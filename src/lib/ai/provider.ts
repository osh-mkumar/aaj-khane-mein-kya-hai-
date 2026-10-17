import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

export interface AIProviderResult {
  text: string;
  provider: "gemini" | "groq";
  model: string;
  fallbackUsed: boolean;
}

export interface AIExecutionOptions {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
}

export function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/([a-zA-Z0-9_-]{20,})/g, "[REDACTED]");
  }
  return String(err);
}

/**
 * Execute AI prompt using Gemini with Groq fallback.
 * Strictly server-side; accesses API keys from environment variables.
 */
export async function executeAIWithFallback(
  options: AIExecutionOptions
): Promise<AIProviderResult> {
  const errors: string[] = [];
  const fullPrompt = options.systemPrompt
    ? `${options.systemPrompt}\n\nUSER INPUT:\n${options.userPrompt}`
    : options.userPrompt;

  // 1. Try Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const geminiModel = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: fullPrompt,
      });

      const text = response.text?.trim();
      if (text) {
        return {
          text,
          provider: "gemini",
          model: geminiModel,
          fallbackUsed: false,
        };
      }
      errors.push(`Gemini: empty response from model ${geminiModel}`);
    } catch (err) {
      console.error("Gemini invocation failed, attempting Groq fallback:", err);
      errors.push(`Gemini: ${sanitizeError(err)}`);
    }
  } else {
    errors.push("Gemini: GEMINI_API_KEY is not configured");
  }

  // 2. Fallback to Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });

      const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
      const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [];

      if (options.systemPrompt) {
        messages.push({
          role: "system",
          content: options.systemPrompt,
        });
      }
      messages.push({
        role: "user",
        content: options.userPrompt,
      });

      const completion = await groq.chat.completions.create({
        model: groqModel,
        messages,
        temperature: options.temperature ?? 0.1,
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (text) {
        return {
          text,
          provider: "groq",
          model: groqModel,
          fallbackUsed: true,
        };
      }
      errors.push(`Groq: empty response from model ${groqModel}`);
    } catch (err) {
      console.error("Groq fallback invocation failed:", err);
      errors.push(`Groq: ${sanitizeError(err)}`);
    }
  } else {
    errors.push("Groq: GROQ_API_KEY is not configured");
  }

  throw new Error(`All AI providers failed:\n${errors.join("\n")}`);
}
