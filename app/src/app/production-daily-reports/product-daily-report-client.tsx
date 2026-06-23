"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  Image as ImageIcon,
  ListFilter,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { HelpTooltip } from "@/components/ui/help-tooltip";
import SectionTabs from "@/components/ui/section-tabs";
import ProductCombobox, { type ProductComboOption } from "@/components/ui/product-combobox";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import {
  DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE,
  computeProductDailyReportMetrics,
  type ProductDailyReportSummaryRow,
} from "@/lib/product-daily-report-calculations";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";

export type ProductDailyReportBomMaterial = {
  materialId: string;
  materialName: string;
  unitPrice: number;
  quantityPerUnit: number;
};

export type ProductDailyReportProductOption = ProductComboOption & {
  capacityG: number | null;
  materialUnitCostPerKg: number;
  packageCostPerUnit: number;
  unitPrice: number;
  bomMaterials: ProductDailyReportBomMaterial[];
};

export type ProductDailyReportMaterialOption = {
  id: string;
  materialCode: string;
  name: string;
  standardUnitPrice: number;
  unit: string;
};

export type ProductDailyReportLaborRateOption = {
  id: string;
  code: string;
  name: string;
  hourlyRate: number;
};

export type MonthlyLaborFeeRow = {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  perBagLaborFee: number;
  avgPerHourQty: number;
  sampleCount: number;
  status: string;
  appliedAt: string | null;
  currentUnitPrice: number;
};

export type ProductDailyReportRowMaterial = {
  materialId: string | null;
  materialName: string;
  usedKg: number;
  unitPriceSnapshot: number;
};

export type ProductDailyReportLabelPhoto = {
  name: string;
  type: string | null;
  dataUrl: string;
};

export type ProductDailyReportRow = {
  id: string;
  reportDate: string;
  productId: string | null;
  productName: string;
  productCode: string | null;
  displayName: string | null;
  officialName: string | null;
  productMatchStatus: string;
  expiryDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workerCount: number;
  productionQty: number;
  materialUsedKg: number;
  materials: ProductDailyReportRowMaterial[];
  laborFeeRateId: string | null;
  laborFeeRateName: string | null;
  note: string | null;
  approvalStatus: string;
  inventoryReflected: boolean;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  labelPhotos: ProductDailyReportLabelPhoto[];
  capacityGSnapshot: number | null;
  materialUnitCostSnapshot: number;
  packageCostPerUnitSnapshot: number;
  unitPriceSnapshot: number;
  laborHourlyRateSnapshot: number;
  operatingMinutes: number;
  totalOperatingMinutes: number;
  perHourQty: number;
  perUnitTimeMinutes: number;
  laborFeePerUnit: number;
  bagWeightG: number;
  lossRate: number;
  materialCost: number;
  packageCost: number;
  totalCost: number;
  sales: number;
  profitRate: number;
  calculationWarnings: string[];
};

type MaterialFormRow = { materialId: string; materialName: string; usedKg: string };
type DailyReportColumnMode = "review" | "input" | "cost" | "all";
type DailyReportQuickFilter = "all" | "submitted" | "attention" | "photos" | "noPhotos";
type DailyReportTabId = "review" | "entry" | "labor-fee" | "summary";

const dailyReportColumnModes: { id: DailyReportColumnMode; label: string }[] = [
  { id: "review", label: "確認" },
  { id: "input", label: "入力" },
  { id: "cost", label: "原価" },
  { id: "all", label: "全列" },
];

type EntryFormState = {
  reportDate: string;
  productId: string;
  productName: string;
  expiryDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  workerCount: string;
  productionQty: string;
  materials: MaterialFormRow[];
  laborFeeRateId: string;
  note: string;
};

