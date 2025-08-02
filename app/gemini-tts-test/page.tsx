"use client";

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function GeminiTTSTest() {
  const { user, loading } = useAuth();
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  // Helper function to convert PCM16 data to WAV format
  const pcmToWav = (pcmData: Int16Array, sampleRate: number): Blob => {
    const length = pcmData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    // PCM data
    for (let i = 0; i < length; i++) {
      view.setInt16(44 + i * 2, pcmData[i], true);
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const handleGenerateSpeech = async () => {
    if (!text.trim()) {
      setError('Please enter some text to convert to speech');
      return;
    }

    setIsGenerating(true);
    setError('');
    setStatusMessage('Generating speech with Gemini 2.0 Flash Live...');

    try {
      const response = await fetch('/api/gemini-tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate speech');
      }

      // Check if response is audio
      const contentType = response.headers.get('Content-Type');
      
      if (contentType?.includes('audio/pcm')) {
        // Handle PCM audio response from Gemini Live
        const pcmArrayBuffer = await response.arrayBuffer();
        
        setStatusMessage('✅ Converting Gemini Live PCM audio...');
        
        try {
          // Convert PCM16 to AudioBuffer for playback
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          
          // PCM16 format: 16-bit signed integers, typically 24kHz sample rate
          const pcmData = new Int16Array(pcmArrayBuffer);
          const sampleRate = 24000; // Gemini Live typically uses 24kHz
          const numberOfChannels = 1; // Mono
          
          // Create AudioBuffer
          const audioBuffer = audioContext.createBuffer(numberOfChannels, pcmData.length, sampleRate);
          const channelData = audioBuffer.getChannelData(0);
          
          // Convert PCM16 to Float32 (Web Audio API format)
          for (let i = 0; i < pcmData.length; i++) {
            channelData[i] = pcmData[i] / 32768.0; // Convert from -32768..32767 to -1..1
          }
          
          // Create and play audio source
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          
          // Play the audio
          source.start(0);
          
          setStatusMessage('🎵 Playing Gemini 2.0 Flash Live generated speech!');
          
          // Create a WAV blob for the audio element controls
          const wavBlob = pcmToWav(pcmData, sampleRate);
          const audioUrl = URL.createObjectURL(wavBlob);
          
          if (audioRef.current) {
            audioRef.current.src = audioUrl;
          }
          
        } catch (audioError) {
          console.error('Audio processing error:', audioError);
          setError('Failed to process audio data from Gemini Live');
        }
      } else {
        // Handle error response
        const errorData = await response.json();
        throw new Error(errorData.error || 'Unexpected response format');
      }

    } catch (err) {
      console.error('Gemini Live TTS Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate speech');
      setStatusMessage('');
    } finally {
      setIsGenerating(false);
    }
  };

  const sampleTexts = [
    "Hello! This is a test of Gemini's natural text-to-speech capabilities.",
    "Welcome to Memory Care. I'm here to help you recognize and remember important people in your life.",
    "The weather today is beautiful. Would you like to go for a walk in the garden?",
    "Good morning! How are you feeling today? Is there anything I can help you with?"
  ];

  const handleSampleText = (sampleText: string) => {
    setText(sampleText);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please log in to access TTS demo</h1>
          <a href="/login" className="text-blue-500 hover:underline">Go to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
            🎤 Gemini 2.0 Flash Live - Native Audio Generation
          </h1>
          
          <div className="space-y-6">
            {/* Text Input */}
            <div>
              <label htmlFor="text-input" className="block text-sm font-medium text-gray-700 mb-2">
                Enter text to convert to speech:
              </label>
              <textarea
                id="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your text here..."
                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
              />
            </div>

            {/* Sample Texts */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or try these sample texts:
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sampleTexts.map((sampleText, index) => (
                  <button
                    key={index}
                    onClick={() => handleSampleText(sampleText)}
                    className="p-3 text-left bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <div className="text-sm text-gray-600 truncate">
                      {sampleText}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <div className="flex justify-center">
              <button
                onClick={handleGenerateSpeech}
                disabled={isGenerating || !text.trim()}
                className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                  isGenerating || !text.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isGenerating ? 'Generating Native Audio...' : 'Generate Native Audio'}
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-700">{error}</div>
              </div>
            )}

            {/* Status Message */}
            {statusMessage && !error && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-blue-700">{statusMessage}</div>
              </div>
            )}

            {/* Audio Player */}
            <div className="flex justify-center">
              <audio
                ref={audioRef}
                controls
                className="w-full max-w-md"
              >
                Your browser does not support the audio element.
              </audio>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-800 mb-2">Gemini 2.0 Flash Live Audio:</h3>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>Enter text in the textarea above or click on a sample text</li>
                <li>Click "Generate Native Audio" to send text to Gemini 2.0 Flash Live</li>
                <li>The model generates native audio using advanced speech synthesis</li>
                <li>Audio is converted from PCM16 format and played automatically</li>
                <li>Use the audio controls below to replay or adjust volume</li>
              </ol>
              <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                <strong>🚀 Live API:</strong> Using Gemini's bidirectional Live API for real-time audio generation with the Charon voice.
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-center pt-4">
              <a
                href="/"
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                ← Back to Home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
