"use client";

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

const CameraView = ({ isFullscreen, onToggleFullscreen }: { isFullscreen: boolean, onToggleFullscreen: (isFs: boolean) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { user } = useAuth();
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isWebcamStarted, setIsWebcamStarted] = useState(false);
  const [error, setError] = useState<string>('');
  const [faceMatcher, setFaceMatcher] = useState<any>(null);
  const [dbPersons, setDbPersons] = useState<Array<{
    id: string;
    name: string;
    description: string;
    relationship: string;
    presignedImageUrl?: string;
  }>>([]);
  const [facesLoaded, setFacesLoaded] = useState(false);
  const [displayMode, setDisplayMode] = useState<'name' | 'nameBox' | 'nameLandmarks'>('name');

  // Load assets and start camera
  useEffect(() => {
    if (!user) return;

    const loadAssets = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
        setModelsLoaded(true);

        const response = await fetch(`/api/persons?userId=${user.id}`);
        if (!response.ok) throw new Error("Failed to fetch persons.");
        const persons = await response.json();
        setDbPersons(persons);

        await loadFacesFromDB(persons);
        startVideo();
      } catch (err) {
        setError("Failed to load assets.");
        console.error(err);
      }
    };

    loadAssets();
  }, [user]);

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
              .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
              .withFaceLandmarks()
              .withFaceDescriptor();
            if (detection) {
              return new faceapi.LabeledFaceDescriptors(person.name, [detection.descriptor]);
            }
            return null;
          } catch (e) {
            console.error(`Failed to load image for ${person.name}`, e);
            return null;
          }
        })
      );
      const validDescriptors = labeledDescriptors.filter(d => d !== null) as faceapi.LabeledFaceDescriptors[];
      if (validDescriptors.length > 0) {
        setFaceMatcher(new faceapi.FaceMatcher(validDescriptors, 0.6));
      }
    } catch (err) {
      setError("Failed to build face matcher.");
      console.error(err);
    } finally {
      setFacesLoaded(true);
    }
  };

  const startVideo = async () => {
    try {
      // Increased resolution for bigger camera size
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsWebcamStarted(true);
      }
    } catch (err) {
      setError("Failed to access webcam.");
    }
  };

  useEffect(() => {
    if (!isWebcamStarted || !videoRef.current || !canvasRef.current || !modelsLoaded) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    const setCanvasSize = () => {
        if (!videoRef.current) return;
        const videoEl = videoRef.current;
        const container = videoEl.parentElement;
        if (!container) return;

        const { videoWidth, videoHeight } = videoEl;
        const { clientWidth, clientHeight } = container;

        const videoRatio = videoWidth / videoHeight;
        const containerRatio = clientWidth / clientHeight;

        let newWidth = clientWidth;
        let newHeight = clientHeight;

        if (videoRatio > containerRatio) {
            newHeight = clientWidth / videoRatio;
        } else {
            newWidth = clientHeight * videoRatio;
        }

        canvas.width = newWidth;
        canvas.height = newHeight;
    }

    const handleResize = () => {
      setCanvasSize();
    }

    video.onloadedmetadata = () => {
      setCanvasSize();
    }
    
    window.addEventListener('resize', handleResize);


    const detectFaces = async () => {
      if (!video.srcObject || video.paused || video.ended) return;
      
      const displaySize = { width: canvas.width, height: canvas.height };
      faceapi.matchDimensions(canvas, displaySize);

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();
      
      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (faceMatcher && resizedDetections.length > 0) {
        resizedDetections.forEach(detection => {
          const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
          const { label, distance } = bestMatch;
          const person = dbPersons.find(p => p.name === label);
          const displayText = label !== 'unknown' ? `${person?.name} (${person?.relationship})` : `Unknown (${(1 - distance).toFixed(2)})`;
          const textColor = label !== 'unknown' ? '#00ff00' : '#ff0000';
          const box = detection.detection.box;

          if (displayMode === 'nameBox' || displayMode === 'nameLandmarks') {
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
          }
          if (displayMode === 'nameLandmarks') {
            const landmarks = detection.landmarks;
            ctx.fillStyle = textColor;
            landmarks.positions.forEach(point => {
              ctx.beginPath();
              ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
          ctx.fillStyle = textColor;
          ctx.font = "20px Arial";
          ctx.strokeStyle = "black";
          ctx.lineWidth = 3;
          ctx.strokeText(displayText, box.x, box.y - 10);
          ctx.fillText(displayText, box.x, box.y - 10);
        });
      }
    };

    const interval = setInterval(detectFaces, 100);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
    }
  }, [isWebcamStarted, modelsLoaded, faceMatcher, displayMode, dbPersons]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-contain"
      />
      <canvas
        ref={canvasRef}
        className="absolute"
      />
      
      {/* Overlaid UI */}
      <div className="absolute inset-0 z-10 flex flex-col">
        {isFullscreen ? (
          <div className="absolute top-4 right-4">
            <button onClick={() => onToggleFullscreen(false)} className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white p-3 rounded-full">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ) : (
          <nav className="bg-white/80 backdrop-blur-sm shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16 sm:h-20">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-green-500 rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold text-lg">MC</span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">Memory Care</h1>
                </div>
                <div className="flex items-center space-x-2 sm:space-x-4">
                  <span className="hidden sm:block text-slate-600 text-sm">Welcome, {user?.email}</span>
                  <button onClick={() => {}} className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-xl text-sm">Sign Out</button>
                </div>
              </div>
            </div>
          </nav>
        )}

        <div className="absolute top-4 left-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2 flex gap-2">
            {['name', 'nameBox', 'nameLandmarks'].map(mode => (
              <button key={mode} onClick={() => setDisplayMode(mode as any)} className={`px-3 py-1 rounded text-sm font-medium ${displayMode === mode ? 'bg-white text-black' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                {mode === 'name' ? '📝' : mode === 'nameBox' ? '📦' : '🎯'}
              </button>
            ))}
          </div>
        </div>

        {!isFullscreen && (
          <div className="absolute bottom-4 right-4">
            <button onClick={() => onToggleFullscreen(true)} className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg">
              📺 Go Fullscreen
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default function Home() {
  const { user, loading, signOut } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(true);

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
    <div className={`min-h-screen ${isFullscreen ? 'bg-black' : 'bg-gradient-to-br from-blue-50 via-white to-green-50'}`}>
      {user ? (
        <div className={`transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50 w-full h-full' : 'relative max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 h-[600px]'}`}>
          <CameraView isFullscreen={isFullscreen} onToggleFullscreen={setIsFullscreen} />
        </div>
      ) : (
          <div className="text-center py-10 px-4">
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
    </div>
  );
}