export default function ProductDailyReportClient({
  selectedMonth,
  rows,
  summaries,
  total,
  products,
  materialOptions,
  laborRates,
  monthlyLaborFees,
  initialReviewOnly = false,
}: {
  selectedMonth: string;
  rows: ProductDailyReportRow[];
  summaries: ProductDailyReportSummaryRow[];
  total: ProductDailyReportSummaryRow;
  products: ProductDailyReportProductOption[];
  materialOptions: ProductDailyReportMaterialOption[];
  laborRates: ProductDailyReportLaborRateOption[];
  monthlyLaborFees: MonthlyLaborFeeRow[];
  initialReviewOnly?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<EntryFormState>(() => emptyForm(selectedMonth, laborRates));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EntryFormState | null>(null);
  const [approvalReviewId, setApprovalReviewId] = useState<string | null>(null);
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DailyReportTabId>("review");
  const [columnMode, setColumnMode] = useState<DailyReportColumnMode>("review");
  const [tableSearch, setTableSearch] = useState("");
  const [tableQuickFilter, setTableQuickFilter] = useState<DailyReportQuickFilter>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alerts = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.approvalStatus === "submitted" ||
          row.approvalStatus === "rejected" ||
          row.productMatchStatus === "unmatched" ||
          row.productMatchStatus === "fuzzy" ||
          row.unitPriceSnapshot <= 0 ||
          row.calculationWarnings.length > 0,
    ),
    [rows],
  );
  const pendingApproval = useMemo(() => rows.filter((row) => row.approvalStatus === "submitted"), [rows]);
  const approvedCount = useMemo(() => rows.filter((row) => row.approvalStatus === "approved").length, [rows]);
  const unmatchedCount = useMemo(
    () =>
      rows.filter((row) => row.productMatchStatus === "unmatched" || row.productMatchStatus === "fuzzy")
        .length,
    [rows],
  );
  const missingPriceCount = useMemo(() => rows.filter((row) => row.unitPriceSnapshot <= 0).length, [rows]);
  const warningCount = useMemo(() => rows.filter((row) => row.calculationWarnings.length > 0).length, [rows]);
  const photoCount = useMemo(() => rows.filter((row) => row.labelPhotos.length > 0).length, [rows]);
  const noPhotoCount = rows.length - photoCount;
  const reviewListRows = useMemo(() => {
    const pendingIds = new Set(pendingApproval.map((row) => row.id));
    return [...pendingApproval, ...alerts.filter((row) => !pendingIds.has(row.id))].slice(0, 4);
  }, [alerts, pendingApproval]);
  const nextReviewRow = reviewListRows[0] ?? null;
  const [showReviewOnly, setShowReviewOnly] = useState(initialReviewOnly && alerts.length > 0);
  const baseDisplayRows = showReviewOnly ? alerts : rows;
  const displayRows = useMemo(() => {
    const query = tableSearch.trim();
    return baseDisplayRows.filter((row) => {
      const matchesQuickFilter =
        tableQuickFilter === "all" ||
        (tableQuickFilter === "submitted" && row.approvalStatus === "submitted") ||
        (tableQuickFilter === "attention" && needsDailyReportAttention(row)) ||
        (tableQuickFilter === "photos" && row.labelPhotos.length > 0) ||
        (tableQuickFilter === "noPhotos" && row.labelPhotos.length === 0);
      const matchesText =
        !query ||
        matchesQuery(query, [
          row.reportDate,
          row.productName,
          row.productCode,
          row.displayName,
          row.officialName,
          row.note,
          row.submittedBy,
          ...dailyReportAttentionLabels(row),
        ]);
      return matchesQuickFilter && matchesText;
    });
  }, [baseDisplayRows, tableQuickFilter, tableSearch]);
  const hasTableFilters = Boolean(showReviewOnly || tableQuickFilter !== "all" || tableSearch.trim());
  const editingRow = useMemo(() => rows.find((row) => row.id === editingId) ?? null, [editingId, rows]);
  const approvalReviewRow = useMemo(
    () => rows.find((row) => row.id === approvalReviewId && row.approvalStatus === "submitted") ?? null,
    [approvalReviewId, rows],
  );
  const deleteReviewRow = useMemo(() => rows.find((row) => row.id === deleteReviewId) ?? null, [deleteReviewId, rows]);
  const preview = usePreview(form, products, materialOptions, laborRates);
  const selectedProduct = useMemo(() => products.find((p) => p.id === form.productId) ?? null, [form.productId, products]);
  const entryProductTitle = selectedProduct ? selectedProductDisplayName(selectedProduct) : form.productName.trim() || "商品未選択";
  const lowestProfit = useMemo(() => lowestProfitSummary(summaries), [summaries]);
  const highestLoss = useMemo(() => highestLossSummary(summaries), [summaries]);
  const entryMaterialUsedKg = useMemo(
    () => form.materials.reduce((sum, material) => sum + toNumber(material.usedKg), 0),
    [form.materials],
  );
  const editPreview = usePreview(editForm ?? form, products, materialOptions, laborRates);
  const entryChecks = useMemo(
    () => [
      { label: "商品", done: Boolean(form.productId || form.productName.trim()) },
      { label: "時間", done: Boolean(form.startTime && form.endTime && preview.operatingMinutes > 0) },
      { label: "人数", done: toNumber(form.workerCount) > 0 },
      { label: "生産数", done: toNumber(form.productionQty) > 0 },
      {
        label: "原料",
        done: form.materials.some(
          (material) => Boolean(material.materialId || material.materialName.trim()) && toNumber(material.usedKg) > 0,
        ),
      },
    ],
    [form, preview.operatingMinutes],
  );
  const entryDoneCount = entryChecks.filter((check) => check.done).length;
  const pendingLaborFeeCount = useMemo(
    () => monthlyLaborFees.filter((row) => row.status !== "applied").length,
    [monthlyLaborFees],
  );
  const summaryAttentionCount = summaries.filter((summary) =>
    productSummaryBadges(summary, false).some((badge) => badge.tone === "warn" || badge.tone === "danger"),
  ).length;
  const nextWorkflowAction =
    pendingApproval.length > 0
      ? "未計上を確認"
      : alerts.length > 0
        ? "要確認を編集"
        : pendingLaborFeeCount > 0
          ? "月次手間賃を反映"
          : entryDoneCount < entryChecks.length
            ? "日報を入力"
            : "商品別集計を確認";
  const workflowQueues = [
    {
      tab: "review" as const,
      label: "日報確認",
      count: alerts.length,
      detail: pendingApproval.length > 0 ? `未計上 ${pendingApproval.length}` : `表示 ${rows.length}`,
      tone: alerts.length > 0 ? "warn" : "success",
      Icon: ListFilter,
    },
    {
      tab: "entry" as const,
      label: "日報入力",
      count: entryDoneCount,
      detail: `${entryChecks.length}項目中`,
      tone: entryDoneCount === entryChecks.length ? "success" : "info",
      Icon: Plus,
    },
    {
      tab: "labor-fee" as const,
      label: "月次手間賃",
      count: pendingLaborFeeCount,
      detail: `算出 ${monthlyLaborFees.length}`,
      tone: pendingLaborFeeCount > 0 ? "warn" : "success",
      Icon: Save,
    },
    {
      tab: "summary" as const,
      label: "商品別集計",
      count: summaries.length,
      detail: summaryAttentionCount > 0 ? `注意 ${summaryAttentionCount}` : "集計確認",
      tone: summaryAttentionCount > 0 ? "warn" : "info",
      Icon: ClipboardList,
    },
  ];
  const selectedEditProduct = useMemo(
    () => (editForm ? products.find((p) => p.id === editForm.productId) ?? null : null),
    [editForm, products],
  );

  function onSelectProduct(setter: Dispatch<SetStateAction<EntryFormState>>, productId: string) {
    const product = products.find((p) => p.id === productId);
    setter((prev) => ({
      ...prev,
      productId,
      productName: "",
      // 商品選択でBOM原料を自動展開(使用量は空欄、現場が実績kgを入力)。
      materials:
        product && product.bomMaterials.length > 0
          ? product.bomMaterials.map((b) => ({ materialId: b.materialId, materialName: b.materialName, usedKg: "" }))
          : prev.materials.length > 0
            ? prev.materials
            : [emptyMaterialRow()],
    }));
  }

  async function createEntry(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath("/production-daily-reports"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(form)),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`保存できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("日報を保存し、在庫へ反映しました。");
    setForm((prev) => ({ ...emptyForm(selectedMonth, laborRates), reportDate: prev.reportDate }));
    router.refresh();
  }

  async function saveEdit(id: string) {
    if (!editForm) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/production-daily-reports/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(editForm)),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`更新できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setEditingId(null);
    setEditForm(null);
    setMessage("日報を更新しました。");
    router.refresh();
  }

  async function deleteRow(row: ProductDailyReportRow) {
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/production-daily-reports/${row.id}`), { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`削除できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setDeleteReviewId(null);
    setMessage("日報を削除しました。");
    router.refresh();
  }

  async function approveRow(row: ProductDailyReportRow) {
    if (row.approvalStatus !== "submitted") {
      setError("未計上の日報だけ計上できます。");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/production-daily-reports/${row.id}/approve`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "管理者" }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`計上できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setApprovalReviewId(null);
    setMessage(`${row.reportDate} ${displayProductName(row)} を計上しました。月次手間賃も再計算済みです。`);
    router.refresh();
  }

  function openApprovalReview(row: ProductDailyReportRow, options?: { reviewOnly?: boolean }) {
    if (row.approvalStatus !== "submitted") return;
    if (options?.reviewOnly) {
      setShowReviewOnly(true);
      setTableQuickFilter("all");
    }
    setApprovalReviewId(row.id);
    setDeleteReviewId(null);
    setEditingId(null);
    setEditForm(null);
    window.setTimeout(() => {
      document.getElementById("daily-report-approve-panel")?.scrollIntoView({ block: "start", inline: "nearest" });
    }, 0);
  }

  function openDeleteReview(row: ProductDailyReportRow) {
    setDeleteReviewId(row.id);
    setApprovalReviewId(null);
    setEditingId(null);
    setEditForm(null);
    window.setTimeout(() => {
      document.getElementById("daily-report-delete-panel")?.scrollIntoView({ block: "start", inline: "nearest" });
    }, 0);
  }

  function openEdit(row: ProductDailyReportRow, options?: { reviewOnly?: boolean }) {
    if (options?.reviewOnly) {
      setShowReviewOnly(true);
      setTableQuickFilter("all");
    }
    setApprovalReviewId(null);
    setDeleteReviewId(null);
    setEditingId(row.id);
    setEditForm(formFromRow(row));
    window.setTimeout(() => {
      document.getElementById("daily-report-edit-panel")?.scrollIntoView({ block: "start", inline: "nearest" });
    }, 0);
  }

  function showOnlyReviewRows() {
    setShowReviewOnly(true);
    setTableQuickFilter("all");
  }

  function showAllReportRows() {
    setShowReviewOnly(false);
    setTableQuickFilter("all");
  }

  function applyQuickFilter(filter: DailyReportQuickFilter) {
    setShowReviewOnly(false);
    setTableQuickFilter(filter);
  }

  function clearTableFilters() {
    setShowReviewOnly(false);
    setTableQuickFilter("all");
    setTableSearch("");
  }

  function openWorkflowTab(tab: DailyReportTabId, options?: { reviewOnly?: boolean }) {
    setActiveTab(tab);
    if (tab === "review" && options?.reviewOnly && alerts.length > 0) {
      setShowReviewOnly(true);
      setTableQuickFilter("all");
    }
    window.setTimeout(() => {
      document.getElementById("daily-report-workflow-tabs")?.scrollIntoView({ block: "start", inline: "nearest" });
    }, 0);
  }

  function scrollToEntrySection(id: string) {
    setActiveTab("entry");
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start", inline: "nearest" });
    }, 0);
  }

  function runNextWorkflowAction() {
    if (nextReviewRow) {
      if (nextReviewRow.approvalStatus === "submitted") {
        openApprovalReview(nextReviewRow, { reviewOnly: true });
      } else {
        openEdit(nextReviewRow, { reviewOnly: true });
      }
      setActiveTab("review");
      return;
    }
    if (pendingLaborFeeCount > 0) {
      openWorkflowTab("labor-fee");
      return;
    }
    if (entryDoneCount < entryChecks.length) {
      openWorkflowTab("entry");
      return;
    }
    openWorkflowTab("summary");
  }

  return (
    <>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}

      <div className={`daily-report-workflow-command ${alerts.length > 0 || pendingLaborFeeCount > 0 ? "warn" : "success"}`}>
        <div className="daily-report-workflow-main">
          <span className={`badge ${alerts.length > 0 || pendingLaborFeeCount > 0 ? "warn" : "success"}`}>
            {alerts.length > 0 ? `要確認 ${alerts.length}` : pendingLaborFeeCount > 0 ? `未反映 ${pendingLaborFeeCount}` : "順調"}
          </span>
          <strong>{selectedMonth} の日報フロー</strong>
          <span>次: {nextWorkflowAction}</span>
        </div>
        <div className="daily-report-workflow-queue" aria-label="日報作業キュー">
          {workflowQueues.map(({ tab, label, count, detail, tone, Icon }) => (
            <button
              key={tab}
              type="button"
              className={`daily-report-workflow-item ${tone}${activeTab === tab ? " is-active" : ""}`}
              onClick={() => openWorkflowTab(tab, { reviewOnly: tab === "review" })}
            >
              <span>
                <Icon className="h-4 w-4" />
                {label}
              </span>
              <strong>{count}</strong>
              <small>{detail}</small>
            </button>
          ))}
        </div>
        <div className="daily-report-workflow-actions">
          <button type="button" className="gap-2" onClick={runNextWorkflowAction} disabled={busy}>
            <CheckCircle className="h-4 w-4" />
            次へ
          </button>
        </div>
      </div>

      <div className={`daily-report-review-panel ${alerts.length > 0 ? "warn" : "success"}`}>
        <div className="daily-report-review-status">
          {alerts.length > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
          <div>
            <span>確認対象</span>
            <strong>{alerts.length} 件</strong>
            <p>
              {alerts.length > 0
                ? "未計上・商品照合・売値・原価設定を先に確認します。"
                : "この月の日報に確認対象はありません。"}
            </p>
          </div>
        </div>
        <div className="daily-report-review-breakdown" aria-label="確認対象の内訳">
          <span className="badge warn">未計上 {pendingApproval.length}</span>
          <span className="badge warn">照合 {unmatchedCount}</span>
          <span className="badge warn">売値未設定 {missingPriceCount}</span>
          <span className="badge warn">計算注意 {warningCount}</span>
        </div>
        <div className="daily-report-review-actions">
          {nextReviewRow &&
            (nextReviewRow.approvalStatus === "submitted" ? (
              <button
                type="button"
                className="gap-2 daily-report-primary-action"
                onClick={() => openApprovalReview(nextReviewRow, { reviewOnly: true })}
                disabled={busy}
              >
                <CheckCircle className="h-4 w-4" />
                次の未計上を確認
              </button>
            ) : (
              <button
                type="button"
                className="gap-2 daily-report-primary-action"
                onClick={() => openEdit(nextReviewRow, { reviewOnly: true })}
                disabled={busy}
              >
                <Pencil className="h-4 w-4" />
                要確認を編集
              </button>
            ))}
          <button
            type="button"
            className={showReviewOnly ? "gap-2" : "secondary gap-2"}
            onClick={showOnlyReviewRows}
            disabled={alerts.length === 0}
          >
            <ListFilter className="h-4 w-4" />
            確認対象だけ
          </button>
          <button
            type="button"
            className={showReviewOnly ? "secondary gap-2" : "gap-2"}
            onClick={showAllReportRows}
          >
            <Table2 className="h-4 w-4" />
            全件表示
          </button>
        </div>
        {alerts.length > 0 && (
          <div className="daily-report-review-list">
            {reviewListRows.map((row) => (
              <div key={row.id} className="daily-report-review-item">
                <div>
                  <strong>{displayProductName(row)}</strong>
                  <span>{row.reportDate}</span>
                </div>
                <div className="daily-report-review-reasons">
                  {dailyReportAttentionLabels(row).map((label) => (
                    <span key={label} className="badge warn">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="daily-report-review-item-actions">
                  {row.approvalStatus === "submitted" && (
                    <button
                      type="button"
                      className="gap-2"
                      onClick={() => openApprovalReview(row, { reviewOnly: true })}
                      disabled={busy}
                    >
                      <CheckCircle className="h-4 w-4" />
                      計上前確認
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary icon-button"
                    onClick={() => openEdit(row, { reviewOnly: true })}
                    aria-label="編集"
                    title="編集"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="visually-hidden">編集</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="daily-report-summary-grid">
        <Metric label="日報行数" value={`${rows.length} 件`} note={`計上済 ${approvedCount}件`} />
        <Metric
          label="未計上"
          value={`${pendingApproval.length} 件`}
          note="在庫・請求へ反映待ち"
          tone={pendingApproval.length > 0 ? "warn" : "normal"}
        />
        <Metric label="生産数合計" value={formatNumber(total.totalProductionQty)} />
        <Metric label="売値合計" value={formatYen(total.totalSales)} />
        <Metric
          label="要確認"
          value={`${alerts.length} 件`}
          note={`照合 ${unmatchedCount}件 / 売値未設定 ${missingPriceCount}件`}
          tone={alerts.length > 0 ? "warn" : "normal"}
        />
      </div>

      {approvalReviewRow && (
        <section id="daily-report-approve-panel" className="panel daily-report-approve-panel anchor-offset">
          <div className="daily-report-approve-head">
            <div className="daily-report-approve-title">
              <span className="badge warn">計上前確認</span>
              <h2>{displayProductName(approvalReviewRow)}</h2>
              <div className="daily-report-review-reasons">
                {dailyReportAttentionLabels(approvalReviewRow).map((label) => (
                  <span key={label} className="badge warn">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="daily-report-approve-actions">
              <button type="button" className="gap-2" onClick={() => approveRow(approvalReviewRow)} disabled={busy}>
                <CheckCircle className="h-4 w-4" />
                在庫・月次・請求へ計上
              </button>
              <button
                type="button"
                className="secondary gap-2"
                onClick={() => openEdit(approvalReviewRow, { reviewOnly: showReviewOnly })}
                disabled={busy}
              >
                <Pencil className="h-4 w-4" />
                内容を編集
              </button>
              <button
                type="button"
                className="secondary gap-2"
                onClick={() => setApprovalReviewId(null)}
                disabled={busy}
              >
                <X className="h-4 w-4" />
                取消
              </button>
            </div>
          </div>

          <div className="daily-report-approve-grid">
            <div className="daily-report-approve-metrics">
              <Metric label="日付" value={approvalReviewRow.reportDate} />
              <Metric label="賞味期限" value={approvalReviewRow.expiryDate || "未設定"} />
              <Metric label="生産数" value={formatNumber(approvalReviewRow.productionQty)} />
              <Metric label="使用原料" value={`${formatNumber(approvalReviewRow.materialUsedKg)} kg`} />
              <Metric label="稼動時間（M）" value={formatNumber(approvalReviewRow.operatingMinutes, 0)} />
              <Metric label="作業人数" value={formatNumber(approvalReviewRow.workerCount)} />
              <Metric label="売値" value={formatYen(approvalReviewRow.sales)} />
              <Metric
                label="利率"
                value={formatPercent(approvalReviewRow.profitRate)}
                tone={approvalReviewRow.profitRate <= 0 ? "warn" : "normal"}
              />
            </div>

            <div className="daily-report-approve-side">
              <div className="daily-report-approve-impact">
                <h3>計上後の反映先</h3>
                <ul>
                  <li>原料在庫の使用実績</li>
                  <li>月別商品集計・手間賃計算</li>
                  <li>請求出力の対象データ</li>
                </ul>
              </div>
              <div className="daily-report-approve-materials">
                <h3>使用原料</h3>
                {approvalReviewRow.materials.length > 0 ? (
                  <ul>
                    {approvalReviewRow.materials.map((material, index) => (
                      <li key={`${material.materialId ?? material.materialName}-${index}`}>
                        <span>{material.materialName}</span>
                        <strong>{formatNumber(material.usedKg)} kg</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>原料明細なし</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {deleteReviewRow && (
        <section id="daily-report-delete-panel" className="panel daily-report-delete-panel anchor-offset">
          <div className="daily-report-delete-head">
            <div className="daily-report-delete-title">
              <span className="badge danger">削除前確認</span>
              <h2>{displayProductName(deleteReviewRow)}</h2>
              <div className="daily-report-review-reasons">
                <StatusBadges row={deleteReviewRow} />
              </div>
            </div>
            <div className="daily-report-delete-actions">
              <button type="button" className="danger gap-2" onClick={() => deleteRow(deleteReviewRow)} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                日報を削除
              </button>
              <button
                type="button"
                className="secondary gap-2"
                onClick={() => openEdit(deleteReviewRow, { reviewOnly: showReviewOnly })}
                disabled={busy}
              >
                <Pencil className="h-4 w-4" />
                内容を編集
              </button>
              <button type="button" className="secondary gap-2" onClick={() => setDeleteReviewId(null)} disabled={busy}>
                <X className="h-4 w-4" />
                取消
              </button>
            </div>
          </div>

          <div className="daily-report-delete-grid">
            <div className="daily-report-delete-metrics">
              <Metric label="日付" value={deleteReviewRow.reportDate} />
              <Metric label="状態" value={deleteStatusLabel(deleteReviewRow)} />
              <Metric label="生産数" value={formatNumber(deleteReviewRow.productionQty)} />
              <Metric label="使用原料" value={`${formatNumber(deleteReviewRow.materialUsedKg)} kg`} />
              <Metric label="売値" value={formatYen(deleteReviewRow.sales)} />
              <Metric label="利率" value={formatPercent(deleteReviewRow.profitRate)} />
            </div>

            <div className="daily-report-delete-side">
              <div className="daily-report-delete-impact">
                <h3>削除後に戻る対象</h3>
                <ul>
                  <li>日報一覧・商品別集計から除外</li>
                  {deleteReviewRow.inventoryReflected && <li>在庫差引の履歴を戻す</li>}
                  {deleteReviewRow.productId && <li>月別実績を再集計</li>}
                  {deleteReviewRow.approvalStatus === "approved" ? (
                    <li>請求出力の対象から除外</li>
                  ) : (
                    <li>未計上・確認対象から除外</li>
                  )}
                </ul>
              </div>
              <div className="daily-report-delete-materials">
                <h3>使用原料</h3>
                {deleteReviewRow.materials.length > 0 ? (
                  <ul>
                    {deleteReviewRow.materials.map((material, index) => (
                      <li key={`${material.materialId ?? material.materialName}-${index}`}>
                        <span>{material.materialName}</span>
                        <strong>{formatNumber(material.usedKg)} kg</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>原料明細なし</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {editingRow && editForm && (
        <section id="daily-report-edit-panel" className="panel daily-report-edit-panel anchor-offset">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit(editingRow.id);
            }}
          >
            <div className="daily-report-edit-head">
              <div className="daily-report-edit-title">
                <span className="badge info">編集中</span>
                <h2>{displayProductName(editingRow)}</h2>
                <div className="daily-report-review-reasons">
                  {dailyReportAttentionLabels(editingRow).map((label) => (
                    <span key={label} className="badge warn">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="daily-report-edit-actions">
                <button type="submit" className="gap-2" disabled={busy}>
                  <Save className="h-4 w-4" />
                  保存
                </button>
                <button
                  type="button"
                  className="secondary gap-2"
                  onClick={() => {
                    setEditingId(null);
                    setEditForm(null);
                  }}
                  disabled={busy}
                >
                  <X className="h-4 w-4" />
                  取消
                </button>
              </div>
            </div>

            <div className="daily-report-edit-grid">
              <div className="entry-card">
                <h3>入力項目</h3>
                <div className="grid grid-4">
                  <label>
                    <span>日付</span>
                    <input
                      type="date"
                      required
                      value={editForm.reportDate}
                      onChange={(e) => setFormValue(setEditForm, "reportDate", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>商品名</span>
                    <ProductCombobox
                      products={products}
                      value={editForm.productId}
                      onChange={(value) => {
                        setFormValue(setEditForm, "productId", value);
                        setFormValue(setEditForm, "productName", "");
                      }}
                      emptyOptionLabel="商品名を直接入力"
                    />
                  </label>
                  {!editForm.productId && (
                    <label>
                      <span>商品名（直接入力）</span>
                      <input
                        type="text"
                        value={editForm.productName}
                        onChange={(e) => setFormValue(setEditForm, "productName", e.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    <span>賞味期限</span>
                    <input
                      type="date"
                      value={editForm.expiryDate}
                      onChange={(e) => setFormValue(setEditForm, "expiryDate", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>開始時間</span>
                    <input
                      type="time"
                      required
                      value={editForm.startTime}
                      onChange={(e) => setFormValue(setEditForm, "startTime", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>終了時間</span>
                    <input
                      type="time"
                      required
                      value={editForm.endTime}
                      onChange={(e) => setFormValue(setEditForm, "endTime", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>休憩時間（M）</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editForm.breakMinutes}
                      onChange={(e) => setFormValue(setEditForm, "breakMinutes", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>作業人数</span>
                    <input
                      type="number"
                      required
                      min={0.1}
                      step={0.1}
                      value={editForm.workerCount}
                      onChange={(e) => setFormValue(setEditForm, "workerCount", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>生産数</span>
                    <input
                      type="number"
                      required
                      min={0}
                      step="any"
                      value={editForm.productionQty}
                      onChange={(e) => setFormValue(setEditForm, "productionQty", e.target.value)}
                    />
                  </label>
                  <label>
                    <span>手間賃区分</span>
                    <select
                      value={editForm.laborFeeRateId}
                      onChange={(e) => setFormValue(setEditForm, "laborFeeRateId", e.target.value)}
                    >
                      {laborRates.length === 0 && <option value="">標準</option>}
                      {laborRates.map((rate) => (
                        <option key={rate.id} value={rate.id}>
                          {rate.name}（{formatYen(rate.hourlyRate)}/時）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>備考</span>
                    <input
                      type="text"
                      value={editForm.note}
                      onChange={(e) => setFormValue(setEditForm, "note", e.target.value)}
                    />
                  </label>
                </div>

                <MaterialsEditor
                  materials={editForm.materials}
                  materialOptions={materialOptions}
                  onChange={(next) => setEditForm((prev) => (prev ? { ...prev, materials: next } : prev))}
                />
              </div>

              <div className="entry-card calculated">
                <h3>自動計算</h3>
                <div className="stat-grid compact-metrics">
                  <Metric label="入り数(g)" value={formatOptionalNumber(selectedEditProduct?.capacityG ?? null)} />
                  <Metric label="商品名合算" value={selectedProductDisplayName(selectedEditProduct)} />
                  <Metric label="稼動時間（M）" value={formatNumber(editPreview.operatingMinutes, 0)} />
                  <Metric label="合計稼動時間（M）" value={formatNumber(editPreview.totalOperatingMinutes, 0)} />
                  <Metric label="1人当たりの1hの生産数(個)" value={formatNumber(editPreview.perHourQty)} />
                  <Metric label="1個の生産時間（M）" value={formatNumber(editPreview.perUnitTimeMinutes)} />
                  <Metric label="1袋の手間賃（円）" value={formatYen(editPreview.laborFeePerUnit)} />
                  <Metric label="1袋の量（g）" value={formatNumber(editPreview.bagWeightG)} />
                  <Metric label="ロス率（％）" value={formatPercent(editPreview.lossRate)} />
                  <Metric label="原料原価" value={formatYen(editPreview.materialCost)} />
                  <Metric label="資材原価" value={formatYen(editPreview.packageCost)} />
                  <Metric label="合計原価" value={formatYen(editPreview.totalCost)} />
                  <Metric label="売値" value={formatYen(editPreview.sales)} />
                  <Metric label="利率" value={formatPercent(editPreview.profitRate)} />
                </div>
              </div>
            </div>
          </form>
        </section>
      )}

      <div id="daily-report-workflow-tabs" className="anchor-offset">
        <SectionTabs
          ariaLabel="日報の表示切り替え"
          initialTabId="review"
          activeTabId={activeTab}
          onActiveTabChange={(tabId) => setActiveTab(tabId as DailyReportTabId)}
          inlineHeader
          items={[
          {
            id: "review",
            label: "日報確認",
            heading: "月別製造日報",
            count: hasTableFilters
              ? `表示 ${displayRows.length}`
              : pendingApproval.length > 0
                ? `未計上 ${pendingApproval.length}`
                : rows.length,
            content: (
              <section>
                <div className="daily-report-heading">
                  <div className="daily-report-view-state">
                    <strong>{showReviewOnly ? "確認対象だけ表示中" : "全件表示中"}</strong>
                    <span>{displayRows.length} 件</span>
                  </div>
                  <div className="daily-report-column-toggle" role="group" aria-label="一覧列の表示切り替え">
                    {dailyReportColumnModes.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={columnMode === mode.id ? "is-active" : ""}
                        aria-pressed={columnMode === mode.id}
                        onClick={() => setColumnMode(mode.id)}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  <div className="column-legend" aria-label="列種別">
                    <span className="column-kind input">入力</span>
                    <span className="column-kind auto">自動計算</span>
                  </div>
                </div>
                <div className="daily-report-list-filter" aria-label="日報一覧の絞り込み">
                  <label className="filter-search">
                    <span>一覧検索</span>
                    <input
                      type="search"
                      value={tableSearch}
                      placeholder="商品名・コード・入力者・備考"
                      onChange={(event) => setTableSearch(event.target.value)}
                    />
                  </label>
                  <div className="daily-report-list-filter-buttons">
                    <button
                      type="button"
                      className={!showReviewOnly && tableQuickFilter === "all" ? "is-active" : ""}
                      onClick={showAllReportRows}
                    >
                      <Table2 className="h-4 w-4" />
                      全件 {rows.length}
                    </button>
                    <button
                      type="button"
                      className={tableQuickFilter === "submitted" ? "is-active" : ""}
                      onClick={() => applyQuickFilter("submitted")}
                      disabled={pendingApproval.length === 0}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      未計上 {pendingApproval.length}
                    </button>
                    <button
                      type="button"
                      className={showReviewOnly || tableQuickFilter === "attention" ? "is-active danger" : "danger"}
                      onClick={() => applyQuickFilter("attention")}
                      disabled={alerts.length === 0}
                    >
                      <ListFilter className="h-4 w-4" />
                      要確認 {alerts.length}
                    </button>
                    <button
                      type="button"
                      className={tableQuickFilter === "photos" ? "is-active" : ""}
                      onClick={() => applyQuickFilter("photos")}
                      disabled={photoCount === 0}
                    >
                      <ImageIcon className="h-4 w-4" />
                      写真あり {photoCount}
                    </button>
                    <button
                      type="button"
                      className={tableQuickFilter === "noPhotos" ? "is-active" : ""}
                      onClick={() => applyQuickFilter("noPhotos")}
                      disabled={noPhotoCount === 0}
                    >
                      <ImageIcon className="h-4 w-4" />
                      写真なし {noPhotoCount}
                    </button>
                  </div>
                  {hasTableFilters && (
                    <button type="button" className="secondary gap-2 daily-report-list-filter-reset" onClick={clearTableFilters}>
                      <X className="h-4 w-4" />
                      条件解除
                    </button>
                  )}
                </div>
                <div className="table-frame daily-report-frame">
                  <table className={`daily-report-table daily-report-column-mode-${columnMode}`}>
                    <colgroup>
                      <col className="daily-col-date" />
                      <col className="daily-col-product" />
                      <col className="daily-col-small daily-report-col-cost" />
                      <col className="daily-col-name daily-report-col-cost daily-report-col-review" />
                      <col className="daily-col-date-input daily-report-col-input" />
                      <col className="daily-col-time daily-report-col-input" />
                      <col className="daily-col-time daily-report-col-input" />
                      <col className="daily-col-time daily-report-col-input" />
                      <col className="daily-col-number daily-report-col-cost" />
                      <col className="daily-col-number daily-report-col-input" />
                      <col className="daily-col-number daily-report-col-input daily-report-col-review" />
                      <col className="daily-col-material daily-report-col-input daily-report-col-review" />
                      <col className="daily-col-wide-number daily-report-col-cost" />
                      <col className="daily-col-wide-number daily-report-col-cost" />
                      <col className="daily-col-wide-number daily-report-col-cost" />
                      <col className="daily-col-wide-number daily-report-col-cost" />
                      <col className="daily-col-number daily-report-col-cost" />
                      <col className="daily-col-number daily-report-col-cost" />
                      <col className="daily-col-number daily-report-col-cost" />
                      <col className="daily-col-number daily-report-col-cost" />
                      <col className="daily-col-number daily-report-col-cost" />
                      <col className="daily-col-number daily-report-col-cost daily-report-col-review" />
                      <col className="daily-col-number daily-report-col-cost daily-report-col-review" />
                      <col className="daily-col-note daily-report-col-input" />
                      <col className="daily-col-status" />
                      <col className="daily-col-actions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="sticky-date">日付 <ColumnKind kind="input" /></th>
                        <th className="sticky-product">商品名 <ColumnKind kind="input" /></th>
                        <th className="right daily-report-col-cost">入り数(g) <ColumnKind kind="auto" /></th>
                        <th className="daily-report-col-cost daily-report-col-review">商品名合算 <ColumnKind kind="auto" /></th>
                        <th className="daily-report-col-input">賞味期限 <ColumnKind kind="input" /></th>
                        <th className="daily-report-col-input">開始時間 <ColumnKind kind="input" /></th>
                        <th className="daily-report-col-input">終了時間 <ColumnKind kind="input" /></th>
                        <th className="daily-report-col-input">休憩時間 <ColumnKind kind="input" /></th>
                        <th className="right daily-report-col-cost">稼動時間（M） <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-input">作業人数 <ColumnKind kind="input" /></th>
                        <th className="right daily-report-col-input daily-report-col-review">生産数 <ColumnKind kind="input" /></th>
                        <th className="right daily-report-col-input daily-report-col-review">使用原料（kg） <ColumnKind kind="input" /></th>
                        <th className="right daily-report-col-cost">合計稼動時間（M） <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost">1人当たりの1hの生産数(個) <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost">1個の生産時間（M） <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost">1袋の手間賃（円） <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost">1袋の量（g） <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost">ロス率（％） <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost">原料原価 <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost">資材原価 <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost">合計原価 <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost daily-report-col-review">売値 <ColumnKind kind="auto" /></th>
                        <th className="right daily-report-col-cost daily-report-col-review">利率 <ColumnKind kind="auto" /></th>
                        <th className="daily-report-col-input">備考 <ColumnKind kind="input" /></th>
                        <th>確認</th>
                        <th className="sticky-action"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => (
                          <tr
                            key={row.id}
                            id={dailyReportRowId(row.id)}
                            className={dailyReportRowClass(
                              row,
                              editingId === row.id,
                              approvalReviewId === row.id,
                              deleteReviewId === row.id,
                            )}
                          >
                            <td className="sticky-date">{row.reportDate}</td>
                            <td className="sticky-product product-name-cell">
                              <div>{row.productName}</div>
                              {row.productCode && <div className="subtext">{row.productCode}</div>}
                            </td>
                            <td className="right daily-report-col-cost">{formatOptionalNumber(row.capacityGSnapshot)}</td>
                            <td className="daily-report-col-cost daily-report-col-review">
                              <div>{consolidatedProductName(row)}</div>
                              {row.productMatchStatus === "unmatched" && <div className="subtext">商品未照合</div>}
                            </td>
                            <td className="daily-report-col-input">{row.expiryDate || "—"}</td>
                            <td className="daily-report-col-input">{row.startTime}</td>
                            <td className="daily-report-col-input">{row.endTime}</td>
                            <td className="daily-report-col-input">{formatDuration(row.breakMinutes)}</td>
                            <td className="right daily-report-col-cost">{formatNumber(row.operatingMinutes, 0)}</td>
                            <td className="right daily-report-col-input">{formatNumber(row.workerCount)}</td>
                            <td className="right daily-report-col-input daily-report-col-review">{formatNumber(row.productionQty)}</td>
                            <td className="right material-summary-cell daily-report-col-input daily-report-col-review">
                              <div>{formatNumber(row.materialUsedKg)} kg</div>
                              {row.materials.length > 0 && (
                                <div className="subtext">
                                  {row.materials
                                    .map((m) => `${m.materialName} ${formatNumber(m.usedKg)}kg`)
                                    .join(" / ")}
                                </div>
                              )}
                            </td>
                            <td className="right daily-report-col-cost">{formatNumber(row.totalOperatingMinutes, 0)}</td>
                            <td className="right daily-report-col-cost">{formatNumber(row.perHourQty)}</td>
                            <td className="right daily-report-col-cost">{formatNumber(row.perUnitTimeMinutes)}</td>
                            <td className="right daily-report-col-cost">{formatYen(row.laborFeePerUnit)}</td>
                            <td className="right daily-report-col-cost">{formatNumber(row.bagWeightG)}</td>
                            <td className="right daily-report-col-cost">{formatPercent(row.lossRate)}</td>
                            <td className="right daily-report-col-cost">{formatYen(row.materialCost)}</td>
                            <td className="right daily-report-col-cost">{formatYen(row.packageCost)}</td>
                            <td className="right daily-report-col-cost">{formatYen(row.totalCost)}</td>
                            <td className="right daily-report-col-cost daily-report-col-review">{formatYen(row.sales)}</td>
                            <td className="right daily-report-col-cost daily-report-col-review">{formatPercent(row.profitRate)}</td>
                            <td className="note-cell daily-report-col-input">{row.note || "—"}</td>
                            <td>
                              <StatusBadges row={row} />
                              {editingId === row.id && <span className="badge info">編集中</span>}
                              <SubmissionInfo row={row} />
                            </td>
                            <td className="action-cell sticky-action">
                              <div className="table-actions">
                                {row.approvalStatus === "submitted" && (
                                  <button
                                    type="button"
                                    className={approvalReviewId === row.id ? "icon-button" : "secondary icon-button"}
                                    onClick={() => openApprovalReview(row)}
                                    disabled={busy}
                                    aria-label="計上前確認"
                                    title="計上前確認"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    <span className="visually-hidden">計上前確認</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={editingId === row.id ? "icon-button" : "secondary icon-button"}
                                  onClick={() => openEdit(row)}
                                  aria-label={editingId === row.id ? "編集中" : "編集"}
                                  title={editingId === row.id ? "編集中" : "編集"}
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span className="visually-hidden">{editingId === row.id ? "編集中" : "編集"}</span>
                                </button>
                                <button
                                  type="button"
                                  className={deleteReviewId === row.id ? "danger icon-button" : "secondary danger icon-button"}
                                  onClick={() => openDeleteReview(row)}
                                  disabled={busy}
                                  aria-label="削除前確認"
                                  title="削除前確認"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="visually-hidden">削除前確認</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                      ))}
                      {displayRows.length === 0 && (
                        <tr>
                          <td colSpan={26} className="muted">
                            {hasTableFilters
                              ? "条件に合う日報はありません。検索条件を外してください。"
                              : "対象月の日報はありません。"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ),
          },
          {
            id: "entry",
            label: "日報入力",
            heading: "日報入力",
            count: "手入力",
            content: (
              <section className="panel daily-report-entry-panel">
                <form onSubmit={createEntry}>
                  <div className="daily-report-entry-command">
                    <div className="daily-report-entry-command-title">
                      <span className="badge info">新規日報</span>
                      <strong>{entryProductTitle}</strong>
                      <span>{form.reportDate}</span>
                      <div className="daily-report-entry-checks" aria-label="入力状況">
                        {entryChecks.map((check) => (
                          <span key={check.label} className={`badge ${check.done ? "success" : "muted"}`}>
                            {check.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="daily-report-entry-command-metrics">
                      <Metric
                        label="生産数"
                        value={form.productionQty ? formatNumber(toNumber(form.productionQty)) : "未入力"}
                      />
                      <Metric label="使用原料" value={`${formatNumber(entryMaterialUsedKg)} kg`} />
                      <Metric label="稼動時間（M）" value={formatNumber(preview.operatingMinutes, 0)} />
                      <Metric label="売値" value={formatYen(preview.sales)} />
                      <Metric
                        label="利率"
                        value={formatPercent(preview.profitRate)}
                        tone={preview.profitRate <= 0 ? "warn" : "normal"}
                      />
                    </div>
                    <div className="daily-report-entry-command-actions">
                      <button type="submit" className="gap-2" disabled={busy}>
                        <Plus className="h-4 w-4" />
                        保存
                      </button>
                    </div>
                  </div>
                  <div className="daily-report-entry-jumpbar" aria-label="日報入力セクション移動">
                    <button type="button" onClick={() => scrollToEntrySection("daily-report-entry-basic")}>
                      基本情報
                    </button>
                    <button type="button" onClick={() => scrollToEntrySection("daily-report-entry-work")}>
                      作業実績
                    </button>
                    <button type="button" onClick={() => scrollToEntrySection("daily-report-entry-materials")}>
                      原料・備考
                    </button>
                    <button type="button" onClick={() => scrollToEntrySection("daily-report-entry-preview")}>
                      自動計算
                    </button>
                  </div>

                  <div className="daily-report-form-layout">
                    <div className="entry-card">
                      <h3>入力項目</h3>
                      <div className="daily-report-entry-sections">
                        <div id="daily-report-entry-basic" className="daily-report-entry-group anchor-offset">
                          <h4>基本情報</h4>
                          <div className="grid grid-4 daily-report-field-grid">
                            <label>
                              <span>日付</span>
                              <input
                                type="date"
                                required
                                value={form.reportDate}
                                onChange={(e) => setFormValue(setForm, "reportDate", e.target.value)}
                              />
                            </label>
                            <label className="min-w-[260px]">
                              <span>商品名</span>
                              <ProductCombobox
                                products={products}
                                value={form.productId}
                                onChange={(value) => onSelectProduct(setForm, value)}
                                emptyOptionLabel="商品名を直接入力"
                              />
                            </label>
                            {!form.productId && (
                              <label>
                                <span>商品名（直接入力）</span>
                                <input
                                  type="text"
                                  value={form.productName}
                                  onChange={(e) => setFormValue(setForm, "productName", e.target.value)}
                                />
                              </label>
                            )}
                            <label>
                              <span>賞味期限</span>
                              <input
                                type="date"
                                value={form.expiryDate}
                                onChange={(e) => setFormValue(setForm, "expiryDate", e.target.value)}
                              />
                            </label>
                          </div>
                        </div>

                        <div id="daily-report-entry-work" className="daily-report-entry-group anchor-offset">
                          <h4>作業実績</h4>
                          <div className="grid grid-4 daily-report-field-grid">
                            <label>
                              <span>開始時間</span>
                              <input
                                type="time"
                                required
                                value={form.startTime}
                                onChange={(e) => setFormValue(setForm, "startTime", e.target.value)}
                              />
                            </label>
                            <label>
                              <span>終了時間</span>
                              <input
                                type="time"
                                required
                                value={form.endTime}
                                onChange={(e) => setFormValue(setForm, "endTime", e.target.value)}
                              />
                            </label>
                            <label>
                              <span>休憩時間（M）</span>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={form.breakMinutes}
                                onChange={(e) => setFormValue(setForm, "breakMinutes", e.target.value)}
                              />
                            </label>
                            <label>
                              <span>作業人数</span>
                              <input
                                type="number"
                                required
                                min={0.1}
                                step={0.1}
                                value={form.workerCount}
                                onChange={(e) => setFormValue(setForm, "workerCount", e.target.value)}
                              />
                            </label>
                            <label>
                              <span>生産数</span>
                              <input
                                type="number"
                                required
                                min={0}
                                step="any"
                                value={form.productionQty}
                                onChange={(e) => setFormValue(setForm, "productionQty", e.target.value)}
                              />
                            </label>
                          </div>
                        </div>

                        <div id="daily-report-entry-materials" className="daily-report-entry-group anchor-offset">
                          <h4>原料・備考</h4>
                          <div className="grid grid-4 daily-report-field-grid">
                            <label>
                              <span>手間賃区分</span>
                              <select
                                value={form.laborFeeRateId}
                                onChange={(e) => setFormValue(setForm, "laborFeeRateId", e.target.value)}
                              >
                                {laborRates.length === 0 && <option value="">標準</option>}
                                {laborRates.map((rate) => (
                                  <option key={rate.id} value={rate.id}>
                                    {rate.name}（{formatYen(rate.hourlyRate)}/時）
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="min-w-[220px]">
                              <span>備考</span>
                              <input
                                type="text"
                                value={form.note}
                                onChange={(e) => setFormValue(setForm, "note", e.target.value)}
                              />
                            </label>
                          </div>

                          <MaterialsEditor
                            materials={form.materials}
                            materialOptions={materialOptions}
                            onChange={(next) => setForm((prev) => ({ ...prev, materials: next }))}
                          />
                        </div>
                      </div>
                    </div>

                    <div id="daily-report-entry-preview" className="entry-card calculated daily-report-preview-card anchor-offset">
                      <h3>自動計算</h3>
                      <div className="stat-grid compact-metrics">
                        <Metric label="入り数(g)" value={formatOptionalNumber(selectedProduct?.capacityG ?? null)} />
                        <Metric label="商品名合算" value={selectedProductDisplayName(selectedProduct)} />
                        <Metric label="稼動時間（M）" value={formatNumber(preview.operatingMinutes, 0)} />
                        <Metric label="合計稼動時間（M）" value={formatNumber(preview.totalOperatingMinutes, 0)} />
                        <Metric label="1人当たりの1hの生産数(個)" value={formatNumber(preview.perHourQty)} />
                        <Metric label="1個の生産時間（M）" value={formatNumber(preview.perUnitTimeMinutes)} />
                        <Metric label="1袋の手間賃（円）" value={formatYen(preview.laborFeePerUnit)} />
                        <Metric label="1袋の量（g）" value={formatNumber(preview.bagWeightG)} />
                        <Metric label="ロス率（％）" value={formatPercent(preview.lossRate)} />
                        <Metric label="原料原価" value={formatYen(preview.materialCost)} />
                        <Metric label="資材原価" value={formatYen(preview.packageCost)} />
                        <Metric label="合計原価" value={formatYen(preview.totalCost)} />
                        <Metric label="売値" value={formatYen(preview.sales)} />
                        <Metric label="利率" value={formatPercent(preview.profitRate)} />
                      </div>
                    </div>
                  </div>

                  <div className="row form-actions mt-4">
                    <div className="spacer" />
                    <button type="submit" className="gap-2" disabled={busy}>
                      <Plus className="h-4 w-4" />
                      保存
                    </button>
                  </div>
                </form>
              </section>
            ),
          },
          {
            id: "labor-fee",
            label: "月次手間賃",
            heading: "月次手間賃",
            count: monthlyLaborFees.length,
            content: <MonthlyLaborFeePanel selectedMonth={selectedMonth} rows={monthlyLaborFees} />,
          },
          {
            id: "summary",
            label: "商品別集計",
            heading: "月次 商品別集計",
            count: summaries.length,
            content: (
              <section>
                <div className="daily-report-product-summary-grid">
                  <Metric label="集計商品" value={`${formatNumber(summaries.length, 0)} 件`} />
                  <Metric label="製造回数" value={`${formatNumber(total.manufacturingCount, 0)} 回`} />
                  <Metric
                    label="最低利率"
                    value={lowestProfit ? formatPercent(lowestProfit.averageProfitRate) : "—"}
                    note={lowestProfit?.productName}
                  />
                  <Metric
                    label="最大ロス率"
                    value={highestLoss ? formatPercent(highestLoss.averageLossRate) : "—"}
                    note={highestLoss?.productName}
                  />
                </div>
                <div className="table-frame product-summary-frame">
                  <table className="product-summary-table">
                    <colgroup>
                      <col className="product-summary-product-col" />
                      <col className="product-summary-count-col" />
                      <col className="product-summary-number-col" />
                      <col className="product-summary-number-col" />
                      <col className="product-summary-money-col" />
                      <col className="product-summary-rate-col" />
                      <col className="product-summary-rate-col" />
                      <col className="product-summary-status-col" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>商品</th>
                        <th className="right">製造回数</th>
                        <th className="right">生産数合計</th>
                        <th className="right">使用原料合計(kg)</th>
                        <th className="right">売値合計</th>
                        <th className="right">平均利率</th>
                        <th className="right">平均ロス率</th>
                        <th>確認</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((summary) => (
                        <SummaryRow key={summary.productKey} summary={summary} />
                      ))}
                      <SummaryRow summary={total} total />
                      {summaries.length === 0 && (
                        <tr>
                          <td colSpan={8} className="muted">
                            対象月の日報はありません。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ),
          },
          ]}
        />
      </div>
    </>
  );
}

function MaterialsEditor({
  materials,
  materialOptions,
  onChange,
  compact,
}: {
  materials: MaterialFormRow[];
  materialOptions: ProductDailyReportMaterialOption[];
  onChange: (rows: MaterialFormRow[]) => void;
  compact?: boolean;
}) {
  const materialComboboxOptions = useMemo(
    () =>
      materialOptions.map((option) => ({
        value: option.id,
        code: option.materialCode,
        label: option.name,
        description: `${option.unit}・標準単価 ${formatYen(option.standardUnitPrice)}`,
      })),
    [materialOptions],
  );

  function update(index: number, patch: Partial<MaterialFormRow>) {
    onChange(materials.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }
  function selectMaterial(index: number, materialId: string) {
    const opt = materialOptions.find((o) => o.id === materialId);
    update(index, { materialId, materialName: opt?.name ?? "" });
  }
  return (
    <div className={compact ? "materials-editor compact" : "materials-editor"}>
      {!compact && (
        <div className="row" style={{ alignItems: "center" }}>
          <strong>使用原料（複数可）</strong>
          <HelpTooltip text="原料を選び、使用量(kg)を入力します。確定すると在庫から差し引きます。" />
        </div>
      )}
      <div className="table-frame">
        <table>
          <thead>
            <tr>
              <th>原料</th>
              <th className="right" style={{ width: 140 }}>使用量(kg)</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m, index) => (
              <tr key={index}>
                <td>
                  <SearchableCombobox
                    value={m.materialId}
                    options={materialComboboxOptions}
                    emptyOptionLabel="（原料を選択）"
                    placeholder="原料番号・名称で検索"
                    onChange={(materialId) => selectMaterial(index, materialId)}
                  />
                </td>
                <td className="right">
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={m.usedKg}
                    onChange={(e) => update(index, { usedKg: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onChange(materials.filter((_, i) => i !== index))}
                    aria-label="原料を削除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {materials.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">原料が未設定です。「原料を追加」で行を追加してください。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className="secondary gap-2 mt-2" onClick={() => onChange([...materials, emptyMaterialRow()])}>
        <Plus className="h-4 w-4" />
        原料を追加
      </button>
    </div>
  );
}

function MonthlyLaborFeePanel({ selectedMonth, rows }: { selectedMonth: string; rows: MonthlyLaborFeeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const stats = useMemo(() => {
    const pendingRows = rows.filter((row) => row.status !== "applied");
    return {
      appliedCount: rows.length - pendingRows.length,
      pendingCount: pendingRows.length,
      totalSamples: rows.reduce((sum, row) => sum + row.sampleCount, 0),
      averageLaborFee: averageNumber(rows.map((row) => row.perBagLaborFee)),
      highestLaborFeeRow: maxBy(rows, (row) => row.perBagLaborFee),
    };
  }, [rows]);

  async function recompute() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch(kitagoyaApiPath("/product-monthly-labor-fees"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth: selectedMonth }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(`再計算できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMsg(`${selectedMonth} の月次手間賃を再計算しました。`);
    router.refresh();
  }

  async function apply(row: MonthlyLaborFeeRow) {
    if (
      !window.confirm(
        `${row.productName} の1袋手間賃を ${formatYen(row.perBagLaborFee)} で売値(翌月適用)に反映します。よろしいですか？`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch(kitagoyaApiPath(`/product-monthly-labor-fees/${row.id}/apply`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(`反映できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMsg(`${row.productName} の売値を更新しました。`);
    router.refresh();
  }

  return (
    <section className="panel daily-report-labor-panel">
      <div className="daily-report-labor-command">
        <div className="daily-report-labor-command-title">
          <div className="row">
            <span className="badge info">対象月 {selectedMonth}</span>
            <HelpTooltip text="蓄積した日報の実績から1袋手間賃の中央値を商品別に算出します。反映すると売値の手間賃単価を翌月から更新します。" />
          </div>
          <strong>実績から翌月適用の手間賃を確認</strong>
        </div>
        <button type="button" className="secondary gap-2" onClick={recompute} disabled={busy}>
          <RefreshCw className="h-4 w-4" />
          対象月の蓄積から再計算
        </button>
      </div>
      <div className="daily-report-labor-summary-grid">
        <Metric label="算出商品" value={`${formatNumber(rows.length, 0)} 件`} />
        <Metric
          label="未反映"
          value={`${formatNumber(stats.pendingCount, 0)} 件`}
          note={`反映済 ${formatNumber(stats.appliedCount, 0)} 件`}
          tone={stats.pendingCount > 0 ? "warn" : "normal"}
        />
        <Metric label="根拠日報" value={`${formatNumber(stats.totalSamples, 0)} 件`} />
        <Metric
          label="平均1袋手間賃"
          value={rows.length > 0 ? formatYen(stats.averageLaborFee) : "—"}
          note={stats.highestLaborFeeRow ? `最大 ${stats.highestLaborFeeRow.productName}` : undefined}
        />
      </div>
      {msg && <div className="alert success">{msg}</div>}
      {err && <div className="alert danger">{err}</div>}
      <div className="table-frame monthly-labor-frame">
        <table className="monthly-labor-table">
          <colgroup>
            <col className="monthly-labor-product-col" />
            <col className="monthly-labor-count-col" />
            <col className="monthly-labor-number-col" />
            <col className="monthly-labor-money-col" />
            <col className="monthly-labor-money-col" />
            <col className="monthly-labor-status-col" />
            <col className="monthly-labor-action-col" />
          </colgroup>
          <thead>
            <tr>
              <th>商品</th>
              <th className="right">件数</th>
              <th className="right">平均1人1h</th>
              <th className="right">新1袋手間賃(中央値)</th>
              <th className="right">現売値</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.status === "applied" ? "is-applied" : "needs-apply"}>
                <td>
                  <div>{row.productName}</div>
                  <div className="subtext">{row.productCode}</div>
                </td>
                <td className="right">{row.sampleCount}</td>
                <td className="right">{formatNumber(row.avgPerHourQty)}</td>
                <td className="right">{formatYen(row.perBagLaborFee)}</td>
                <td className="right">{formatYen(row.currentUnitPrice)}</td>
                <td>
                  {row.status === "applied" ? (
                    <span className="badge success">反映済 {row.appliedAt ?? ""}</span>
                  ) : (
                    <span className="badge warn">未反映</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="gap-2"
                    onClick={() => apply(row)}
                    disabled={busy || row.status === "applied" || !(row.perBagLaborFee > 0)}
                  >
                    <Save className="h-4 w-4" />
                    {row.status === "applied" ? "反映済" : "反映"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  対象月の月次手間賃はありません。「再計算」で蓄積日報から算出してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function dailyReportRowClass(row: ProductDailyReportRow, isEditing = false, isApproving = false, isDeleting = false) {
  const classes = ["daily-report-row"];
  if (row.approvalStatus === "submitted") classes.push("is-submitted");
  if (needsDailyReportAttention(row)) classes.push("needs-review");
  if (isEditing) classes.push("is-editing");
  if (isApproving) classes.push("is-approving");
  if (isDeleting) classes.push("is-deleting");
  return classes.join(" ");
}

function needsDailyReportAttention(row: ProductDailyReportRow) {
  return (
    row.approvalStatus === "submitted" ||
    row.approvalStatus === "rejected" ||
    row.productMatchStatus === "unmatched" ||
    row.productMatchStatus === "fuzzy" ||
    row.unitPriceSnapshot <= 0 ||
    row.calculationWarnings.length > 0
  );
}

function dailyReportAttentionLabels(row: ProductDailyReportRow) {
  const labels: string[] = [];
  if (row.approvalStatus === "submitted") labels.push("未計上");
  if (row.approvalStatus === "rejected") labels.push("差戻し");
  if (row.productMatchStatus === "unmatched") labels.push("商品未照合");
  if (row.productMatchStatus === "fuzzy") labels.push("曖昧照合");
  if (row.unitPriceSnapshot <= 0) labels.push("売値未設定");
  if (row.calculationWarnings.includes("missing_material_unit_cost")) labels.push("原料単価未設定");
  if (row.calculationWarnings.includes("missing_package_cost")) labels.push("資材単価未設定");
  if (row.calculationWarnings.includes("missing_capacity_g")) labels.push("入り数未設定");
  return labels.length > 0 ? labels : ["確認"];
}

function dailyReportRowId(id: string) {
  return `daily-report-row-${id}`;
}

function deleteStatusLabel(row: ProductDailyReportRow) {
  if (row.approvalStatus === "approved") {
    return row.inventoryReflected ? "計上済・在庫反映済" : "計上済・履歴のみ";
  }
  if (row.approvalStatus === "submitted") return "未計上";
  if (row.approvalStatus === "rejected") return "差戻し";
  return row.approvalStatus;
}

function productSummaryBadges(summary: ProductDailyReportSummaryRow, isTotal: boolean) {
  if (isTotal) return [{ label: "月計", tone: "info" }];
  const badges: { label: string; tone: "success" | "warn" | "danger" | "info" | "muted" }[] = [];
  if (summary.totalSales <= 0) badges.push({ label: "売値未設定", tone: "danger" });
  if (summary.averageProfitRate < 0) badges.push({ label: "赤字", tone: "danger" });
  if (summary.averageProfitRate === 0 && summary.totalSales > 0) badges.push({ label: "利率0", tone: "warn" });
  if (summary.averageLossRate > 0) badges.push({ label: "内容量超過側", tone: "warn" });
  if (summary.averageLossRate < 0) badges.push({ label: "内容量不足側", tone: "warn" });
  return badges.length > 0 ? badges : [{ label: "確認済", tone: "success" }];
}

function lowestProfitSummary(summaries: ProductDailyReportSummaryRow[]) {
  return minBy(summaries, (summary) => summary.averageProfitRate);
}

function highestLossSummary(summaries: ProductDailyReportSummaryRow[]) {
  return maxBy(summaries, (summary) => summary.averageLossRate);
}

function SummaryRow({ summary, total: isTotal }: { summary: ProductDailyReportSummaryRow; total?: boolean }) {
  const badges = productSummaryBadges(summary, Boolean(isTotal));
  return (
    <tr className={isTotal ? "row-total" : undefined}>
      <td className="product-summary-product-cell">
        <div>{summary.productName}</div>
        {!isTotal && <div className="subtext">月次集計</div>}
      </td>
      <td className="right">{formatNumber(summary.manufacturingCount, 0)}</td>
      <td className="right">{formatNumber(summary.totalProductionQty)}</td>
      <td className="right">{formatNumber(summary.totalMaterialUsedKg)}</td>
      <td className="right">{formatYen(summary.totalSales)}</td>
      <td className="right">{formatPercent(summary.averageProfitRate)}</td>
      <td className="right">{formatPercent(summary.averageLossRate)}</td>
      <td className="summary-status-cell">
        <div className="summary-status-badges">
          {badges.map((badge) => (
            <span key={badge.label} className={`badge ${badge.tone}`}>
              {badge.label}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

function SubmissionInfo({ row }: { row: ProductDailyReportRow }) {
  return (
    <div className="submission-info">
      {row.submittedBy && <div className="subtext">入力者: {row.submittedBy}</div>}
      {row.approvedAt && <div className="subtext">計上: {row.approvedAt}</div>}
      {row.labelPhotos.length > 0 ? (
        <div className="label-photo-strip">
          {row.labelPhotos.map((photo, index) => (
            <a key={`${photo.name}-${index}`} href={photo.dataUrl} target="_blank" rel="noreferrer" title={photo.name}>
              <img src={photo.dataUrl} alt={`商品ラベル写真 ${index + 1}`} />
            </a>
          ))}
        </div>
      ) : (
        <span className="badge muted">
          <ImageIcon className="h-3 w-3" />
          写真なし
        </span>
      )}
    </div>
  );
}

function StatusBadges({ row }: { row: ProductDailyReportRow }) {
  return (
    <>
      {row.approvalStatus === "submitted" && <span className="badge warn">未計上</span>}
      {row.approvalStatus === "approved" && <span className="badge success">計上済</span>}
      {row.approvalStatus === "rejected" && <span className="badge danger">差戻し</span>}
      {row.approvalStatus === "approved" && !row.inventoryReflected && <span className="badge info">履歴・在庫未反映</span>}
      {row.productMatchStatus === "unmatched" && <span className="badge danger">商品未照合</span>}
      {row.productMatchStatus === "fuzzy" && <span className="badge warn">曖昧照合</span>}
      {row.productMatchStatus !== "unmatched" && row.productMatchStatus !== "fuzzy" && (
        <span className="badge success">照合済</span>
      )}
      {row.labelPhotos.length > 0 && (
        <span className="badge info">
          <ImageIcon className="h-3 w-3" />
          写真 {row.labelPhotos.length}
        </span>
      )}
      {row.unitPriceSnapshot <= 0 && <span className="badge danger">売値未設定</span>}
      {row.calculationWarnings.includes("missing_material_unit_cost") && <span className="badge warn">原料単価未設定</span>}
      {row.calculationWarnings.includes("missing_package_cost") && <span className="badge warn">資材単価未設定</span>}
      {row.calculationWarnings.includes("missing_capacity_g") && <span className="badge warn">入り数未設定</span>}
    </>
  );
}

function ColumnKind({ kind }: { kind: "input" | "auto" }) {
  return <span className={`column-kind ${kind}`}>{kind === "input" ? "入力" : "自動"}</span>;
}

function Metric({
  label,
  value,
  note,
  tone = "normal",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "normal" | "warn";
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone === "warn" ? "warn-value" : ""}`}>{value}</div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}

function usePreview(
  form: EntryFormState,
  products: ProductDailyReportProductOption[],
  materialOptions: ProductDailyReportMaterialOption[],
  laborRates: ProductDailyReportLaborRateOption[],
) {
  return useMemo(() => {
    const product = products.find((p) => p.id === form.productId);
    const laborRate = laborRates.find((rate) => rate.id === form.laborFeeRateId);
    const priceById = new Map(materialOptions.map((o) => [o.id, o.standardUnitPrice]));
    const materials = form.materials.map((m) => ({
      usedKg: toNumber(m.usedKg),
      unitCostPerKg: m.materialId ? priceById.get(m.materialId) ?? 0 : 0,
    }));
    return computeProductDailyReportMetrics({
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: toNumber(form.breakMinutes),
      workerCount: toNumber(form.workerCount),
      productionQty: toNumber(form.productionQty),
      materials,
      capacityG: product?.capacityG,
      packageCostPerUnit: product?.packageCostPerUnit,
      unitPrice: product?.unitPrice,
      laborHourlyRate: laborRate?.hourlyRate ?? DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE,
    });
  }, [form, products, materialOptions, laborRates]);
}

function emptyMaterialRow(): MaterialFormRow {
  return { materialId: "", materialName: "", usedKg: "" };
}

function emptyForm(selectedMonth: string, laborRates: ProductDailyReportLaborRateOption[]): EntryFormState {
  const today = new Date().toISOString().slice(0, 10);
  const reportDate = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;
  return {
    reportDate,
    productId: "",
    productName: "",
    expiryDate: "",
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: "60",
    workerCount: "1",
    productionQty: "",
    materials: [emptyMaterialRow()],
    laborFeeRateId: laborRates.find((rate) => rate.code === "standard_1200")?.id ?? laborRates[0]?.id ?? "",
    note: "",
  };
}

function formFromRow(row: ProductDailyReportRow): EntryFormState {
  return {
    reportDate: row.reportDate,
    productId: row.productId ?? "",
    productName: row.productId ? "" : row.productName,
    expiryDate: row.expiryDate,
    startTime: row.startTime,
    endTime: row.endTime,
    breakMinutes: String(row.breakMinutes),
    workerCount: String(row.workerCount),
    productionQty: String(row.productionQty),
    materials:
      row.materials.length > 0
        ? row.materials.map((m) => ({
            materialId: m.materialId ?? "",
            materialName: m.materialName,
            usedKg: String(m.usedKg),
          }))
        : [emptyMaterialRow()],
    laborFeeRateId: row.laborFeeRateId ?? "",
    note: row.note ?? "",
  };
}

function toPayload(form: EntryFormState) {
  const materials = form.materials
    .filter((m) => m.materialId || m.materialName.trim() || toNumber(m.usedKg) > 0)
    .map((m) => ({
      materialId: m.materialId || null,
      materialName: m.materialName.trim() || "(未設定)",
      usedKg: toNumber(m.usedKg),
    }));
  return {
    reportDate: form.reportDate,
    productId: form.productId || null,
    productName: form.productName || null,
    expiryDate: form.expiryDate || null,
    startTime: form.startTime,
    endTime: form.endTime,
    breakMinutes: toNumber(form.breakMinutes),
    workerCount: toNumber(form.workerCount),
    productionQty: toNumber(form.productionQty),
    materials,
    laborFeeRateId: form.laborFeeRateId || null,
    note: form.note || null,
    sourceType: "manual",
  };
}

function setFormValue<T extends EntryFormState | null>(
  setter: Dispatch<SetStateAction<T>>,
  key: keyof EntryFormState,
  value: string,
) {
  setter((prev: T) => (prev ? ({ ...prev, [key]: value } as T) : prev));
}

function displayProductName(row: ProductDailyReportRow) {
  return row.displayName || row.officialName || row.productName;
}

function consolidatedProductName(row: ProductDailyReportRow) {
  return row.productId ? displayProductName(row) : "未照合";
}

function selectedProductDisplayName(product: ProductDailyReportProductOption | null) {
  return product ? product.displayName || product.officialName : "—";
}

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function averageNumber(values: number[]) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) return 0;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function minBy<T>(values: T[], score: (value: T) => number) {
  return values.reduce<T | null>((best, value) => {
    if (!best) return value;
    return score(value) < score(best) ? value : best;
  }, null);
}

function maxBy<T>(values: T[], score: (value: T) => number) {
  return values.reduce<T | null>((best, value) => {
    if (!best) return value;
    return score(value) > score(best) ? value : best;
  }, null);
}

function formatOptionalNumber(value: number | null | undefined, maximumFractionDigits = 2) {
  return value == null ? "—" : formatNumber(value, maximumFractionDigits);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits }) : "0";
}

function formatYen(value: number) {
  return `¥${formatNumber(value)}`;
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return `${hours}:${String(rest).padStart(2, "0")}`;
}

function formatPercent(value: number) {
  return `${((Number.isFinite(value) ? value : 0) * 100).toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
  })}%`;
}
