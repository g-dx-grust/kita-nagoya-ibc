"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath } from "@/lib/paths";

export default function GeneratePurchaseCandidatesButton({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/purchase-candidates/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateFrom, dateTo, replaceExistingCandidates: true }),
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
    <>
      <button type="button" onClick={generate} disabled={busy}>
        {busy ? "生成中..." : "不足から発注候補を生成"}
      </button>
      {message && <span className="muted">{message}</span>}
    </>
  );
}
