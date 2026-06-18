"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { EditableGridRow } from "@/lib/inventory-editable-grid";
import { computeGridBalances } from "@/lib/inventory-editable-grid";
import { kitagoyaApiPath } from "@/lib/paths";

export type EditableGridItemType = "product" | "raw_material" | "packaging";

const rowLabels = ["使用量", "入荷", "残", "賞味期限", "出荷期限"] as const;
type EditableGridRowLabel = (typeof rowLabels)[number];

// 1セルの編集値(4項目)。数値は入力中の文字列で保持し、保存時に数値化する。
type CellEdit = { inbound: string; usage: string; expiry: string; shipping: string };
type ItemEdits = { opening?: string; days: Record<string, CellEdit> };
type EditMap = Record<string, ItemEdits>;
type ManualGridRowReview = {
  needsReview: boolean;
  dirtyCount: number;
  negativeDays: number;
  missingDeadlineDays: number;
};

function initialCell(row: EditableGridRow, date: string): CellEdit {
  const d = row.days.find((x) => x.date === date);
  return {
    inbound: d && d.gridInbound ? String(d.gridInbound) : "",
    usage: d && d.gridUsage ? String(d.gridUsage) : "",
    expiry: d?.gridExpiry ?? "",
    shipping: d?.gridShipping ?? "",
  };
}

function initialOpening(row: EditableGridRow): string {
  return row.gridOpening ? String(row.gridOpening) : "";
}

