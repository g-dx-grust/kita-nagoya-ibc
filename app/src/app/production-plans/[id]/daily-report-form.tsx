"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  PackageCheck,
  RotateCcw,
  Save,
} from "lucide-react";
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

  const displayQuantity = ceilDisplayQuantity(toFiniteNumber(quantity)) ?? 0;
  const displayPlannedQuantity = ceilDisplayQuantity(planned.quantity) ?? 0;
  const diff = displayQuantity - displayPlannedQuantity;
  const plannedMinutes = netWorkMinutes(planned.startTime, planned.endTime, 0);
  const actualMinutes = netWorkMinutes(startTime, endTime, toFiniteNumber(breakMinutes));
  const invalidTime = Boolean(startTime && endTime && actualMinutes <= 0);
  const plannedLaborHours = (plannedMinutes * planned.peopleCount) / 60;
  const actualLaborHours = (actualMinutes * toFiniteNumber(peopleCount)) / 60;
  const usageRows = requirements.map((r) => {
    const key = `${r.itemType}:${r.itemId}`;
    const actualQuantity = toFiniteNumber(consumptions[key] ?? 0);
    const quantityDiff = actualQuantity - r.plannedQuantity;
    return { ...r, key, actualQuantity, quantityDiff };
  });
  const usageVarianceCount = usageRows.filter((r) => Math.abs(r.quantityDiff) > 0.0001).length;
  const emptyUsageCount = usageRows.filter((r) => r.plannedQuantity > 0 && r.actualQuantity <= 0).length;
  const invalidUsageCount = usageRows.filter((r) => !Number.isFinite(r.actualQuantity) || r.actualQuantity < 0).length;
  const checks = [
    { label: "時間", done: Boolean(startTime && endTime && actualMinutes > 0) },
    { label: "人数", done: toFiniteNumber(peopleCount) > 0 },
    { label: "数量", done: displayQuantity > 0 },
    { label: "使用量", done: requirements.length === 0 || (emptyUsageCount === 0 && invalidUsageCount === 0) },
  ];
  const completedChecks = checks.filter((check) => check.done).length;
  const statusLabel = confirmed ? "確定済み" : report ? "下書き" : "未入力";
  const statusClass = confirmed ? "success" : report ? "warn" : "muted";
  const canSaveDraft = !busy && !confirmed && planStatus !== "cancelled" && !invalidTime && invalidUsageCount === 0;
  const canConfirm = canSaveDraft && checks.every((check) => check.done);
  const actionStatus = planStatus === "cancelled"
    ? "キャンセル済みの予定です"
    : confirmed
      ? "在庫台帳へ反映済みです"
      : canConfirm
        ? "確定できます"
        : canSaveDraft
          ? "下書き保存できます"
          : "入力を確認してください";
  const actionHelp = confirmed
    ? "確定済み日報の修正は履歴管理側の運用で扱います。"
    : canConfirm
      ? "確定すると実績使用量で在庫を更新し、この生産予定は完了になります。"
      : "確定前に時間、人数、数量、実使用量を確認してください。";

  function buildBody() {
    return {
      actualStartTime: startTime || undefined,
      actualEndTime: endTime || undefined,
      actualBreakMinutes: Math.max(0, toFiniteNumber(breakMinutes)),
      // 0人は無効。未入力扱い(undefined)にして API 側で予定人数を使う。
      actualPeopleCount: toFiniteNumber(peopleCount) > 0 ? toFiniteNumber(peopleCount) : undefined,
      actualQuantity: ceilDisplayQuantity(toFiniteNumber(quantity)) ?? 0,
      note: note || null,
      consumptions: requirements.map((r) => ({
        itemType: r.itemType,
        itemId: r.itemId,
        actualQuantity: toFiniteNumber(consumptions[`${r.itemType}:${r.itemId}`] ?? 0),
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
    if (!canConfirm) {
      setError("日報を確定する前に、時間・人数・数量・実使用量を確認してください。");
      return;
    }
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

  function resetActualsToPlan() {
    setStartTime(planned.startTime);
    setEndTime(planned.endTime);
    setBreakMinutes(0);
    setPeopleCount(planned.peopleCount);
    setQuantity(planned.quantity);
    resetConsumptionsToPlan();
    setMessage(null);
    setError(null);
  }

  function resetConsumptionsToPlan() {
    const next: Record<string, number> = {};
    for (const r of requirements) {
      next[`${r.itemType}:${r.itemId}`] = r.plannedQuantity;
    }
    setConsumptions(next);
  }

  return (
    <div className="panel daily-report-plan-panel">
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}
      {confirmed && <div className="alert info">この日報は確定済みです。実績は在庫台帳に反映されています。</div>}
      {requirements.length === 0 && !confirmed && (
        <div className="alert warn">
          この予定には原料・資材の予定使用量がありません。確定前にBOM登録または使用量の扱いを確認してください。
        </div>
      )}
      {invalidTime && <div className="alert danger">実終了時刻と休憩時間を確認してください。実稼働時間が0分以下です。</div>}

      <div className="daily-report-plan-command">
        <div className="daily-report-plan-command-title">
          <span className={`badge ${statusClass}`}>
            {confirmed ? <ClipboardCheck size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
            {statusLabel}
          </span>
          <strong>日報の実績を入力</strong>
          <span>予定値を起点に、現場で変わった数量・時間・使用量だけを直して確定します。</span>
        </div>
        <div className="daily-report-plan-checks" aria-label="日報入力チェック">
          {checks.map((check) => (
            <span key={check.label} className={`badge ${check.done ? "success" : "warn"}`}>
              {check.done ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
              {check.label}
            </span>
          ))}
        </div>
        {!confirmed && (
          <button type="button" className="secondary" onClick={resetActualsToPlan} disabled={busy || planStatus === "cancelled"}>
            <RotateCcw size={15} aria-hidden="true" />
            予定値に戻す
          </button>
        )}
      </div>

      <div className="daily-report-plan-summary-grid">
        <div className="metric">
          <div className="metric-label">入力完了</div>
          <div className="metric-value">
            {completedChecks} / {checks.length}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">実績数量</div>
          <div className="metric-value">
            {formatCases(displayQuantity, { casePackQty: planned.casePackQty, baseUnit: planned.unit })}
          </div>
          <span className={`badge ${diff === 0 ? "muted" : diff > 0 ? "success" : "danger"}`}>
            {diff > 0 ? "+" : ""}
            {formatCases(diff, { casePackQty: planned.casePackQty, baseUnit: planned.unit })}
          </span>
        </div>
        <div className="metric">
          <div className="metric-label">実稼働</div>
          <div className="metric-value">{formatMinutes(actualMinutes)}</div>
          <span className="subtext">予定 {formatMinutes(plannedMinutes)}</span>
        </div>
        <div className="metric">
          <div className="metric-label">人時</div>
          <div className="metric-value">{formatHours(actualLaborHours)}</div>
          <span className="subtext">予定 {formatHours(plannedLaborHours)}</span>
        </div>
        <div className="metric">
          <div className="metric-label">原料・資材</div>
          <div className="metric-value">{usageVarianceCount}件差異</div>
          <span className={emptyUsageCount > 0 ? "warn-value" : "subtext"}>{emptyUsageCount > 0 ? `未入力 ${emptyUsageCount}件` : `${requirements.length}行`}</span>
        </div>
      </div>

      <div className="daily-report-plan-section">
        <div className="daily-report-plan-section-title">
          <Clock3 size={16} aria-hidden="true" />
          <strong>作業実績</strong>
        </div>
        <div className="daily-report-plan-field-grid">
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
              {formatCases(displayQuantity, { casePackQty: planned.casePackQty, baseUnit: planned.unit })}
            </span>
          </label>
          <label className="daily-report-plan-diff-field">
            <span>予定比 過不足</span>
            <span className={`badge ${diff === 0 ? "muted" : diff > 0 ? "success" : "danger"}`}>
              {diff > 0 ? "+" : ""}
              {formatCases(diff, { casePackQty: planned.casePackQty, baseUnit: planned.unit })}
            </span>
          </label>
        </div>
      </div>

      <div className="daily-report-plan-section">
        <div className="daily-report-plan-section-head">
          <div className="daily-report-plan-section-title">
            <PackageCheck size={16} aria-hidden="true" />
            <strong>実使用量（原料・資材）</strong>
          </div>
          {requirements.length > 0 && !confirmed && (
            <button type="button" className="secondary" onClick={resetConsumptionsToPlan} disabled={busy}>
              <RotateCcw size={15} aria-hidden="true" />
              使用量を予定に戻す
            </button>
          )}
        </div>
        {requirements.length > 0 ? (
          <div className="table-frame daily-report-plan-usage-frame">
            <table className="daily-report-plan-usage-table">
              <thead>
                <tr>
                  <th>区分</th>
                  <th>名称</th>
                  <th>予定使用量</th>
                  <th>実使用量</th>
                  <th>差異</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.map((r) => {
                  return (
                    <tr key={r.key} className={r.actualQuantity <= 0 && r.plannedQuantity > 0 ? "row-needs-action" : undefined}>
                      <td data-label="区分">{r.itemType === "raw_material" ? "原料" : "資材"}</td>
                      <td data-label="名称">{r.itemName}</td>
                      <td data-label="予定使用量" className="right">
                        {r.plannedQuantity} {r.unit}
                      </td>
                      <td data-label="実使用量">
                        <div className="daily-report-plan-usage-input">
                          <input
                            type="number"
                            min={0}
                            step="0.0001"
                            value={consumptions[r.key] ?? 0}
                            disabled={confirmed}
                            onChange={(e) => setConsumptions({ ...consumptions, [r.key]: Number(e.target.value) })}
                          />
                          <span>{r.unit}</span>
                        </div>
                      </td>
                      <td data-label="差異">
                        <span className={`badge ${Math.abs(r.quantityDiff) <= 0.0001 ? "muted" : r.quantityDiff > 0 ? "success" : "danger"}`}>
                          {r.quantityDiff > 0 ? "+" : ""}
                          {formatDecimal(r.quantityDiff)} {r.unit}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">この予定には原料・資材の予定使用量がありません。</div>
        )}
      </div>

      <div className="daily-report-plan-section">
        <label className="full-field">
          <span>備考・トラブル等</span>
          <textarea value={note} disabled={confirmed} rows={2} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      {!confirmed && (
        <div className="daily-report-plan-savebar">
          <div>
            <strong>{actionStatus}</strong>
            <span>{actionHelp}</span>
          </div>
          <div className="daily-report-plan-savebar-actions">
            <button type="button" className="secondary" onClick={onSaveDraft} disabled={!canSaveDraft}>
              <Save size={15} aria-hidden="true" />
              {busy ? "処理中..." : "下書き保存"}
            </button>
            <button type="button" onClick={onConfirm} disabled={!canConfirm}>
              <ClipboardCheck size={15} aria-hidden="true" />
              実績を確定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function toFiniteNumber(value: number | string | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function netWorkMinutes(startTime: string, endTime: string, breakMinutes: number) {
  const start = toMinutes(startTime);
  let end = toMinutes(endTime);
  if (start == null || end == null) return 0;
  if (end <= start) end += 24 * 60;
  return Math.max(0, end - start - Math.max(0, breakMinutes));
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return "0分";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

function formatHours(hours: number) {
  return `${formatDecimal(hours)}h`;
}

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
