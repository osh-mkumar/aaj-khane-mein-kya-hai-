"use client";

import React, { useState } from "react";
import { Mic, Sparkles, AlertCircle } from "lucide-react";
import { VoiceInput } from "./VoiceInput";
import { ActionPreview } from "./ActionPreview";
import { InterpretationResult } from "@/lib/validation/voice";

export function VoiceAssistant() {
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interpretationData, setInterpretationData] = useState<{
    interpretation: InterpretationResult;
    provider: string;
    model: string;
    fallbackUsed: boolean;
  } | null>(null);

  const handleInterpret = async (text: string) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/voice/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Interpretation failed");
      }

      setInterpretationData({
        interpretation: data.data,
        provider: data.provider,
        model: data.model,
        fallbackUsed: data.fallbackUsed,
      });
    } catch (err: any) {
      console.error("Interpretation request failed:", err);
      setError(err.message || "Failed to contact AI interpreter");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscard = () => {
    setInterpretationData(null);
    setTranscript("");
    setError(null);
  };

  return (
    <div className="voice-assistant-section">
      <div className="page-heading">
        <div>
          <div className="eyebrow">VOICE & NATURAL LANGUAGE INPUT (PHASE 3.1)</div>
          <h1>
            Kitchen Voice Assistant<span className="title-dot">.</span>
          </h1>
          <p>
            Speak or type kitchen updates in Hindi, Hinglish, English, or Marathi. AI will interpret and propose structured actions for your review.
          </p>
        </div>
      </div>

      <VoiceInput
        value={transcript}
        onChange={setTranscript}
        onSubmit={handleInterpret}
        isProcessing={isProcessing}
      />

      {error && (
        <div className="notice-box error" style={{ marginTop: "1rem" }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {interpretationData && (
        <div style={{ marginTop: "1.5rem" }}>
          <ActionPreview
            interpretation={interpretationData.interpretation}
            provider={interpretationData.provider}
            model={interpretationData.model}
            fallbackUsed={interpretationData.fallbackUsed}
            onDiscard={handleDiscard}
          />
        </div>
      )}
    </div>
  );
}