function toNum(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function InventoryEditableGrid({
  itemType,
  month,
  monthLabel,
  dateFrom,
  dateTo,
  days,
  rows,
  visibleItemIds,
  secondaryHeader,
}: {
  itemType: EditableGridItemType;
  month: string;
  monthLabel: string;
  dateFrom: string;
  dateTo: string;
  days: string[];
  rows: EditableGridRow[];
  // 表示対象の itemId(検索/絞り込み結果)。未指定なら全行表示。
  // 状態・保存は rows 全体で扱い、絞り込みで隠れた行の編集も失わない。
  visibleItemIds?: string[];
  secondaryHeader: string;
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<EditMap>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.itemId, r])), [rows]);
  const editableRowLabels = useMemo(
    (): readonly EditableGridRowLabel[] => (itemType === "product" ? ["使用量", "入荷", "残"] : rowLabels),
    [itemType],
  );
  const rowReviews = useMemo(() => buildManualGridRowReviews(rows, edits, itemType), [rows, edits, itemType]);
  const renderRows = useMemo(() => {
    const visibleSet = visibleItemIds ? new Set(visibleItemIds) : null;
    const baseRows = visibleSet ? rows.filter((row) => visibleSet.has(row.itemId)) : rows;
    if (!reviewOnly) return baseRows;
    return baseRows.filter((row) => rowReviews.get(row.itemId)?.needsReview);
  }, [rows, visibleItemIds, reviewOnly, rowReviews]);

  // setter は安定参照にする(各行の useMemo/再描画が編集のたびに無駄に走らないように)。
  const setCellField = useCallback(
    (row: EditableGridRow, date: string, field: keyof CellEdit, value: string) => {
      setMessage(null);
      setEdits((prev) => {
        const item = prev[row.itemId] ?? { days: {} };
        const base = item.days[date] ?? initialCell(row, date);
        return {
          ...prev,
          [row.itemId]: { ...item, days: { ...item.days, [date]: { ...base, [field]: value } } },
        };
      });
    },
    [],
  );
  const setOpening = useCallback((row: EditableGridRow, value: string) => {
    setMessage(null);
    setEdits((prev) => {
      const item = prev[row.itemId] ?? { days: {} };
      return { ...prev, [row.itemId]: { ...item, opening: value } };
    });
  }, []);

  // 変更があるか(保存ボタン活性・ハイライト判定用)。初期値と異なるセル/期首を dirty とみなす。
  const dirtyCells = useMemo(() => {
    const set = new Set<string>();
    for (const [itemId, item] of Object.entries(edits)) {
      const row = rowById.get(itemId);
      if (!row) continue;
      if (item.opening !== undefined && item.opening !== initialOpening(row)) {
        set.add(`${itemId}:opening`);
      }
      for (const [date, cell] of Object.entries(item.days)) {
        const init = initialCell(row, date);
        (["inbound", "usage", "expiry", "shipping"] as const).forEach((f) => {
          if (cell[f] !== init[f]) set.add(`${itemId}:${date}:${f}`);
        });
      }
    }
    return set;
  }, [edits, rowById]);

  const hasChanges = dirtyCells.size > 0;
  const reviewSummary = useMemo(() => {
    return [...rowReviews.values()].reduce(
      (summary, review) => ({
        dirtyRowCount: summary.dirtyRowCount + (review.dirtyCount > 0 ? 1 : 0),
        negativeRowCount: summary.negativeRowCount + (review.negativeDays > 0 ? 1 : 0),
        negativeDayCount: summary.negativeDayCount + review.negativeDays,
        missingDeadlineRowCount: summary.missingDeadlineRowCount + (review.missingDeadlineDays > 0 ? 1 : 0),
        missingDeadlineDayCount: summary.missingDeadlineDayCount + review.missingDeadlineDays,
        needsReviewCount: summary.needsReviewCount + (review.needsReview ? 1 : 0),
      }),
      {
        dirtyRowCount: 0,
        negativeRowCount: 0,
        negativeDayCount: 0,
        missingDeadlineRowCount: 0,
        missingDeadlineDayCount: 0,
        needsReviewCount: 0,
      },
    );
  }, [rowReviews]);

  function reset() {
    setEdits({});
    setMessage(null);
  }

  async function save() {
    setBusy(true);
    setMessage(null);

    const openings: { itemId: string; value: number }[] = [];
    const cells: {
      itemId: string;
      date: string;
      inbound: number;
      usage: number;
      expiry: string | null;
      shipping: string | null;
    }[] = [];

    for (const [itemId, item] of Object.entries(edits)) {
      const row = rowById.get(itemId);
      if (!row) continue;
      if (item.opening !== undefined && item.opening !== initialOpening(row)) {
        openings.push({ itemId, value: toNum(item.opening) });
      }
      for (const [date, cell] of Object.entries(item.days)) {
        const init = initialCell(row, date);
        const changed = (["inbound", "usage", "expiry", "shipping"] as const).some(
          (f) => cell[f] !== init[f],
        );
        if (!changed) continue;
        cells.push({
          itemId,
          date,
          inbound: toNum(cell.inbound),
          usage: toNum(cell.usage),
          expiry: cell.expiry || null,
          shipping: cell.shipping || null,
        });
      }
    }

    const res = await fetch(kitagoyaApiPath("/inventory/manual-grid"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType, month, openings, cells }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMessage(typeof j.error === "string" ? `保存に失敗しました: ${j.error}` : "保存に失敗しました。");
      return;
    }
    setEdits({});
    setMessage("保存しました。");
    router.refresh();
  }

  return (
    <section className="panel manual-grid">
      <div className="manual-grid-head">
        <strong>在庫の手入力（管理者・セル編集）</strong>
        <HelpTooltip text="入荷・使用量・賞味期限・出荷期限・前月繰越のセルに直接入力し、まとめて保存します。手入力分は自動値に加算されます。「自動」表示が元の確定値です。" />
        <span className="manual-grid-actions">
          {message && <span className="manual-grid-msg">{message}</span>}
          {hasChanges && <span className="badge warn">未保存 {dirtyCells.size} 件</span>}
          <button type="button" className="secondary" onClick={reset} disabled={busy || !hasChanges}>
            変更を破棄
          </button>
          <button type="button" onClick={save} disabled={busy || !hasChanges}>
            保存
          </button>
        </span>
      </div>

      <div className="manual-grid-command">
        <div className="manual-grid-command-title">
          <strong>手入力確認</strong>
          <span className={`badge ${reviewSummary.needsReviewCount > 0 ? "warn" : "success"}`}>
            {reviewSummary.needsReviewCount > 0 ? `要確認 ${reviewSummary.needsReviewCount}品目` : "整備済み"}
          </span>
        </div>
        <div className="manual-grid-checks">
          <span className="badge info">
            表示 {renderRows.length} / {rows.length} 件
          </span>
          <span className={`badge ${hasChanges ? "warn" : "success"}`}>
            未保存 {reviewSummary.dirtyRowCount}品目 / {dirtyCells.size}セル
          </span>
          <span className={`badge ${reviewSummary.negativeRowCount > 0 ? "danger" : "success"}`}>
            マイナス {reviewSummary.negativeRowCount}品目 / {reviewSummary.negativeDayCount}日
          </span>
          {itemType !== "product" && (
            <span className={`badge ${reviewSummary.missingDeadlineRowCount > 0 ? "warn" : "success"}`}>
              期限未入力 {reviewSummary.missingDeadlineRowCount}品目 / {reviewSummary.missingDeadlineDayCount}日
            </span>
          )}
          <label className="manual-grid-review-toggle">
            <input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} />
            要確認のみ
          </label>
        </div>
      </div>

      <div className="inventory-sheet-meta">
        <span className="badge info">{monthLabel}</span>
        <span className="muted">
          {dateFrom} 〜 {dateTo}
        </span>
      </div>

      {renderRows.length === 0 ? (
        <div className="empty-state">表示する在庫がありません。</div>
      ) : (
        <div className="excel-inventory-scroll">
          <table className="excel-inventory-table excel-inventory-editable">
            <colgroup>
              <col className="excel-col-no" />
              <col className="excel-col-name" />
              <col className="excel-col-supplier" />
              <col className="excel-col-label" />
              <col className="excel-col-carry" />
              {days.map((date) => (
                <col key={date} className="excel-col-day" />
              ))}
              <col className="excel-col-summary" />
              <col className="excel-col-summary" />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky-x sticky-no">No.</th>
                <th className="sticky-x sticky-name">{monthLabel}</th>
                <th className="sticky-x sticky-supplier">{secondaryHeader}</th>
                <th className="sticky-x sticky-label">区分</th>
                <th>前月繰越</th>
                {days.map((date) => (
                  <th key={date}>{formatDateHeader(date)}</th>
                ))}
                <th>月末残</th>
                <th>合計</th>
              </tr>
            </thead>
            <tbody>
              {renderRows.map((row) => (
                <EditableItemRows
                  key={row.itemId}
                  row={row}
                  itemEdit={edits[row.itemId]}
                  rowLabels={editableRowLabels}
                  rowReview={rowReviews.get(row.itemId)}
                  setCellField={setCellField}
                  setOpening={setOpening}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EditableItemRows({
  row,
  itemEdit,
  rowLabels,
  rowReview,
  setCellField,
  setOpening,
}: {
  row: EditableGridRow;
  itemEdit: ItemEdits | undefined;
  rowLabels: readonly EditableGridRowLabel[];
  rowReview: ManualGridRowReview | undefined;
  setCellField: (row: EditableGridRow, date: string, field: keyof CellEdit, value: string) => void;
  setOpening: (row: EditableGridRow, value: string) => void;
}) {
  // 各セルの実効値(編集があれば編集値、無ければ初期値)。当該行の編集スライスだけ参照する。
  const effCell = (date: string): CellEdit => itemEdit?.days[date] ?? initialCell(row, date);
  const effOpening = (): string => itemEdit?.opening ?? initialOpening(row);

  // 当該行のライブ残・合計。依存は [row, itemEdit] なので、この行を編集したときだけ再計算される。
  const balances = useMemo(() => {
    return computeGridBalances({
      openingAuto: row.openingAuto,
      gridOpening: toNum(effOpening()),
      days: row.days.map((d) => {
        const c = effCell(d.date);
        return {
          autoInbound: d.autoInbound,
          autoUsage: d.autoUsage,
          gridInbound: toNum(c.inbound),
          gridUsage: toNum(c.usage),
        };
      }),
    });
    // effCell/effOpening は itemEdit/row から導出されるため、依存は [row, itemEdit] で十分。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, itemEdit]);

  const balanceByDate = useMemo(
    () => new Map(row.days.map((d, i) => [d.date, balances.balances[i]])),
    [row.days, balances.balances],
  );

  // 当該行の変更セル(ハイライト用)。キーは itemId 接頭辞なし(opening / `${date}:${field}`)。
  const dirtySet = useMemo(() => {
    const set = new Set<string>();
    if (!itemEdit) return set;
    if (itemEdit.opening !== undefined && itemEdit.opening !== initialOpening(row)) set.add("opening");
    for (const [date, cell] of Object.entries(itemEdit.days)) {
      const init = initialCell(row, date);
      (["inbound", "usage", "expiry", "shipping"] as const).forEach((f) => {
        if (cell[f] !== init[f]) set.add(`${date}:${f}`);
      });
    }
    return set;
  }, [row, itemEdit]);
  const dirty = (key: string) => (dirtySet.has(key) ? " is-dirty" : "");

  return (
    <>
      {rowLabels.map((label, index) => (
        <tr
          key={`${row.itemId}:${label}`}
          className={`excel-row-${labelClass(label)} ${rowReview?.needsReview ? "inventory-review-row" : ""}`}
        >
          {index === 0 && (
            <>
              <td className="sticky-x sticky-no excel-rowspan-cell right" rowSpan={rowLabels.length}>
                {row.rowNo}
              </td>
              <td className="sticky-x sticky-name excel-rowspan-cell" rowSpan={rowLabels.length}>
                <div className="excel-item-name">{row.name}</div>
                <div className="subtext">{row.code}</div>
                {rowReview?.needsReview && (
                  <div className="inventory-row-badges">
                    {rowReview.dirtyCount > 0 && <span className="badge warn">未保存 {rowReview.dirtyCount}セル</span>}
                    {rowReview.negativeDays > 0 && (
                      <span className="badge danger">マイナス {rowReview.negativeDays}日</span>
                    )}
                    {rowReview.missingDeadlineDays > 0 && (
                      <span className="badge warn">期限未入力 {rowReview.missingDeadlineDays}日</span>
                    )}
                  </div>
                )}
              </td>
              <td className="sticky-x sticky-supplier excel-rowspan-cell" rowSpan={rowLabels.length}>
                {row.supplierName || "—"}
              </td>
            </>
          )}
          <th className="sticky-x sticky-label excel-line-label" scope="row">
            {label}
          </th>

          {/* 前月繰越 列 */}
          <td className="right">
            {label === "入荷" ? (
              <div className={`excel-edit-cell${dirty("opening")}`}>
                <input
                  type="number"
                  step="any"
                  className="excel-cell-input"
                  value={effOpening()}
                  onChange={(e) => setOpening(row, e.target.value)}
                  aria-label={`${row.name} 前月繰越 手入力`}
                />
                {row.openingAuto !== 0 && <span className="excel-auto-hint">自動 {row.openingAuto}</span>}
              </div>
            ) : label === "残" ? (
              <span className={balances.opening < 0 ? "negative-stock" : undefined}>{balances.opening}</span>
            ) : (
              ""
            )}
          </td>

          {/* 日次セル */}
          {row.days.map((d) => {
            const c = effCell(d.date);
            const bal = balanceByDate.get(d.date) ?? 0;
            return (
              <td key={`${row.itemId}:${label}:${d.date}`} className="right">
                {label === "使用量" && (
                  <div className={`excel-edit-cell${dirty(`${d.date}:usage`)}`}>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      className="excel-cell-input"
                      value={c.usage}
                      onChange={(e) => setCellField(row, d.date, "usage", e.target.value)}
                      aria-label={`${row.name} ${d.date} 使用量 手入力`}
                    />
                    {d.autoUsage !== 0 && <span className="excel-auto-hint">自動 {d.autoUsage}</span>}
                  </div>
                )}
                {label === "入荷" && (
                  <div className={`excel-edit-cell${dirty(`${d.date}:inbound`)}`}>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      className="excel-cell-input"
                      value={c.inbound}
                      onChange={(e) => setCellField(row, d.date, "inbound", e.target.value)}
                      aria-label={`${row.name} ${d.date} 入荷 手入力`}
                    />
                    {d.autoInbound !== 0 && <span className="excel-auto-hint">自動 {d.autoInbound}</span>}
                  </div>
                )}
                {label === "残" && <span className={bal < 0 ? "negative-stock" : undefined}>{bal}</span>}
                {label === "賞味期限" && (
                  <input
                    type="date"
                    className={`excel-cell-input excel-cell-date${dirty(`${d.date}:expiry`)}`}
                    value={c.expiry}
                    onChange={(e) => setCellField(row, d.date, "expiry", e.target.value)}
                    aria-label={`${row.name} ${d.date} 賞味期限`}
                  />
                )}
                {label === "出荷期限" && (
                  <input
                    type="date"
                    className={`excel-cell-input excel-cell-date${dirty(`${d.date}:shipping`)}`}
                    value={c.shipping}
                    onChange={(e) => setCellField(row, d.date, "shipping", e.target.value)}
                    aria-label={`${row.name} ${d.date} 出荷期限`}
                  />
                )}
              </td>
            );
          })}

          {/* 月末残 列 */}
          <td className="right">
            {label === "残" ? (
              <span className={balances.monthEnd < 0 ? "negative-stock" : undefined}>{balances.monthEnd}</span>
            ) : (
              ""
            )}
          </td>
          {/* 合計 列 */}
          <td className="right">
            {label === "使用量" ? balances.usageTotal || "" : label === "入荷" ? balances.inboundTotal || "" : ""}
          </td>
        </tr>
      ))}
    </>
  );
}

function labelClass(label: (typeof rowLabels)[number]) {
  switch (label) {
    case "使用量":
      return "usage";
    case "入荷":
      return "inbound";
    case "残":
      return "balance";
    case "賞味期限":
      return "expiry";
    case "出荷期限":
      return "deadline";
  }
}

function buildManualGridRowReviews(rows: EditableGridRow[], edits: EditMap, itemType: EditableGridItemType) {
  const reviews = new Map<string, ManualGridRowReview>();
  for (const row of rows) {
    const itemEdit = edits[row.itemId];
    const balances = computeEditableRowBalances(row, itemEdit);
    const negativeDays =
      (balances.opening < 0 ? 1 : 0) + balances.balances.filter((balance) => balance < 0).length;
    const dirtyCount = countDirtyCells(row, itemEdit);
    const missingDeadlineDays = countMissingDeadlineDays(row, itemEdit, itemType);
    reviews.set(row.itemId, {
      needsReview: dirtyCount > 0 || negativeDays > 0 || missingDeadlineDays > 0,
      dirtyCount,
      negativeDays,
      missingDeadlineDays,
    });
  }
  return reviews;
}

function computeEditableRowBalances(row: EditableGridRow, itemEdit: ItemEdits | undefined) {
  return computeGridBalances({
    openingAuto: row.openingAuto,
    gridOpening: toNum(itemEdit?.opening ?? initialOpening(row)),
    days: row.days.map((day) => {
      const cell = itemEdit?.days[day.date] ?? initialCell(row, day.date);
      return {
        autoInbound: day.autoInbound,
        autoUsage: day.autoUsage,
        gridInbound: toNum(cell.inbound),
        gridUsage: toNum(cell.usage),
      };
    }),
  });
}

function countDirtyCells(row: EditableGridRow, itemEdit: ItemEdits | undefined) {
  if (!itemEdit) return 0;
  let count = 0;
  if (itemEdit.opening !== undefined && itemEdit.opening !== initialOpening(row)) count += 1;
  for (const [date, cell] of Object.entries(itemEdit.days)) {
    const init = initialCell(row, date);
    (["inbound", "usage", "expiry", "shipping"] as const).forEach((field) => {
      if (cell[field] !== init[field]) count += 1;
    });
  }
  return count;
}

function countMissingDeadlineDays(
  row: EditableGridRow,
  itemEdit: ItemEdits | undefined,
  itemType: EditableGridItemType,
) {
  if (itemType === "product") return 0;
  return row.days.filter((day) => {
    const cell = itemEdit?.days[day.date] ?? initialCell(row, day.date);
    return toNum(cell.inbound) > 0 && (!cell.expiry || !cell.shipping);
  }).length;
}

function formatDateHeader(date: string) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${month}/${day}`;
}
