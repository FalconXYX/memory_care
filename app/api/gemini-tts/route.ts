import { GoogleGenAI, LiveConnectConfig, LiveCallbacks, Modality } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your .env.local file' },
        { status: 500 }
      );
    }

    // Initialize Gemini Live API client
    const client = new GoogleGenAI({ apiKey });
    
    // Configuration for Gemini 2.0 Flash Live with audio output
    const config: LiveConnectConfig = {
      // Direct fields for new SDK versions
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Charon' }
        }
      },
      // For backward compatibility: ensure generationConfig includes audio modality
      generationConfig: {
        responseModalities: [Modality.AUDIO]
      },
      systemInstruction: {
        parts: [{ text: "You are a helpful assistant. Always respond with spoken audio, not text. Keep responses brief and conversational." }]
      }
    };

    // Collect audio chunks
    const audioChunks: ArrayBuffer[] = [];
    let isReceivingAudio = false;
    let sessionComplete = false;

    // Set up event callbacks
    const callbacks: LiveCallbacks = {
      onopen: () => {
        console.log('Live API connection opened');
      },
      onmessage: (message) => {
        console.log('Received message:', JSON.stringify(message, null, 2));
        
        // Handle incoming messages and look for audio data
        if (message.serverContent?.modelTurn) {
          const parts = message.serverContent.modelTurn.parts || [];
          console.log('Found parts:', parts.length);
          
          // Look for audio parts - check multiple possible audio formats
          const audioParts = parts.filter(
            (p) => p.inlineData && (
              p.inlineData.mimeType?.startsWith("audio/pcm") ||
              p.inlineData.mimeType?.startsWith("audio/") ||
              p.inlineData.mimeType?.includes("audio")
            )
          );
          
          console.log('Found audio parts:', audioParts.length);
          if (audioParts.length > 0) {
            console.log('Audio part mime types:', audioParts.map(p => p.inlineData?.mimeType));
          }
          
          // Process audio data
          audioParts.forEach((part) => {
            if (part.inlineData?.data) {
              console.log('Processing audio data, length:', part.inlineData.data.length);
              // Convert base64 to ArrayBuffer
              const audioData = Uint8Array.from(atob(part.inlineData.data), c => c.charCodeAt(0));
              audioChunks.push(audioData.buffer);
              isReceivingAudio = true;
            }
          });
          
          // Log text parts for debugging
          const textParts = parts.filter(p => p.text);
          if (textParts.length > 0) {
            console.log('Received text parts:', textParts.map(p => p.text));
          }
        }
        
        if (message.serverContent?.turnComplete) {
          console.log('Turn complete received');
          sessionComplete = true;
        }
      },
      onerror: (error) => {
        console.error('Live API error:', error);
      },
      onclose: (event) => {
        console.log('Live API connection closed');
        sessionComplete = true;
      }
    };

    // Connect to Gemini Live API
    const session = await client.live.connect({
      model: 'models/gemini-2.0-flash-live-001',
      config,
      callbacks
    });

    // Send the text message with explicit request for audio response
    console.log('Sending text to Gemini Live:', text);
    // Use simple turns array with text for Live API to return audio
    session.sendClientContent({
      turns: [{ text }],
      turnComplete: true
    });

    // Wait for audio response with timeout
    const timeout = 15000; // 15 seconds
    const startTime = Date.now();

    while (!sessionComplete && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Give a small buffer time for any remaining audio chunks
    await new Promise(resolve => setTimeout(resolve, 500));

    // Close the session
    session.close();

    console.log('Session complete. Audio chunks received:', audioChunks.length);
    console.log('Is receiving audio:', isReceivingAudio);

    // Check if we have audio chunks regardless of the flag
    if (audioChunks.length === 0) {
      return NextResponse.json(
        { 
          error: 'No audio received from Gemini Live API',
          details: 'The Live API responded but did not include audio data. This may be due to configuration issues or the model not supporting audio output for this request.',
          debugging: {
            sessionComplete,
            audioChunksReceived: audioChunks.length,
            isReceivingAudio
          }
        },
        { status: 500 }
      );
    }

    // Combine all audio chunks into a single buffer
    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combinedAudio = new ArrayBuffer(totalLength);
    const combinedView = new Uint8Array(combinedAudio);
    
    let offset = 0;
    for (const chunk of audioChunks) {
      combinedView.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // Return the audio as a WAV-like response
    return new NextResponse(combinedAudio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/pcm',
        'Content-Length': combinedAudio.byteLength.toString(),
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Gemini Live TTS error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to generate speech with Gemini Live',
        details: 'Please ensure you have access to Gemini 2.0 Flash Live model'
      },
      { status: 500 }
    );
  }
}
