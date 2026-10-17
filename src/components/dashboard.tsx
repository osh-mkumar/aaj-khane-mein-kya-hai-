"use client";
import { TodayMeal } from "./meals/TodayMeal";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Users,
  Package,
  BookOpen,
  ArrowUpRight,
  Plus,
  ArrowRight,
  Sun,
  Clock3,
  Leaf,
  CalendarDays,
  Mic,
  ShoppingBag,
  CookingPot,
  AlertTriangle,
} from "lucide-react";
import type { Household, Recipe } from "@/types";
import { api, Badge, Loading, ErrorBox, formatDate } from "./ui/shared";
import { expiryState } from "@/lib/inventory/units";
export function Dashboard() {
  const [data, setData] = useState<Household>();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<Household>("household"), api<Recipe[]>("recipes")])
      .then(([h, r]) => {
        setData(h);
        setRecipes(r);
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!data) return error ? <ErrorBox message={error} /> : <Loading />;
  const active = data.members.filter((m) => m.active && m.participating);
  const soon = data.inventory.filter(
    (i) => i.availability !== "UNAVAILABLE" && expiryState(i.expiryDate),
  );
  const unavailableItems = data.inventory.filter(
    (i) => i.availability === "UNAVAILABLE"
  );
  const fastingMembers = data.members.filter((m) => m.fasting);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FAMILY DASHBOARD · YOUR KITCHEN OVERVIEW</div>
          <h1>
            Welcome to your kitchen<span className="title-dot">.</span>
          </h1>
          <p>Everyone’s preferences. Every ingredient. All in one place.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link
            className="button primary"
            href="/cook"
            onClick={() => {
              try {
                localStorage.setItem("rasoios_active_role", "cook");
              } catch {}
            }}
          >
            <CookingPot size={17} /> Open Cook Dashboard
          </Link>
          <Link className="button secondary" href="/voice">
            <Mic size={17} /> Voice Assistant
          </Link>
          <Link className="button secondary" href="/groceries">
            <ShoppingBag size={17} /> Grocery Gaps
          </Link>
          <Link className="button secondary" href="/inventory">
            <Plus size={17} /> Update inventory
          </Link>
        </div>
      </div>

      {/* Fasting & Low-Stock Notices */}
      {fastingMembers.length > 0 && (
        <div className="notice-box warning" style={{ margin: "1rem 0" }}>
          <AlertTriangle size={18} />
          <span>
            <strong>Fasting Status Active:</strong>{" "}
            {fastingMembers.map((m) => m.name).join(", ")} has fasting today. Meal planner and recommendations will enforce fasting restrictions.
          </span>
        </div>
      )}

      {unavailableItems.length > 0 && (
        <div className="notice-box error" style={{ margin: "0.5rem 0 1rem" }}>
          <AlertTriangle size={18} />
          <span>
            <strong>Pantry Shortfall Alert ({unavailableItems.length}):</strong>{" "}
            {unavailableItems.slice(0, 4).map((i) => i.ingredient?.name || i.ingredientId).join(", ")}
            {unavailableItems.length > 4 ? ` and ${unavailableItems.length - 4} more` : ""} marked unavailable.{" "}
            <Link href="/groceries" style={{ textDecoration: "underline", fontWeight: 600 }}>
              Review Grocery Gaps →
            </Link>
          </span>
        </div>
      )}
      <section className="hero">
        <div className="hero-copy">
          <Badge tone="cream">
            <Sun size={14} /> YOUR EVERYDAY, A LITTLE EASIER
          </Badge>
          <h2>
            Good meals begin
            <br />
            with a kitchen that remembers.
          </h2>
          <p>
            Bring your family’s tastes and your pantry together.
            <br />
            We’ll keep the details, so you can enjoy the table.
          </p>
          <Link href="/household" className="hero-link">
            Meet your household <ArrowRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="plate">
            <div className="rice-dish">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="small-bowl dal" />
            <div className="small-bowl greens" />
            <div className="roti roti-one" />
            <div className="roti roti-two" />
            <div className="garnish" />
          </div>
          <span className="art-label">
            <Leaf size={15} /> A little care in every meal
          </span>
        </div>
      </section>
      <section className="stats">
        {[
          {
            label: "Household members",
            value: data.members.length,
            note: `${active.length} selected for meals`,
            icon: Users,
            href: "/household",
          },
          {
            label: "In your inventory",
            value: data.inventory.length,
            note: `${data.inventory.filter((i) => i.availability === "AVAILABLE").length} confirmed available`,
            icon: Package,
            href: "/inventory",
          },
          {
            label: "Use soon or review",
            value: soon.length,
            note: "Keep a little less from going to waste",
            icon: Clock3,
            href: "/inventory",
          },
          {
            label: "Recipes to make yours",
            value: recipes.length,
            note: `${recipes.filter((r) => r.source === "LOCAL").length} local household favourites`,
            icon: BookOpen,
            href: "/recipes",
          },
        ].map((s) => (
          <Link href={s.href} className="stat" key={s.label}>
            <div className="stat-top">
              <s.icon size={20} />
              <ArrowUpRight size={16} />
            </div>
            <strong>{s.value}</strong>
            <h3>{s.label}</h3>
            <p>{s.note}</p>
          </Link>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="card">
          <div className="section-heading">
            <h2>At the table</h2>
            <Link href="/household">
              Manage household <ArrowRight size={14} />
            </Link>
          </div>
          <p className="muted">Your selected meal participants</p>
          <div className="participant-row">
            {active.length ? (
              active.map((m, i) => (
                <div className="participant" key={m.id}>
                  <div className={`avatar avatar-${i % 4}`}>
                    {m.name.slice(0, 1)}
                  </div>
                  <strong>{m.name}</strong>
                  <small>{m.dietaryPreference}</small>
                  {m.fasting && <Badge tone="amber">Fasting</Badge>}
                </div>
              ))
            ) : (
              <p>No participants selected. Choose members in Household.</p>
            )}
          </div>
          <div className="info-strip">
            <Leaf size={17} />
            <span>
              Every family is different. Your household’s individual rules come
              first.
            </span>
          </div>
        </section>
        <TodayMeal />
        <section className="card">
          <div className="section-heading">
            <h2>A little attention, less waste</h2>
            <Link href="/inventory">
              View inventory <ArrowRight size={14} />
            </Link>
          </div>
          {soon.length ? (
            soon.slice(0, 4).map((i) => (
              <div className="list-row" key={i.id}>
                <div className="ingredient-icon">
                  <Leaf size={19} />
                </div>
                <div className="grow">
                  <strong>{i.ingredient.name}</strong>
                  <small>
                    {i.quantity ?? "Unknown"}{" "}
                    {i.quantity === null ? "quantity" : i.unit} ·{" "}
                    {i.expiryDate && formatDate(i.expiryDate)}
                  </small>
                </div>
                <Badge tone="amber">{expiryState(i.expiryDate)}</Badge>
              </div>
            ))
          ) : (
            <p className="muted">No ingredients nearing their use-by dates.</p>
          )}
        </section>
        <section className="card">
          <div className="section-heading">
            <h2>Around the kitchen</h2>
            <Link href="/activity">
              All activity <ArrowRight size={14} />
            </Link>
          </div>
          {data.activity.slice(0, 4).map((a) => (
            <div className="activity-row" key={a.id}>
              <span className="timeline-dot" />
              <div>
                <p>{a.description}</p>
                <small>
                  {formatDate(a.createdAt)} · State {a.stateVersion}
                </small>
              </div>
            </div>
          ))}
        </section>
      </div>
      <div className="quick-actions">
        <span>MAKE YOURSELF AT HOME</span>
        <Link href="/household?add=1">
          <Plus size={16} /> Add a member
        </Link>
        <Link href="/inventory">
          <Package size={16} /> Update inventory
        </Link>
        <Link href="/recipes">
          <BookOpen size={16} /> Browse recipes
        </Link>
      </div>
    </>
  );
}
