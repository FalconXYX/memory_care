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
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Aoede' }
        }
      },
      generationConfig: {
        responseModalities: [Modality.AUDIO]
      },
      systemInstruction: {
        parts: [{ text: "You are a helpful assistant. Always respond with spoken audio, not text. Keep responses brief and conversational." }]
      }
    };

    // Collect audio chunks
    const audioChunks: ArrayBuffer[] = [];
    let sessionComplete = false;
    let hasReceivedAudio = false;

    // Set up event callbacks
    const callbacks: LiveCallbacks = {
      onopen: () => {
        console.log('Live API connection opened');
      },
      onmessage: (message) => {
        // Handle incoming messages and look for audio data
        if (message.serverContent?.modelTurn) {
          const parts = message.serverContent.modelTurn.parts || [];
          
          // Look for audio parts
          const audioParts = parts.filter(
            (p) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/pcm")
          );
          
          // Process audio data
          audioParts.forEach((part) => {
            if (part.inlineData?.data) {
              // Convert base64 to ArrayBuffer
              const audioData = Uint8Array.from(atob(part.inlineData.data), c => c.charCodeAt(0));
              audioChunks.push(audioData.buffer);
              hasReceivedAudio = true;
            }
          });
        }
        
        if (message.serverContent?.turnComplete) {
          sessionComplete = true;
        }
      },
      onerror: (error) => {
        console.error('Live API error:', error);
        sessionComplete = true;
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

    // Send the text message
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

    // Close the session
    session.close();

    // Check if we have audio chunks
    if (audioChunks.length === 0 || !hasReceivedAudio) {
      return NextResponse.json(
        { 
          error: 'No audio received from Gemini Live API',
          details: 'The Live API responded but did not include audio data.'
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

    // Return the audio as PCM response
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
