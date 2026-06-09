"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath } from "@/lib/paths";
import { ceilDisplayQuantity, formatCases } from "@/lib/units";

type RequirementRow = {
  itemType: "raw_material" | "packaging";
  itemId: string;
  itemName: string;
  unit: string;
  plannedQuantity: number;
  unitPriceSnapshot: number;
};

type ExistingReport = {
  id: string;
  status: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
  actualBreakMinutes: number | null;
  actualPeopleCount: number | null;
  actualQuantity: number | null;
  note: string | null;
  consumptions: { itemType: string; itemId: string; actualQuantity: number }[];
};

export default function DailyReportForm({
  planId,
  planStatus,
  planned,
  requirements,
  report,
}: {
  planId: string;
  planStatus: string;
  planned: {
    quantity: number;
    unit: string;
    casePackQty: number | null;
    peopleCount: number;
    startTime: string;
    endTime: string;
  };
  requirements: RequirementRow[];
  report: ExistingReport | null;
}) {
  const router = useRouter();
  const confirmed = report?.status === "confirmed";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consumedOf = (r: RequirementRow) =>
    report?.consumptions.find((c) => c.itemType === r.itemType && c.itemId === r.itemId)?.actualQuantity;

  const [startTime, setStartTime] = useState(report?.actualStartTime ?? planned.startTime);
  const [endTime, setEndTime] = useState(report?.actualEndTime ?? planned.endTime);
  const [breakMinutes, setBreakMinutes] = useState(report?.actualBreakMinutes ?? 0);
  const [peopleCount, setPeopleCount] = useState(report?.actualPeopleCount ?? planned.peopleCount);
  const [quantity, setQuantity] = useState(report?.actualQuantity ?? planned.quantity);
  const [note, setNote] = useState(report?.note ?? "");
  const [consumptions, setConsumptions] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const r of requirements) {
      const key = `${r.itemType}:${r.itemId}`;
      init[key] = consumedOf(r) ?? r.plannedQuantity;
    }
    return init;
  });

  const displayQuantity = ceilDisplayQuantity(quantity) ?? 0;
  const displayPlannedQuantity = ceilDisplayQuantity(planned.quantity) ?? 0;
  const diff = displayQuantity - displayPlannedQuantity;

  function buildBody() {
    return {
      actualStartTime: startTime || undefined,
      actualEndTime: endTime || undefined,
      actualBreakMinutes: Number(breakMinutes),
      // 0人は無効。未入力扱い(undefined)にして API 側で予定人数を使う。
      actualPeopleCount: Number(peopleCount) > 0 ? Number(peopleCount) : undefined,
      actualQuantity: ceilDisplayQuantity(Number(quantity)) ?? 0,
      note: note || null,
      consumptions: requirements.map((r) => ({
        itemType: r.itemType,
        itemId: r.itemId,
        actualQuantity: Number(consumptions[`${r.itemType}:${r.itemId}`] ?? 0),
        unitPriceSnapshot: r.unitPriceSnapshot,
      })),
    };
  }

  async function saveDraft(): Promise<string | null> {
    const res = await fetch(kitagoyaApiPath(`/daily-reports/from-production-plan/${planId}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody()),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(`日報の保存に失敗しました: ${json.error ?? "unknown"}`);
      return null;
    }
    return json.id ?? null;
  }

  async function onSaveDraft() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const id = await saveDraft();
    setBusy(false);
    if (id) {
      setMessage("日報を下書き保存しました。");
      router.refresh();
    }
  }

  async function onConfirm() {
    if (
      !confirm(
        "日報を確定します。確定すると実績で在庫が減り、生産予定は完了になります。よろしいですか？",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const id = report?.id ?? (await saveDraft());
    if (!id) {
      setBusy(false);
      return;
    }
    // 確定前に現在の入力値を必ず保存
    if (report?.id) await saveDraft();
    const res = await fetch(kitagoyaApiPath(`/daily-reports/${id}/confirm`), { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`日報の確定に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("日報を確定しました。実績で在庫・原価を更新しました。");
    router.refresh();
  }

  return (
    <div className="panel">
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}
      {confirmed && <div className="alert info">この日報は確定済みです。実績は在庫台帳に反映されています。</div>}

      <div className="row field-row">
        <label>
          <span>実開始</span>
          <input type="time" value={startTime} disabled={confirmed} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label>
          <span>実終了</span>
          <input type="time" value={endTime} disabled={confirmed} onChange={(e) => setEndTime(e.target.value)} />
        </label>
        <label>
          <span>休憩(分)</span>
          <input
            type="number"
            min={0}
            step={5}
            value={breakMinutes}
            disabled={confirmed}
            onChange={(e) => setBreakMinutes(Number(e.target.value))}
          />
        </label>
        <label>
          <span>実人数</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={peopleCount}
            disabled={confirmed}
            onChange={(e) => setPeopleCount(Number(e.target.value))}
          />
        </label>
        <label>
          <span>実生産数量（{planned.unit}）</span>
          <input
            type="number"
            min={0}
            step={1}
            value={quantity}
            disabled={confirmed}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
          <span className="subtext">
            {formatCases(quantity, { casePackQty: planned.casePackQty, baseUnit: planned.unit })}
          </span>
        </label>
        <label>
          <span>予定比 過不足</span>
          <span className={`badge ${diff === 0 ? "muted" : diff > 0 ? "success" : "danger"}`}>
            {diff > 0 ? "+" : ""}
            {formatCases(diff, { casePackQty: planned.casePackQty, baseUnit: planned.unit })}
          </span>
        </label>
      </div>

      {requirements.length > 0 && (
        <>
          <h3>実使用量（原料・資材）</h3>
          <table>
            <thead>
              <tr>
                <th>区分</th>
                <th>名称</th>
                <th>予定使用量</th>
                <th>実使用量</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map((r) => {
                const key = `${r.itemType}:${r.itemId}`;
                return (
                  <tr key={key}>
                    <td>{r.itemType === "raw_material" ? "原料" : "資材"}</td>
                    <td>{r.itemName}</td>
                    <td className="right">
                      {r.plannedQuantity} {r.unit}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.0001"
                        value={consumptions[key] ?? 0}
                        disabled={confirmed}
                        onChange={(e) => setConsumptions({ ...consumptions, [key]: Number(e.target.value) })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div className="field-row">
        <label className="full-field">
          <span>備考・トラブル等</span>
          <textarea value={note} disabled={confirmed} rows={2} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      {!confirmed && (
        <div className="row form-actions">
          <button type="button" className="secondary" onClick={onSaveDraft} disabled={busy || planStatus === "cancelled"}>
            {busy ? "処理中..." : "日報を下書き保存"}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || planStatus === "cancelled"}>
            実績を確定（在庫へ反映）
          </button>
        </div>
      )}
    </div>
  );
}
