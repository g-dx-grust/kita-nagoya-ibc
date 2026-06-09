"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

export default function PlanActions({ planId, status }: { planId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(path: string, method = "POST") {
    setBusy(true);
    try {
      await fetch(kitagoyaApiPath(`/production-plans/${planId}${path}`), { method });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row">
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => call("/recalculate")}
      >
        再計算
      </button>
      {status !== "confirmed" && status !== "completed" && (
        <button type="button" disabled={busy} onClick={() => call("/confirm")}>
          確定する
        </button>
      )}
      {status !== "cancelled" && status !== "completed" && (
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => call("/cancel")}
        >
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
        削除
      </button>
    </div>
  );
}
