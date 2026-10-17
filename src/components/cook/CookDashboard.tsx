"use client";

import { useEffect, useState, useRef, useMemo } from "react";
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
import { normalizeIngredient } from "@/lib/recipes/aliases";

export interface MealIngredientItem {
  ingredientId: string;
  name: string;
  quantityText: string;
}

export function CookDashboard() {
  const [household, setHousehold] = useState<Household>();
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [ttsLanguage, setTtsLanguage] = useState<"hi-IN" | "en-IN" | "mr-IN">("hi-IN");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [cookingProgress, setCookingProgress] = useState<"NOT_STARTED" | "IN_PROGRESS" | "COMPLETED">("NOT_STARTED");
  const [isMissingModalOpen, setIsMissingModalOpen] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<MealIngredientItem | null>(null);
  const [missingBusy, setMissingBusy] = useState(false);
  const [missingError, setMissingError] = useState<string | null>(null);
  const [replanAlert, setReplanAlert] = useState<{
    type: "success" | "warning";
    message: string;
    hasReplacement?: boolean;
    shortfalls?: any[];
  } | null>(null);
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

  // Ingredients required for currently selected meal
  const mealIngredients = useMemo<MealIngredientItem[]>(() => {
    if (!primaryDish) return [];
    const seen = new Set<string>();
    const result: MealIngredientItem[] = [];

    // 1. From primaryDish.requirements
    if (primaryDish.requirements && Array.isArray(primaryDish.requirements)) {
      for (const req of primaryDish.requirements) {
        const canonicalId = req.ingredientId || normalizeIngredient(req.name);
        if (!seen.has(canonicalId)) {
          seen.add(canonicalId);
          result.push({
            ingredientId: canonicalId,
            name: req.name || canonicalId,
            quantityText:
              req.quantity !== null && req.quantity !== undefined
                ? `${req.quantity} ${req.unit || ""}`.trim()
                : req.unit || "",
          });
        }
      }
    }

    // 2. From primaryDish.recipeSnapshot.ingredients
    if (result.length === 0 && primaryDish.recipeSnapshot?.ingredients) {
      for (const ing of primaryDish.recipeSnapshot.ingredients as any[]) {
        const canonicalId = ing.ingredientId || normalizeIngredient(ing.name || "");
        if (!seen.has(canonicalId)) {
          seen.add(canonicalId);
          result.push({
            ingredientId: canonicalId,
            name: ing.name || canonicalId,
            quantityText:
              ing.quantity !== null && ing.quantity !== undefined
                ? `${ing.quantity} ${ing.unit || ""}`.trim()
                : ing.unit || "",
          });
        }
      }
    }

    return result;
  }, [primaryDish]);

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
  const handleReportMissing = async (ing: MealIngredientItem) => {
    if (missingBusy) return;
    setMissingBusy(true);
    setMissingError(null);
    setReplanAlert(null);
    try {
      const res = await fetch("/api/voice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: [
            {
              type: "inventory_unavailable",
              ingredient: ing.ingredientId, // Canonical ID ensures exact mapping
              originalIngredientText: ing.name,
            },
          ],
          idempotencyKey: `cook-missing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          transcript: `Cook reported ${ing.name} unavailable via Cook Dashboard.`,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.error || json.details?.formErrors?.[0] || "Failed to update kitchen state"
        );
      }

      setIsMissingModalOpen(false);
      setSelectedIngredient(null);
      await loadData();

      const replan = json.data?.replan;
      if (replan?.needsReplanning) {
        if (replan.hasReplacement) {
          setReplanAlert({
            type: "success",
            message: `${ing.name} marked unavailable in pantry. ${replan.explanation}`,
            hasReplacement: true,
          });
        } else {
          setReplanAlert({
            type: "warning",
            message: `${ing.name} marked unavailable in pantry. ${replan.explanation}`,
            hasReplacement: false,
            shortfalls: replan.shortfalls,
          });
        }
      } else {
        setReplanAlert({
          type: "success",
          message: `Marked ${ing.name} as unavailable in kitchen inventory.`,
          hasReplacement: true,
        });
      }
    } catch (err) {
      setMissingError(err instanceof Error ? err.message : "Failed to report missing ingredient");
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

      {/* Replanning / Inventory Notification Banner */}
      {replanAlert && (
        <div
          className="approval-confirmation-banner"
          style={{
            background: replanAlert.type === "success" ? "#ecfdf5" : "#fffbeb",
            borderColor: replanAlert.type === "success" ? "#a7f3d0" : "#fde68a",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderRadius: "10px",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            {replanAlert.type === "success" ? (
              <Sparkles className="success-icon" size={24} style={{ color: "#059669", flexShrink: 0, marginTop: "2px" }} />
            ) : (
              <AlertTriangle size={24} style={{ color: "#d97706", flexShrink: 0, marginTop: "2px" }} />
            )}
            <div>
              <strong style={{ color: replanAlert.type === "success" ? "#065f46" : "#92400e", fontSize: "0.95rem" }}>
                {replanAlert.type === "success"
                  ? "Kitchen State & Meal Plan Updated"
                  : "Meal Invalidation Notice"}
              </strong>
              <p style={{ margin: "4px 0 0", color: replanAlert.type === "success" ? "#047857" : "#b45309", fontSize: "0.9rem" }}>
                {replanAlert.message}
              </p>
              {replanAlert.hasReplacement === false && (
                <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <Link
                    href="/groceries"
                    className="button secondary"
                    style={{ fontSize: "0.82rem", padding: "4px 10px", borderColor: "#fde68a" }}
                  >
                    <ShoppingBag size={14} /> View Grocery Requirements
                  </Link>
                  <Link
                    href="/meal-planner"
                    className="button secondary"
                    style={{ fontSize: "0.82rem", padding: "4px 10px", borderColor: "#fde68a" }}
                  >
                    Open Meal Planner
                  </Link>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setReplanAlert(null)}
            style={{
              background: "transparent",
              border: 0,
              fontSize: "1.3rem",
              cursor: "pointer",
              color: replanAlert.type === "success" ? "#065f46" : "#92400e",
              lineHeight: 1,
            }}
            title="Dismiss notice"
          >
            ×
          </button>
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
                {mealIngredients.map((req, i) => {
                  const isChecked = !!checkedIngredients[req.name];
                  return (
                    <label
                      key={req.ingredientId || i}
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
                        <span className="cook-ing-qty">{req.quantityText}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedIngredient(req);
                          setIsMissingModalOpen(true);
                          setMissingError(null);
                        }}
                        className="icon-button"
                        title={`Report ${req.name} missing`}
                        style={{ marginLeft: "auto", color: "#b45309" }}
                      >
                        <AlertTriangle size={15} />
                      </button>
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
                  onClick={() => {
                    setIsMissingModalOpen(true);
                    setSelectedIngredient(null);
                    setMissingError(null);
                  }}
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
                  setReplanAlert({
                    type: "success",
                    message: result.replan?.needsReplanning
                      ? "Inventory updated! Meal plan revalidated and replanned."
                      : "Kitchen state updated successfully.",
                    hasReplacement: result.replan?.hasReplacement,
                  });
                }}
              />
            )}
          </section>

          {/* Quick Missing Ingredient Modal */}
          {isMissingModalOpen && (
            <div className="modal-backdrop">
              <div className="modal-dialog" style={{ maxWidth: "520px" }}>
                <div className="modal-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <AlertTriangle size={20} style={{ color: "#d97706" }} />
                    <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Report Missing Ingredient</h2>
                  </div>
                  <button
                    onClick={() => {
                      if (!missingBusy) {
                        setIsMissingModalOpen(false);
                        setSelectedIngredient(null);
                        setMissingError(null);
                      }
                    }}
                    className="icon-btn"
                    disabled={missingBusy}
                  >
                    ×
                  </button>
                </div>
                <div style={{ padding: "1.2rem 0" }}>
                  <p style={{ margin: "0 0 1rem", fontSize: "0.92rem", color: "#4b5563" }}>
                    Select which ingredient is finished or unavailable for{" "}
                    <strong>{primaryDish?.recipeName || "this meal"}</strong>:
                  </p>

                  {/* List of ingredients required for the selected meal */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                      gap: "0.5rem",
                      maxHeight: "220px",
                      overflowY: "auto",
                      marginBottom: "1.2rem",
                      padding: "2px",
                    }}
                  >
                    {mealIngredients.map((ing) => {
                      const isSelected = selectedIngredient?.ingredientId === ing.ingredientId;
                      return (
                        <button
                          key={ing.ingredientId}
                          type="button"
                          className={`choice-chip ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedIngredient(ing);
                            setMissingError(null);
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            padding: "8px 10px",
                            textAlign: "left",
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>
                            {ing.name}
                          </span>
                          <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                            {ing.quantityText}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Error display if operation failed */}
                  {missingError && (
                    <div
                      style={{
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        color: "#991b1b",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        marginBottom: "1rem",
                      }}
                    >
                      {missingError}
                    </div>
                  )}

                  {/* Explicit Confirmation Block */}
                  {selectedIngredient ? (
                    <div
                      style={{
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: "8px",
                        padding: "12px 14px",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: "#92400e",
                          fontSize: "0.92rem",
                          marginBottom: "4px",
                        }}
                      >
                        Mark &quot;{selectedIngredient.name}&quot; as unavailable?
                      </div>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#b45309", lineHeight: 1.4 }}>
                        This will set {selectedIngredient.name} to 0 in persistent inventory and automatically revalidate today&apos;s meal using the Phase 2 solver.
                      </p>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "#6b7280",
                        fontStyle: "italic",
                        textAlign: "center",
                        padding: "8px",
                      }}
                    >
                      Tap an ingredient above to select it.
                    </div>
                  )}
                </div>

                <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMissingModalOpen(false);
                      setSelectedIngredient(null);
                      setMissingError(null);
                    }}
                    disabled={missingBusy}
                    className="button secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedIngredient) {
                        handleReportMissing(selectedIngredient);
                      }
                    }}
                    disabled={!selectedIngredient || missingBusy}
                    className="button primary"
                    style={{ background: "#dc2626" }}
                  >
                    {missingBusy
                      ? "Replanning..."
                      : selectedIngredient
                        ? `Confirm ${selectedIngredient.name} Unavailable`
                        : "Select Ingredient"}
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
