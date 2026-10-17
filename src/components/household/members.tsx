"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  Users,
  ShieldCheck,
} from "lucide-react";
import type { Member } from "@/types";
import { diets, MemberInput } from "@/lib/validation";
import { mealTypes } from "@/lib/validation/planning";
import {
  api,
  Modal,
  Field,
  Badge,
  Loading,
  ErrorBox,
  asList,
  split,
  Empty,
} from "../ui/shared";
const empty: MemberInput = {
  name: "",
  relationship: "",
  dietaryPreference: "Vegetarian",
  allergies: [],
  dislikes: [],
  preferredLanguage: "Hindi",
  active: true,
  participating: true,
  fasting: false,
  excludedIngredients: [],
  excludedCategories: [],
  fastingRule: {
    permittedIngredients: [],
    prohibitedIngredients: [],
    permittedCategories: [],
    prohibitedCategories: [],
    notes: "",
  },
};
function memberForm(m: Member): MemberInput {
  return {
    name: m.name,
    relationship: m.relationship ?? "",
    dietaryPreference: m.dietaryPreference as MemberInput["dietaryPreference"],
    allergies: asList(m.allergies),
    dislikes: asList(m.dislikes),
    preferredLanguage: m.preferredLanguage,
    active: m.active,
    participating: m.participating,
    fasting: m.fasting,
    allowEggs: m.allowEggs,
    excludedIngredients: m.dietaryRules
      .filter((r) => r.target === "INGREDIENT")
      .map((r) => r.value),
    excludedCategories: m.dietaryRules
      .filter((r) => r.target === "CATEGORY")
      .map((r) => r.value),
    fastingRule: m.fastingRule
      ? {
          permittedIngredients: asList(m.fastingRule.permittedIngredients),
          prohibitedIngredients: asList(m.fastingRule.prohibitedIngredients),
          permittedCategories: asList(m.fastingRule.permittedCategories),
          prohibitedCategories: asList(m.fastingRule.prohibitedCategories),
          notes: m.fastingRule.notes,
          startsOn: m.fastingRule.startsOn,
          endsOn: m.fastingRule.endsOn,
          mealType: m.fastingRule
            .mealType as MemberInput["fastingRule"]["mealType"],
        }
      : empty.fastingRule,
  };
}
function MemberEditor({
  member,
  onClose,
  onSave,
}: {
  member: Member | null;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [form, setForm] = useState(member ? memberForm(member) : empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof MemberInput>(key: K, value: MemberInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <Modal
      title={member ? "Edit member" : "A new seat at the table"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              `members${member ? "/" + member.id : ""}`,
              member ? "PATCH" : "POST",
              form,
            );
            await onSave();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Name">
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Relationship (optional)">
            <input
              value={form.relationship ?? ""}
              onChange={(e) => set("relationship", e.target.value)}
            />
          </Field>
          <Field label="Dietary profile">
            <select
              value={form.dietaryPreference}
              onChange={(e) =>
                set(
                  "dietaryPreference",
                  e.target.value as MemberInput["dietaryPreference"],
                )
              }
            >
              {diets.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Preferred language">
            <input
              required
              value={form.preferredLanguage}
              onChange={(e) => set("preferredLanguage", e.target.value)}
              list="languages"
            />
            <datalist id="languages">
              {[
                "Hindi",
                "English",
                "Marathi",
                "Gujarati",
                "Tamil",
                "Telugu",
                "Kannada",
                "Bengali",
              ].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </datalist>
          </Field>
          <div className="info-strip wide">
            Profiles are labels. Configure individual exclusions below,
            including Jain and Satvik preferences. Use comma-separated values.
          </div>
          {(
            [
              "excludedIngredients",
              "excludedCategories",
              "allergies",
              "dislikes",
            ] as const
          ).map((key, i) => (
            <Field
              key={key}
              label={
                [
                  "Excluded ingredients",
                  "Excluded categories",
                  "Allergies — kept separate from dislikes",
                  "Disliked ingredients or dishes",
                ][i]
              }
            >
              <input
                defaultValue={form[key].join(", ")}
                onChange={(e) => set(key, split(e.target.value))}
                placeholder={
                  [
                    "onion, garlic",
                    "root vegetables",
                    "peanuts",
                    "bitter gourd",
                  ][i]
                }
              />
            </Field>
          ))}
          <label className="check wide">
            <input
              type="checkbox"
              checked={form.allowEggs ?? false}
              onChange={(e) => set("allowEggs", e.target.checked)}
            />{" "}
            Allow eggs for a Vegetarian profile (explicit exclusions and
            allergies still apply)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.fasting}
              onChange={(e) => set("fasting", e.target.checked)}
            />{" "}
            Currently fasting
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  active: e.target.checked,
                  participating: e.target.checked ? f.participating : false,
                }))
              }
            />{" "}
            Active household member
          </label>
          <div className="wide">
            <h3>Individual fasting rules</h3>
            <p className="muted">
              These stay saved even when fasting is off. No universal fasting
              rules are assumed.
            </p>
          </div>
          {(
            [
              "permittedIngredients",
              "prohibitedIngredients",
              "permittedCategories",
              "prohibitedCategories",
            ] as const
          ).map((key, i) => (
            <Field
              key={key}
              label={
                [
                  "Permitted ingredients",
                  "Prohibited ingredients",
                  "Permitted categories",
                  "Prohibited categories",
                ][i]
              }
            >
              <input
                defaultValue={form.fastingRule[key].join(", ")}
                onChange={(e) =>
                  set("fastingRule", {
                    ...form.fastingRule,
                    [key]: split(e.target.value),
                  })
                }
              />
            </Field>
          ))}
          <div className="info-strip wide">
            A nonempty permitted list is a whitelist: every ingredient must
            match a permitted ingredient or category. Prohibitions and allergies
            always override permission. Include water, salt and cooking fat if
            permitted.
          </div>
          <Field label="Fasting start date (optional)">
            <input
              type="date"
              value={form.fastingRule.startsOn ?? ""}
              onChange={(e) =>
                set("fastingRule", {
                  ...form.fastingRule,
                  startsOn: e.target.value || null,
                })
              }
            />
          </Field>
          <Field label="Fasting end date (optional)">
            <input
              type="date"
              value={form.fastingRule.endsOn ?? ""}
              onChange={(e) =>
                set("fastingRule", {
                  ...form.fastingRule,
                  endsOn: e.target.value || null,
                })
              }
            />
          </Field>
          <Field label="Fasting meal (optional)">
            <select
              value={form.fastingRule.mealType ?? ""}
              onChange={(e) =>
                set("fastingRule", {
                  ...form.fastingRule,
                  mealType:
                    (e.target
                      .value as MemberInput["fastingRule"]["mealType"]) || null,
                })
              }
            >
              <option value="">All meals</option>
              {mealTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Fasting notes" wide>
            <textarea
              value={form.fastingRule.notes}
              onChange={(e) =>
                set("fastingRule", {
                  ...form.fastingRule,
                  notes: e.target.value,
                })
              }
            />
          </Field>
        </div>
        <ErrorBox message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save member"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Members() {
  const [members, setMembers] = useState<Member[]>();
  const [editing, setEditing] = useState<Member | null | undefined>();
  const [deleting, setDeleting] = useState<Member>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => setMembers(await api<Member[]>("members"));
  useEffect(() => {
    load().catch((e) => setError(e.message));
    if (new URLSearchParams(window.location.search).has("add"))
      setEditing(null);
  }, []);
  async function change(m: Member, body: object) {
    setBusy(true);
    setError("");
    try {
      await api(`members/${m.id}`, "PATCH", body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DIFFERENT TASTES. ONE TABLE.</div>
          <h1>Your household</h1>
          <p>A little understanding makes every meal feel like home.</p>
        </div>
        <button className="button primary" onClick={() => setEditing(null)}>
          <Plus size={17} /> Add member
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="info-banner">
        <Users size={22} />
        <div>
          <strong>
            {members?.filter((m) => m.active && m.participating).length ?? 0}{" "}
            members selected for meals
          </strong>
          <p>
            Choose your default participants. Deactivated members keep their
            profiles and are left out.
          </p>
        </div>
      </div>
      {!members ? (
        <Loading />
      ) : members.length === 0 ? (
        <Empty>Your household is ready for its first member.</Empty>
      ) : (
        <div className="member-grid">
          {members.map((m, i) => (
            <article
              key={m.id}
              className={`card member-card ${!m.active ? "inactive" : ""}`}
            >
              <div className="member-top">
                <div className={`avatar avatar-${i % 4}`}>
                  {m.name.slice(0, 1)}
                </div>
                <Badge tone={m.active ? "green" : "neutral"}>
                  {m.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <h2>{m.name}</h2>
              <p className="muted">
                {m.relationship || "Family member"} · {m.preferredLanguage}
              </p>
              <div className="tags">
                <Badge>{m.dietaryPreference}</Badge>
                {m.fasting && <Badge tone="amber">Fasting</Badge>}
              </div>
              <div className="member-details">
                <span>
                  <ShieldCheck size={15} /> Individual preferences
                </span>
                <p>
                  {m.dietaryRules.length
                    ? m.dietaryRules
                        .map((r) => r.value.replaceAll("-", " "))
                        .join(", ")
                    : "No explicit exclusions"}
                  {m.dietaryRules.length > 0 ? " excluded" : ""}
                </p>
                <p>
                  <strong>Allergies:</strong>{" "}
                  {asList(m.allergies).join(", ") || "None recorded"}
                </p>
                <p>
                  <strong>Dislikes:</strong>{" "}
                  {asList(m.dislikes).join(", ") || "None recorded"}
                </p>
              </div>
              <label className="participant-check">
                <input
                  disabled={!m.active || busy}
                  type="checkbox"
                  checked={m.participating && m.active}
                  onChange={(e) =>
                    change(m, { participating: e.target.checked })
                  }
                />{" "}
                Include in meals
              </label>
              <div className="card-actions">
                <button disabled={busy} onClick={() => setEditing(m)}>
                  <Pencil size={15} /> Edit
                </button>
                <button
                  disabled={busy}
                  onClick={() => change(m, { active: !m.active })}
                >
                  {m.active ? <Pause size={15} /> : <Play size={15} />}{" "}
                  {m.active ? "Deactivate" : "Reactivate"}
                </button>
                <button
                  className="danger-text"
                  aria-label={`Delete ${m.name}`}
                  onClick={() => setDeleting(m)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <MemberEditor
          member={editing}
          onClose={() => setEditing(undefined)}
          onSave={load}
        />
      )}{" "}
      {deleting && (
        <Modal
          title={`Delete ${deleting.name}?`}
          onClose={() => setDeleting(undefined)}
        >
          <p>
            This permanently removes their profile and rules. Household
            inventory and recipes will be preserved.
          </p>
          <ErrorBox message={error} />
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(undefined)}
            >
              Keep member
            </button>
            <button
              disabled={busy}
              className="button danger"
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`members/${deleting.id}`, "DELETE");
                  await load();
                  setDeleting(undefined);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete member
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
