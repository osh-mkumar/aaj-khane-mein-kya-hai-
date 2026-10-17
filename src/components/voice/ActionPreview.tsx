"use client";

import React, { useState } from "react";
import { Check, Edit2, X, AlertTriangle, ShieldCheck, RefreshCw, Sparkles, ChefHat, Package } from "lucide-react";
import Link from "next/link";
import { ProposedAction, InterpretationResult } from "@/lib/validation/voice";
import { Badge } from "../ui/shared";
import { ApplyVoiceActionsResult } from "@/lib/db/voice-mutations";

interface ActionPreviewProps {
  interpretation: InterpretationResult;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  onDiscard: () => void;
  onApplySuccess?: (result: ApplyVoiceActionsResult) => void;
}

export function ActionPreview({
  interpretation,
  provider,
  model,
  fallbackUsed,
  onDiscard,
  onApplySuccess,
}: ActionPreviewProps) {
  const [actions, setActions] = useState<ProposedAction[]>(interpretation.actions);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyVoiceActionsResult | null>(null);

  const handleActionChange = (index: number, updated: ProposedAction) => {
    const next = [...actions];
    next[index] = updated;
    setActions(next);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleConfirmAndApply = async () => {
    setIsApplying(true);
    setApplyError(null);

    const idempotencyKey = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      const res = await fetch("/api/voice/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: interpretation.transcript,
          idempotencyKey,
          actions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to apply actions");
      }

      setApplyResult(data.data);
      if (onApplySuccess) {
        onApplySuccess(data.data);
      }
    } catch (err: any) {
      console.error("Failed to apply confirmed actions:", err);
      setApplyError(err.message || "Failed to persist actions to kitchen database");
    } finally {
      setIsApplying(false);
    }
  };

  const renderActionReadable = (action: ProposedAction) => {
    switch (action.type) {
      case "inventory_unavailable":
        return (
          <>
            <strong>Mark unavailable / out of stock:</strong>{" "}
            <span className="highlight">{action.ingredient}</span>
            {action.originalIngredientText && (
              <small className="muted"> (from &ldquo;{action.originalIngredientText}&rdquo;)</small>
            )}
          </>
        );
      case "inventory_set_quantity":
        return (
          <>
            <strong>Set stock quantity:</strong>{" "}
            <span className="highlight">{action.ingredient}</span> to{" "}
            <strong>{action.quantity} {action.unit}</strong>
            {action.originalIngredientText && (
              <small className="muted"> (from &ldquo;{action.originalIngredientText}&rdquo;)</small>
            )}
          </>
        );
      case "inventory_add_quantity":
        return (
          <>
            <strong>Add / purchased quantity:</strong>{" "}
            <strong>+{action.quantity} {action.unit}</strong> of{" "}
            <span className="highlight">{action.ingredient}</span>
          </>
        );
      case "inventory_remove_quantity":
        return (
          <>
            <strong>Used / consumed quantity:</strong>{" "}
            <strong>-{action.quantity} {action.unit}</strong> of{" "}
            <span className="highlight">{action.ingredient}</span>
          </>
        );
      case "fasting_status_update":
        return (
          <>
            <strong>Update fasting status:</strong> Member{" "}
            <span className="highlight">{action.member}</span> is{" "}
            <Badge tone={action.active ? "amber" : "neutral"}>
              {action.active ? "Fasting" : "Not fasting"}
            </Badge>
          </>
        );
      case "member_preference_update":
        return (
          <>
            <strong>Member preference update:</strong> Member{" "}
            <span className="highlight">{action.member}</span>{" "}
            {action.dietaryPreference && `diet: ${action.dietaryPreference}`}
            {action.addDislike && `dislikes: +${action.addDislike}`}
          </>
        );
      case "meal_request":
        return (
          <>
            <strong>Requested dish / meal:</strong>{" "}
            <span className="highlight">{action.dish}</span>
            {action.servings && <span> for {action.servings} people</span>}
            {action.mealType && <span> ({action.mealType})</span>}
            {action.date && <span> on {action.date}</span>}
          </>
        );
      case "unknown":
      default:
        return (
          <div className="unknown-action-text">
            <span className="badge warning">Needs clarification / Unhandled</span>
            <p className="reason-text">{action.reason}</p>
            {action.rawText && <small className="muted">Source: &ldquo;{action.rawText}&rdquo;</small>}
          </div>
        );
    }
  };

  return (
    <div className="action-preview-card card">
      <div className="section-heading">
        <div>
          <h2>Proposed Kitchen Changes</h2>
          <p className="muted">
            All AI interpretations are untrusted proposals requiring your review before updating database.
          </p>
        </div>
        {provider && (
          <div className="provider-chip">
            <Badge tone={fallbackUsed ? "amber" : "neutral"}>
              {provider} ({model}) {fallbackUsed && "· Fallback"}
            </Badge>
          </div>
        )}
      </div>

      <div className="original-transcript-display">
        <strong>Original Transcript:</strong>
        <p className="transcript-quote">&ldquo;{interpretation.transcript}&rdquo;</p>
      </div>

      {interpretation.warnings.length > 0 && (
        <div className="warnings-list">
          {interpretation.warnings.map((w, idx) => (
            <div key={idx} className="notice-box warning">
              <AlertTriangle size={16} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {applyError && (
        <div className="notice-box error">
          <AlertTriangle size={16} />
          <span>{applyError}</span>
        </div>
      )}

      {applyResult ? (
        <div className="approval-confirmation-banner">
          <ShieldCheck size={32} className="success-icon" />
          <div style={{ flex: 1 }}>
            <h3>Kitchen Memory Updated &amp; Persisted (State v{applyResult.stateVersion})</h3>
            <p style={{ margin: "6px 0 12px 0" }}>
              All changes were saved atomically to your persistent household database with event logging.
            </p>

            <ul style={{ paddingLeft: "20px", margin: "8px 0", fontSize: "13px" }}>
              {applyResult.appliedActions.map((res, i) => (
                <li key={i} style={{ color: res.success ? "#2b7a2b" : "#b91c1c" }}>
                  {res.message}
                </li>
              ))}
            </ul>

            {/* Replanning Insight */}
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                borderRadius: "6px",
                background: applyResult.replan.needsReplanning ? "#fffdf5" : "#f6f8f1",
                border: "1px solid",
                borderColor: applyResult.replan.needsReplanning ? "#fef08a" : "#d8dfd2",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={16} color="#d97706" />
                <strong>Self-Correcting Meal Replanning Engine:</strong>
              </div>
              <p style={{ fontSize: "13px", marginTop: "4px" }}>
                {applyResult.replan.explanation}
              </p>

              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <Link href="/meal-planner" className="button primary sm">
                  <ChefHat size={14} /> View Meal Planner
                </Link>
                <Link href="/inventory" className="button secondary sm">
                  <Package size={14} /> View Inventory
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="actions-list">
          {actions.map((act, idx) => (
            <div
              key={idx}
              className={`action-item-card ${act.type === "unknown" ? "item-unknown" : ""}`}
            >
              <div className="action-main-content">
                <span className="action-index-badge">{idx + 1}</span>
                <div className="action-details">
                  {editingIndex === idx ? (
                    <div className="action-inline-editor">
                      <strong>Edit Action #{idx + 1}</strong>
                      {"ingredient" in act && (
                        <div className="form-group-inline">
                          <label>Ingredient:</label>
                          <input
                            type="text"
                            value={act.ingredient}
                            onChange={(e) =>
                              handleActionChange(idx, {
                                ...act,
                                ingredient: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                      {"quantity" in act && (
                        <div className="form-group-inline">
                          <label>Quantity:</label>
                          <input
                            type="number"
                            value={act.quantity}
                            onChange={(e) =>
                              handleActionChange(idx, {
                                ...act,
                                quantity: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      )}
                      {"member" in act && (
                        <div className="form-group-inline">
                          <label>Member:</label>
                          <input
                            type="text"
                            value={act.member}
                            onChange={(e) =>
                              handleActionChange(idx, {
                                ...act,
                                member: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                      {"dish" in act && (
                        <div className="form-group-inline">
                          <label>Dish:</label>
                          <input
                            type="text"
                            value={act.dish}
                            onChange={(e) =>
                              handleActionChange(idx, {
                                ...act,
                                dish: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        className="button primary sm"
                        onClick={() => setEditingIndex(null)}
                      >
                        Done Editing
                      </button>
                    </div>
                  ) : (
                    renderActionReadable(act)
                  )}
                </div>
              </div>

              {editingIndex !== idx && (
                <div className="action-row-controls">
                  {act.type !== "unknown" && (
                    <button
                      type="button"
                      className="button icon-btn"
                      onClick={() => setEditingIndex(idx)}
                      title="Edit this proposed action"
                    >
                      <Edit2 size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="button icon-btn danger"
                    onClick={() => handleRemoveAction(idx)}
                    title="Remove this proposed action"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="preview-footer-controls">
        <button
          type="button"
          className="button secondary"
          onClick={onDiscard}
          disabled={isApplying}
        >
          {applyResult ? "Done" : "Cancel & Discard"}
        </button>

        {!applyResult && (
          <button
            type="button"
            className="button primary"
            onClick={handleConfirmAndApply}
            disabled={actions.length === 0 || isApplying}
          >
            {isApplying ? (
              <>
                <RefreshCw size={16} className="spin" /> Updating Kitchen Memory...
              </>
            ) : (
              <>
                <Check size={18} /> Confirm &amp; Apply to Kitchen
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
