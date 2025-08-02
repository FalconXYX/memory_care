'use client'

import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useEffect, useRef, useState } from 'react'
import * as faceapi from 'face-api.js'

export default function Home() {
  const { user, loading, signOut } = useAuth()
  
  // Face detection states
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [isWebcamStarted, setIsWebcamStarted] = useState(false)
  const [error, setError] = useState<string>('')
  const [mode, setMode] = useState<'recognition' | 'registration'>('recognition')
  const [isRegistering, setIsRegistering] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonContext, setNewPersonContext] = useState('')
  const [storedFaces, setStoredFaces] = useState<Array<{
    name: string
    context: string
    descriptors: Float32Array[]
  }>>([])
  const [faceMatcher, setFaceMatcher] = useState<any>(null)

  // Load face-api models when user is logged in
  useEffect(() => {
    if (!user) return

    const loadModels = async () => {
      try {
        console.log('Loading Tiny Face Detector models...')
        
        // Load required models for face detection and recognition
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models')
        await faceapi.nets.faceLandmark68Net.loadFromUri('/models')
        await faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        
        console.log('All models loaded successfully')
        setModelsLoaded(true)
      } catch (err) {
        console.error('Error loading models:', err)
        setError('Failed to load face detection models. Please ensure all model files are in the /public/models directory.')
      }
    }
    
    loadModels()
  }, [user])

  // Start webcam
  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 720, height: 560 } 
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setIsWebcamStarted(true)
      }
    } catch (err) {
      console.error('Error accessing webcam:', err)
      setError('Failed to access webcam. Please allow camera permissions.')
    }
  }

  // Register a new face
  const registerFace = async () => {
    if (!videoRef.current || !newPersonName.trim()) return
    
    setIsRegistering(true)
    try {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.5
        }))
        .withFaceLandmarks()
        .withFaceDescriptors()

      if (detections.length === 0) {
        setError('No face detected. Please ensure your face is clearly visible.')
        return
      }

      if (detections.length > 1) {
        setError('Multiple faces detected. Please ensure only one person is in frame.')
        return
      }

      const descriptor = detections[0].descriptor
      
      // Store the new face
      const newFace = {
        name: newPersonName.trim(),
        context: newPersonContext.trim(),
        descriptors: [descriptor]
      }

      const updatedFaces = [...storedFaces, newFace]
      setStoredFaces(updatedFaces)

      // Update face matcher
      const labeledDescriptors = updatedFaces.map(face => 
        new faceapi.LabeledFaceDescriptors(face.name, face.descriptors)
      )
      setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.6))

      // Reset form
      setNewPersonName('')
      setNewPersonContext('')
      setMode('recognition')
      setError('')
      
      console.log(`Successfully registered: ${newFace.name}`)
    } catch (err) {
      console.error('Error registering face:', err)
      setError('Failed to register face. Please try again.')
    } finally {
      setIsRegistering(false)
    }
  }

  // Detect faces in real-time
  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current || !modelsLoaded) return

    const canvas = canvasRef.current
    const video = videoRef.current
    
    const displaySize = { width: video.width, height: video.height }
    faceapi.matchDimensions(canvas, displaySize)

    const detectFaces = async () => {
      if (!video || !canvas) return

      // Detect faces with landmarks and descriptors
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.5
        }))
        .withFaceLandmarks()
        .withFaceDescriptors()

      // Clear previous drawings
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }

      // Resize detections to match display size
      const resizedDetections = faceapi.resizeResults(detections, displaySize)
      
      // Draw detections
      faceapi.draw.drawDetections(canvas, resizedDetections)
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)

      // Recognition mode: identify faces
      if (mode === 'recognition' && faceMatcher && resizedDetections.length > 0) {
        resizedDetections.forEach((detection, i) => {
          const bestMatch = faceMatcher.findBestMatch(detection.descriptor)
          const { label, distance } = bestMatch
          
          let displayText = ''
          let textColor = '#ff0000' // Red for unknown
          
          if (label !== 'unknown') {
            const confidence = Math.round((1 - distance) * 100)
            displayText = `${label} (${confidence}%)`
            textColor = '#00ff00' // Green for known faces
            
            // Find the person's context
            const person = storedFaces.find(face => face.name === label)
            if (person && person.context) {
              displayText += `\n${person.context}`
            }
          } else {
            displayText = 'Unknown Person'
          }
          
          if (ctx) {
            const box = detection.detection.box
            ctx.fillStyle = textColor
            ctx.font = '16px Arial'
            ctx.strokeStyle = 'black'
            ctx.lineWidth = 2
            
            // Draw text with background
            const lines = displayText.split('\n')
            lines.forEach((line, lineIndex) => {
              const y = box.y - 30 + (lineIndex * 20)
              ctx.strokeText(line, box.x, y)
              ctx.fillText(line, box.x, y)
            })
          }
        })
      } else if (mode === 'registration') {
        // Registration mode: show instructions
        resizedDetections.forEach((detection, i) => {
          const { score } = detection.detection
          const text = detections.length === 1 ? 
            'Ready to register!' : 
            `${detections.length} faces detected - ensure only one person in frame`
          
          if (ctx) {
            ctx.fillStyle = detections.length === 1 ? '#00ff00' : '#ff9900'
            ctx.font = '16px Arial'
            ctx.strokeStyle = 'black'
            ctx.lineWidth = 2
            ctx.strokeText(text, detection.detection.box.x, detection.detection.box.y - 10)
            ctx.fillText(text, detection.detection.box.x, detection.detection.box.y - 10)
          }
        })
      }
    }

    // Run detection every 100ms
    const interval = setInterval(detectFaces, 100)
    
    return () => clearInterval(interval)
  }

  const handleGoogleSignIn = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Memory Care App</h1>
            </div>
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <span className="text-gray-700">Welcome, {user.email}</span>
                  <button
                    onClick={signOut}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
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
          <div className="space-y-6">
            {/* Welcome Section */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Welcome to Memory Care</h2>
                <p className="text-gray-600 mb-4">
                  Use the face recognition system below to help identify people in your life.
                </p>
                <div className="bg-gray-50 p-4 rounded-md">
                  <p><strong>Email:</strong> {user.email}</p>
                  <p><strong>User ID:</strong> {user.id}</p>
                  <p><strong>Last Sign In:</strong> {new Date(user.last_sign_in_at || '').toLocaleString()}</p>
                  {user.app_metadata?.provider && (
                    <p><strong>Sign-in Method:</strong> {user.app_metadata.provider}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Face Detection Section */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-semibold text-center mb-6 text-gray-800">
                Face Recognition System
              </h3>
              
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className={`w-4 h-4 rounded-full ${modelsLoaded ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-gray-700">
                    Models: {modelsLoaded ? 'Loaded' : 'Loading...'}
                  </span>
                  
                  <div className={`w-4 h-4 rounded-full ${isWebcamStarted ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <span className="text-gray-700">
                    Camera: {isWebcamStarted ? 'Active' : 'Inactive'}
                  </span>

                  <div className="text-gray-700">
                    Stored Faces: {storedFaces.length}
                  </div>
                </div>

                {!isWebcamStarted && modelsLoaded && (
                  <button
                    onClick={startVideo}
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-4"
                  >
                    Start Camera
                  </button>
                )}

                {isWebcamStarted && (
                  <div className="flex justify-center gap-4 mb-4">
                    <button
                      onClick={() => setMode('recognition')}
                      className={`px-4 py-2 rounded font-medium ${
                        mode === 'recognition'
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Recognition Mode
                    </button>
                    <button
                      onClick={() => setMode('registration')}
                      className={`px-4 py-2 rounded font-medium ${
                        mode === 'registration'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Add New Face
                    </button>
                  </div>
                )}
              </div>

              {/* Registration Form */}
              {mode === 'registration' && isWebcamStarted && (
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h4 className="text-lg font-semibold mb-4">Register New Person</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name (required)
                      </label>
                      <input
                        type="text"
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter person's name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Context (optional)
                      </label>
                      <input
                        type="text"
                        value={newPersonContext}
                        onChange={(e) => setNewPersonContext(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Daughter, Son, Caregiver, Friend"
                      />
                    </div>
                  </div>
                  <button
                    onClick={registerFace}
                    disabled={!newPersonName.trim() || isRegistering}
                    className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {isRegistering ? 'Registering...' : 'Register Face'}
                  </button>
                </div>
              )}

              {/* Stored Faces List */}
              {storedFaces.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h4 className="text-lg font-semibold mb-4">Registered People</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {storedFaces.map((face, index) => (
                      <div key={index} className="bg-white p-3 rounded border">
                        <div className="font-medium text-gray-800">{face.name}</div>
                        {face.context && (
                          <div className="text-sm text-gray-600">{face.context}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              <div className="mt-6 text-center text-gray-600">
                <p className="text-sm">
                  {mode === 'recognition' ? (
                    <>
                      <strong>Recognition Mode:</strong> Known faces will be identified with their names.
                      <br />
                      Green text = Known person, Red text = Unknown person
                    </>
                  ) : (
                    <>
                      <strong>Registration Mode:</strong> Position yourself in frame and click "Register Face".
                      <br />
                      Ensure only one person is visible for best results.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Welcome to Memory Care
            </h2>
            <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
              Your personal memory care companion. Sign in to access your personalized dashboard and start your journey.
            </p>
            
            {/* Quick Sign-in Options */}
            <div className="mt-8 max-w-md mx-auto">
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex justify-center items-center py-3 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mb-4"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-50 text-gray-500">Or</span>
                </div>
              </div>
            </div>

            <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
              <div className="rounded-md shadow">
                <Link
                  href="/signup"
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg md:px-10"
                >
                  Create Account
                </Link>
              </div>
              <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
                <Link
                  href="/login"
                  className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
