"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const savedRole = localStorage.getItem("rasoios_active_role");
      if (savedRole === "cook") {
        router.replace("/cook");
        return;
      }
    } catch {
      // Fallback to family default
    }
    router.replace("/family");
  }, [router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <p style={{ color: "#6b7280" }}>Opening your kitchen...</p>
    </div>
  );
}
