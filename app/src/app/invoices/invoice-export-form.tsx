"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath } from "@/lib/paths";

export default function InvoiceExportForm() {
  const router = useRouter();
  const [from, setFrom] = useState(currentMonthStart());
  const [to, setTo] = useState(todayString());
  const [billingOnly, setBillingOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "danger"; text: string } | null>(null);
  const validRange = from <= to;
  const periodDays = useMemo(() => diffDaysInclusive(from, to), [from, to]);
  const periodLabel = validRange ? `${periodDays} 日分` : "期間確認";

  function applyPreset(preset: "thisMonth" | "previousMonth" | "today") {
    if (preset === "today") {
      const today = todayString();
      setFrom(today);
      setTo(today);
      return;
    }
    const base = new Date();
    if (preset === "previousMonth") base.setMonth(base.getMonth() - 1);
    setFrom(monthStart(base));
    setTo(monthEnd(base));
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!validRange) {
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
        <div className="invoice-export-badges">
          <span className="badge">承認済み日報</span>
          <span className={validRange ? "badge info" : "badge danger"}>{periodLabel}</span>
        </div>
      </div>
      <div className="invoice-export-presets" role="group" aria-label="出力期間プリセット">
        <button type="button" className="secondary" onClick={() => applyPreset("thisMonth")}>
          今月
        </button>
        <button type="button" className="secondary" onClick={() => applyPreset("previousMonth")}>
          前月
        </button>
        <button type="button" className="secondary" onClick={() => applyPreset("today")}>
          今日
        </button>
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
        <button type="submit" className="invoice-export-submit" disabled={busy || !validRange}>
          {busy ? "出力中..." : "CSVを出力"}
        </button>
      </div>
      {feedback && <div className={`alert ${feedback.type}`}>{feedback.text}</div>}
    </form>
  );
}

function todayString() {
  return toDateInputValue(new Date());
}

function currentMonthStart() {
  return monthStart(new Date());
}

function monthStart(date: Date) {
  return toDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

function monthEnd(date: Date) {
  return toDateInputValue(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffDaysInclusive(from: string, to: string) {
  const fromTime = new Date(`${from}T00:00:00`).getTime();
  const toTime = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime) return 0;
  return Math.round((toTime - fromTime) / 86_400_000) + 1;
}
