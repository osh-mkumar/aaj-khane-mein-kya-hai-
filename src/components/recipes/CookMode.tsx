"use client";

import React, { useState, useEffect } from "react";
import { Volume2, VolumeX, ChevronRight, ChevronLeft, AlertCircle, Youtube, CheckCircle2, RotateCcw } from "lucide-react";
import { Recipe } from "@/types";

interface CookModeProps {
  recipe: Recipe;
  servings?: number;
  onClose?: () => void;
}

export function CookMode({ recipe, servings = recipe.defaultServings, onClose }: CookModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [selectedLang, setSelectedLang] = useState<"hi" | "en" | "mr">("hi");
  const [missingIngredients, setMissingIngredients] = useState<string[]>([]);
  const [reportedMissing, setReportedMissing] = useState(false);

  // Scale ingredient quantities with servings
  const scaleRatio = servings / (recipe.defaultServings || 4);
  const scaledIngredients = recipe.ingredients.map((ing) => {
    const qty = ing.quantity !== null ? Number((ing.quantity * scaleRatio).toFixed(1)) : null;
    return {
      ...ing,
      scaledQuantity: qty,
    };
  });

  const instructions = recipe.instructions.sort((a, b) => a.position - b.position);
  const totalSteps = instructions.length;

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceSupported(false);
    }
  }, []);

  const speakText = (text: string) => {
    if (!voiceSupported || typeof window === "undefined") return;

    window.speechSynthesis.cancel(); // Stop any ongoing speech

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();

    if (selectedLang === "hi") {
      const hiVoice = voices.find((v) => v.lang.startsWith("hi") || v.lang.includes("IN"));
      if (hiVoice) utterance.voice = hiVoice;
      utterance.lang = "hi-IN";
    } else if (selectedLang === "mr") {
      const mrVoice = voices.find((v) => v.lang.startsWith("mr") || v.lang.includes("IN"));
      if (mrVoice) utterance.voice = mrVoice;
      utterance.lang = "mr-IN";
    } else {
      const enVoice = voices.find((v) => v.lang.startsWith("en-IN") || v.lang.startsWith("en"));
      if (enVoice) utterance.voice = enVoice;
      utterance.lang = "en-IN";
    }

    utterance.rate = 0.95;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const handleNextStep = () => {
    stopSpeaking();
    if (currentStep < totalSteps - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      if (isSpeaking) {
        speakText(`Step ${next + 1}: ${instructions[next].text}`);
      }
    }
  };

  const handlePrevStep = () => {
    stopSpeaking();
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      if (isSpeaking) {
        speakText(`Step ${prev + 1}: ${instructions[prev].text}`);
      }
    }
  };

  // Generate safe YouTube Search URL in selected language without scraping or API keys
  const langLabel = selectedLang === "hi" ? "hindi" : selectedLang === "mr" ? "marathi" : "english";
  const youtubeSearchQuery = encodeURIComponent(`${recipe.name} recipe in ${langLabel}`);
  const youtubeUrl = `https://www.youtube.com/results?search_query=${youtubeSearchQuery}`;

  const toggleMissing = (name: string) => {
    setMissingIngredients((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  return (
    <div className="cook-mode-card card">
      <div className="section-heading">
        <div>
          <span className="badge amber">COOK MODE (HANDS-FREE ASSISTANT)</span>
          <h2>{recipe.name}</h2>
          <p className="muted">
            {servings} servings · Prep: {recipe.prepMinutes}m · Cook: {recipe.cookMinutes}m
          </p>
        </div>
        {onClose && (
          <button type="button" className="button secondary sm" onClick={onClose}>
            Exit Cook Mode
          </button>
        )}
      </div>

      <div className="cook-mode-toolbar">
        <div className="lang-picker">
          <label>Audio Language:</label>
          <select
            value={selectedLang}
            onChange={(e) => {
              stopSpeaking();
              setSelectedLang(e.target.value as any);
            }}
          >
            <option value="hi">Hindi (हिन्दी)</option>
            <option value="en">English</option>
            <option value="mr">Marathi (मराठी)</option>
          </select>
        </div>

        <div className="audio-actions">
          {voiceSupported ? (
            isSpeaking ? (
              <button type="button" className="button danger sm" onClick={stopSpeaking}>
                <VolumeX size={16} /> Stop voice
              </button>
            ) : (
              <button
                type="button"
                className="button secondary sm"
                onClick={() =>
                  speakText(
                    `Step ${currentStep + 1} of ${totalSteps}. ${instructions[currentStep]?.text}`
                  )
                }
              >
                <Volume2 size={16} /> Read aloud
              </button>
            )
          ) : (
            <small className="muted">Voice synthesis not supported in this browser.</small>
          )}

          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button secondary sm youtube-link"
            title="Watch video tutorials for this dish on YouTube"
          >
            <Youtube size={16} color="#c4302b" /> Video Tutorials
          </a>
        </div>
      </div>

      {/* Step Focus Area */}
      <div className="step-display-box">
        <div className="step-header">
          <span className="step-counter">
            STEP {currentStep + 1} OF {totalSteps}
          </span>
          <div className="step-progress-bar">
            <div
              className="step-progress-fill"
              style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        <div className="step-content">
          <p className="step-text">{instructions[currentStep]?.text}</p>
        </div>

        <div className="step-nav-controls">
          <button
            type="button"
            className="button secondary"
            onClick={handlePrevStep}
            disabled={currentStep === 0}
          >
            <ChevronLeft size={18} /> Previous Step
          </button>
          <button
            type="button"
            className="button primary"
            onClick={handleNextStep}
            disabled={currentStep === totalSteps - 1}
          >
            Next Step <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Ingredients Checklist and Shortage Report */}
      <div className="cook-ingredients-checklist">
        <h3>Ingredients Checklist ({servings} servings)</h3>
        <p className="muted text-xs">
          Click an ingredient to flag it as missing or low in the kitchen.
        </p>

        <div className="cook-ingredients-grid">
          {scaledIngredients.map((ing) => {
            const isMissing = missingIngredients.includes(ing.ingredient.name);
            return (
              <button
                key={ing.ingredientId}
                type="button"
                className={`cook-ingredient-chip ${isMissing ? "missing" : ""}`}
                onClick={() => toggleMissing(ing.ingredient.name)}
              >
                {isMissing ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                <span>
                  {ing.ingredient.name}: {ing.scaledQuantity ?? "As needed"} {ing.unit}
                </span>
              </button>
            );
          })}
        </div>

        {missingIngredients.length > 0 && (
          <div className="notice-box warning" style={{ marginTop: "12px" }}>
            <AlertCircle size={16} />
            <div>
              <strong>Missing / Low ingredients reported:</strong> {missingIngredients.join(", ")}
              <br />
              <small>Use Voice Assistant or Inventory to update availability.</small>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
