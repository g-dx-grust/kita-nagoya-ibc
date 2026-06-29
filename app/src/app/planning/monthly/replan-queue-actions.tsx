"use client";

import { useState } from "react";

import { kitagoyaApiPath } from "@/lib/paths";

export default function ReplanQueueActions({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState<"apply" | "ignore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function consume(action: "apply" | "ignore") {
    setBusy(action);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/replan-jobs/${jobId}/apply`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(json.error ?? "replan_job_update_failed");
      return;
    }
    window.location.reload();
  }

  return (
    <div className="table-actions">
      <button type="button" className="secondary" onClick={() => consume("apply")} disabled={busy !== null}>
        {busy === "apply" ? "処理中" : "確認済み"}
      </button>
      <button type="button" className="secondary" onClick={() => consume("ignore")} disabled={busy !== null}>
        {busy === "ignore" ? "処理中" : "見送り"}
      </button>
      {error && <span className="badge warn">{error}</span>}
    </div>
  );
}
