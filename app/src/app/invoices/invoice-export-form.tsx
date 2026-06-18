"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath } from "@/lib/paths";

export default function InvoiceExportForm() {
  const router = useRouter();
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [billingOnly, setBillingOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "danger"; text: string } | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (from > to) {
      setFeedback({ type: "danger", text: "終了日は開始日以降の日付にしてください。" });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const res = await fetch(kitagoyaApiPath("/invoice-exports"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateFrom: from,
        dateTo: to,
        billingTargetOnly: billingOnly,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setFeedback({ type: "danger", text: `エラー: ${json.error ?? "出力に失敗しました。"}` });
      return;
    }
    setFeedback({
      type: "success",
      text: `${json.rowCount ?? 0}件出力 / 合計 ¥${Number(json.totalAmount ?? 0).toLocaleString()}`,
    });
    if (json.rowCount > 0) {
      const blob = new Blob(["﻿" + json.csv.replace(/^﻿/, "")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = json.fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
    router.refresh();
  }

  return (
    <form className="panel invoice-export-panel" onSubmit={run}>
      <div className="invoice-export-head">
        <h2>CSV出力条件</h2>
        <span className="badge">承認済み日報</span>
      </div>
      <div className="invoice-export-grid">
        <label>
          <span>開始日</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label>
          <span>終了日</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </label>
        <label>
          <span>対象</span>
          <select
            value={billingOnly ? "1" : "0"}
            onChange={(e) => setBillingOnly(e.target.value === "1")}
          >
            <option value="1">請求対象のみ</option>
            <option value="0">外注/AX含む</option>
          </select>
        </label>
        <button type="submit" className="invoice-export-submit" disabled={busy}>
          {busy ? "出力中..." : "CSVを出力"}
        </button>
      </div>
      {feedback && <div className={`alert ${feedback.type}`}>{feedback.text}</div>}
    </form>
  );
}
