"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import {
  purchaseOrderStatusLabel,
  purchaseOrderUrgencyClass,
  purchaseOrderUrgencyLabel,
} from "@/lib/labels";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";
import { formatCases } from "@/lib/units";

export type PurchaseOrderTableRow = {
  id: string;
  status: string;
  urgency: string;
  itemType: string;
  itemCode: string;
  itemName: string;
  supplierName: string;
  unit: string;
  casePackQty: number | null;
  orderedQuantity: number;
  confirmedQuantity: number | null;
  receivedQuantity: number | null;
  recommendedOrderDate: string;
  shortageDate: string;
  expectedArrivalDate: string;
  receivedDate: string;
  note: string;
};

type Draft = {
  status: string;
  orderedQuantity: number;
  confirmedQuantity: string;
  recommendedOrderDate: string;
  shortageDate: string;
  expectedArrivalDate: string;
  note: string;
};

type ReceivingDraft = {
  row: PurchaseOrderTableRow;
  receivedQuantity: string;
  receivedDate: string;
};

type PurchaseOrderReview = {
  needsAction: boolean;
  isUnplaced: boolean;
  isCritical: boolean;
  needsConfirm: boolean;
  canReceive: boolean;
  missingRecommendedDate: boolean;
  missingExpectedArrivalDate: boolean;
  isOverdueArrival: boolean;
};

