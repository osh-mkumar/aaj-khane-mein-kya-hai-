import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "GROQ_API_KEY is not configured for Whisper transcription.",
        },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get("file") as File | null;
    const language = (formData.get("language") as string) || undefined;

    if (!audioFile) {
      return NextResponse.json(
        { success: false, error: "Audio file is required." },
        { status: 400 }
      );
    }

    // Limit audio file size to 25MB
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Audio file exceeds 25MB limit." },
        { status: 413 }
      );
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // Call Groq Whisper transcription with whisper-large-v3-turbo
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      language: language && language !== "auto" ? language.split("-")[0] : undefined,
      response_format: "json",
      temperature: 0,
      prompt: "RasoiOS kitchen speech: Hindi, English, Hinglish, Marathi ingredient names, pantry counts, and fasting updates.",
    });

    return NextResponse.json({
      success: true,
      text: transcription.text?.trim() || "",
      model: "whisper-large-v3-turbo",
    });
  } catch (error) {
    console.error("Whisper transcription error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Whisper transcription failed";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
