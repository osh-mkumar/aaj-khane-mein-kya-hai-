"use client";
import type { Verification } from "@/lib/dietary/verifier";
import { Badge } from "../ui/shared";
export function DietaryCompatibility({ result }: { result: Verification }) {
  return (
    <div className="dietary-result">
      <div className="tags">
        {result.members.map((m) => (
          <Badge
            key={m.memberId}
            tone={
              m.status === "VERIFIED"
                ? "green"
                : m.status === "REJECTED"
                  ? "rose"
                  : "amber"
            }
          >
            {m.memberName}:{" "}
            {m.status === "VERIFIED"
              ? "Rules satisfied"
              : m.status === "REJECTED"
                ? "Not compatible"
                : "Review needed"}
          </Badge>
        ))}
      </div>
      <p>{result.explanation}</p>
      {result.violations.length > 0 && (
        <ul>
          {result.violations.map((v, i) => (
            <li key={i}>{v.message}</li>
          ))}
        </ul>
      )}
      {result.clarifications.length > 0 && (
        <ul>
          {result.clarifications.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      <small>{result.notice}</small>
    </div>
  );
}
