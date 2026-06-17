"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { kitagoyaApiPath } from "@/lib/paths";

export type CapacityReviewRow = {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  standardProductionLotSize: number;
  defaultWorkAreaName: string | null;
  workAreaId: string;
  workAreaName: string;
  capacityId: string | null;
  unitsPerPersonHour: number | null;
  standardPeople: number;
  standardBreakMinutes: number;
  candidatePriority: number | null;
  reviewStatus: "unreviewed" | "confirmed" | "needs_review";
  reviewMemo: string;
  reviewedAt: string | null;
  missingCapacity: boolean;
  productHasAnyCapacity: boolean;
  isPrimaryReviewRow: boolean;
};

type Draft = {
  unitsPerPersonHour: string;
  standardPeople: string;
  standardBreakMinutes: string;
  candidatePriority: string;
  reviewStatus: CapacityReviewRow["reviewStatus"];
  reviewMemo: string;
  sampleQuantity: string;
  samplePeople: string;
  sampleHours: string;
};

type Filter =
  | "all"
  | "action_needed"
  | "unreviewed"
  | "needs_review"
  | "confirmed"
  | "low"
  | "high"
  | "missing_room"
  | "missing_product";

const statusLabels: Record<CapacityReviewRow["reviewStatus"], string> = {
  unreviewed: "未確認",
  confirmed: "確認済み",
  needs_review: "要再確認",
};

