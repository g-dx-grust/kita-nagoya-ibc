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

const filterLabels: Record<Filter, string> = {
  all: "すべて",
  action_needed: "確認が必要",
  unreviewed: "未確認",
  needs_review: "要再確認",
  confirmed: "確認済み",
  low: "10以下",
  high: "300以上",
  missing_room: "部屋別未登録",
  missing_product: "商品能力未登録",
};

export default function CapacityReviewTable({ rows: initialRows }: { rows: CapacityReviewRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [filter, setFilter] = useState<Filter>("action_needed");
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
      <div className="capacity-summary-grid">
        <Metric
          label="確認が必要"
          value={stats.actionNeeded}
          note={`未確認 ${stats.unreviewed.toLocaleString()} / 要再確認 ${stats.needsReview.toLocaleString()}`}
          tone={stats.actionNeeded > 0 ? "warn" : "normal"}
        />
        <Metric
          label="登録済み"
          value={stats.registered}
          note={`${stats.total.toLocaleString()}件中`}
        />
        <Metric
          label="能力未登録"
          value={stats.missingProduct}
          note={`部屋別未登録 ${stats.missingRoom.toLocaleString()}件`}
          tone={stats.missingProduct > 0 ? "warn" : "normal"}
        />
        <Metric
          label="異常値候補"
          value={stats.low + stats.high}
          note={`10以下 ${stats.low.toLocaleString()} / 300以上 ${stats.high.toLocaleString()}`}
          tone={stats.low + stats.high > 0 ? "warn" : "normal"}
        />
      </div>

      <div className="panel capacity-filter-panel">
        <div className="capacity-filter-head">
          <div>
            <h2>確認対象</h2>
            <div className="subtext">商品コード・商品名・作業場所で絞り込みます。</div>
          </div>
          <span className="badge info">表示 {filteredRows.length.toLocaleString()}件</span>
        </div>
        <div className="filter-bar compact-controls capacity-filter-bar">
          <input
            className="filter-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="管理コード・商品名・部屋名"
            aria-label="生産能力を検索"
          />
          <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
            <option value="all">すべて ({stats.total.toLocaleString()})</option>
            <option value="action_needed">確認が必要 ({stats.actionNeeded.toLocaleString()})</option>
            <option value="unreviewed">未確認 ({stats.unreviewed.toLocaleString()})</option>
            <option value="needs_review">要再確認 ({stats.needsReview.toLocaleString()})</option>
            <option value="confirmed">確認済み ({stats.confirmed.toLocaleString()})</option>
            <option value="low">10以下 ({stats.low.toLocaleString()})</option>
            <option value="high">300以上 ({stats.high.toLocaleString()})</option>
            <option value="missing_room">部屋別能力未登録 ({stats.missingRoom.toLocaleString()})</option>
            <option value="missing_product">商品能力未登録 ({stats.missingProduct.toLocaleString()})</option>
          </select>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setFilter("action_needed");
              setQuery("");
            }}
            disabled={filter === "action_needed" && !query}
          >
            条件クリア
          </button>
        </div>
        <div className="capacity-filter-chips" aria-label="生産能力の絞り込み">
          {(
            [
              ["action_needed", stats.actionNeeded],
              ["needs_review", stats.needsReview],
              ["missing_product", stats.missingProduct],
              ["missing_room", stats.missingRoom],
              ["low", stats.low],
              ["high", stats.high],
              ["all", stats.total],
            ] as const
          ).map(([value, count]) => (
            <button
              key={value}
              type="button"
              className={`capacity-filter-chip ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {filterLabels[value]} {count.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}

      <div className="capacity-table-section">
        <div className="capacity-table-head">
          <div>
            <h2>能力一覧</h2>
            <div className="subtext">
              {filterLabels[filter]}を表示中
              {query ? ` / ${query}` : ""}
            </div>
          </div>
          <HelpTooltip text="聞き取りした数量・人数・時間から袋/人時を計算できます。時間は 0.25 時間 = 15分単位が目安です。" />
        </div>
        <div className="table-frame standard-list-frame capacity-review-frame">
          <table className="standard-list-table capacity-review-table">
            <colgroup>
              <col className="capacity-product-col" />
              <col className="capacity-work-area-col" />
              <col className="capacity-priority-col" />
              <col className="capacity-rate-col" />
              <col className="capacity-sample-col" />
              <col className="capacity-people-col" />
              <col className="capacity-status-col" />
              <col className="capacity-memo-col" />
              <col className="capacity-action-col" />
            </colgroup>
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
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="capacity-empty-cell" colSpan={9}>
                    条件に一致する生産能力はありません。
                  </td>
                </tr>
              ) : null}
              {filteredRows.map((row) => {
                const draft = draftFor(row);
                const key = keyOf(row);
                return (
                  <tr key={key} className={needsAction(row) ? "capacity-review-row needs-action" : "capacity-review-row"}>
                    <td className="wrap-cell capacity-product-cell" data-label="商品">
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
                    <td data-label="作業場所">
                      <span className="capacity-work-area-name">{row.workAreaName}</span>
                      {row.missingCapacity && <span className="badge warn">未登録</span>}
                    </td>
                    <td data-label="候補順位">
                      <input
                        className="capacity-priority-input"
                        type="number"
                        min={1}
                        step={1}
                        value={draft.candidatePriority}
                        onChange={(event) => patchDraft(row, { candidatePriority: event.target.value })}
                      />
                      <div className="subtext">1=第1候補</div>
                    </td>
                    <td data-label="生産能力 / 人時">
                      <input
                        className="capacity-rate-input"
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
                    <td data-label="現場確認から計算">
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
                    <td data-label="基準人数">
                      <input
                        className="capacity-people-input"
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={draft.standardPeople}
                        onChange={(event) => patchDraft(row, { standardPeople: event.target.value })}
                      />
                    </td>
                    <td data-label="確認">
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
                      <div className={`badge ${statusBadgeClass(draft.reviewStatus)}`}>
                        {statusLabels[draft.reviewStatus]}
                      </div>
                    </td>
                    <td data-label="メモ">
                      <textarea
                        value={draft.reviewMemo}
                        onChange={(event) => patchDraft(row, { reviewMemo: event.target.value })}
                        rows={2}
                        placeholder="確認メモ"
                      />
                    </td>
                    <td className="action-cell capacity-actions" data-label="操作">
                      <div className="capacity-row-actions">
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
                      </div>
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

function statusBadgeClass(value: CapacityReviewRow["reviewStatus"]) {
  switch (value) {
    case "confirmed":
      return "success";
    case "needs_review":
      return "warn";
    default:
      return "muted";
  }
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

function Metric({
  label,
  value,
  note,
  tone = "normal",
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "normal" | "warn";
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone === "warn" ? "warn-value" : ""}`}>
        {value.toLocaleString()}
      </div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
