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

    // For now, skip Live API and go directly to standard API in production
    // to avoid the b.mask function error
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
    
    if (isProduction) {
      console.log('Production environment detected, using standard API');
      return await handleWithStandardAPI(text, apiKey);
    }

    // Try to use the Live API first, fall back to standard API
    try {
      return await handleWithLiveAPI(text, apiKey);
    } catch (liveApiError) {
      console.warn('Live API failed, falling back to standard API:', liveApiError);
      return await handleWithStandardAPI(text, apiKey);
    }

  } catch (error) {
    console.error('Gemini TTS error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to generate speech',
        details: 'Please check server logs for more information'
      },
      { status: 500 }
    );
  }
}

async function handleWithLiveAPI(text: string, apiKey: string) {
  try {
    // Dynamic import to avoid SSR issues
    const { GoogleGenAI, Modality } = await import('@google/genai');
    
    // Initialize Gemini Live API client
    const client = new GoogleGenAI({ apiKey });
    
    // Configuration for Gemini 2.0 Flash Live with audio output
    const config = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Charon' }
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
    const callbacks = {
      onopen: () => {
        console.log('Live API connection opened');
      },
      onmessage: (message: any) => {
        // Handle incoming messages and look for audio data
        if (message.serverContent?.modelTurn) {
          const parts = message.serverContent.modelTurn.parts || [];
          
          // Look for audio parts
          const audioParts = parts.filter(
            (p: any) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/pcm")
          );
          
          // Process audio data
          audioParts.forEach((part: any) => {
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
      onerror: (error: any) => {
        console.error('Live API error:', error);
        sessionComplete = true;
      },
      onclose: (event: any) => {
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
      throw new Error('No audio received from Gemini Live API');
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
    console.error('Live API specific error:', error);
    throw error; // Re-throw to trigger fallback
  }
}

async function handleWithStandardAPI(text: string, apiKey: string) {
  // Fallback to standard Generative AI API (text-only)
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  // Optimize text for speech synthesis
  const prompt = `Please rewrite the following text to be more natural and conversational for text-to-speech synthesis. Add appropriate pauses and improve the flow, but keep the core message intact: "${text}"`;

  const result = await model.generateContent(prompt);
  const optimizedText = result.response.text();

  // Return optimized text instead of audio
  return NextResponse.json({
    success: true,
    originalText: text,
    optimizedText: optimizedText,
    message: "Text optimized by Gemini for natural speech synthesis (Live API unavailable)",
    fallback: true,
    ttsConfig: {
      rate: 0.9,
      pitch: 1.0,
      volume: 1.0,
      voice: "en-US"
    }
  });
}