export default function PurchaseOrderTable({ rows, today }: { rows: PurchaseOrderTableRow[]; today: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<ReceivingDraft | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState("");
  const [queueFilter, setQueueFilter] = useState<"" | "unplaced" | "critical" | "receiving">("");
  const [attentionOnly, setAttentionOnly] = useState(false);

  const rowReviews = useMemo(() => buildPurchaseOrderReviews(rows, today), [rows, today]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const review = rowReviews.get(row.id);
        if (attentionOnly && !review?.needsAction) return false;
        if (queueFilter === "unplaced" && row.status !== "candidate" && row.status !== "draft") return false;
        if (queueFilter === "critical" && row.urgency !== "CRITICAL") return false;
        if (queueFilter === "receiving" && row.status !== "confirmed") return false;
        if (statusFilter && row.status !== statusFilter) return false;
        if (urgencyFilter && row.urgency !== urgencyFilter) return false;
        if (itemTypeFilter && row.itemType !== itemTypeFilter) return false;
        return matchesQuery(search, [
          row.itemCode,
          row.itemName,
          row.supplierName,
          row.note,
          row.itemType === "raw_material" ? "原料" : "資材",
          purchaseOrderStatusLabel(row.status),
          purchaseOrderUrgencyLabel(row.urgency),
          ...(review ? reviewKeywords(review) : []),
        ]);
      }),
    [rows, search, statusFilter, urgencyFilter, itemTypeFilter, queueFilter, attentionOnly, rowReviews],
  );

  const queueCounts = useMemo(
    () => ({
      unplaced: rows.filter((row) => row.status === "candidate" || row.status === "draft").length,
      critical: rows.filter((row) => row.urgency === "CRITICAL").length,
      receiving: rows.filter((row) => row.status === "confirmed").length,
    }),
    [rows],
  );
  const reviewSummary = useMemo(() => {
    return [...rowReviews.values()].reduce(
      (summary, review) => ({
        needsAction: summary.needsAction + (review.needsAction ? 1 : 0),
        unplaced: summary.unplaced + (review.isUnplaced ? 1 : 0),
        critical: summary.critical + (review.isCritical ? 1 : 0),
        confirmWaiting: summary.confirmWaiting + (review.needsConfirm ? 1 : 0),
        receiveWaiting: summary.receiveWaiting + (review.canReceive ? 1 : 0),
        missingDate: summary.missingDate + (review.missingRecommendedDate || review.missingExpectedArrivalDate ? 1 : 0),
        overdueArrival: summary.overdueArrival + (review.isOverdueArrival ? 1 : 0),
      }),
      {
        needsAction: 0,
        unplaced: 0,
        critical: 0,
        confirmWaiting: 0,
        receiveWaiting: 0,
        missingDate: 0,
        overdueArrival: 0,
      },
    );
  }, [rowReviews]);

  const hasActiveFilters = !!(search || statusFilter || urgencyFilter || itemTypeFilter || queueFilter || attentionOnly);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setUrgencyFilter("");
    setItemTypeFilter("");
    setQueueFilter("");
    setAttentionOnly(false);
  }

  function applyQueueFilter(next: "" | "unplaced" | "critical" | "receiving") {
    setQueueFilter((current) => (current === next ? "" : next));
    setStatusFilter("");
    setUrgencyFilter("");
    setAttentionOnly(false);
  }

  function beginEdit(row: PurchaseOrderTableRow) {
    setEditingId(row.id);
    setDraft({
      status: row.status,
      orderedQuantity: row.orderedQuantity,
      confirmedQuantity: row.confirmedQuantity == null ? "" : String(row.confirmedQuantity),
      recommendedOrderDate: row.recommendedOrderDate,
      shortageDate: row.shortageDate,
      expectedArrivalDate: row.expectedArrivalDate,
      note: row.note === "—" ? "" : row.note,
    });
    setError(null);
    setMessage(null);
  }

  async function save(id: string) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/purchase-orders/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: draft.status,
        orderedQuantity: Number(draft.orderedQuantity),
        confirmedQuantity: draft.confirmedQuantity === "" ? null : Number(draft.confirmedQuantity),
        recommendedOrderDate: draft.recommendedOrderDate || null,
        shortageDate: draft.shortageDate || null,
        expectedArrivalDate: draft.expectedArrivalDate || null,
        note: draft.note || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`保存に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("発注内容を更新しました。");
    setEditingId(null);
    setDraft(null);
    router.refresh();
  }

  async function deleteOrCancel(row: PurchaseOrderTableRow) {
    const label = row.status === "candidate" || row.status === "draft" || row.status === "cancelled" ? "削除" : "取消";
    if (!confirm(`${row.itemName} の発注を${label}します。よろしいですか？`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/purchase-orders/${row.id}`), { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`${label}に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage(`発注を${label}しました。`);
    router.refresh();
  }

  async function placeOrder(row: PurchaseOrderTableRow) {
    if (!confirm(`${row.itemName} を発注します。よろしいですか？`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/purchase-orders/${row.id}/order`), { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`発注に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("発注しました。発注書を出力できます。");
    router.refresh();
  }

  async function confirmOrder(row: PurchaseOrderTableRow) {
    if (!confirm(`${row.itemName} の発注を確定します。よろしいですか？`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/purchase-orders/${row.id}/confirm`), { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`発注確定に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("発注を確定しました。");
    router.refresh();
  }

  function beginReceive(row: PurchaseOrderTableRow) {
    const today = new Date().toISOString().slice(0, 10);
    setReceiving({
      row,
      receivedQuantity: String(row.confirmedQuantity ?? row.orderedQuantity),
      receivedDate: today,
    });
    setError(null);
    setMessage(null);
  }

  async function receiveOrder() {
    if (!receiving) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/purchase-orders/${receiving.row.id}/receive`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receivedQuantity: Number(receiving.receivedQuantity),
        receivedDate: receiving.receivedDate,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`入荷確定に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("入荷を確定しました。");
    setReceiving(null);
    router.refresh();
  }

  async function downloadDocument(row: PurchaseOrderTableRow, format: "xlsx" | "pdf") {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/purchase-orders/${row.id}/document?format=${format}`));
    setBusy(false);
    if (!res.ok) {
      setError("発注書の生成に失敗しました。");
      return;
    }
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileNameFromDisposition(res.headers.get("content-disposition")) ?? `purchase-order-${row.id}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    setMessage(`${row.status === "draft" ? "仮発注書" : "発注書"}を出力しました。`);
  }

  if (rows.length === 0) {
    return <div className="empty-state">発注候補はまだありません。</div>;
  }

  const showCaseNote = rows.some((row) => (row.casePackQty ?? 0) > 0);

  return (
    <>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}
      <div className="purchase-order-review-command">
        <div className="purchase-order-review-title">
          <strong>発注一覧確認</strong>
          <span className={`badge ${reviewSummary.needsAction > 0 ? "warn" : "success"}`}>
            {reviewSummary.needsAction > 0 ? `要対応 ${reviewSummary.needsAction}件` : "対応済み"}
          </span>
        </div>
        <div className="purchase-order-review-checks">
          <span className="badge info">
            表示 {filteredRows.length} / {rows.length} 件
          </span>
          <span className={`badge ${reviewSummary.unplaced > 0 ? "warn" : "success"}`}>
            未発注 {reviewSummary.unplaced}
          </span>
          <span className={`badge ${reviewSummary.critical > 0 ? "danger" : "success"}`}>
            緊急 {reviewSummary.critical}
          </span>
          <span className={`badge ${reviewSummary.confirmWaiting > 0 ? "warn" : "success"}`}>
            確定待ち {reviewSummary.confirmWaiting}
          </span>
          <span className={`badge ${reviewSummary.receiveWaiting > 0 ? "info" : "success"}`}>
            入荷確定待ち {reviewSummary.receiveWaiting}
          </span>
          <span className={`badge ${reviewSummary.overdueArrival > 0 ? "danger" : "success"}`}>
            入荷予定超過 {reviewSummary.overdueArrival}
          </span>
          <span className={`badge ${reviewSummary.missingDate > 0 ? "warn" : "success"}`}>
            日付未設定 {reviewSummary.missingDate}
          </span>
        </div>
      </div>
      <div className="purchase-order-queue" aria-label="発注作業キュー">
        <button
          type="button"
          className={queueFilter === "unplaced" ? "is-active" : ""}
          onClick={() => applyQueueFilter("unplaced")}
        >
          <span>未発注</span>
          <strong>{queueCounts.unplaced}</strong>
        </button>
        <button
          type="button"
          className={queueFilter === "critical" ? "is-active danger" : "danger"}
          onClick={() => applyQueueFilter("critical")}
        >
          <span>緊急</span>
          <strong>{queueCounts.critical}</strong>
        </button>
        <button
          type="button"
          className={queueFilter === "receiving" ? "is-active" : ""}
          onClick={() => applyQueueFilter("receiving")}
        >
          <span>入荷確定待ち</span>
          <strong>{queueCounts.receiving}</strong>
        </button>
      </div>
      <CollapsiblePanel
        title={
          <span className="inline-action">
            表内検索・絞り込み
            {showCaseNote && (
              <HelpTooltip text="資材はケース入数があれば基本単位とケース数を併記します。編集は基本単位で行います。" />
            )}
          </span>
        }
        summary={`${filteredRows.length} / ${rows.length} 件${hasActiveFilters ? " / 条件あり" : ""}`}
        open={hasActiveFilters}
      >
        <div className="filter-bar compact-controls">
          <input
            className="filter-search"
            type="search"
            placeholder="品目コード・品目名・仕入先で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="発注候補を検索"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setQueueFilter("");
              setStatusFilter(e.target.value);
            }}
          >
            <option value="">状態(すべて)</option>
            <option value="candidate">候補</option>
            <option value="draft">仮発注</option>
            <option value="ordered_unconfirmed">未確定発注</option>
            <option value="confirmed">確定発注</option>
            <option value="received">入荷済み</option>
            <option value="cancelled">取消</option>
          </select>
          <select
            value={urgencyFilter}
            onChange={(e) => {
              setQueueFilter("");
              setUrgencyFilter(e.target.value);
            }}
          >
            <option value="">緊急度(すべて)</option>
            <option value="CRITICAL">緊急</option>
            <option value="WARNING">注意</option>
            <option value="INFO">余裕あり</option>
            <option value="NONE">—</option>
          </select>
          <select value={itemTypeFilter} onChange={(e) => setItemTypeFilter(e.target.value)}>
            <option value="">区分(すべて)</option>
            <option value="raw_material">原料</option>
            <option value="packaging">資材</option>
          </select>
          <label className="filter-check">
            <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
            要対応のみ
          </label>
          <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
            条件クリア
          </button>
          <span className="filter-count">
            {filteredRows.length} / {rows.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      {filteredRows.length === 0 ? (
        <div className="empty-state">条件に一致する発注はありません。</div>
      ) : (
        <div className="table-frame standard-list-frame purchase-order-frame">
          <table className="standard-list-table purchase-order-list-table">
            <colgroup>
              <col className="purchase-status-col" />
              <col className="purchase-urgency-col" />
              <col className="purchase-type-col" />
              <col className="purchase-item-col" />
              <col className="purchase-supplier-col" />
              <col className="purchase-quantity-col" />
              <col className="purchase-quantity-col" />
              <col className="purchase-quantity-col" />
              <col className="purchase-date-col" />
              <col className="purchase-date-col" />
              <col className="purchase-date-col" />
              <col className="purchase-date-col" />
              <col className="purchase-note-col" />
              <col className="purchase-action-col" />
            </colgroup>
            <thead>
              <tr>
                <th>状態</th>
                <th>緊急度</th>
                <th>区分</th>
                <th>品目</th>
                <th>仕入先</th>
                <th>数量</th>
                <th>確定数量</th>
                <th>受領数量</th>
                <th>推奨発注日</th>
                <th>不足日</th>
                <th>入荷予定</th>
                <th>入荷日</th>
                <th>メモ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
          {filteredRows.map((row) => {
            const editing = editingId === row.id && draft;
            const review = rowReviews.get(row.id);
            const rowClass = [
              "purchase-order-row",
              editing ? "is-editing" : "",
              review?.needsAction ? "row-needs-action" : "",
              review?.isCritical ? "is-critical" : "",
              review?.isUnplaced ? "is-unplaced" : "",
              review?.isOverdueArrival ? "is-overdue" : "",
            ].filter(Boolean).join(" ");
            return (
              <tr key={row.id} className={rowClass}>
                {editing ? (
                  <>
                    <td data-label="状態">
                      <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                        <option value="candidate">候補</option>
                        <option value="draft">下書き</option>
                        <option value="ordered_unconfirmed">発注済み未確定</option>
                        <option value="confirmed">確定</option>
                        <option value="received">入荷済み</option>
                        <option value="cancelled">取消</option>
                      </select>
                    </td>
                    <td data-label="緊急度">
                      <span className={`badge ${purchaseOrderUrgencyClass(row.urgency)}`}>
                        {purchaseOrderUrgencyLabel(row.urgency)}
                      </span>
                    </td>
                    <td data-label="区分">{row.itemType === "raw_material" ? "原料" : "資材"}</td>
                    <td className="wrap-cell product-name-cell" data-label="品目">
                      {row.itemCode} · {row.itemName}
                      <PurchaseOrderRowBadges review={review} />
                    </td>
                    <td data-label="仕入先">{row.supplierName}</td>
                    <td data-label="数量">
                      <input
                        type="number"
                        min={0.0001}
                        step={0.0001}
                        value={draft.orderedQuantity}
                        onChange={(e) => setDraft({ ...draft, orderedQuantity: Number(e.target.value) })}
                      />
                    </td>
                    <td data-label="確定数量">
                      <input
                        type="number"
                        min={0.0001}
                        step={0.0001}
                        value={draft.confirmedQuantity}
                        onChange={(e) => setDraft({ ...draft, confirmedQuantity: e.target.value })}
                      />
                    </td>
                    <td data-label="受領数量">{qtyLabel(row, row.receivedQuantity)}</td>
                    <td data-label="推奨発注日">
                      <input
                        type="date"
                        value={draft.recommendedOrderDate}
                        onChange={(e) => setDraft({ ...draft, recommendedOrderDate: e.target.value })}
                      />
                    </td>
                    <td data-label="不足日">
                      <input
                        type="date"
                        value={draft.shortageDate}
                        onChange={(e) => setDraft({ ...draft, shortageDate: e.target.value })}
                      />
                    </td>
                    <td data-label="入荷予定">
                      <input
                        type="date"
                        value={draft.expectedArrivalDate}
                        onChange={(e) => setDraft({ ...draft, expectedArrivalDate: e.target.value })}
                      />
                    </td>
                    <td data-label="入荷日">{row.receivedDate || "—"}</td>
                    <td className="wrap-cell" data-label="メモ">
                      <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </td>
                    <td className="action-cell" data-label="操作">
                      <div className="table-actions">
                        <button type="button" onClick={() => save(row.id)} disabled={busy}>
                          保存
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setEditingId(null);
                            setDraft(null);
                          }}
                          disabled={busy}
                        >
                          キャンセル
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td data-label="状態">{purchaseOrderStatusLabel(row.status)}</td>
                    <td data-label="緊急度">
                      <span className={`badge ${purchaseOrderUrgencyClass(row.urgency)}`}>
                        {purchaseOrderUrgencyLabel(row.urgency)}
                      </span>
                    </td>
                    <td data-label="区分">{row.itemType === "raw_material" ? "原料" : "資材"}</td>
                    <td className="wrap-cell product-name-cell" data-label="品目">
                      {row.itemCode} · {row.itemName}
                      <PurchaseOrderRowBadges review={review} />
                    </td>
                    <td data-label="仕入先">{row.supplierName}</td>
                    <td className="right" data-label="数量">{qtyLabel(row, row.orderedQuantity)}</td>
                    <td className="right" data-label="確定数量">{qtyLabel(row, row.confirmedQuantity)}</td>
                    <td className="right" data-label="受領数量">{qtyLabel(row, row.receivedQuantity)}</td>
                    <td data-label="推奨発注日">{row.recommendedOrderDate || "—"}</td>
                    <td data-label="不足日">{row.shortageDate || "—"}</td>
                    <td data-label="入荷予定">{row.expectedArrivalDate || "—"}</td>
                    <td data-label="入荷日">{row.receivedDate || "—"}</td>
                    <td className="wrap-cell" data-label="メモ">{row.note || "—"}</td>
                    <td className="action-cell" data-label="操作">
                      <div className="table-actions">
                        {canDownload(row.status) && (
                          <>
                            <button type="button" className="secondary" onClick={() => downloadDocument(row, "xlsx")} disabled={busy}>
                              {row.status === "draft" ? "仮発注書 Excel" : "発注書 Excel"}
                            </button>
                            <button type="button" className="secondary" onClick={() => downloadDocument(row, "pdf")} disabled={busy}>
                              {row.status === "draft" ? "仮発注書 PDF" : "発注書 PDF"}
                            </button>
                          </>
                        )}
                        {(row.status === "candidate" || row.status === "draft") && (
                          <button type="button" onClick={() => placeOrder(row)} disabled={busy}>
                            発注する
                          </button>
                        )}
                        {row.status === "ordered_unconfirmed" && (
                          <button type="button" onClick={() => confirmOrder(row)} disabled={busy}>
                            確定する
                          </button>
                        )}
                        {row.status === "confirmed" && (
                          <button type="button" onClick={() => beginReceive(row)} disabled={busy}>
                            入荷確定
                          </button>
                        )}
                        <button type="button" className="secondary" onClick={() => beginEdit(row)}>
                          編集
                        </button>
                        <button type="button" className="danger" onClick={() => deleteOrCancel(row)} disabled={busy}>
                          {row.status === "candidate" || row.status === "draft" || row.status === "cancelled"
                            ? "削除"
                            : "取消"}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
            </tbody>
          </table>
        </div>
      )}
      {receiving && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-title">入荷確定</div>
            <p className="modal-body">
              {receiving.row.itemName} の受領数量を入力してください。
            </p>
            <div className="modal-fields">
              <label>
                <span>受領数量</span>
                <input
                  type="number"
                  min={0.0001}
                  step={0.0001}
                  value={receiving.receivedQuantity}
                  onChange={(e) => setReceiving({ ...receiving, receivedQuantity: e.target.value })}
                />
              </label>
              <label>
                <span>入荷日</span>
                <input
                  type="date"
                  value={receiving.receivedDate}
                  onChange={(e) => setReceiving({ ...receiving, receivedDate: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setReceiving(null)} disabled={busy}>
                キャンセル
              </button>
              <button type="button" onClick={receiveOrder} disabled={busy || Number(receiving.receivedQuantity) <= 0}>
                入荷確定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PurchaseOrderRowBadges({ review }: { review: PurchaseOrderReview | undefined }) {
  if (!review?.needsAction) return null;
  return (
    <div className="purchase-order-row-badges">
      {review.isUnplaced && <span className="badge warn">未発注</span>}
      {review.isCritical && <span className="badge danger">緊急</span>}
      {review.needsConfirm && <span className="badge warn">確定待ち</span>}
      {review.canReceive && <span className="badge info">入荷確定待ち</span>}
      {review.isOverdueArrival && <span className="badge danger">入荷予定超過</span>}
      {review.missingRecommendedDate && <span className="badge warn">推奨発注日なし</span>}
      {review.missingExpectedArrivalDate && <span className="badge warn">入荷予定なし</span>}
    </div>
  );
}

function qtyLabel(row: PurchaseOrderTableRow, value: number | null) {
  if (value == null) return "—";
  // 資材(casePackQtyあり)は基本単位とケース数を併記、原料は基本単位
  return formatCases(value, { casePackQty: row.casePackQty, baseUnit: row.unit });
}

function buildPurchaseOrderReviews(rows: PurchaseOrderTableRow[], today: string) {
  const reviews = new Map<string, PurchaseOrderReview>();
  for (const row of rows) {
    const isClosed = row.status === "received" || row.status === "cancelled";
    const isUnplaced = row.status === "candidate" || row.status === "draft";
    const isCritical = row.urgency === "CRITICAL";
    const needsConfirm = row.status === "ordered_unconfirmed";
    const canReceive = row.status === "confirmed";
    const missingRecommendedDate = isUnplaced && !row.recommendedOrderDate;
    const missingExpectedArrivalDate = !isClosed && !isUnplaced && !row.expectedArrivalDate;
    const isOverdueArrival = !isClosed && !!row.expectedArrivalDate && row.expectedArrivalDate < today;
    const needsAction =
      isUnplaced ||
      isCritical ||
      needsConfirm ||
      canReceive ||
      missingRecommendedDate ||
      missingExpectedArrivalDate ||
      isOverdueArrival;

    reviews.set(row.id, {
      needsAction,
      isUnplaced,
      isCritical,
      needsConfirm,
      canReceive,
      missingRecommendedDate,
      missingExpectedArrivalDate,
      isOverdueArrival,
    });
  }
  return reviews;
}

function reviewKeywords(review: PurchaseOrderReview) {
  const keywords: string[] = [];
  if (review.needsAction) keywords.push("要対応");
  if (review.isUnplaced) keywords.push("未発注");
  if (review.isCritical) keywords.push("緊急");
  if (review.needsConfirm) keywords.push("確定待ち");
  if (review.canReceive) keywords.push("入荷確定待ち");
  if (review.isOverdueArrival) keywords.push("入荷予定超過");
  if (review.missingRecommendedDate || review.missingExpectedArrivalDate) keywords.push("日付未設定");
  return keywords;
}

export type ShortageForecastRow = {
  requirementId: string;
  date: string;
  itemType: string;
  itemCode: string;
  itemName: string;
  shortageType: string;
  plannedQuantityLabel: string;
  onHandBeforeLabel: string;
  shortageQuantityLabel: string;
};

type ShortageForecastFilter = "" | "hard_shortage" | "below_safety" | "unconfirmed_dependency" | "raw_material" | "packaging";

export function ShortageForecastTable({ rows }: { rows: ShortageForecastRow[] }) {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<ShortageForecastFilter>("");
  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          hardShortage: acc.hardShortage + (row.shortageType === "hard_shortage" ? 1 : 0),
          belowSafety: acc.belowSafety + (row.shortageType === "below_safety" ? 1 : 0),
          unconfirmedDependency: acc.unconfirmedDependency + (row.shortageType === "unconfirmed_dependency" ? 1 : 0),
          rawMaterial: acc.rawMaterial + (row.itemType === "raw_material" ? 1 : 0),
          packaging: acc.packaging + (row.itemType === "packaging" ? 1 : 0),
        }),
        {
          hardShortage: 0,
          belowSafety: 0,
          unconfirmedDependency: 0,
          rawMaterial: 0,
          packaging: 0,
        },
      ),
    [rows],
  );
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (
          (quickFilter === "hard_shortage" ||
            quickFilter === "below_safety" ||
            quickFilter === "unconfirmed_dependency") &&
          row.shortageType !== quickFilter
        ) {
          return false;
        }
        if ((quickFilter === "raw_material" || quickFilter === "packaging") && row.itemType !== quickFilter) {
          return false;
        }
        return matchesQuery(search, [
          row.date,
          row.itemCode,
          row.itemName,
          itemTypeLabel(row.itemType),
          shortageTypeLabel(row.shortageType),
        ]);
      }),
    [rows, search, quickFilter],
  );
  const hasActiveFilters = !!(search || quickFilter);
  const filterSummary = [
    `${filtered.length} / ${rows.length} 件`,
    quickFilter ? shortageQuickFilterLabel(quickFilter) : "",
    search,
  ].filter(Boolean).join(" / ");

  function resetFilters() {
    setSearch("");
    setQuickFilter("");
  }

  function applyQuickFilter(next: ShortageForecastFilter) {
    setQuickFilter((current) => (current === next ? "" : next));
  }

  return (
    <>
      <div className={`shortage-forecast-command ${summary.hardShortage > 0 ? "warn" : "success"}`}>
        <div className="shortage-forecast-command-title">
          <strong>不足見込み確認</strong>
          <span className={`badge ${summary.hardShortage > 0 ? "danger" : "success"}`}>
            {summary.hardShortage > 0 ? `実不足 ${summary.hardShortage}件` : "実不足なし"}
          </span>
        </div>
        <div className="shortage-forecast-checks">
          <span className={`badge ${summary.belowSafety > 0 ? "warn" : "success"}`}>
            安全在庫割れ {summary.belowSafety}
          </span>
          <span className={`badge ${summary.unconfirmedDependency > 0 ? "warn" : "success"}`}>
            未確定依存 {summary.unconfirmedDependency}
          </span>
          <span className="badge info">原料 {summary.rawMaterial}</span>
          <span className="badge info">資材 {summary.packaging}</span>
          <span className="badge info">
            表示 {filtered.length} / {rows.length}
          </span>
        </div>
      </div>
      <div className="shortage-forecast-queue" aria-label="不足見込みキュー">
        <button
          type="button"
          className={quickFilter === "hard_shortage" ? "is-active danger" : "danger"}
          onClick={() => applyQuickFilter("hard_shortage")}
        >
          <span>実不足</span>
          <strong>{summary.hardShortage}</strong>
        </button>
        <button
          type="button"
          className={quickFilter === "below_safety" ? "is-active" : ""}
          onClick={() => applyQuickFilter("below_safety")}
        >
          <span>安全在庫割れ</span>
          <strong>{summary.belowSafety}</strong>
        </button>
        <button
          type="button"
          className={quickFilter === "unconfirmed_dependency" ? "is-active" : ""}
          onClick={() => applyQuickFilter("unconfirmed_dependency")}
        >
          <span>未確定依存</span>
          <strong>{summary.unconfirmedDependency}</strong>
        </button>
        <button
          type="button"
          className={quickFilter === "raw_material" ? "is-active" : ""}
          onClick={() => applyQuickFilter("raw_material")}
        >
          <span>原料</span>
          <strong>{summary.rawMaterial}</strong>
        </button>
        <button
          type="button"
          className={quickFilter === "packaging" ? "is-active" : ""}
          onClick={() => applyQuickFilter("packaging")}
        >
          <span>資材</span>
          <strong>{summary.packaging}</strong>
        </button>
      </div>
      <CollapsiblePanel
        title="不足見込みの検索・絞り込み"
        summary={filterSummary}
        open={hasActiveFilters}
      >
        <div className="filter-bar compact-controls">
          <input
            className="filter-search"
            type="search"
            placeholder="品目コード・品目名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="不足見込みを検索"
          />
          <button type="button" className="secondary" onClick={resetFilters} disabled={!search}>
            条件クリア
          </button>
          <span className="filter-count">
            {filtered.length} / {rows.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      {filtered.length === 0 ? (
        <div className="empty-state">条件に一致する不足見込みはありません。</div>
      ) : (
        <div className="table-frame standard-list-frame shortage-forecast-frame">
          <table className="standard-list-table shortage-forecast-list-table">
            <colgroup>
              <col className="shortage-date-col" />
              <col className="shortage-type-col" />
              <col className="shortage-item-col" />
              <col className="shortage-quantity-col" />
              <col className="shortage-quantity-col" />
              <col className="shortage-quantity-col" />
              <col className="shortage-status-col" />
            </colgroup>
            <thead>
              <tr>
                <th>不足日</th>
                <th>区分</th>
                <th>品目</th>
                <th>予定使用量</th>
                <th>使用前見込み</th>
                <th>不足</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.requirementId}
                  className={[
                    "shortage-forecast-row",
                    row.shortageType === "hard_shortage" ? "row-needs-action" : "",
                    row.shortageType === "below_safety" ? "is-safety-warning" : "",
                    row.shortageType === "unconfirmed_dependency" ? "is-unconfirmed" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <td data-label="不足日">{row.date}</td>
                  <td data-label="区分">{itemTypeLabel(row.itemType)}</td>
                  <td className="wrap-cell product-name-cell" data-label="品目">
                    <strong>{row.itemName}</strong>
                    {row.itemCode && <div className="subtext">{row.itemCode}</div>}
                  </td>
                  <td className="right" data-label="予定使用量">{row.plannedQuantityLabel}</td>
                  <td className="right" data-label="使用前見込み">{row.onHandBeforeLabel}</td>
                  <td className="right" data-label="不足">{row.shortageQuantityLabel}</td>
                  <td data-label="状態">
                    <span className={`badge ${shortageTypeBadgeClass(row.shortageType)}`}>
                      {shortageTypeLabel(row.shortageType)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function itemTypeLabel(value: string) {
  return value === "raw_material" ? "原料" : "資材";
}

function shortageTypeLabel(value: string) {
  switch (value) {
    case "hard_shortage":
      return "実不足";
    case "below_safety":
      return "安全在庫割れ";
    case "unconfirmed_dependency":
      return "未確定依存";
    default:
      return "確認";
  }
}

function shortageTypeBadgeClass(value: string) {
  switch (value) {
    case "hard_shortage":
      return "danger";
    case "below_safety":
    case "unconfirmed_dependency":
      return "warn";
    default:
      return "info";
  }
}

function shortageQuickFilterLabel(value: ShortageForecastFilter) {
  switch (value) {
    case "hard_shortage":
    case "below_safety":
    case "unconfirmed_dependency":
      return shortageTypeLabel(value);
    case "raw_material":
    case "packaging":
      return itemTypeLabel(value);
    default:
      return "";
  }
}

function canDownload(status: string) {
  return ["draft", "ordered_unconfirmed", "confirmed", "received"].includes(status);
}

function fileNameFromDisposition(value: string | null) {
  return value?.match(/filename="?([^"]+)"?/)?.[1] ?? null;
}
