"use client";

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

export default function Home() {
  const { user, loading, signOut } = useAuth();

  // Face detection states
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isWebcamStarted, setIsWebcamStarted] = useState(false);
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<"recognition" | "registration">(
    "recognition"
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonContext, setNewPersonContext] = useState("");
  const [storedFaces, setStoredFaces] = useState<
    Array<{
      name: string;
      context: string;
      descriptors: Float32Array[];
    }>
  >([]);
  const [faceMatcher, setFaceMatcher] = useState<any>(null);
  const [referenceImageLoaded, setReferenceImageLoaded] = useState(false);
  const [referencePeople, setReferencePeople] = useState<
    Array<{ name: string; loaded: boolean }>
  >([
    { name: "Thomas", loaded: false },
    { name: "Parth", loaded: false },
  ]);
  const [debugMode, setDebugMode] = useState(false);

  // Load face-api models when user is logged in
  useEffect(() => {
    if (!user) return;

    const loadModels = async () => {
      try {
        // Load required models for face detection and recognition
        await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");

        setModelsLoaded(true);

        // Load reference images for Thomas and Parth
        await loadReferenceImages();
      } catch (err) {
        setError(
          "Failed to load face detection models. Please ensure all model files are in the /public/models directory."
        );
      }
    };

    loadModels();
  }, [user]);

  // Load reference images and create face matcher
  const loadReferenceImages = async () => {
    try {
      const labeledDescriptors = [];

      // Load Thomas's image
      try {
        const thomasImg = await faceapi.fetchImage("/onePersonFace.png");

        const thomasDetection = await faceapi
          .detectSingleFace(
            thomasImg,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 416,
              scoreThreshold: 0.3, // Lower threshold for better detection
            })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (thomasDetection) {
          labeledDescriptors.push(
            new faceapi.LabeledFaceDescriptors("Thomas", [
              thomasDetection.descriptor,
            ])
          );
          setReferencePeople((prev) =>
            prev.map((p) => (p.name === "Thomas" ? { ...p, loaded: true } : p))
          );
        } else {
        }
      } catch (err) {}

      // Load Parth's image
      try {
        const parthImg = await faceapi.fetchImage("/onePersonFace2.png");

        const parthDetection = await faceapi
          .detectSingleFace(
            parthImg,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 416,
              scoreThreshold: 0.3, // Lower threshold for better detection
            })
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (parthDetection) {
          labeledDescriptors.push(
            new faceapi.LabeledFaceDescriptors("Parth", [
              parthDetection.descriptor,
            ])
          );
          setReferencePeople((prev) =>
            prev.map((p) => (p.name === "Parth" ? { ...p, loaded: true } : p))
          );
        } else {
          // Try with more permissive settings
          const retryDetection = await faceapi
            .detectSingleFace(
              parthImg,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 320,
                scoreThreshold: 0.1,
              })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (retryDetection) {
            labeledDescriptors.push(
              new faceapi.LabeledFaceDescriptors("Parth", [
                retryDetection.descriptor,
              ])
            );
            setReferencePeople((prev) =>
              prev.map((p) => (p.name === "Parth" ? { ...p, loaded: true } : p))
            );
          } else {
          }
        }
      } catch (err) {}

      // Create face matcher if we have at least one reference
      if (labeledDescriptors.length > 0) {
        const matcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
        setFaceMatcher(matcher);
        setReferenceImageLoaded(true);
      } else {
        setError(
          "No reference faces could be loaded. Please check onePersonFace.png and onePersonFace2.png in /public directory."
        );
      }
    } catch (err) {
      setError(
        "Failed to load reference images. Please ensure images are in the /public directory."
      );
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

  // Register a new face
  const registerFace = async () => {
    if (!videoRef.current || !newPersonName.trim()) return;

    setIsRegistering(true);
    try {
      const detections = await faceapi
        .detectAllFaces(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 416,
            scoreThreshold: 0.5,
          })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length === 0) {
        setError(
          "No face detected. Please ensure your face is clearly visible."
        );
        return;
      }

      if (detections.length > 1) {
        setError(
          "Multiple faces detected. Please ensure only one person is in frame."
        );
        return;
      }

      const descriptor = detections[0].descriptor;

      // Store the new face
      const newFace = {
        name: newPersonName.trim(),
        context: newPersonContext.trim(),
        descriptors: [descriptor],
      };

      const updatedFaces = [...storedFaces, newFace];
      setStoredFaces(updatedFaces);

      // Update face matcher
      const labeledDescriptors = updatedFaces.map(
        (face) =>
          new faceapi.LabeledFaceDescriptors(face.name, face.descriptors)
      );
      setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.6));

      // Reset form
      setNewPersonName("");
      setNewPersonContext("");
      setMode("recognition");
      setError("");
    } catch (err) {
      setError("Failed to register face. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  };

  // Detect faces in real-time
  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current || !modelsLoaded) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;

    // Use actual video dimensions like the working version
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    const detectFaces = async () => {
      if (!video || !canvas) return;

      // Detect faces with landmarks and descriptors
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

      // Clear previous drawings
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      // Resize detections to match display size
      const resizedDetections = faceapi.resizeResults(detections, displaySize);

      // Draw detections
      faceapi.draw.drawDetections(canvas, resizedDetections);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

      // Recognition mode: identify faces
      if (
        mode === "recognition" &&
        faceMatcher &&
        resizedDetections.length > 0
      ) {
        resizedDetections.forEach((detection, i) => {
          const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
          const { label, distance } = bestMatch;

          let displayText = "";
          let textColor = "#ff0000"; // Red for unknown

          if (label === "Thomas" || label === "Parth") {
            const confidence = Math.round((1 - distance) * 100);
            displayText = `${label} (${confidence}%)`;
            textColor = "#00ff00"; // Green for known faces

            if (debugMode) {
              displayText += `\nDist: ${distance.toFixed(3)}`;
            }
          } else {
            displayText = "Unknown Person";
            if (debugMode) {
              displayText += `\nDist: ${distance.toFixed(3)}`;
            }
          }

          if (ctx) {
            const box = detection.detection.box;
            ctx.fillStyle = textColor;
            ctx.font = debugMode ? "14px Arial" : "20px Arial";
            ctx.strokeStyle = "black";
            ctx.lineWidth = 3;

            // Draw text with background for better visibility
            const lines = displayText.split("\n");
            lines.forEach((line, lineIndex) => {
              const y = box.y - 10 - (lines.length - 1 - lineIndex) * 18;
              ctx.strokeText(line, box.x, y);
              ctx.fillText(line, box.x, y);
            });

            if (debugMode) {
              // Draw detection score
              ctx.fillStyle = "#ffff00";
              ctx.fillText(
                `Score: ${detection.detection.score.toFixed(3)}`,
                box.x,
                box.y + box.height + 20
              );
            }
          }
        });
      } else if (mode === "registration") {
        // Registration mode: show instructions
        resizedDetections.forEach((detection, i) => {
          const { score } = detection.detection;
          const text =
            detections.length === 1
              ? "Ready to register!"
              : `${detections.length} faces detected - ensure only one person in frame`;

          if (ctx) {
            ctx.fillStyle = detections.length === 1 ? "#00ff00" : "#ff9900";
            ctx.font = "16px Arial";
            ctx.strokeStyle = "black";
            ctx.lineWidth = 2;
            ctx.strokeText(
              text,
              detection.detection.box.x,
              detection.detection.box.y - 10
            );
            ctx.fillText(
              text,
              detection.detection.box.x,
              detection.detection.box.y - 10
            );
          }
        });
      }
    };

    // Run detection every 100ms
    const interval = setInterval(detectFaces, 100);

    return () => clearInterval(interval);
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
                  <span className="hidden sm:block text-slate-600 text-sm">
                    Welcome, {user.email}
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

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {user ? (
          <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
            {/* Welcome Section */}
            <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b border-border/40">
              <div className="container flex h-16 items-center space-x-4 sm:justify-between sm:space-x-0">
                <div className="flex gap-6 md:gap-10">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl font-bold text-care-trust">
                      Memory Care
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 items-center justify-end space-x-4">
                  <nav className="flex items-center space-x-1"></nav>
                </div>
              </div>
            </header>

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
                    <div
                      className={`w-3 h-3 rounded-full ${
                        modelsLoaded ? "bg-green-500" : "bg-red-500"
                      } animate-pulse`}
                    ></div>
                    <span className="text-slate-700 text-sm font-medium">
                      Models: {modelsLoaded ? "✅ Loaded" : "⏳ Loading..."}
                    </span>
                  </div>

                  {referencePeople.map((person) => (
                    <div
                      key={person.name}
                      className="flex items-center justify-center gap-2 bg-white/50 rounded-xl p-3"
                    >
                      <div
                        className={`w-3 h-3 rounded-full ${
                          person.loaded ? "bg-green-500" : "bg-red-500"
                        } animate-pulse`}
                      ></div>
                      <span className="text-slate-700 text-sm font-medium">
                        {person.name}:{" "}
                        {person.loaded ? "✅ Ready" : "⏳ Loading..."}
                      </span>
                    </div>
                  ))}

                  <div className="flex items-center justify-center gap-2 bg-white/50 rounded-xl p-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        isWebcamStarted ? "bg-green-500" : "bg-gray-400"
                      } ${isWebcamStarted ? "animate-pulse" : ""}`}
                    ></div>
                    <span className="text-slate-700 text-sm font-medium">
                      Camera: {isWebcamStarted ? "🎥 Active" : "📷 Inactive"}
                    </span>
                  </div>
                </div>

                {!isWebcamStarted && modelsLoaded && referenceImageLoaded && (
                  <button
                    onClick={startVideo}
                    className="bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-lg"
                  >
                    🎥 Start Camera
                  </button>
                )}

                {isWebcamStarted && (
                  <div className="flex flex-col sm:flex-row justify-center gap-3 mb-6">
                    <button
                      onClick={() => setMode("recognition")}
                      className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                        mode === "recognition"
                          ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg"
                          : "bg-white/70 text-slate-700 hover:bg-white/90 border border-blue-200"
                      }`}
                    >
                      🔍 Recognition Mode
                    </button>
                    <button
                      onClick={() => setMode("registration")}
                      className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                        mode === "registration"
                          ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg"
                          : "bg-white/70 text-slate-700 hover:bg-white/90 border border-green-200"
                      }`}
                    >
                      ➕ Add New Face
                    </button>
                    <button
                      onClick={() => setDebugMode(!debugMode)}
                      className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                        debugMode
                          ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg"
                          : "bg-white/70 text-slate-700 hover:bg-white/90 border border-purple-200"
                      }`}
                    >
                      {debugMode ? "🔬 Debug ON" : "🔬 Debug OFF"}
                    </button>
                  </div>
                )}
              </div>

              {/* Registered People Display */}
              {referencePeople.some((p) => p.loaded) && (
                <div className="bg-gradient-to-r from-blue-50 to-green-50 p-4 sm:p-6 rounded-2xl mb-6 border border-blue-100">
                  <h4 className="text-lg font-bold mb-4 text-slate-800 flex items-center">
                    👥 Registered People
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {referencePeople
                      .filter((p) => p.loaded)
                      .map((person) => (
                        <div
                          key={person.name}
                          className="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-blue-200 shadow-sm"
                        >
                          <div className="font-bold text-slate-800 flex items-center">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                            {person.name}
                          </div>
                          <div className="text-sm text-slate-600 mt-1">
                            ✅ Reference Ready
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Registration Form */}
              {mode === "registration" && isWebcamStarted && (
                <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 sm:p-6 rounded-2xl mb-6 border border-green-100">
                  <h4 className="text-lg font-bold mb-4 text-slate-800 flex items-center">
                    ➕ Register New Person
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        Name (required)
                      </label>
                      <input
                        type="text"
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/70 backdrop-blur-sm"
                        placeholder="Enter person's name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        Context (optional)
                      </label>
                      <input
                        type="text"
                        value={newPersonContext}
                        onChange={(e) => setNewPersonContext(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/70 backdrop-blur-sm"
                        placeholder="e.g., Daughter, Son, Caregiver, Friend"
                      />
                    </div>
                  </div>
                  <button
                    onClick={registerFace}
                    disabled={!newPersonName.trim() || isRegistering}
                    className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-6 rounded-xl disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    {isRegistering ? "⏳ Registering..." : "✅ Register Face"}
                  </button>
                </div>
              )}

              {/* Stored Faces List */}
              {storedFaces.length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 sm:p-6 rounded-2xl mb-6 border border-purple-100">
                  <h4 className="text-lg font-bold mb-4 text-slate-800 flex items-center">
                    📝 Dynamic Registered People
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {storedFaces.map((face, index) => (
                      <div
                        key={index}
                        className="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-purple-200 shadow-sm"
                      >
                        <div className="font-bold text-slate-800 flex items-center">
                          <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                          {face.name}
                        </div>
                        {face.context && (
                          <div className="text-sm text-slate-600 mt-1">
                            {face.context}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              <div className="text-center bg-white/50 rounded-2xl p-4 border border-blue-100">
                <p className="text-sm sm:text-base text-slate-700">
                  {mode === "recognition" ? (
                    <>
                      <span className="font-bold">🔍 Recognition Mode:</span>{" "}
                      The system will detect Thomas, Parth, or unknown people.
                      <br />
                      <span className="text-green-600 font-semibold">
                        Green text = Known person
                      </span>
                      ,{" "}
                      <span className="text-red-500 font-semibold">
                        Red text = Unknown person
                      </span>
                      <br />
                      <span className="text-blue-600">
                        Multiple people can be detected simultaneously
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold">➕ Registration Mode:</span>{" "}
                      Position yourself in frame and click "Register Face".
                      <br />
                      <span className="text-amber-600">
                        Ensure only one person is visible for best results.
                      </span>
                    </>
                  )}
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
