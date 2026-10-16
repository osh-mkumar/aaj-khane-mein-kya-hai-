"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  CookingPot,
  Mic,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  Users,
  Clock,
  Sparkles,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import type { Household, Recipe } from "@/types";
import type { SavedPlan } from "../meals/MealPlanner";
import { localDate } from "../meals/MealPlanner";
import { api, Badge, Loading, ErrorBox } from "../ui/shared";
import { ActionPreview } from "../voice/ActionPreview";
import { VoiceInput } from "../voice/VoiceInput";
import type { InterpretationResult } from "@/lib/validation/voice";

export function CookDashboard() {
  const [household, setHousehold] = useState<Household>();
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [ttsLanguage, setTtsLanguage] = useState<"hi-IN" | "en-IN" | "mr-IN">("hi-IN");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [cookingProgress, setCookingProgress] = useState<"NOT_STARTED" | "IN_PROGRESS" | "COMPLETED">("NOT_STARTED");
  const [quickMissingIngredient, setQuickMissingIngredient] = useState<string | null>(null);
  const [missingBusy, setMissingBusy] = useState(false);
  const [replanNotice, setReplanNotice] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [interpretationData, setInterpretationData] = useState<{
    interpretation: InterpretationResult;
    provider?: string;
    model?: string;
    fallbackUsed?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load today's plans and household state
  const loadData = async () => {
    try {
      setLoading(true);
      const [h, p] = await Promise.all([
        api<Household>("household"),
        api<SavedPlan[]>(`meals?date=${localDate()}`),
      ]);
      setHousehold(h);
      setPlans(p || []);
      if (p && p.length > 0 && selectedPlanIndex >= p.length) {
        setSelectedPlanIndex(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load kitchen data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Load progress from localStorage
    try {
      const savedProg = localStorage.getItem(`cook_prog_${localDate()}`);
      if (savedProg === "IN_PROGRESS" || savedProg === "COMPLETED") {
        setCookingProgress(savedProg);
      }
    } catch {}
  }, []);

  const activePlan = plans[selectedPlanIndex];
  const activeDishes = activePlan?.snapshot?.menu?.dishes || [];
  const primaryDish = activeDishes[0];
  const instructions = primaryDish?.recipeSnapshot?.instructions || [];

  // Toggle ingredient check
  const toggleIngredientCheck = (name: string) => {
    setCheckedIngredients((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  // Browser Text-To-Speech read aloud
  const readStepAloud = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Speech synthesis is not supported on this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    if (isSpeaking) {
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = ttsLanguage;
    utterance.rate = 0.9;

    // Pick best matching voice
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang.startsWith(ttsLanguage.slice(0, 2)));
    if (voice) utterance.voice = voice;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    speechRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // Quick report ingredient unavailable action
  const handleReportMissing = async (ingredientName: string) => {
    setMissingBusy(true);
    setReplanNotice(null);
    try {
      const res = await fetch("/api/voice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId: household?.id || "demo-household",
          actions: [
            {
              type: "inventory_unavailable",
              ingredient: ingredientName,
            },
          ],
          idempotencyKey: `cook-missing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          transcript: `Cook reported ${ingredientName} unavailable.`,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update kitchen state");
      }

      setQuickMissingIngredient(null);
      await loadData();

      if (json.data?.replan?.needsReplanning) {
        setReplanNotice(
          `Meal plan automatically updated! ${json.data.replan.explanation}`
        );
      } else {
        setReplanNotice(`Marked ${ingredientName} as unavailable in pantry.`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to report missing ingredient");
    } finally {
      setMissingBusy(false);
    }
  };

  // Dietary and Fasting notices for today's meal participants
  const participants = household?.members.filter((m) => m.participating && m.active) || [];
  const fastingMembers = participants.filter((m) => m.fasting);
  const allergicMembers = participants.filter(
    (m) => Array.isArray(m.allergies) && m.allergies.length > 0
  );
  const jainMembers = participants.filter(
    (m) => m.dietaryPreference.toLowerCase() === "jain"
  );

  // YouTube tutorial search link
  const dishName = primaryDish?.recipeName || "Indian Dish";
  const youtubeUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${dishName} recipe in ${ttsLanguage === "hi-IN" ? "hindi" : ttsLanguage === "mr-IN" ? "marathi" : "english"}`
  )}`;

  if (loading && !household) return <Loading />;

  return (
    <div className="cook-dashboard">
      {/* Top Banner & Mode Switcher */}
      <div className="cook-top-header">
        <div>
          <span className="cook-badge">
            <CookingPot size={16} /> COOK DASHBOARD · रसोई सहायक
          </span>
          <h1 className="cook-main-title">What are we cooking today?</h1>
          <p className="cook-subtext">
            Simple, touch-friendly instructions and quick voice reporting for the kitchen.
          </p>
        </div>
        <div className="cook-switch-actions">
          <button
            onClick={() => {
              window.speechSynthesis?.cancel();
              loadData();
            }}
            className="button secondary"
            title="Refresh shared kitchen state"
          >
            <RefreshCw size={16} /> Sync State
          </button>
          <Link
            href="/family"
            onClick={() => localStorage.setItem("rasoios_active_role", "family")}
            className="button primary"
          >
            <Users size={16} /> Switch to Family Dashboard
          </Link>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {/* Replanning Notification Banner */}
      {replanNotice && (
        <div className="approval-confirmation-banner" style={{ background: "#ecfdf5", borderColor: "#a7f3d0" }}>
          <Sparkles className="success-icon" size={24} style={{ color: "#059669" }} />
          <div>
            <strong style={{ color: "#065f46" }}>Kitchen State Updated</strong>
            <p style={{ margin: "2px 0 0", color: "#047857" }}>{replanNotice}</p>
          </div>
        </div>
      )}

      {/* Meal Tabs if multiple meals planned for today */}
      {plans.length > 1 && (
        <div className="cook-meal-tabs">
          {plans.map((p, idx) => (
            <button
              key={p.id}
              className={`cook-tab-btn ${idx === selectedPlanIndex ? "active" : ""}`}
              onClick={() => {
                setSelectedPlanIndex(idx);
                setCurrentStepIndex(0);
              }}
            >
              <span style={{ textTransform: "capitalize" }}>{p.mealType}</span>:{" "}
              {p.snapshot?.menu?.dishes?.map((d) => d.recipeName).join(" + ") || "Meal"}
            </button>
          ))}
        </div>
      )}

      {/* If No Meal Plan Found for Today */}
      {(!plans || plans.length === 0) ? (
        <section className="card cook-empty-card">
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <CookingPot size={48} style={{ color: "#9ca3af", margin: "0 auto 1rem" }} />
            <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>No Meal Scheduled for Today</h2>
            <p style={{ color: "#6b7280", maxWidth: "480px", margin: "0 auto 1.5rem" }}>
              The family has not finalized a meal plan for today yet. You can open the Family Planner or report available inventory stock.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <Link href="/meal-planner" className="button primary">
                Open Meal Planner <ArrowRight size={16} />
              </Link>
              <Link href="/family" className="button secondary">
                View Family Overview
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Section 1: Today's Cooking Hero Card */}
          <section className="card cook-hero-card">
            <div className="cook-hero-details">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <Badge tone="cream">
                  {activePlan.mealType.toUpperCase()}
                </Badge>
                <Badge tone={activePlan.status === "READY" ? "green" : "neutral"}>
                  {activePlan.status === "READY" ? "Ready to Prepare" : activePlan.status.replaceAll("_", " ")}
                </Badge>
                {/* Progress Status */}
                <span className={`cook-status-pill status-${cookingProgress.toLowerCase()}`}>
                  {cookingProgress === "NOT_STARTED" && "Not Started"}
                  {cookingProgress === "IN_PROGRESS" && "Cooking In Progress"}
                  {cookingProgress === "COMPLETED" && "Meal Completed"}
                </span>
              </div>

              <h2 className="cook-dish-title">{primaryDish?.recipeName || "Scheduled Dish"}</h2>

              <div className="cook-meta-row">
                <span>
                  <Users size={16} /> <strong>{activePlan.snapshot?.request?.servings || 4} Servings</strong>
                </span>
                <span>
                  <Clock size={16} /> <strong>~{primaryDish?.minutes || 30} mins</strong> total
                </span>
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cook-youtube-link"
                >
                  <ExternalLink size={14} /> Watch on YouTube
                </a>
              </div>

              {/* Multiple dishes note for mixed diets */}
              {activeDishes.length > 1 && (
                <div className="split-meal-alert">
                  <strong>Multi-Dish Plan:</strong>
                  {activeDishes.map((d, i) => (
                    <div key={i} style={{ marginTop: "4px" }}>
                      • <strong>{d.recipeName}</strong> for {d.memberNames.join(", ")} ({d.servings} servings)
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dietary Warnings Box */}
            <div className="cook-dietary-box">
              <h3 style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.95rem", margin: "0 0 8px", color: "#92400e" }}>
                <AlertTriangle size={18} /> Important Dietary Instructions
              </h3>
              {fastingMembers.length > 0 && (
                <div className="diet-alert-item warning">
                  <strong>Vrat / Fasting:</strong> {fastingMembers.map((m) => m.name).join(", ")} has fasting today. Do NOT use grains, regular salt, onion, or garlic for their serving.
                </div>
              )}
              {jainMembers.length > 0 && (
                <div className="diet-alert-item warning">
                  <strong>Jain Preference:</strong> {jainMembers.map((m) => m.name).join(", ")}. Do NOT use root vegetables (potatoes, carrots), onions, or garlic.
                </div>
              )}
              {allergicMembers.length > 0 && (
                <div className="diet-alert-item danger">
                  <strong>Allergies:</strong>{" "}
                  {allergicMembers
                    .map((m) => `${m.name} (${(m.allergies as string[]).join(", ")})`)
                    .join("; ")}
                </div>
              )}
              {fastingMembers.length === 0 && jainMembers.length === 0 && allergicMembers.length === 0 && (
                <p style={{ margin: 0, color: "#166534", fontSize: "0.88rem" }}>
                  ✓ Standard household meal. No special dietary restrictions active for today.
                </p>
              )}
            </div>
          </section>

          <div className="cook-columns-layout">
            {/* Section 2: Interactive Ingredients Checklist */}
            <section className="card cook-checklist-card">
              <div className="section-heading">
                <h2>
                  <CheckCircle2 size={20} style={{ color: "#2e5927" }} /> Ingredients Needed
                </h2>
                <span className="muted" style={{ fontSize: "0.85rem" }}>
                  Tap items as you gather them
                </span>
              </div>

              <div className="cook-ingredients-list">
                {(primaryDish?.requirements || []).map((req, i) => {
                  const isChecked = !!checkedIngredients[req.name];
                  return (
                    <label
                      key={i}
                      className={`cook-ingredient-item ${isChecked ? "checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleIngredientCheck(req.name)}
                        className="cook-checkbox"
                      />
                      <div className="cook-ing-text">
                        <span className="cook-ing-name">{req.name}</span>
                        <span className="cook-ing-qty">
                          {req.quantity !== null ? `${req.quantity} ${req.unit}` : req.unit}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Quick Report Missing Button */}
              <div className="quick-missing-trigger">
                <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                  Something missing on the counter?
                </span>
                <button
                  type="button"
                  onClick={() => setQuickMissingIngredient(primaryDish?.requirements[0]?.name || "paneer")}
                  className="button secondary"
                  style={{ width: "100%", marginTop: "6px" }}
                >
                  <AlertTriangle size={15} /> Report Missing Ingredient
                </button>
              </div>
            </section>

            {/* Section 3: Step-by-Step Cooking Guide */}
            <section className="card cook-steps-card">
              <div className="step-card-header">
                <div>
                  <span className="step-counter">
                    STEP {instructions.length > 0 ? currentStepIndex + 1 : 0} OF {instructions.length}
                  </span>
                  <h2>Cooking Instructions</h2>
                </div>
                {/* Language Selector for TTS */}
                <div className="tts-lang-picker">
                  <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>Voice:</span>
                  <select
                    value={ttsLanguage}
                    onChange={(e) => setTtsLanguage(e.target.value as any)}
                    className="select"
                    style={{ fontSize: "0.85rem", padding: "4px 8px" }}
                  >
                    <option value="hi-IN">Hindi (हिंदी)</option>
                    <option value="en-IN">English</option>
                    <option value="mr-IN">Marathi (मराठी)</option>
                  </select>
                </div>
              </div>

              {instructions.length > 0 ? (
                <div className="active-step-box">
                  <p className="large-step-text">
                    {instructions[currentStepIndex]}
                  </p>

                  <div className="step-action-row">
                    <button
                      onClick={() => readStepAloud(instructions[currentStepIndex])}
                      className={`button speech-read-btn ${isSpeaking ? "speaking" : ""}`}
                    >
                      <Volume2 size={20} />
                      {isSpeaking ? "बोलना रोकें (Stop)" : "बोलकर सुनाएं (Read Step)"}
                    </button>

                    <div className="step-nav-buttons">
                      <button
                        onClick={() => {
                          window.speechSynthesis?.cancel();
                          setIsSpeaking(false);
                          setCurrentStepIndex((prev) => Math.max(0, prev - 1));
                        }}
                        disabled={currentStepIndex === 0}
                        className="button secondary"
                      >
                        <ChevronLeft size={18} /> Prev
                      </button>
                      <button
                        onClick={() => {
                          window.speechSynthesis?.cancel();
                          setIsSpeaking(false);
                          if (currentStepIndex === 0 && cookingProgress === "NOT_STARTED") {
                            setCookingProgress("IN_PROGRESS");
                            try {
                              localStorage.setItem(`cook_prog_${localDate()}`, "IN_PROGRESS");
                            } catch {}
                          }
                          setCurrentStepIndex((prev) =>
                            Math.min(instructions.length - 1, prev + 1)
                          );
                        }}
                        disabled={currentStepIndex >= instructions.length - 1}
                        className="button primary"
                      >
                        Next <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ padding: "2rem", textAlign: "center" }}>
                  No cooking steps recorded for this recipe.
                </p>
              )}

              {/* Cooking Progress Controls */}
              <div className="cook-progress-footer">
                <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Cooking Status:</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    className={`prog-chip ${cookingProgress === "IN_PROGRESS" ? "active" : ""}`}
                    onClick={() => {
                      setCookingProgress("IN_PROGRESS");
                      try {
                        localStorage.setItem(`cook_prog_${localDate()}`, "IN_PROGRESS");
                      } catch {}
                    }}
                  >
                    Cooking in Progress
                  </button>
                  <button
                    className={`prog-chip ${cookingProgress === "COMPLETED" ? "active" : ""}`}
                    onClick={() => {
                      setCookingProgress("COMPLETED");
                      try {
                        localStorage.setItem(`cook_prog_${localDate()}`, "COMPLETED");
                      } catch {}
                      alert("Great job! Marked meal as completed.");
                    }}
                  >
                    <CheckCircle2 size={14} /> Meal Ready & Finished
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Section 4: Report Kitchen Changes via Voice */}
          <section className="card cook-voice-card">
            <div className="section-heading">
              <div>
                <h2>
                  <Mic size={22} style={{ color: "#2e5927" }} /> Report Kitchen Changes (बोलकर अपडेट करें)
                </h2>
                <p className="muted" style={{ fontSize: "0.9rem" }}>
                  Speak or type when an ingredient runs out or stock changes. The meal plan updates automatically.
                </p>
              </div>
            </div>

            {/* Quick voice preset buttons */}
            <div className="quick-voice-chips">
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#4b5563" }}>Quick Voice Examples:</span>
              {[
                "Paneer khatam ho gaya.",
                "Palak aadha kilo bacha hai.",
                "200 gram tamatar use ho gaya.",
                "Aaj aloo nahi hai.",
              ].map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  className="quick-phrase-btn"
                  onClick={async () => {
                    setVoiceTranscript(phrase);
                    setIsVoiceProcessing(true);
                    try {
                      const res = await fetch("/api/voice/interpret", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ transcript: phrase }),
                      });
                      const d = await res.json();
                      if (d.success) {
                        setInterpretationData({
                          interpretation: d.data,
                          provider: d.provider,
                          model: d.model,
                          fallbackUsed: d.fallbackUsed,
                        });
                      }
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setIsVoiceProcessing(false);
                    }
                  }}
                >
                  "{phrase}"
                </button>
              ))}
            </div>

            <VoiceInput
              value={voiceTranscript}
              onChange={setVoiceTranscript}
              onSubmit={async (text) => {
                if (!text.trim()) return;
                setIsVoiceProcessing(true);
                try {
                  const res = await fetch("/api/voice/interpret", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ transcript: text }),
                  });
                  const d = await res.json();
                  if (d.success) {
                    setInterpretationData({
                      interpretation: d.data,
                      provider: d.provider,
                      model: d.model,
                      fallbackUsed: d.fallbackUsed,
                    });
                  }
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsVoiceProcessing(false);
                }
              }}
              isProcessing={isVoiceProcessing}
            />

            {/* Proposal Confirmation preview modal */}
            {interpretationData && (
              <ActionPreview
                interpretation={interpretationData.interpretation}
                provider={interpretationData.provider}
                model={interpretationData.model}
                fallbackUsed={interpretationData.fallbackUsed}
                onDiscard={() => {
                  setInterpretationData(null);
                  setVoiceTranscript("");
                }}
                onApplySuccess={async (result) => {
                  setInterpretationData(null);
                  setVoiceTranscript("");
                  await loadData();
                  setReplanNotice(
                    result.replan?.needsReplanning
                      ? "Inventory updated! Meal plan revalidated and replanned."
                      : "Kitchen state updated successfully."
                  );
                }}
              />
            )}
          </section>

          {/* Quick Missing Ingredient Modal */}
          {quickMissingIngredient && (
            <div className="modal-backdrop">
              <div className="modal-dialog">
                <div className="modal-header">
                  <h2>Report Ingredient Unavailable</h2>
                  <button
                    onClick={() => setQuickMissingIngredient(null)}
                    className="icon-btn"
                  >
                    ×
                  </button>
                </div>
                <div style={{ padding: "1rem 0" }}>
                  <p style={{ marginBottom: "1rem" }}>
                    Select which ingredient is finished or unavailable in the kitchen:
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem" }}>
                    {(primaryDish?.requirements || []).map((req) => (
                      <button
                        key={req.name}
                        type="button"
                        className={`choice-chip ${quickMissingIngredient === req.name ? "selected" : ""}`}
                        onClick={() => setQuickMissingIngredient(req.name)}
                      >
                        {req.name}
                      </button>
                    ))}
                  </div>

                  <div style={{ background: "#fef3c7", padding: "12px", borderRadius: "8px", border: "1px solid #fde68a", fontSize: "0.9rem", color: "#92400e" }}>
                    ⚠️ Reporting <strong>{quickMissingIngredient}</strong> unavailable will mark it in kitchen inventory and trigger automatic replanning of today's meal.
                  </div>
                </div>

                <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setQuickMissingIngredient(null)}
                    className="button secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReportMissing(quickMissingIngredient)}
                    disabled={missingBusy}
                    className="button primary"
                    style={{ background: "#dc2626" }}
                  >
                    {missingBusy ? "Replanning..." : `Confirm ${quickMissingIngredient} Unavailable`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
