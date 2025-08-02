import { useRef, useState, useEffect } from 'react'
import * as faceapi from 'face-api.js'

export function useFaceRecognition() {
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

  // Load face-api models
  const loadModels = async () => {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models')
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models')
      await faceapi.nets.faceRecognitionNet.loadFromUri('/models')
      setModelsLoaded(true)
    } catch (err) {
      setError('Failed to load face detection models. Please ensure all model files are in the /public/models directory.')
    }
  }

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
      const newFace = {
        name: newPersonName.trim(),
        context: newPersonContext.trim(),
        descriptors: [descriptor]
      }
      const updatedFaces = [...storedFaces, newFace]
      setStoredFaces(updatedFaces)
      const labeledDescriptors = updatedFaces.map(face => 
        new faceapi.LabeledFaceDescriptors(face.name, face.descriptors)
      )
      setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.6))
      setNewPersonName('')
      setNewPersonContext('')
      setMode('recognition')
      setError('')
    } catch (err) {
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
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.5
        }))
        .withFaceLandmarks()
        .withFaceDescriptors()
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      const resizedDetections = faceapi.resizeResults(detections, displaySize)
      faceapi.draw.drawDetections(canvas, resizedDetections)
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)
      if (mode === 'recognition' && faceMatcher && resizedDetections.length > 0) {
        resizedDetections.forEach((detection) => {
          const bestMatch = faceMatcher.findBestMatch(detection.descriptor)
          const { label, distance } = bestMatch
          let displayText = ''
          let textColor = '#ff0000'
          if (label !== 'unknown') {
            const confidence = Math.round((1 - distance) * 100)
            displayText = `${label} (${confidence}%)`
            textColor = '#00ff00'
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
            const lines = displayText.split('\n')
            lines.forEach((line, lineIndex) => {
              const y = box.y - 30 + (lineIndex * 20)
              ctx.strokeText(line, box.x, y)
              ctx.fillText(line, box.x, y)
            })
          }
        })
      } else if (mode === 'registration') {
        resizedDetections.forEach((detection) => {
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
    const interval = setInterval(detectFaces, 100)
    return () => clearInterval(interval)
  }

  return {
    videoRef,
    canvasRef,
    modelsLoaded,
    isWebcamStarted,
    error,
    mode,
    setMode,
    isRegistering,
    newPersonName,
    setNewPersonName,
    newPersonContext,
    setNewPersonContext,
    storedFaces,
    setStoredFaces,
    faceMatcher,
    setFaceMatcher,
    loadModels,
    startVideo,
    registerFace,
    handleVideoPlay
  }
}