export default function CapacityReviewTable({ rows: initialRows }: { rows: CapacityReviewRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const existing = rows.filter((row) => row.unitsPerPersonHour != null);
    return {
      total: rows.length,
      registered: existing.length,
      missingRoom: rows.filter((row) => row.missingCapacity).length,
      missingProduct: rows.filter((row) => !row.productHasAnyCapacity && row.isPrimaryReviewRow).length,
      actionNeeded: rows.filter(needsAction).length,
      unreviewed: rows.filter((row) => row.reviewStatus === "unreviewed").length,
      needsReview: rows.filter((row) => row.reviewStatus === "needs_review").length,
      confirmed: rows.filter((row) => row.reviewStatus === "confirmed").length,
      low: existing.filter((row) => (row.unitsPerPersonHour ?? 0) <= 10).length,
      high: existing.filter((row) => (row.unitsPerPersonHour ?? 0) >= 300).length,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const haystack = `${row.productCode} ${row.productName} ${row.workAreaName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      switch (filter) {
        case "action_needed":
          return needsAction(row);
        case "unreviewed":
          return row.reviewStatus === "unreviewed";
        case "needs_review":
          return row.reviewStatus === "needs_review";
        case "confirmed":
          return row.reviewStatus === "confirmed";
        case "low":
          return row.unitsPerPersonHour != null && row.unitsPerPersonHour <= 10;
        case "high":
          return row.unitsPerPersonHour != null && row.unitsPerPersonHour >= 300;
        case "missing_room":
          return row.missingCapacity;
        case "missing_product":
          return !row.productHasAnyCapacity && row.isPrimaryReviewRow;
        default:
          return true;
      }
    });
  }, [filter, query, rows]);

  function keyOf(row: CapacityReviewRow) {
    return `${row.productId}:${row.workAreaId}`;
  }

  function draftFor(row: CapacityReviewRow): Draft {
    const key = keyOf(row);
    return (
      drafts[key] ?? {
        unitsPerPersonHour: row.unitsPerPersonHour == null ? "" : formatNumber(row.unitsPerPersonHour),
        standardPeople: formatNumber(row.standardPeople),
        standardBreakMinutes: String(row.standardBreakMinutes),
        candidatePriority: row.candidatePriority == null ? "" : String(row.candidatePriority),
        reviewStatus: row.reviewStatus,
        reviewMemo: row.reviewMemo ?? "",
        sampleQuantity: "",
        samplePeople: "",
        sampleHours: "",
      }
    );
  }

  function patchDraft(row: CapacityReviewRow, patch: Partial<Draft>) {
    const key = keyOf(row);
    setDrafts({ ...drafts, [key]: { ...draftFor(row), ...patch } });
  }

  function applySample(row: CapacityReviewRow) {
    const draft = draftFor(row);
    const quantity = Number(draft.sampleQuantity);
    const people = Number(draft.samplePeople);
    const hours = Number(draft.sampleHours);
    if (!(quantity > 0 && people > 0 && hours > 0)) {
      setError("数量・人数・時間を入力すると、生産能力を計算できます。");
      return;
    }
    setError(null);
    patchDraft(row, {
      unitsPerPersonHour: formatNumber(quantity / people / hours),
      standardPeople: draft.samplePeople,
    });
  }

  async function save(row: CapacityReviewRow, statusOverride?: CapacityReviewRow["reviewStatus"]) {
    const key = keyOf(row);
    const draft = draftFor(row);
    const unitsPerPersonHour = Number(draft.unitsPerPersonHour);
    const standardPeople = Number(draft.standardPeople);
    const standardBreakMinutes = 0;
    const candidatePriority = draft.candidatePriority.trim() ? Number(draft.candidatePriority) : null;
    const reviewStatus = statusOverride ?? draft.reviewStatus;

    if (!(unitsPerPersonHour > 0 && standardPeople > 0)) {
      setError("生産能力・基準人数を確認してください。");
      return;
    }
    if (candidatePriority != null && (!Number.isInteger(candidatePriority) || candidatePriority < 1)) {
      setError("候補順位は1以上の整数で入力してください。");
      return;
    }

    setSavingKey(key);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/capacities"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: row.productId,
        workAreaId: row.workAreaId,
        unitsPerPersonHour,
        standardPeople,
        standardBreakMinutes,
        candidatePriority,
        reviewStatus,
        reviewMemo: draft.reviewMemo || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingKey(null);
    if (!res.ok) {
      setError(`保存に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }

    setRows((current) =>
      current.map((item) =>
        keyOf(item) === key
          ? {
              ...item,
              capacityId: json.id ?? item.capacityId,
              unitsPerPersonHour,
              standardPeople,
              standardBreakMinutes,
              candidatePriority,
              reviewStatus,
              reviewMemo: draft.reviewMemo,
              reviewedAt: json.reviewedAt ?? item.reviewedAt,
              missingCapacity: false,
              productHasAnyCapacity: true,
            }
          : item.productId === row.productId
            ? { ...item, productHasAnyCapacity: true }
            : item,
      ),
    );
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setMessage(`${row.productCode} ${row.workAreaName} を保存しました。`);
    router.refresh();
  }

  async function deleteCapacity(row: CapacityReviewRow) {
    if (!row.capacityId) return;
    if (!confirm(`${row.productCode} ${row.workAreaName} の生産能力を削除します。よろしいですか？`)) return;
    const key = keyOf(row);
    setSavingKey(key);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/capacities/${row.capacityId}`), { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setSavingKey(null);
    if (!res.ok) {
      setError(`削除に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setRows((current) =>
      current.map((item) =>
        keyOf(item) === key
          ? {
              ...item,
              capacityId: null,
              unitsPerPersonHour: null,
              standardPeople: 1,
              standardBreakMinutes: 0,
              candidatePriority: null,
              reviewStatus: "unreviewed",
              reviewMemo: "",
              reviewedAt: null,
              missingCapacity: true,
            }
          : item,
      ),
    );
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setMessage(`${row.productCode} ${row.workAreaName} を削除しました。`);
    router.refresh();
  }

  return (
    <>
      <div className="grid grid-4">
        <Metric label="確認が必要" value={stats.actionNeeded} />
        <Metric label="登録済み" value={stats.registered} />
        <Metric label="能力未登録商品" value={stats.missingProduct} />
        <Metric label="部屋別未登録" value={stats.missingRoom} />
      </div>

      <div className="panel toolbar">
        <label>
          <span>検索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="管理コード・商品名・部屋名"
          />
        </label>
        <label>
          <span>絞り込み</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            <option value="all">すべて ({stats.total})</option>
            <option value="action_needed">確認が必要 ({stats.actionNeeded})</option>
            <option value="unreviewed">未確認 ({stats.unreviewed})</option>
            <option value="needs_review">要再確認 ({stats.needsReview})</option>
            <option value="confirmed">確認済み ({stats.confirmed})</option>
            <option value="low">10以下 ({stats.low})</option>
            <option value="high">300以上 ({stats.high})</option>
            <option value="missing_room">部屋別能力未登録 ({stats.missingRoom})</option>
            <option value="missing_product">商品能力未登録 ({stats.missingProduct})</option>
          </select>
        </label>
        <div className="spacer" />
        <span className="muted">表示 {filteredRows.length} 件</span>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}

      <div className="panel">
        <div className="toolbar flush-top">
          <strong>能力一覧</strong>
          <HelpTooltip text="聞き取りした数量・人数・時間から袋/人時を計算できます。時間は 0.25 時間 = 15分単位が目安です。" />
        </div>
        <div className="table-scroll capacity-review-scroll">
          <table className="capacity-review-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>作業場所</th>
                <th>候補順位</th>
                <th>生産能力 / 人時</th>
                <th>現場確認から計算</th>
                <th>基準人数</th>
                <th>確認</th>
                <th>メモ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const draft = draftFor(row);
                const key = keyOf(row);
                return (
                  <tr key={key}>
                    <td>
                      <strong>{row.productCode}</strong>
                      <div>{row.productName}</div>
                      {row.standardProductionLotSize > 0 && (
                        <div className="subtext">
                          日報生産数: {formatNumber(row.standardProductionLotSize)}
                          {row.unit}
                        </div>
                      )}
                      {row.defaultWorkAreaName && (
                        <div className="subtext">標準: {row.defaultWorkAreaName}</div>
                      )}
                    </td>
                    <td>
                      {row.workAreaName}
                      {row.missingCapacity && <div className="badge warn">未登録</div>}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={draft.candidatePriority}
                        onChange={(event) => patchDraft(row, { candidatePriority: event.target.value })}
                      />
                      <div className="subtext">1=第1候補</div>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={draft.unitsPerPersonHour}
                        onChange={(event) =>
                          patchDraft(row, { unitsPerPersonHour: event.target.value })
                        }
                      />
                      <div className="subtext">{row.unit}/人時</div>
                      {row.unitsPerPersonHour != null && row.unitsPerPersonHour <= 10 && (
                        <div className="badge warn">低め</div>
                      )}
                      {row.unitsPerPersonHour != null && row.unitsPerPersonHour >= 300 && (
                        <div className="badge warn">高め</div>
                      )}
                    </td>
                    <td>
                      <div className="inline-inputs capacity-sample-inputs">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          placeholder="数量"
                          value={draft.sampleQuantity}
                          onChange={(event) =>
                            patchDraft(row, { sampleQuantity: event.target.value })
                          }
                        />
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          placeholder="人数"
                          value={draft.samplePeople}
                          onChange={(event) => patchDraft(row, { samplePeople: event.target.value })}
                        />
                        <input
                          type="number"
                          min={0.25}
                          step={0.25}
                          placeholder="時間"
                          value={draft.sampleHours}
                          onChange={(event) => patchDraft(row, { sampleHours: event.target.value })}
                        />
                      </div>
                      <button type="button" className="secondary mini" onClick={() => applySample(row)}>
                        計算反映
                      </button>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={draft.standardPeople}
                        onChange={(event) => patchDraft(row, { standardPeople: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={draft.reviewStatus}
                        onChange={(event) =>
                          patchDraft(row, {
                            reviewStatus: event.target.value as CapacityReviewRow["reviewStatus"],
                          })
                        }
                      >
                        <option value="unreviewed">未確認</option>
                        <option value="confirmed">確認済み</option>
                        <option value="needs_review">要再確認</option>
                      </select>
                    </td>
                    <td>
                      <textarea
                        value={draft.reviewMemo}
                        onChange={(event) => patchDraft(row, { reviewMemo: event.target.value })}
                        rows={2}
                        placeholder="確認メモ"
                      />
                    </td>
                    <td className="capacity-actions">
                      <button type="button" disabled={savingKey === key} onClick={() => save(row)}>
                        保存
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={savingKey === key}
                        onClick={() => save(row, "confirmed")}
                      >
                        確認済み
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={savingKey === key || !row.capacityId}
                        onClick={() => deleteCapacity(row)}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function isSuspiciousCapacity(row: CapacityReviewRow) {
  return (
    row.unitsPerPersonHour != null &&
    (row.unitsPerPersonHour <= 10 || row.unitsPerPersonHour >= 300)
  );
}

function needsAction(row: CapacityReviewRow) {
  if (row.reviewStatus === "needs_review") return true;
  if (row.unitsPerPersonHour != null && row.reviewStatus !== "confirmed") return true;
  if (!row.productHasAnyCapacity) return row.isPrimaryReviewRow;
  return isSuspiciousCapacity(row);
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value.toLocaleString()}</div>
    </div>
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
