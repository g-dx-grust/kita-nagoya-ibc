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
  const [msg, setMsg] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch(kitagoyaApiPath("/invoice-exports"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateFrom: from,
        dateTo: to,
        billingTargetOnly: billingOnly,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(`エラー: ${json.error}`);
      return;
    }
    setMsg(`${json.rowCount}件出力 / 合計 ¥${json.totalAmount.toLocaleString()}`);
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
    <form className="panel toolbar" onSubmit={run}>
      <label>
        <span>開始日</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
      </label>
      <label>
        <span>終了日</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
      </label>
      <label>
        <span>請求対象のみ</span>
        <select
          value={billingOnly ? "1" : "0"}
          onChange={(e) => setBillingOnly(e.target.value === "1")}
        >
          <option value="1">はい</option>
          <option value="0">いいえ (外注/AX含む)</option>
        </select>
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "出力中..." : "CSVを出力"}
      </button>
      {msg && <span className="badge success">{msg}</span>}
    </form>
  );
}
