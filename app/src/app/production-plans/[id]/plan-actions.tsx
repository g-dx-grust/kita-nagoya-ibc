"use client";

import { Ban, CheckCircle2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

export default function PlanActions({ planId, status }: { planId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, method = "POST") {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(kitagoyaApiPath(`/production-plans/${planId}${path}`), { method });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(json.error ?? "処理に失敗しました。"));
        return;
      }
      if (path === "/tentative-confirm") setMessage("仮確定しました。");
      else if (path === "/confirm") setMessage("確定しました。");
      else if (path === "/recalculate") setMessage("再計算しました。");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const showTentativeConfirm = status === "draft";
  const showConfirm = status === "tentative_confirmed";

  return (
    <div className="production-plan-actions">
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => call("/recalculate")}
      >
        <RefreshCw size={16} aria-hidden="true" />
        {busy ? "処理中..." : "再計算"}
      </button>
      {showTentativeConfirm && (
        <button type="button" disabled={busy} onClick={() => call("/tentative-confirm")}>
          <CheckCircle2 size={16} aria-hidden="true" />
          仮確定する
        </button>
      )}
      {showConfirm && (
        <button type="button" disabled={busy} onClick={() => call("/confirm")}>
          <CheckCircle2 size={16} aria-hidden="true" />
          確定する
        </button>
      )}
      {status === "confirmed" && <span className="badge success">確定済み</span>}
      {status !== "cancelled" && status !== "completed" && (
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => call("/cancel")}
        >
          <Ban size={16} aria-hidden="true" />
          取消
        </button>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={async () => {
          if (!confirm("本当に削除しますか？")) return;
          await fetch(kitagoyaApiPath(`/production-plans/${planId}`), { method: "DELETE" });
          router.push(kitagoyaPath("/production-plans"));
        }}
      >
        <Trash2 size={16} aria-hidden="true" />
        削除
      </button>
      {message && <span className="badge success">{message}</span>}
      {error && <span className="badge danger">{error}</span>}
    </div>
  );
}
