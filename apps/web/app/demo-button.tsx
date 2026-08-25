"use client";

import { useState } from "react";

export function DemoButton() {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function startDemo() {
    setState("loading");
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/demo/scans`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Demo scan failed");
      const payload = await response.json();
      window.location.href = `/scans/${payload.scanId}`;
    } catch {
      setState("error");
    }
  }

  return (
    <button
      className="primaryButton"
      type="button"
      onClick={startDemo}
      disabled={state === "loading"}
    >
      {state === "loading" ? "Queueing scan…" : state === "error" ? "Try again" : "Run demo scan"}
    </button>
  );
}
