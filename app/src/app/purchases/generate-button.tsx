"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath } from "@/lib/paths";
import { buildPurchaseCandidateGeneratePayload } from "./generate-payload";

export default function GeneratePurchaseCandidatesButton({
  dateFrom,
  dateTo,
  targetMonth,
}: {
  dateFrom: string;
  dateTo: string;
  targetMonth: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generate(mode: "window" | "month_end") {
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/purchase-candidates/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPurchaseCandidateGeneratePayload({ mode, dateFrom, dateTo, targetMonth })),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage("発注候補の生成に失敗しました");
      return;
    }
    setMessage(`${json.rowCount ?? 0}件の発注候補を生成しました`);
    router.refresh();
  }

  return (
    <div className="purchase-generate-control">
      <button type="button" onClick={() => generate("month_end")} disabled={busy}>
        {busy ? "生成中..." : "月末在庫予測で発注候補を生成"}
      </button>
      <button type="button" className="secondary" onClick={() => generate("window")} disabled={busy}>
        表示期間不足から生成
      </button>
      {message && <span className="muted">{message}</span>}
    </div>
  );
}
