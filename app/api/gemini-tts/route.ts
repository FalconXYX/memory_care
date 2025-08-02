import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Gemini API key not configured. Please add GEMINI_API_KEY to your .env.local file",
        },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const result = await model.generateContentStream({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Using a standard, friendly, and clear voice, please say the following sentence: "${text}"`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "audio/webm",
      },
    });

    const readable = new Readable({
      read() {},
    });

    // Stream the audio
    (async () => {
      try {
        for await (const chunk of result.stream) {
          const audioChunkData =
            chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (audioChunkData) {
            readable.push(Buffer.from(audioChunkData, "base64"));
          }
        }
        readable.push(null); // End the stream
      } catch (error) {
        console.error("Error during stream processing:", error);
        readable.destroy(
          error instanceof Error ? error : new Error("Streaming error")
        );
      }
    })();

    return new NextResponse(readable as any, {
      status: 200,
      headers: {
        "Content-Type": "audio/webm",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Gemini TTS error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate speech with Gemini",
        details:
          "Please ensure you have access to the Gemini 1.5 Flash model.",
      },
      { status: 500 }
    );
  }
}

