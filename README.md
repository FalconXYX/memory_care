# Memory Care - AI-Powered Memory Assistance

A Next.js application that combines face recognition with AI-powered text-to-speech for memory care assistance.

## Features

### Face Recognition System
- Real-time face detection and recognition using face-api.js
- Database-backed person management with relationships
- Live camera feed with overlay identification

### Gemini-Enhanced Text-to-Speech
- Text optimization using Google's Gemini 2.0 Flash Experimental model
- AI-enhanced text processing for more natural speech delivery
- Intelligent punctuation and pacing improvements
- High-quality speech synthesis with optimized parameters
- Interactive test interface with sample texts

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Google Gemini API key with audio generation access ([Get one here](https://aistudio.google.com/apikey))
- Access to Gemini 2.0 Flash Experimental model

### Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
# Copy the example environment file
cp .env.example .env.local

# Edit .env.local and add your Gemini API key:
GEMINI_API_KEY=your_actual_api_key_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) to access the application

## Usage

### Face Recognition
1. Navigate to the main page and sign in
2. Click "👥 Manage Registered Persons" to add people to the database
3. Return to the main page and start the camera to begin recognition

## API Endpoints

### `/api/gemini-tts` (POST)
Optimizes text using Gemini 2.0 Flash Experimental for enhanced speech synthesis.

**Request:**
```json
{
  "text": "Hello, this is a test message"
}
```

**Response:** 
```json
{
  "success": true,
  "originalText": "Hello, this is a test message",
  "optimizedText": "Hello there! This is a test message.",
  "message": "Text optimized by Gemini for natural speech synthesis",
  "ttsConfig": {
    "rate": 0.9,
    "pitch": 1.0,
    "volume": 1.0,
    "voice": "en-US"
  }
}
```

## Technology Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Face Recognition:** face-api.js with TensorFlow.js models
- **AI Text Enhancement:** Google Generative AI (Gemini 2.0 Flash Experimental)
- **Speech Synthesis:** Web Speech API with Gemini-optimized text
- **Database:** Prisma with Supabase
- **Authentication:** Supabase Auth

## Learn More

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
