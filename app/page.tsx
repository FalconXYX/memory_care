"use client";

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { AudioStreamer } from "@/lib/audio-streamer";
import { audioContext } from "@/lib/audio-utils";

export default function Home() {
  const { user, loading, signOut } = useAuth();

  // Face detection states
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isWebcamStarted, setIsWebcamStarted] = useState(false);
  const [error, setError] = useState<string>("");
  const [faceMatcher, setFaceMatcher] = useState<any>(null);
  const [dbPersons, setDbPersons] = useState<
    Array<{
      id: string;
      name: string;
      description: string;
      relationship: string;
      presignedImageUrl?: string;
    }>
  >([]);
  const [facesLoaded, setFacesLoaded] = useState(false);
  const [debugMode, setDebugMode] = useState(false)
  const [isAssistantEnabled, setIsAssistantEnabled] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState<string>('');
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [lastApiCall, setLastApiCall] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Track last time any speech finished for global cooldown
  const [lastSpeechTime, setLastSpeechTime] = useState<number>(0);
  
  // Camera flip functionality
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  
  // Hashmap to track last voice play time for each person
  const [personCooldowns, setPersonCooldowns] = useState<Map<string, number>>(new Map());
  
  // Track currently detected persons with their positions for overlay buttons
  const [detectedPersons, setDetectedPersons] = useState<Array<{
    person: any;
    box: { x: number; y: number; width: number; height: number };
    textColor: string;
  }>>([]);
  
  // Cooldown configuration in minutes
  const PERSON_COOLDOWN_MINUTES = 5;
  const API_CALL_DEBOUNCE_MS = 2000; // 2 seconds between API calls
  // Global speech cooldown in milliseconds
  const GLOBAL_COOLDOWN_MS = PERSON_COOLDOWN_MINUTES * 60 * 1000;

  // Store the interval ref so we can clear it when needed
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Audio streaming refs
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Track detected persons to prevent API spam
  const detectedPersonsRef = useRef<Set<string>>(new Set());
  const lastDetectionTimeRef = useRef<number>(0);

  // Fullscreen functions
  const enterFullscreen = async () => {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  const exitFullscreen = async () => {
    // Only try to exit fullscreen if we're actually in fullscreen mode
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
    setIsFullscreen(false);
  };

  // Listen for fullscreen changes (e.g., ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Enumerate available cameras
  const getAvailableCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(videoDevices);
      return videoDevices;
    } catch (error) {
      console.error('Error getting available cameras:', error);
      return [];
    }
  };

  // Switch camera function
  const flipCamera = async () => {
    if (!videoRef.current) return;
    
    try {
      // Stop current stream
      const currentStream = videoRef.current.srcObject as MediaStream;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }

      // Toggle facing mode
      const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
      
      // Get new stream with opposite camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 720, 
          height: 560,
          facingMode: newFacingMode
        },
      });

      videoRef.current.srcObject = stream;
      setFacingMode(newFacingMode);
    } catch (error) {
      console.error('Error flipping camera:', error);
      setError("Failed to flip camera. This device may only have one camera.");
    }
  };

  // Simple cooldown check using hashmap
  const isPersonInCooldown = (personName: string): boolean => {
    const lastPlayTime = personCooldowns.get(personName);
    if (!lastPlayTime) return false;
    
    const cooldownMs = PERSON_COOLDOWN_MINUTES * 60 * 1000;
    const isInCooldown = (Date.now() - lastPlayTime) < cooldownMs;
    
    if (isInCooldown) {
      const timeLeft = cooldownMs - (Date.now() - lastPlayTime);
      console.log(`${personName} is in cooldown for ${Math.ceil(timeLeft / (60 * 1000))} more minutes`);
    }
    
    return isInCooldown;
  };

  // Initialize audio context and streamer
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "memory-care-audio" }).then((audioCtx: AudioContext) => {
        audioContextRef.current = audioCtx;
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current.onComplete = () => {
          setIsAssistantSpeaking(false);
          setAssistantStatus('');
          setLastSpeechTime(Date.now());
        };
      });
    }
  }, []);

  // Initialize available cameras on component mount
  useEffect(() => {
    getAvailableCameras();
  }, []);

  // Simple function to call Gemini Live API for person description
  const generatePersonDescription = async (person: any, forcePlay = false) => {
    console.log(`Attempting to describe ${person.name}, forcePlay: ${forcePlay}, isAssistantEnabled: ${isAssistantEnabled}, isAssistantSpeaking: ${isAssistantSpeaking}`);
    
    // Global cooldown between speeches
    if (!forcePlay && (Date.now() - lastSpeechTime) < GLOBAL_COOLDOWN_MS) {
      console.log('Global cooldown active, skipping');
      return;
    }

    // Don't play if assistant is disabled (unless force play)
    if (!isAssistantEnabled && !forcePlay) {
      console.log('Assistant disabled, skipping');
      return;
    }
    
    // Don't play if already speaking (unless force play)
    if (isAssistantSpeaking && !forcePlay) {
      console.log('Assistant already speaking, skipping');
      return;
    }
    
    // Debounce API calls to prevent spam
    if (!forcePlay && (Date.now() - lastApiCall) < API_CALL_DEBOUNCE_MS) {
      console.log('API call too recent, skipping');
      return;
    }
    
    // Check cooldown for same person (unless force play)
    if (!forcePlay && isPersonInCooldown(person.name)) {
      const lastPlayTime = personCooldowns.get(person.name);
      const timeLeft = PERSON_COOLDOWN_MINUTES * 60 * 1000 - (Date.now() - lastPlayTime!);
      const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
      console.log(`${person.name} is in cooldown for ${minutesLeft} more minutes`);
      setAssistantStatus(`⏳ ${person.name} on cooldown (${minutesLeft}m left)`);
      setTimeout(() => setAssistantStatus(''), 3000);
      return;
    }

    console.log(`Starting description for ${person.name}`);
    // Track this person to prevent repeat calls
    setPersonCooldowns(prev => new Map(prev.set(person.name, Date.now())));
    setLastApiCall(Date.now());
    setIsAssistantSpeaking(true);
    setAssistantStatus(`🎤 Describing ${person.name}...`);
    
    try {
      // Only stop currently playing audio if this is a forced/manual play
      if (forcePlay && audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }

      // Compassionate caretaker prompt for prosopagnosia
      const prompt = `You are a compassionate caretaker for someone with prosopagnosia (face blindness).

When they meet or see someone, your job is to discreetly and clearly speak out loud useful context about that person.

The context should be brief, relevant, and easy to follow. For example, mention their name, how the user knows them, their relationship, their last interaction, and any important details (like shared interests, birthdays, or current projects).

Avoid overwhelming the user with too much information. Focus on what will help them recognize or connect with the person in the moment.

Speak naturally, like a helpful friend. Example:

"This is Sarah Kim, your coworker from the marketing team. You last saw her at the team lunch on Friday. She loves hiking, and you both talked about visiting Algonquin Park."

Always use clear, simple language, and prioritize information that's most helpful for social interaction.

Don't start with "Ok I got it", just start directly to the point, and don't make up stories. Also don't end with, asking questions.
You should act like a helpful assistant, providing context without needing to be prompted.

Here's the person I see: This is ${person.name}, who is your ${person.relationship}. Description: ${person.description}`;

      const response = await fetch('/api/gemini-tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`API Error: ${errorData.error || response.statusText}`);
      }

      const contentType = response.headers.get('Content-Type');
      
      if (contentType?.includes('audio/pcm')) {
        const pcmArrayBuffer = await response.arrayBuffer();
        setAssistantStatus(`🎵 Playing description for ${person.name}`);
        
        // Use the audio streamer for proper playback
        if (audioStreamerRef.current && audioContextRef.current) {
          await audioStreamerRef.current.resume();
          // Convert ArrayBuffer to Uint8Array and stream it
          const pcmData = new Uint8Array(pcmArrayBuffer);
          audioStreamerRef.current.addPCM16(pcmData);
        } else {
          throw new Error('Audio system not initialized');
        }
      }

    } catch (error) {
      console.error('Assistant error:', error);
      setIsAssistantSpeaking(false);
      setAssistantStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTimeout(() => setAssistantStatus(''), 5000);
    }
  }; // end generatePersonDescription

  // Separate function for face detection that can be restarted
  const startFaceDetection = () => {
    // Clear any existing interval
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    const detectFaces = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) return;

      // Check if video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.log('Video dimensions not ready yet');
        return;
      }

      const detections = await faceapi
        .detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.5,
          })
        )
        .withFaceLandmarks(true) // Use tiny landmarks model
        .withFaceDescriptors();

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // Use video's actual dimensions instead of element dimensions
      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      
      // Ensure canvas matches video dimensions
      if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
        canvas.width = displaySize.width;
        canvas.height = displaySize.height;
        faceapi.matchDimensions(canvas, displaySize);
      }

      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      // Collect detected persons for overlay buttons
      const currentDetectedPersons: Array<{
        person: any;
        box: { x: number; y: number; width: number; height: number };
        textColor: string;
      }> = [];

      if (faceMatcher && resizedDetections.length > 0) {
        resizedDetections.forEach((detection) => {
          const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
          const { label, distance } = bestMatch;

          let personInfo = {
            name: `Unknown (${(1 - distance).toFixed(2)})`,
            relationship: "",
            description: ""
          };
          let textColor = "#ff0000"; // Red for unknown
          let fullPersonData = null;

          if (label !== "unknown") {
            const person = dbPersons.find((p) => p.name === label);
            if (person) {
              personInfo = {
                name: person.name,
                relationship: person.relationship,
                description: person.description
              };
              textColor = "#00ff00"; // Green for known
              fullPersonData = person;
              
              // Add to detected persons for overlay buttons (only known persons)
              currentDetectedPersons.push({
                person: person,
                box: detection.detection.box,
                textColor: textColor
              });
              
              // Call Gemini Live assistant to describe the person (only if conditions are met)
              // Add additional check to prevent repeated calls for the same person
              const currentTime = Date.now();
              const shouldTrigger = isAssistantEnabled && 
                                  !isAssistantSpeaking && 
                                  !isPersonInCooldown(person.name) &&
                                  !detectedPersonsRef.current.has(person.name) &&
                                  (currentTime - lastDetectionTimeRef.current) > 1000; // 1 second minimum between any detections
              
              // Debug logging for auto-trigger decisions
              if (isAssistantEnabled && !shouldTrigger) {
                console.log(`Auto-trigger blocked for ${person.name}: speaking=${isAssistantSpeaking}, cooldown=${isPersonInCooldown(person.name)}, detected=${detectedPersonsRef.current.has(person.name)}`);
              }
              
              if (shouldTrigger) {
                console.log(`Auto-triggering voice for ${person.name}`);
                detectedPersonsRef.current.add(person.name);
                lastDetectionTimeRef.current = currentTime;
                generatePersonDescription(person);
                
                // Clear the detection flag after a delay to allow re-detection later
                setTimeout(() => {
                  detectedPersonsRef.current.delete(person.name);
                }, 30000); // 30 seconds before allowing re-detection
              }
            }
          }

          if (ctx) {
            const box = detection.detection.box;

            // Helper function to draw multi-line text with background
            const drawContextInfo = (x: number, y: number, lines: string[]) => {
              const lineHeight = 22;
              const padding = 8;
              const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
              
              // Draw background rectangle
              ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
              ctx.fillRect(x - padding, y - padding, maxWidth + padding * 2, lines.length * lineHeight + padding);
              
              // Draw text lines
              ctx.fillStyle = textColor;
              ctx.font = "16px Arial";
              ctx.strokeStyle = "black";
              ctx.lineWidth = 2;
              
              lines.forEach((line, index) => {
                const lineY = y + index * lineHeight;
                ctx.strokeText(line, x, lineY);
                ctx.fillText(line, x, lineY);
              });
            };

            // Draw bounding box
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            // Draw context info
            const lines = [
              `👤 ${personInfo.name}`,
              ...(personInfo.relationship ? [`💝 ${personInfo.relationship}`] : []),
              ...(personInfo.description ? [`📝 ${personInfo.description}`] : [])
            ];
            
            drawContextInfo(box.x, box.y - 10, lines);
          }
        });
      }

      // Update detected persons state for overlay buttons
      setDetectedPersons(currentDetectedPersons);
    };

    detectionIntervalRef.current = setInterval(detectFaces, 800); // Increased from 500ms to 800ms for better performance
  };

  // Load face-api models and fetch faces from DB
  useEffect(() => {
    if (!user) return;

    const loadAssets = async () => {
      try {
        // Load face-api models - using fastest/smallest models
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
        await faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"); // Using tiny landmarks model
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
        setModelsLoaded(true);

        // Fetch persons from the database
        const response = await fetch(`/api/persons?userId=${user.id}`);
        if (!response.ok) {
          throw new Error("Failed to fetch persons from the database.");
        }
        const persons = await response.json();
        setDbPersons(persons);

        // Load faces and create a face matcher
        await loadFacesFromDB(persons);
      } catch (err) {
        setError(
          "Failed to load assets. Please check the console for more details."
        );
        console.error(err);
      }
    };

    loadAssets();
  }, [user]);

  // Restart face detection when camera starts (only if models are loaded)
  useEffect(() => {
    if (
      isWebcamStarted &&
      modelsLoaded &&
      videoRef.current &&
      canvasRef.current
    ) {
      startFaceDetection();
    }
  }, [isWebcamStarted, modelsLoaded]);

  // Cleanup interval and audio on component unmount
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }
    };
  }, []);

  // Load faces from the database and create a face matcher
  const loadFacesFromDB = async (persons: any[]) => {
    if (persons.length === 0) {
      setFacesLoaded(true);
      return;
    }

    try {
      const labeledDescriptors = await Promise.all(
        persons.map(async (person) => {
          if (!person.presignedImageUrl) return null;

          try {
            const img = await faceapi.fetchImage(person.presignedImageUrl);
            const detection = await faceapi
              .detectSingleFace(
                img,
                new faceapi.TinyFaceDetectorOptions({
                  inputSize: 416,
                  scoreThreshold: 0.5,
                })
              )
              .withFaceLandmarks(true) // Use tiny landmarks model
              .withFaceDescriptor();

            if (detection) {
              return new faceapi.LabeledFaceDescriptors(person.name, [
                detection.descriptor,
              ]);
            }
            return null;
          } catch (e) {
            console.error(`Failed to load image for ${person.name}`, e);
            return null;
          }
        })
      );

      const validDescriptors = labeledDescriptors.filter(
        (d) => d !== null
      ) as faceapi.LabeledFaceDescriptors[];

      if (validDescriptors.length > 0) {
        const matcher = new faceapi.FaceMatcher(validDescriptors, 0.6);
        setFaceMatcher(matcher);
      }
    } catch (err) {
      setError("Failed to build face matcher from database.");
      console.error(err);
    } finally {
      setFacesLoaded(true);
    }
  };

  // Start webcam and enter fullscreen
  const startVideoAndFullscreen = async () => {
    try {
      // Get available cameras first
      await getAvailableCameras();
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 720, 
          height: 560,
          facingMode: facingMode
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsWebcamStarted(true);
        // Enter fullscreen after starting camera
        await enterFullscreen();
      }
    } catch (err) {
      setError("Failed to access webcam. Please allow camera permissions.");
    }
  };

  // Detect faces in real-time
  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current || !modelsLoaded) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    // Wait for video to have valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('Video not ready, waiting...');
      setTimeout(handleVideoPlay, 100);
      return;
    }

    // Set canvas dimensions to match video
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    faceapi.matchDimensions(canvas, displaySize);

    startFaceDetection();
  };

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-green-50">
        <div className="text-center">
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-blue-200/50">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-gradient-to-r from-blue-500 to-green-500 p-4 rounded-2xl">
                <svg className="w-12 h-12 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
            </div>
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-500 mx-auto mb-6"></div>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-2">
              Memory Care AI
            </h3>
            <p className="text-slate-600 text-lg">Initializing your personalized assistant...</p>
            <div className="mt-4 flex justify-center space-x-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isFullscreen ? 'bg-black' : 'bg-gradient-to-br from-blue-50 via-white to-green-50'}`}>
      {!isFullscreen && (
        <nav className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-blue-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 sm:h-20">
              <div className="flex items-center">
                <div className="flex items-center space-x-3">
                  <img
                    src="/logo.png"
                    alt="Memory Care Logo"
                    className="w-16 h-16 object-contain"
                  />
                  <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                    Memory Care
                  </h1>
                </div>
              </div>
              <div className="flex items-center space-x-2 sm:space-x-4">
                {user ? (
                  <>
                    <span className="hidden sm:block text-slate-600 text-sm">
                      Welcome, {user.user_metadata.full_name || user.email}
                    </span>
                    <button
                      onClick={signOut}
                      className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="text-slate-600 hover:text-blue-600 px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-200"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/signup"
                      className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </nav>
      )}

      <main className={`${isFullscreen ? 'h-screen' : 'max-w-7xl mx-auto py-6 sm:px-6 lg:px-8'}`}>
        {user ? (
          <div className={`${isFullscreen ? 'h-full' : 'space-y-4 sm:space-y-6 px-4 sm:px-0'}`}>
            {!isFullscreen && (
              <>
                {/* Welcome Section */}
                <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200/50 rounded-3xl shadow-2xl overflow-hidden">
                  <div className="px-6 py-8">
                    {/* Header with Icon */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center space-x-4">
                        <div className="bg-gradient-to-r from-blue-500 to-green-500 p-3 rounded-2xl">
                          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-700 to-green-700 bg-clip-text text-transparent">
                            Memory Care AI
                          </h2>
                          <p className="text-slate-600 text-sm sm:text-base">
                            Intelligent Face Recognition System
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold flex items-center">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                          ACTIVE
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 mb-6">
                      <p className="text-slate-700 text-base sm:text-lg leading-relaxed mb-4">
                        🧠 <strong>Advanced AI Recognition:</strong> Our system helps identify and remember people in your life, providing instant context and background information.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-slate-600">
                        <div className="flex items-center space-x-2">
                          <span className="text-green-500">✓</span>
                          <span>Real-time face detection</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-green-500">✓</span>
                          <span>Voice assistance enabled</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-green-500">✓</span>
                          <span>Privacy-focused design</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-green-500">✓</span>
                          <span>Personalized memories</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Link
                        href="/person"
                        className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-6 py-4 rounded-2xl text-center font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center justify-center space-x-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span>Manage People</span>
                      </Link>
                      <Link
                        href="/person/new"
                        className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-6 py-4 rounded-2xl text-center font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center justify-center space-x-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <span>Add New Person</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Face Detection Section */}
            <div className={`${isFullscreen ? 'h-full flex flex-col' : 'bg-gradient-to-b from-slate-50 to-white rounded-3xl shadow-2xl p-6 border border-slate-200/50'}`}>
              {!isFullscreen && (
                <>
                  <div className="text-center mb-8">
                    <div className="flex items-center justify-center mb-4">
                      <div className="bg-gradient-to-r from-blue-500 to-green-500 p-3 rounded-2xl mr-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                          Smart Camera System
                        </h3>
                        <p className="text-slate-600 text-sm sm:text-base">
                          Advanced face recognition with voice assistance
                        </p>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-6 text-sm">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <span className="font-medium">{error}</span>
                      </div>
                    </div>
                  )}

                  {/* System Status Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-slate-200/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Models</p>
                          <p className="text-lg font-bold text-slate-800">
                            {modelsLoaded ? "Ready" : "Loading..."}
                          </p>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${modelsLoaded ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}></div>
                      </div>
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-slate-200/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Faces</p>
                          <p className="text-lg font-bold text-slate-800">
                            {facesLoaded ? `${dbPersons.length} Loaded` : "Loading..."}
                          </p>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${facesLoaded ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}></div>
                      </div>
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-slate-200/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Camera</p>
                          <p className="text-lg font-bold text-slate-800">
                            {isWebcamStarted ? "Active" : "Inactive"}
                          </p>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${isWebcamStarted ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}></div>
                      </div>
                    </div>

                    <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-slate-200/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assistant</p>
                          <p className="text-lg font-bold text-slate-800">
                            {isAssistantSpeaking ? 'Speaking' : isAssistantEnabled ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${
                          isAssistantSpeaking ? 'bg-orange-500 animate-pulse' : 
                          isAssistantEnabled ? 'bg-blue-500' : 'bg-gray-400'
                        }`}></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* AI Assistant Toggle */}
                  <div className="mb-8 text-center">
                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 inline-block shadow-lg border border-slate-200/50">
                      <h4 className="text-lg font-semibold text-slate-700 mb-4">Voice Assistant Control</h4>
                      <button
                        onClick={() => setIsAssistantEnabled(!isAssistantEnabled)}
                        className={`px-8 py-4 rounded-2xl text-lg font-semibold transition-all duration-200 shadow-lg transform hover:scale-105 ${
                          isAssistantEnabled
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-blue-200'
                            : 'bg-gradient-to-r from-gray-400 to-gray-500 text-white hover:from-gray-500 hover:to-gray-600'
                        }`}
                      >
                        {isAssistantEnabled ? (
                          <span className="flex items-center space-x-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 11.293c0 1.297-.908 2.35-2.026 2.35-1.119 0-2.026-1.053-2.026-2.35 0-1.297.907-2.35 2.026-2.35 1.118 0 2.026 1.053 2.026 2.35z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 15.657A8 8 0 016.343 4.343a8 8 0 0011.314 11.314z" />
                            </svg>
                            <span>Voice Assistant ON</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            </svg>
                            <span>Voice Assistant OFF</span>
                          </span>
                        )}
                      </button>
                      {assistantStatus && (
                        <div className="mt-4">
                          <span className="inline-block bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium">
                            {assistantStatus}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Camera Controls */}
                  {modelsLoaded && facesLoaded && (
                    <div className="text-center mb-6">
                      {!isWebcamStarted && (
                        <button
                          onClick={startVideoAndFullscreen}
                          className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-4 px-8 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-200 text-xl transform hover:-translate-y-1 flex items-center space-x-3 mx-auto"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Start Full Screen Camera</span>
                        </button>
                      )}
                      {isWebcamStarted && !isFullscreen && (
                        <div className="flex gap-4 flex-wrap justify-center">
                          <button
                            onClick={enterFullscreen}
                            className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white font-bold py-3 px-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 text-lg transform hover:-translate-y-1 flex items-center space-x-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                            <span>Enter Full Screen</span>
                          </button>
                          {availableCameras.length > 1 && (
                            <button
                              onClick={flipCamera}
                              className="bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-bold py-3 px-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 text-lg transform hover:-translate-y-1 flex items-center space-x-2"
                              title={`Switch to ${facingMode === 'user' ? 'back' : 'front'} camera`}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              <span>Flip Camera</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              
              {/* Camera Container */}
              <div className={`relative ${isFullscreen ? 'flex justify-center items-center h-full' : 'flex justify-center'}`}>
                <div className="relative">
                  {!isFullscreen && (
                    <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-green-500/20 rounded-3xl blur-xl"></div>
                  )}
                  <div className={`relative ${!isFullscreen ? 'bg-black rounded-2xl overflow-hidden shadow-2xl' : ''}`}>
                    <video
                      ref={videoRef}
                      width={isFullscreen ? "auto" : "720"}
                      height={isFullscreen ? "auto" : "560"}
                      autoPlay
                      muted
                      onPlay={handleVideoPlay}
                      className={`${isFullscreen ? 'max-h-full max-w-full' : 'rounded-2xl'} ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                      style={isFullscreen ? { height: '100vh', width: 'auto' } : {}}
                    />
                    <canvas
                      ref={canvasRef}
                      width="720"
                      height="560"
                      className={`absolute top-0 left-0 ${isFullscreen ? '' : 'rounded-2xl'} ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                      style={isFullscreen ? { 
                        height: '100vh', 
                        width: 'auto',
                        transform: `scale(${facingMode === 'user' ? '-1, 1' : '1, 1'})`,
                        transformOrigin: 'center'
                      } : {}}
                    />
                    
                    {/* Fullscreen UI Overlay */}
                    {isFullscreen && (
                      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                        {/* Voice Assistant Toggle - Top Left */}
                        <div className="absolute top-6 left-6 pointer-events-auto">
                          <button
                            onClick={() => setIsAssistantEnabled(!isAssistantEnabled)}
                            className={`px-6 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 shadow-xl ${
                              isAssistantEnabled
                                ? 'bg-blue-500/90 text-white hover:bg-blue-600/90 backdrop-blur-sm'
                                : 'bg-white/90 text-slate-700 hover:bg-gray-100/90 backdrop-blur-sm'
                            }`}
                          >
                            {isAssistantEnabled ? (
                              <span className="flex items-center space-x-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 11.293c0 1.297-.908 2.35-2.026 2.35-1.119 0-2.026-1.053-2.026-2.35 0-1.297.907-2.35 2.026-2.35 1.118 0 2.026 1.053 2.026 2.35z" />
                                </svg>
                                <span>Voice ON</span>
                              </span>
                            ) : (
                              <span className="flex items-center space-x-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                </svg>
                                <span>Voice OFF</span>
                              </span>
                            )}
                          </button>
                        </div>
                        
                        {/* Assistant Status - Top Center */}
                        {assistantStatus && (
                          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 pointer-events-auto">
                            <span className="inline-block bg-blue-100/95 text-blue-800 px-4 py-2 rounded-2xl text-sm font-semibold backdrop-blur-sm shadow-lg">
                              {assistantStatus}
                            </span>
                          </div>
                        )}
                        
                        {/* Exit Fullscreen Button - Top Right */}
                        <div className="absolute top-6 right-6 pointer-events-auto">
                          <button
                            onClick={exitFullscreen}
                            className="bg-red-500/90 hover:bg-red-600/90 text-white font-bold py-3 px-6 rounded-2xl shadow-xl transition-all duration-200 backdrop-blur-sm flex items-center space-x-2"
                            title="Exit Fullscreen"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span>Exit</span>
                          </button>
                        </div>
                        
                        {/* Flip Camera Button - Bottom Right */}
                        {availableCameras.length > 1 && (
                          <div className="absolute bottom-6 right-6 pointer-events-auto">
                            <button
                              onClick={flipCamera}
                              className="bg-gray-700/90 hover:bg-gray-600/90 text-white font-bold py-4 px-6 rounded-2xl shadow-xl transition-all duration-200 backdrop-blur-sm flex items-center space-x-2"
                              title={`Switch to ${facingMode === 'user' ? 'back' : 'front'} camera`}
                            >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              <span>Flip Camera</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Overlay Play Buttons for Detected Persons */}
                    {detectedPersons.map((detectedPerson, index) => {
                      const { person, box } = detectedPerson;
                      const isInCooldown = isPersonInCooldown(person.name);
                      const cooldownTime = personCooldowns.get(person.name);
                      let remainingMinutes = 0;
                      
                      if (cooldownTime) {
                        const timeLeft = (PERSON_COOLDOWN_MINUTES * 60 * 1000) - (Date.now() - cooldownTime);
                        remainingMinutes = Math.ceil(timeLeft / (60 * 1000));
                      }
                      
                      return (
                        <button
                          key={`${person.name}-${index}`}
                          onClick={() => {
                            generatePersonDescription(person, true);
                            // Reset cooldown when manually triggered
                            setPersonCooldowns(prev => new Map(prev.set(person.name, Date.now())));
                          }}
                          disabled={isAssistantSpeaking}
                          className={`absolute text-xs font-bold rounded-full w-10 h-10 flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg backdrop-blur-sm ${
                            isAssistantSpeaking 
                              ? 'bg-gray-400/80 text-gray-600 cursor-not-allowed' 
                              : isInCooldown 
                                ? 'bg-orange-500/90 text-white hover:bg-orange-600/90' 
                                : 'bg-green-500/90 text-white hover:bg-green-600/90'
                          }`}
                          style={{
                            left: `${box.x + box.width + 8}px`,
                            top: `${box.y}px`,
                          }}
                          title={
                            isAssistantSpeaking 
                              ? 'Assistant is currently speaking' 
                              : isInCooldown 
                                ? `Play ${person.name} (${remainingMinutes}m cooldown)` 
                                : `Play ${person.name}`
                          }
                        >
                          {isAssistantSpeaking ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                            </svg>
                          ) : isInCooldown ? (
                            remainingMinutes
                          ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Audio is now handled by AudioStreamer - no need for HTML audio element */}
            </div>
          </div>
        ) : (
          <div className="text-center px-4">
            <div className="max-w-2xl mx-auto">
              {/* Hero Section */}
              <div className="mb-8">
                <div className="flex items-center justify-center mb-6">
                  <div className="bg-gradient-to-r from-blue-500 to-green-500 p-4 rounded-3xl shadow-xl">
                    <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-4">
                  Welcome to Memory Care AI
                </h2>
                <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto">
                  Your intelligent companion for facial recognition and memory assistance. 
                  Advanced AI technology to help you remember and connect with the important people in your life.
                </p>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-blue-200/50">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Real-time Recognition</h3>
                  <p className="text-slate-600 text-sm">Instantly identify people using advanced facial recognition technology</p>
                </div>
                
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-green-200/50">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Voice Assistance</h3>
                  <p className="text-slate-600 text-sm">Get spoken context and information about recognized individuals</p>
                </div>
                
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-purple-200/50 sm:col-span-2 lg:col-span-1">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Privacy First</h3>
                  <p className="text-slate-600 text-sm">Your data is secure and processed locally with full privacy protection</p>
                </div>
              </div>

              {/* Hero Image */}
              <div className="flex justify-center mb-8">
                <div className="relative">
                  <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-green-500/20 rounded-3xl blur-xl"></div>
                  <img
                    src="old.jpg"
                    alt="Memory Care Hero"
                    className="relative rounded-3xl shadow-2xl max-w-md w-full border-4 border-white/50"
                  />
                </div>
              </div>

              {/* Sign-in Options */}
              <div className="max-w-sm mx-auto space-y-4">
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex justify-center items-center py-4 px-6 border border-gray-300 rounded-2xl shadow-lg bg-white/80 backdrop-blur-sm text-base font-semibold text-gray-700 hover:bg-gray-50/80 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
                >
                  <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </button>

                <div className="flex items-center">
                  <div className="flex-grow border-t border-gray-300" />
                  <span className="px-4 text-gray-500 font-medium">Or</span>
                  <div className="flex-grow border-t border-gray-300" />
                </div>

                <Link
                  href="/signup"
                  className="w-full flex items-center justify-center px-6 py-4 border border-transparent text-base font-semibold rounded-2xl text-white bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Create Account with Email
                </Link>
                
                <Link
                  href="/login"
                  className="w-full flex items-center justify-center px-6 py-4 border border-transparent text-base font-semibold rounded-2xl text-white bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
