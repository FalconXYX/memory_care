"use client";

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

export default function Home() {
  const { user, loading, signOut } = useAuth();

  // Face detection states
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [isWebcamStarted, setIsWebcamStarted] = useState(false)
  const [error, setError] = useState<string>('')
  const [faceMatcher, setFaceMatcher] = useState<any>(null)
  const [dbPersons, setDbPersons] = useState<Array<{
    id: string;
    name: string;
    description: string;
    relationship: string;
    presignedImageUrl?: string;
  }>>([]);
  const [facesLoaded, setFacesLoaded] = useState(false);
  const [debugMode, setDebugMode] = useState(false)
  const [displayMode, setDisplayMode] = useState<'name' | 'nameBox' | 'nameLandmarks'>(
    'name'
  )

  // Store the interval ref so we can clear it when needed
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

      const detections = await faceapi
        .detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.5,
          })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      const displaySize = { width: video.width, height: video.height };
      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      if (faceMatcher && resizedDetections.length > 0) {
        resizedDetections.forEach((detection) => {
          const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
          const { label, distance } = bestMatch;

          let displayText = `Unknown (${(1 - distance).toFixed(2)})`;
          let textColor = "#ff0000"; // Red for unknown

          if (label !== "unknown") {
            const person = dbPersons.find((p) => p.name === label);
            displayText = `${person?.name} (${person?.relationship})`;
            textColor = "#00ff00"; // Green for known
          }

          if (ctx) {
            const box = detection.detection.box;

            // Mode 1: Just name appearing
            if (displayMode === 'name') {
              ctx.fillStyle = textColor;
              ctx.font = "20px Arial";
              ctx.strokeStyle = "black";
              ctx.lineWidth = 3;
              ctx.strokeText(displayText, box.x, box.y - 10);
              ctx.fillText(displayText, box.x, box.y - 10);
            }
            
            // Mode 2: Name + box appearing
            else if (displayMode === 'nameBox') {
              // Draw bounding box
              ctx.strokeStyle = textColor;
              ctx.lineWidth = 2;
              ctx.strokeRect(box.x, box.y, box.width, box.height);
              
              // Draw text
              ctx.fillStyle = textColor;
              ctx.font = "20px Arial";
              ctx.strokeStyle = "black";
              ctx.lineWidth = 3;
              ctx.strokeText(displayText, box.x, box.y - 10);
              ctx.fillText(displayText, box.x, box.y - 10);
            }
            
            // Mode 3: Name + box + face landmarks
            else if (displayMode === 'nameLandmarks') {
              // Draw bounding box
              ctx.strokeStyle = textColor;
              ctx.lineWidth = 2;
              ctx.strokeRect(box.x, box.y, box.width, box.height);
              
              // Draw landmarks
              const landmarks = detection.landmarks;
              if (landmarks) {
                ctx.fillStyle = textColor;
                landmarks.positions.forEach((point) => {
                  ctx.beginPath();
                  ctx.arc(point.x, point.y, 1, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
              
              // Draw text
              ctx.fillStyle = textColor;
              ctx.font = "20px Arial";
              ctx.strokeStyle = "black";
              ctx.lineWidth = 3;
              ctx.strokeText(displayText, box.x, box.y - 10);
              ctx.fillText(displayText, box.x, box.y - 10);
            }
          }
        });
      }
    };

    detectionIntervalRef.current = setInterval(detectFaces, 100);
  };

  // Load face-api models and fetch faces from DB
  useEffect(() => {
    if (!user) return;

    const loadAssets = async () => {
      try {
        // Load face-api models
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
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

  // Restart face detection when display mode changes (only if camera is already running)
  useEffect(() => {
    if (isWebcamStarted && modelsLoaded && videoRef.current && canvasRef.current) {
      startFaceDetection();
    }
  }, [displayMode, isWebcamStarted, modelsLoaded]);

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
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
              .withFaceLandmarks()
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

  // Start webcam
  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 720, height: 560 },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsWebcamStarted(true);
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

    const displaySize = { width: video.width, height: video.height };
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 text-lg">Loading Memory Care...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <nav className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 sm:h-20">
            <div className="flex items-center">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-green-500 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">MC</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                  Memory Care
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4">
              {user ? (
                <>
                  <span className="hidden sm:block text-slate-600 text-sm">Welcome, {user.email}</span>
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

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {user ? (
          <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
            {/* Welcome Section */}
            <div className="bg-white/70 backdrop-blur-sm overflow-hidden shadow-xl rounded-2xl border border-blue-100">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-4 flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                  Welcome to Memory Care
                </h2>
                <p className="text-slate-600 mb-4 text-sm sm:text-base">
                  The face recognition system is active. Use the camera feed below to identify registered individuals.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/person" className="text-indigo-600 hover:underline font-medium">
                    👥 Manage Registered Persons
                  </Link>
                  <Link href="/gemini-tts-test" className="text-green-600 hover:underline font-medium">
                    🎤 Test Gemini Text-to-Speech
                  </Link>
                </div>
              </div>
            </div>

            {/* Face Detection Section */}
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 border border-blue-100">
              <h3 className="text-xl sm:text-2xl font-bold text-center mb-6 bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
                🧠 Face Recognition System
              </h3>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                  <div className="flex items-center">
                    <span className="text-red-500 mr-2">⚠️</span>
                    {error}
                  </div>
                </div>
              )}

              <div className="text-center mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:items-center lg:justify-center gap-3 lg:gap-6 mb-6">
                  <div className="flex items-center justify-center gap-2 bg-white/50 rounded-xl p-3">
                    <div className={`w-3 h-3 rounded-full ${modelsLoaded ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                    <span className="text-slate-700 text-sm font-medium">
                      Models: {modelsLoaded ? '✅ Loaded' : '⏳ Loading...'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-center gap-2 bg-white/50 rounded-xl p-3">
                    <div className={`w-3 h-3 rounded-full ${facesLoaded ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                    <span className="text-slate-700 text-sm font-medium">
                      Faces: {facesLoaded ? `✅ ${dbPersons.length} Loaded` : '⏳ Loading...'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-center gap-2 bg-white/50 rounded-xl p-3">
                    <div className={`w-3 h-3 rounded-full ${isWebcamStarted ? 'bg-green-500' : 'bg-gray-400'} ${isWebcamStarted ? 'animate-pulse' : ''}`}></div>
                    <span className="text-slate-700 text-sm font-medium">
                      Camera: {isWebcamStarted ? '🎥 Active' : '📷 Inactive'}
                    </span>
                  </div>
                </div>
                
                {/* Display Mode Toggle */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 text-center">🎯 Display Mode</h4>
                  <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
                    <button
                      onClick={() => setDisplayMode('name')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        displayMode === 'name'
                          ? 'bg-blue-500 text-white shadow-lg'
                          : 'bg-white/70 text-slate-700 hover:bg-blue-100'
                      }`}
                    >
                      📝 Name Only
                    </button>
                    <button
                      onClick={() => setDisplayMode('nameBox')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        displayMode === 'nameBox'
                          ? 'bg-blue-500 text-white shadow-lg'
                          : 'bg-white/70 text-slate-700 hover:bg-blue-100'
                      }`}
                    >
                      📦 Name + Box
                    </button>
                    <button
                      onClick={() => setDisplayMode('nameLandmarks')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        displayMode === 'nameLandmarks'
                          ? 'bg-blue-500 text-white shadow-lg'
                          : 'bg-white/70 text-slate-700 hover:bg-blue-100'
                      }`}
                    >
                      🎯 Name + Box + Landmarks
                    </button>
                  </div>
                </div>
                
                {!isWebcamStarted && modelsLoaded && facesLoaded && (
                  <button
                    onClick={startVideo}
                    className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-lg"
                  >
                    🎥 Start Camera
                  </button>
                )}
              </div>
              {/* Camera Container */}
              <div className="relative flex justify-center">
                <div className="relative">
                  <video
                    ref={videoRef}
                    width="720"
                    height="560"
                    autoPlay
                    muted
                    onPlay={handleVideoPlay}
                    className="rounded-lg border-2 border-gray-300"
                  />
                  <canvas
                    ref={canvasRef}
                    width="720"
                    height="560"
                    className="absolute top-0 left-0 rounded-lg"
                  />
                </div>
              </div>

              <div className="text-center bg-white/50 rounded-2xl p-4 border border-blue-100 mt-6">
                <p className="text-sm sm:text-base text-slate-700">
                  <span className="font-bold">🔍 Recognition Mode:</span> The system will identify registered individuals.
                  <br />
                  <span className="text-green-600 font-semibold">Green = Known person</span>, <span className="text-red-500 font-semibold">Red = Unknown person</span>
                  <br />
                  <span className="font-bold">🎯 Current Display:</span> {
                    displayMode === 'name' ? '📝 Names only' :
                    displayMode === 'nameBox' ? '📦 Names with bounding boxes' :
                    '🎯 Names, boxes, and facial landmarks'
                  }
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-blue-900 mb-2">
              Welcome to Memory Care
            </h2>
            <p
              className="mt-2 mx-auto text-base text-green-700 font-semibold sm:text-lg md:text-xl text-center leading-snug max-w-xs sm:max-w-md md:max-w-2xl"
              style={{ fontSize: "1rem" }}
            >
              Your personal memory care companion. Sign in to access your
              personalized dashboard and start your journey.
            </p>
            <div className="flex justify-center mt-6 mb-4">
              <img
                src="old.jpg"
                alt="Memory Care Hero"
                className="rounded-2xl shadow-lg max-w-xs sm:max-w-md"
                style={{ width: "100%", height: "auto" }}
              />
            </div>

            {/* Quick Sign-in Options - mobile first */}
            <div className="mt-6 w-full max-w-xs mx-auto flex flex-col gap-4">
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex justify-center items-center py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
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
                <span className="px-2 text-gray-500">Or</span>
                <div className="flex-grow border-t border-gray-300" />
              </div>

              <Link
                href="/signup"
                className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Create Account
              </Link>
              <Link
                href="/login"
                className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-indigo-600 bg-indigo-100 hover:bg-indigo-600"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
