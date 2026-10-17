import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROMPT = "Return exactly this text: RasoiOS AI connected successfully.";

function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/([a-zA-Z0-9_-]{20,})/g, "[REDACTED]");
  }
  return String(err);
}

export async function GET() {
  const errors: string[] = [];

  // 1. Try Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const geminiModel = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: PROMPT,
      });

      const text = response.text?.trim();
      if (text) {
        return NextResponse.json({
          success: true,
          provider: "gemini",
          model: geminiModel,
          message: text,
          fallbackUsed: false,
        });
      }
      errors.push(`Gemini: empty response from model ${geminiModel}`);
    } catch (err) {
      console.error("Gemini attempt failed:", err);
      errors.push(`Gemini: ${sanitizeError(err)}`);
    }
  } else {
    errors.push("Gemini: GEMINI_API_KEY is not configured");
  }

  // 2. Fallback to Groq if Gemini failed
  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });

      const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
      const completion = await groq.chat.completions.create({
        model: groqModel,
        messages: [{ role: "user", content: PROMPT }],
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (text) {
        return NextResponse.json({
          success: true,
          provider: "groq",
          model: groqModel,
          message: text,
          fallbackUsed: true,
        });
      }
      errors.push(`Groq: empty response from model ${groqModel}`);
    } catch (err) {
      console.error("Groq fallback attempt failed:", err);
      errors.push(`Groq: ${sanitizeError(err)}`);
    }
  } else {
    errors.push("Groq: GROQ_API_KEY is not configured");
  }

  // 3. Both failed
  return NextResponse.json(
    {
      success: false,
      provider: null,
      message: "Both AI providers are unavailable.",
      fallbackUsed: true,
      errors,
    },
    { status: 500 }
  );
}
