"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ListTree,
  PackageCheck,
  RotateCcw,
  Save,
} from "lucide-react";

import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";
import { ceilDisplayQuantity, formatCases } from "@/lib/units";

export type DayRequirementRow = {
  itemType: "raw_material" | "packaging";
  itemId: string;
  itemName: string;
  unit: string;
  plannedQuantity: number;
  unitPriceSnapshot: number;
  actualQuantity: number;
};

export type DayPlanRow = {
  planId: string;
  date: string;
  productCode: string;
  productName: string;
  unit: string;
  casePackQty: number | null;
  workAreaName: string;
  planStatus: string;
  plannedQuantity: number;
  plannedPeopleCount: number;
  plannedStartTime: string;
  plannedEndTime: string | null;
  reportStatus: string; // none | draft | confirmed | voided
  confirmedAt: string | null;
  actualQuantity: number;
  requirements: DayRequirementRow[];
};

function reportStatusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "confirmed":
      return { label: "確定", cls: "success" };
    case "draft":
      return { label: "下書き", cls: "info" };
    default:
      return { label: "未入力", cls: "muted" };
  }
}

function toNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type QtyMap = Record<string, string>;
type ConsMap = Record<string, Record<string, string>>;

export default function DailyReportDayEntry({ date, rows }: { date: string; rows: DayPlanRow[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<QtyMap>(() =>
    Object.fromEntries(rows.map((r) => [r.planId, String(r.actualQuantity)])),
  );
  const [cons, setCons] = useState<ConsMap>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.planId,
        Object.fromEntries(r.requirements.map((req) => [`${req.itemType}:${req.itemId}`, String(req.actualQuantity)])),
      ]),
    ),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<"" | "pending" | "issues" | "variance">("");

  const pending = useMemo(() => rows.filter((r) => r.reportStatus !== "confirmed"), [rows]);
  const confirmedCount = useMemo(() => rows.filter((r) => r.reportStatus === "confirmed").length, [rows]);
  const draftCount = useMemo(() => rows.filter((r) => r.reportStatus === "draft").length, [rows]);
  const rowsWithVariance = useMemo(
    () => rows.filter((row) => rowHasVariance(row, qty, cons)).length,
    [cons, qty, rows],
  );
  const issueRows = useMemo(
    () => pending.filter((row) => rowNeedsReview(row, qty, cons)),
    [cons, pending, qty],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (
          !matchesQuery(search, [
            row.productCode,
            row.productName,
            row.workAreaName,
            reportStatusBadge(row.reportStatus).label,
            row.planStatus,
          ])
        ) {
          return false;
        }
        if (viewFilter === "pending" && row.reportStatus === "confirmed") return false;
        if (viewFilter === "issues" && !rowNeedsReview(row, qty, cons)) return false;
        if (viewFilter === "variance" && !rowHasVariance(row, qty, cons)) return false;
        return true;
      }),
    [cons, qty, rows, search, viewFilter],
  );
  const visibleRequirementRows = useMemo(
    () => filteredRows.filter((row) => row.requirements.length > 0),
    [filteredRows],
  );
  const allRequirementRowsOpen =
    visibleRequirementRows.length > 0 && visibleRequirementRows.every((row) => expanded[row.planId]);
  const canDraft = !busy && pending.length > 0 && pending.every((row) => rowHasNonNegativeValues(row, qty, cons));
  const canConfirm = canDraft && issueRows.length === 0;
  const saveStatus =
    pending.length === 0
      ? "当日分は確定済みです"
      : issueRows.length > 0
        ? `${issueRows.length}件を確認してください`
        : "当日分を確定できます";
  const saveHelp =
    pending.length === 0
      ? "在庫・原価へ反映済みです。"
      : issueRows.length > 0
        ? "実数量または実使用量が0以下の未確定行があります。"
        : "確定すると実使用量で在庫・原価へ反映します。";

  function toggle(planId: string) {
    setExpanded((prev) => ({ ...prev, [planId]: !prev[planId] }));
  }
  function setConsValue(planId: string, key: string, value: string) {
    setCons((prev) => ({ ...prev, [planId]: { ...prev[planId], [key]: value } }));
  }

  // 確定対象(=未確定の全行)から送信ペイロードを作る。実数量は表示数量に合わせて切り上げる。
  function buildEntries() {
    return pending.map((r) => ({
      planId: r.planId,
      actualQuantity: ceilDisplayQuantity(toNum(qty[r.planId])) ?? 0,
      consumptions: r.requirements.map((req) => ({
        itemType: req.itemType,
        itemId: req.itemId,
        actualQuantity: toNum(cons[r.planId]?.[`${req.itemType}:${req.itemId}`] ?? "0"),
        unitPriceSnapshot: req.unitPriceSnapshot,
      })),
    }));
  }

  async function submit(confirm: boolean) {
    if (confirm && !canConfirm) {
      setError("確定前に未確定行の実数量・実使用量を確認してください。");
      return;
    }
    if (!confirm && !canDraft) {
      setError("下書き保存前にマイナス値を確認してください。");
      return;
    }
    const entries = buildEntries();
    if (entries.length === 0) return;
    if (confirm && !window.confirm(`当日分 ${entries.length} 件を確定し、実績を在庫・原価に反映します。よろしいですか？`))
      return;

    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/daily-reports/day-entry"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm, entries }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`処理に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    const failed = json.failed?.length ?? 0;
    if (confirm) {
      setMessage(`確定 ${json.confirmed} 件${failed ? ` / 失敗 ${failed} 件` : ""}。在庫・原価を更新しました。`);
    } else {
      setMessage(`下書き保存 ${json.saved} 件${failed ? ` / 失敗 ${failed} 件` : ""}。`);
    }
    router.refresh();
  }

  function toggleAllUsage() {
    if (allRequirementRowsOpen) {
      setExpanded((prev) => {
        const next = { ...prev };
        for (const row of visibleRequirementRows) delete next[row.planId];
        return next;
      });
      return;
    }
    setExpanded((prev) => ({
      ...prev,
      ...Object.fromEntries(visibleRequirementRows.map((row) => [row.planId, true])),
    }));
  }

  function resetViewFilters() {
    setSearch("");
    setViewFilter("");
  }

  function resetPendingToPlan() {
    setQty((prev) => ({
      ...prev,
      ...Object.fromEntries(pending.map((row) => [row.planId, String(row.plannedQuantity)])),
    }));
    setCons((prev) => ({
      ...prev,
      ...Object.fromEntries(
        pending.map((row) => [
          row.planId,
          Object.fromEntries(row.requirements.map((req) => [`${req.itemType}:${req.itemId}`, String(req.plannedQuantity)])),
        ]),
      ),
    }));
    setMessage(null);
    setError(null);
  }

  if (rows.length === 0) {
    return <div className="empty-state">この日の生産予定はありません。生産予定を登録してください。</div>;
  }

  return (
    <section>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}

      <div className="daily-report-day-command">
        <div className="daily-report-day-command-title">
          <span className={`badge ${pending.length === 0 ? "success" : issueRows.length > 0 ? "warn" : "info"}`}>
            {pending.length === 0 ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : issueRows.length > 0 ? (
              <AlertTriangle size={14} aria-hidden="true" />
            ) : (
              <ClipboardCheck size={14} aria-hidden="true" />
            )}
            {saveStatus}
          </span>
          <strong>{date} の日報入力</strong>
        </div>
        <div className="daily-report-day-checks" aria-label="当日日報の状態">
          <span className="badge info">
            表示 {filteredRows.length}/{rows.length}件
          </span>
          <span className="badge muted">予定 {rows.length}件</span>
          <span className="badge success">確定 {confirmedCount}件</span>
          <span className="badge info">下書き {draftCount}件</span>
          <span className={`badge ${rowsWithVariance > 0 ? "warn" : "muted"}`}>差異 {rowsWithVariance}件</span>
          <span className={`badge ${issueRows.length > 0 ? "danger" : "success"}`}>
            {issueRows.length > 0 ? <AlertTriangle size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
            確認 {issueRows.length}件
          </span>
        </div>
        <div className="daily-report-day-command-actions">
          <button type="button" className="secondary" onClick={toggleAllUsage} disabled={visibleRequirementRows.length === 0}>
            <ListTree size={15} aria-hidden="true" />
            {allRequirementRowsOpen ? "使用量を閉じる" : "使用量を開く"}
          </button>
          <button type="button" className="secondary" onClick={resetPendingToPlan} disabled={busy || pending.length === 0}>
            <RotateCcw size={15} aria-hidden="true" />
            未確定を予定値へ
          </button>
        </div>
      </div>

      <div className="daily-report-day-filter">
        <input
          className="filter-search"
          type="search"
          placeholder="商品名・コード・場所で検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="日報行を検索"
        />
        <div className="daily-report-day-filter-buttons" aria-label="日報表示切替">
          <button
            type="button"
            className={viewFilter === "pending" ? "is-active" : ""}
            onClick={() => setViewFilter((current) => (current === "pending" ? "" : "pending"))}
          >
            未確定
          </button>
          <button
            type="button"
            className={viewFilter === "issues" ? "is-active danger" : "danger"}
            onClick={() => setViewFilter((current) => (current === "issues" ? "" : "issues"))}
          >
            要確認
          </button>
          <button
            type="button"
            className={viewFilter === "variance" ? "is-active" : ""}
            onClick={() => setViewFilter((current) => (current === "variance" ? "" : "variance"))}
          >
            差異あり
          </button>
        </div>
        <button type="button" className="secondary" onClick={resetViewFilters} disabled={!search && !viewFilter}>
          条件クリア
        </button>
      </div>

      {filteredRows.length === 0 ? (
        <div className="empty-state">条件に一致する日報行はありません。</div>
      ) : (
      <div className="table-frame daily-report-day-frame">
        <table className="daily-report-day-table">
          <thead>
            <tr>
              <th>商品</th>
              <th>場所</th>
              <th className="right">予定数量</th>
              <th className="right">実数量</th>
              <th className="right">過不足</th>
              <th>使用量</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => {
              const confirmed = r.reportStatus === "confirmed";
              const badge = reportStatusBadge(r.reportStatus);
              const actual = ceilDisplayQuantity(toNum(qty[r.planId])) ?? 0;
              const diff = actual - (ceilDisplayQuantity(r.plannedQuantity) ?? 0);
              const isOpen = !!expanded[r.planId];
              const rowIssueCount = rowIssueMessages(r, qty, cons).length;
              const rowVariance = rowHasVariance(r, qty, cons);
              return (
                <Fragment key={r.planId}>
                  <tr className={`dr-plan-row${confirmed ? " row-muted" : ""}${rowIssueCount > 0 ? " row-needs-action" : ""}`}>
                    <td className="dr-product-cell" data-label="商品">
                      <div>{r.productName}</div>
                      <div className="subtext">
                        {r.productCode} · {r.plannedStartTime}
                        {r.plannedEndTime ? `-${r.plannedEndTime}` : ""}
                      </div>
                    </td>
                    <td data-label="場所">
                      <div>{r.workAreaName}</div>
                      <div className="subtext">{r.plannedPeopleCount}人</div>
                    </td>
                    <td className="right" data-label="予定数量">
                      {formatCases(r.plannedQuantity, { casePackQty: r.casePackQty, baseUnit: r.unit })}
                    </td>
                    <td className="right dr-actual-cell" data-label="実数量">
                      {confirmed ? (
                        formatCases(r.actualQuantity, { casePackQty: r.casePackQty, baseUnit: r.unit })
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="dr-qty-input"
                          value={qty[r.planId] ?? ""}
                          onChange={(e) => setQty((prev) => ({ ...prev, [r.planId]: e.target.value }))}
                          aria-label={`${r.productName} 実数量`}
                        />
                      )}
                    </td>
                    <td className="right" data-label="過不足">
                      <span className={`badge ${diff === 0 ? "muted" : diff > 0 ? "success" : "danger"}`}>
                        {diff > 0 ? "+" : ""}
                        {formatCases(diff, { casePackQty: r.casePackQty, baseUnit: r.unit })}
                      </span>
                    </td>
                    <td data-label="使用量">
                      {r.requirements.length === 0 ? (
                        <span className="badge warn">
                          <AlertTriangle size={13} aria-hidden="true" />
                          BOMなし
                        </span>
                      ) : (
                        <button type="button" className="secondary dr-expand" onClick={() => toggle(r.planId)}>
                          {isOpen ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
                          実使用量 {r.requirements.length}
                        </button>
                      )}
                    </td>
                    <td data-label="状態">
                      <div className="dr-status-stack">
                        <span className={`badge ${badge.cls}`}>{badge.label}</span>
                        {rowIssueCount > 0 && <span className="badge danger">確認 {rowIssueCount}</span>}
                        {rowIssueCount === 0 && rowVariance && !confirmed && <span className="badge warn">差異あり</span>}
                        {rowIssueCount === 0 && !rowVariance && !confirmed && <span className="badge success">OK</span>}
                      </div>
                      {confirmed && r.confirmedAt && <div className="subtext">{r.confirmedAt}</div>}
                    </td>
                    <td className="right dr-action-cell" data-label="詳細">
                      <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans/${r.planId}`)}>
                        詳細
                      </Link>
                    </td>
                  </tr>
                  {isOpen && r.requirements.length > 0 && (
                    <tr className="dr-usage-row">
                      <td colSpan={8}>
                        <table className="dr-usage-table">
                          <thead>
                            <tr>
                              <th>区分</th>
                              <th>名称</th>
                              <th className="right">予定使用量</th>
                              <th className="right">実使用量</th>
                              <th className="right">差異</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.requirements.map((req) => {
                              const key = `${req.itemType}:${req.itemId}`;
                              const actualUsage = toNum(cons[r.planId]?.[key] ?? "0");
                              const usageDiff = actualUsage - req.plannedQuantity;
                              return (
                                <tr key={key} className={!confirmed && req.plannedQuantity > 0 && actualUsage <= 0 ? "row-needs-action" : undefined}>
                                  <td>{req.itemType === "raw_material" ? "原料" : "資材"}</td>
                                  <td>{req.itemName}</td>
                                  <td className="right">
                                    {req.plannedQuantity} {req.unit}
                                  </td>
                                  <td className="right">
                                    {confirmed ? (
                                      `${req.actualQuantity} ${req.unit}`
                                    ) : (
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.0001"
                                        className="dr-qty-input"
                                        value={cons[r.planId]?.[key] ?? "0"}
                                        onChange={(e) => setConsValue(r.planId, key, e.target.value)}
                                        aria-label={`${r.productName} ${req.itemName} 実使用量`}
                                      />
                                    )}
                                  </td>
                                  <td className="right">
                                    <span className={`badge ${Math.abs(usageDiff) <= 0.0001 ? "muted" : usageDiff > 0 ? "success" : "danger"}`}>
                                      {usageDiff > 0 ? "+" : ""}
                                      {formatDecimal(usageDiff)} {req.unit}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div className="dr-actions">
        <div className="dr-save-status">
          <strong>{saveStatus}</strong>
          <span>{saveHelp}</span>
        </div>
        <div className="dr-save-buttons">
          <button type="button" className="secondary" onClick={() => submit(false)} disabled={!canDraft}>
            <Save size={15} aria-hidden="true" />
            {busy ? "処理中..." : "下書き保存"}
          </button>
          <button type="button" onClick={() => submit(true)} disabled={!canConfirm}>
            <PackageCheck size={15} aria-hidden="true" />
            当日分を確定
          </button>
        </div>
      </div>
    </section>
  );
}

function rowActualQuantity(row: DayPlanRow, qty: QtyMap) {
  return ceilDisplayQuantity(toNum(qty[row.planId])) ?? 0;
}

function rowConsumptionValue(row: DayPlanRow, req: DayRequirementRow, cons: ConsMap) {
  return toNum(cons[row.planId]?.[`${req.itemType}:${req.itemId}`] ?? "0");
}

function rowHasVariance(row: DayPlanRow, qty: QtyMap, cons: ConsMap) {
  const actual = rowActualQuantity(row, qty);
  const planned = ceilDisplayQuantity(row.plannedQuantity) ?? 0;
  if (actual !== planned) return true;
  return row.requirements.some((req) => Math.abs(rowConsumptionValue(row, req, cons) - req.plannedQuantity) > 0.0001);
}

function rowIssueMessages(row: DayPlanRow, qty: QtyMap, cons: ConsMap) {
  if (row.reportStatus === "confirmed") return [];
  const issues: string[] = [];
  if (rowActualQuantity(row, qty) <= 0) issues.push("実数量");
  for (const req of row.requirements) {
    if (req.plannedQuantity > 0 && rowConsumptionValue(row, req, cons) <= 0) {
      issues.push(req.itemType === "raw_material" ? "原料" : "資材");
      break;
    }
  }
  return issues;
}

function rowNeedsReview(row: DayPlanRow, qty: QtyMap, cons: ConsMap) {
  return rowIssueMessages(row, qty, cons).length > 0;
}

function rowHasNonNegativeValues(row: DayPlanRow, qty: QtyMap, cons: ConsMap) {
  if (rowActualQuantity(row, qty) < 0) return false;
  return row.requirements.every((req) => rowConsumptionValue(row, req, cons) >= 0);
}

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
