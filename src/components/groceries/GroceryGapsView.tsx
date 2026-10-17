"use client";

import React, { useEffect, useState } from "react";
import { ShoppingCart, AlertCircle, RefreshCw, CheckCircle2, ChevronRight, HelpCircle } from "lucide-react";
import Link from "next/link";
import { Badge, Loading, ErrorBox } from "@/components/ui/shared";

interface GroceryGapItem {
  ingredientId: string;
  name: string;
  requiredQuantity: number | null;
  availableQuantity: number | null;
  shortfall: number | null;
  unit: string;
  affectedRecipes: string[];
  status: string;
  warnings: string[];
}

interface GapsData {
  date: string;
  status: string;
  groceryGaps: GroceryGapItem[];
  confirmationsNeeded: any[];
  plansCount: number;
  stateVersion: number;
}

export function GroceryGapsView() {
  const [data, setData] = useState<GapsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGaps = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/groceries/gaps");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load grocery gaps");
      }
      setData(json.data);
    } catch (err: any) {
      setError(err.message || "Failed to load grocery gaps");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGaps();
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="grocery-gaps-section">
      <div className="page-heading">
        <div>
          <div className="eyebrow">GROCERY GAPS &amp; PANTRY SHORTFALLS</div>
          <h1>
            Kitchen Grocery Gaps<span className="title-dot">.</span>
          </h1>
          <p>
            Aggregated shortfall across all upcoming scheduled meals. Buy only what your planned table needs.
          </p>
        </div>
        <button type="button" className="button secondary" onClick={loadGaps}>
          <RefreshCw size={16} /> Refresh Gaps
        </button>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="section-heading">
            <h2>Pantry Shortfalls ({data?.groceryGaps.length || 0})</h2>
            <Badge tone={data?.groceryGaps.length ? "rose" : "green"}>
              {data?.groceryGaps.length ? "Purchase Needed" : "All Ingredients Covered"}
            </Badge>
          </div>

          {!data?.groceryGaps.length ? (
            <div className="notice-box info" style={{ marginTop: "12px" }}>
              <CheckCircle2 size={18} />
              <span>
                No ingredient shortfalls detected for your active meal plans. Everything needed is in stock!
              </span>
            </div>
          ) : (
            <div className="actions-list" style={{ marginTop: "12px" }}>
              {data.groceryGaps.map((item) => (
                <div key={item.ingredientId} className="action-item-card">
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ fontSize: "15px" }}>{item.name}</strong>
                      <Badge tone="rose">
                        Shortfall: {item.shortfall ?? "Unknown"} {item.unit}
                      </Badge>
                    </div>
                    <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
                      <span>Needed: {item.requiredQuantity ?? "?"} {item.unit}</span>
                      {" · "}
                      <span>Have: {item.availableQuantity ?? 0} {item.unit}</span>
                    </div>
                    {item.affectedRecipes.length > 0 && (
                      <div style={{ fontSize: "12px", color: "#2e5927", marginTop: "4px" }}>
                        Affects: {item.affectedRecipes.join(", ")}
                      </div>
                    )}
                  </div>
                  <Link href={`/inventory`} className="button secondary sm">
                    Update Stock
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="section-heading">
            <h2>Pantry Facts to Confirm ({data?.confirmationsNeeded.length || 0})</h2>
            <Badge tone="amber">Audit Needed</Badge>
          </div>
          <p className="muted text-xs">
            Ingredients required by upcoming recipes that are not recorded or have unknown quantity in inventory.
          </p>

          {!data?.confirmationsNeeded.length ? (
            <div className="notice-box info" style={{ marginTop: "12px" }}>
              <CheckCircle2 size={18} />
              <span>All ingredient quantities are explicitly tracked.</span>
            </div>
          ) : (
            <div className="actions-list" style={{ marginTop: "12px" }}>
              {data.confirmationsNeeded.map((item) => (
                <div key={item.ingredientId} className="action-item-card item-unknown">
                  <div>
                    <strong>{item.name}</strong>
                    <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
                      Required: {item.requiredQuantity ?? "As needed"} {item.unit}
                    </div>
                    {item.warnings.map((w: string, idx: number) => (
                      <small key={idx} style={{ display: "block", color: "#92400e" }}>
                        {w}
                      </small>
                    ))}
                  </div>
                  <Link href={`/inventory`} className="button secondary sm">
                    Confirm in Pantry
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
