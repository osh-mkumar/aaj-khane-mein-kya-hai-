"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../ui/shared";
import { usePathname } from "next/navigation";
import {
  CookingPot,
  LayoutDashboard,
  Users,
  Package,
  BookOpen,
  CalendarDays,
  History,
  ArrowUpRight,
  Leaf,
  Mic,
  ShoppingBag,
} from "lucide-react";
const links = [
  ["/family", "Family Dashboard", LayoutDashboard],
  ["/cook", "Cook Dashboard", CookingPot],
  ["/voice", "Voice Assistant", Mic],
  ["/household", "Household", Users],
  ["/inventory", "Kitchen Inventory", Package],
  ["/recipes", "Recipe Library", BookOpen],
  ["/meal-planner", "Meal Planner", CalendarDays],
  ["/groceries", "Grocery Gaps", ShoppingBag],
  ["/activity", "Activity History", History],
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isCook = path === "/cook";
  const [name, setName] = useState("Your household");
  useEffect(() => {
    api<{ name: string }>("household")
      .then((h) => setName(h.name))
      .catch(() => {});
  }, []);
  return (
    <div className="app">
      <aside className="sidebar">
        <Link href={isCook ? "/cook" : "/family"} className="brand">
          <span className="brand-icon">
            <CookingPot size={27} />
          </span>
          <span>
            Rasoi<span className="brand-light">OS</span>
            <small>A little less kitchen chaos.</small>
          </span>
        </Link>
        <div className="nav-caption">YOUR KITCHEN, TOGETHER</div>
        <nav>
          {links.map(([href, label, Icon]) => {
            const isActive =
              path === href ||
              (href === "/family" && path === "/dashboard");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => {
                  try {
                    if (href === "/cook") {
                      localStorage.setItem("rasoios_active_role", "cook");
                    } else if (href === "/family") {
                      localStorage.setItem("rasoios_active_role", "family");
                    }
                  } catch {}
                }}
                className={isActive ? "nav-link active" : "nav-link"}
              >
                <Icon size={19} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <Leaf size={24} />
          <h3>Made for your family.</h3>
          <p>Different tastes. Shared meals. A kitchen that remembers.</p>
          <span>
            RENAISSANCE 2026 <ArrowUpRight size={13} />
          </span>
        </div>
        <div className="household-chip">
          <div className="avatar">{name.slice(0, 1)}</div>
          <div>
            <strong>{name}</strong>
            <small>{isCook ? "Cook Mode Active" : "Family Mode Active"}</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span>
              <span className="status-dot" /> Your kitchen, in sync
            </span>
          </div>

          {/* Role selection switch: Family | Cook */}
          <div className="role-switcher-container">
            <div className="role-switcher" role="radiogroup" aria-label="Dashboard Role">
              <Link
                href="/family"
                onClick={() => {
                  try {
                    localStorage.setItem("rasoios_active_role", "family");
                  } catch {}
                }}
                className={`role-toggle-btn ${!isCook ? "active" : ""}`}
              >
                <Users size={14} /> Family
              </Link>
              <Link
                href="/cook"
                onClick={() => {
                  try {
                    localStorage.setItem("rasoios_active_role", "cook");
                  } catch {}
                }}
                className={`role-toggle-btn ${isCook ? "active" : ""}`}
              >
                <CookingPot size={14} /> Cook
              </Link>
            </div>
          </div>

          <span className="demo-label">
            {isCook ? "COOK VIEW" : "FAMILY VIEW"} <span>·</span> LOCAL DEMO
          </span>
        </header>
        <main>{children}</main>
        <footer>
          RasoiOS <span>·</span> The Kitchen That Remembers, Decides &
          Coordinates.
        </footer>
      </div>
    </div>
  );
}
