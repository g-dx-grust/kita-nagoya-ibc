"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Database,
  ListFilter,
  PackageCheck,
  RotateCcw,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { ceilDisplayQuantity, formatCases } from "@/lib/units";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import ProductCombobox from "@/components/ui/product-combobox";
import { HelpTooltip } from "@/components/ui/help-tooltip";

type ProductOption = {
  id: string;
  productCode: string;
  officialName: string;
  unit: string;
  displayName?: string | null;
  specification?: string | null;
  brandName?: string | null;
  casePackQty?: number | null;
};

type DemandRow = {
  id: string;
  dueDate: string;
  demandType: string;
  quantity: number;
  status: string;
  customerName: string | null;
  externalRef: string | null;
  note: string | null;
  product: ProductOption;
};

type DemandDraft = {
  productId: string;
  dueDate: string;
  demandType: string;
  quantity: number;
  status: string;
  customerName: string;
  externalRef: string;
  note: string;
};

type SuggestionRow = {
  productId: string;
  productCode: string;
  productName: string;
  productionType: string;
  unit: string;
  onHandQuantity: number;
  plannedProductionQuantity: number;
  openDemandQuantity: number;
  safetyStockQuantity: number;
  shortageQuantity: number;
  shortageType: "none" | "hard_shortage" | "unconfirmed_dependency";
  suggestedQuantity: number;
  reason: string;
};

type MonthlyActualRow = {
  id: string;
  yearMonth: string;
  actualQuantity: number;
  sourceType: string;
  note: string | null;
  product: ProductOption;
};

type MonthlyActualDraft = {
  productId: string;
  yearMonth: string;
  actualQuantity: number;
  sourceType: string;
  note: string;
};
type MonthlyScheduleRegenerateResult = {
  createdCount?: number;
  replacedDraftCount?: number;
  skipped?: { reason?: string }[];
  message?: string;
};
type SuggestionQuickFilter = "all" | "hard" | "dependency" | "suggested" | "stock" | "order";

export default function ProductPlanningClient({
  products,
  demands,
  suggestions,
  monthlyActuals,
  stockByProductId,
  initialDateFrom,
  initialDateTo,
  initialTargetMonth,
}: {
  products: ProductOption[];
  demands: DemandRow[];
  suggestions: SuggestionRow[];
  monthlyActuals: MonthlyActualRow[];
  stockByProductId: Record<string, number>;
  initialDateFrom: string;
  initialDateTo: string;
  initialTargetMonth: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 商品IDからケース入数を引く（予測表・在庫表のケース換算用）
  const caseOf = (productId: string) => products.find((p) => p.id === productId)?.casePackQty ?? null;
  const [stockProductId, setStockProductId] = useState(products[0]?.id ?? "");
  const [stockQuantity, setStockQuantity] = useState(0);
  const [stockDate, setStockDate] = useState(initialDateFrom);
  const [demandProductId, setDemandProductId] = useState(products[0]?.id ?? "");
  const [demandDate, setDemandDate] = useState(initialDateTo);
  const [demandQuantity, setDemandQuantity] = useState(100);
  const [demandType, setDemandType] = useState<"order" | "shipment" | "forecast">("order");
  const [customerName, setCustomerName] = useState("");
  const [actualProductId, setActualProductId] = useState(products[0]?.id ?? "");
  const [actualYearMonth, setActualYearMonth] = useState(initialTargetMonth);
  const [actualQuantity, setActualQuantity] = useState(0);
  const [actualNote, setActualNote] = useState("");
  const [actualCsvText, setActualCsvText] = useState("");
  const [editingDemandId, setEditingDemandId] = useState<string | null>(null);
  const [demandDraft, setDemandDraft] = useState<DemandDraft | null>(null);
  const [editingActualId, setEditingActualId] = useState<string | null>(null);
  const [actualDraft, setActualDraft] = useState<MonthlyActualDraft | null>(null);
  const [showInputPanel, setShowInputPanel] = useState(false);
  const [suggestionFilter, setSuggestionFilter] = useState<SuggestionQuickFilter>("all");
  const [rescheduleAfterDemandChange, setRescheduleAfterDemandChange] = useState(true);

  useEffect(() => {
    if (window.location.hash === "#product-planning-inputs") {
      setShowInputPanel(true);
      window.requestAnimationFrame(() => scrollToSection("product-planning-inputs"));
    }
  }, []);
  const planningStats = useMemo(() => {
    const suggestedCount = suggestions.filter((suggestion) => suggestion.suggestedQuantity > 0).length;
    const hardShortageCount = suggestions.filter((suggestion) => suggestion.shortageType === "hard_shortage").length;
    const dependencyCount = suggestions.filter(
      (suggestion) => suggestion.shortageType === "unconfirmed_dependency",
    ).length;
    const stockShortageCount = suggestions.filter((suggestion) => suggestion.productionType === "stock").length;
    const makeToOrderCount = suggestions.filter((suggestion) => suggestion.productionType === "make_to_order").length;

    return {
      suggestedCount,
      hardShortageCount,
      dependencyCount,
      stockShortageCount,
      makeToOrderCount,
      candidateCount: suggestions.length,
      demandCount: demands.length,
    };
  }, [demands.length, suggestions]);
  const filteredSuggestions = useMemo(
    () =>
      suggestions.filter((suggestion) => {
        if (suggestionFilter === "hard") return suggestion.shortageType === "hard_shortage";
        if (suggestionFilter === "dependency") return suggestion.shortageType === "unconfirmed_dependency";
        if (suggestionFilter === "suggested") return suggestion.suggestedQuantity > 0;
        if (suggestionFilter === "stock") return suggestion.productionType === "stock";
        if (suggestionFilter === "order") return suggestion.productionType === "make_to_order";
        return true;
      }),
    [suggestionFilter, suggestions],
  );
  const planningStatusClass = planningStats.hardShortageCount > 0
    ? "warn"
    : planningStats.dependencyCount > 0
      ? "info"
      : "success";
  const planningStatusLabel = planningStats.hardShortageCount > 0
    ? "生産候補あり"
    : planningStats.dependencyCount > 0
      ? "入荷確認あり"
      : "不足なし";
  const nextPlanningAction =
    planningStats.hardShortageCount > 0
      ? { label: "生産が必要な候補を確認", filter: "hard" as SuggestionQuickFilter, sectionId: "product-planning-suggestions" }
      : planningStats.dependencyCount > 0
        ? { label: "入荷確認の候補を確認", filter: "dependency" as SuggestionQuickFilter, sectionId: "product-planning-suggestions" }
        : planningStats.suggestedCount > 0
          ? { label: "推奨ありを確認", filter: "suggested" as SuggestionQuickFilter, sectionId: "product-planning-suggestions" }
          : demands.length > 0
            ? { label: "未処理予定を確認", sectionId: "product-planning-demands" }
            : { label: "月間予定へ進む", href: kitagoyaPath(`/production-plans/monthly?dateFrom=${initialDateFrom}&dateTo=${initialDateTo}`) };
  const planningFlowCards = [
    {
      label: "表示条件",
      count: initialDateFrom,
      detail: `期限 ${initialDateTo}`,
      action: () => scrollToSection("product-planning-period"),
      tone: "info",
      Icon: CalendarDays,
    },
    {
      label: "登録",
      count: showInputPanel ? "開" : "閉",
      detail: "在庫・予定・実績",
      action: () => {
        setShowInputPanel(true);
        scrollToSection("product-planning-inputs");
      },
      tone: "info",
      Icon: SlidersHorizontal,
    },
    {
      label: "在庫",
      count: products.length,
      detail: "製品別現在庫",
      action: () => scrollToSection("product-planning-stock"),
      tone: "info",
      Icon: Database,
    },
    {
      label: "生産候補",
      count: planningStats.suggestedCount,
      detail: `候補 ${planningStats.candidateCount}`,
      action: () => {
        setSuggestionFilter(planningStats.suggestedCount > 0 ? "suggested" : "all");
        scrollToSection("product-planning-suggestions");
      },
      tone: planningStats.suggestedCount > 0 ? "warn" : "success",
      Icon: PackageCheck,
    },
    {
      label: "月次実績",
      count: monthlyActuals.length,
      detail: initialTargetMonth,
      action: () => scrollToSection("product-planning-actuals"),
      tone: monthlyActuals.length > 0 ? "success" : "warn",
      Icon: BarChart3,
    },
    {
      label: "未処理予定",
      count: demands.length,
      detail: "受注/出荷",
      action: () => scrollToSection("product-planning-demands"),
      tone: demands.length > 0 ? "warn" : "success",
      Icon: Truck,
    },
  ];

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function runNextPlanningAction() {
    if ("filter" in nextPlanningAction && nextPlanningAction.filter) {
      setSuggestionFilter(nextPlanningAction.filter);
    }
    if ("href" in nextPlanningAction && nextPlanningAction.href) {
      window.location.href = nextPlanningAction.href;
      return;
    }
    if ("sectionId" in nextPlanningAction && nextPlanningAction.sectionId) {
      scrollToSection(nextPlanningAction.sectionId);
    }
  }

  async function submitStock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/inventory/adjustments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemType: "product",
        itemId: stockProductId,
        quantity: ceilDisplayQuantity(stockQuantity) ?? 0,
        effectiveDate: stockDate,
        movementType: "adjustment",
        note: "製品在庫計画画面から登録",
      }),
    });
    setBusy(false);
    setMessage(res.ok ? "製品在庫を登録しました" : "製品在庫の登録に失敗しました");
    if (res.ok) router.refresh();
  }

  async function submitDemand(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/product-demands"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: demandProductId,
        dueDate: demandDate,
        demandType,
        quantity: ceilDisplayQuantity(demandQuantity) ?? 0,
        customerName: customerName || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setMessage(`受注/出荷予定の登録に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    const rescheduleMessage = await maybeRegenerateMonthlyDrafts();
    setBusy(false);
    setMessage(`受注/出荷予定を登録しました${rescheduleMessage}`);
    router.refresh();
  }

  async function submitMonthlyActual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/product-monthly-actuals"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: actualProductId,
        yearMonth: actualYearMonth,
        actualQuantity: ceilDisplayQuantity(actualQuantity) ?? 0,
        sourceType: "manual",
        note: actualNote || null,
      }),
    });
    setBusy(false);
    setMessage(res.ok ? "月次実績を登録しました" : "月次実績の登録に失敗しました");
    if (res.ok) router.refresh();
  }

  async function submitMonthlyActualCsv(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/import/product-monthly-actuals"), {
      method: "POST",
      headers: { "Content-Type": "text/csv; charset=utf-8" },
      body: actualCsvText,
    });
    const result = (await res.json().catch(() => null)) as { imported?: number; skipped?: number } | null;
    setBusy(false);
    if (!res.ok) {
      setMessage("月次実績CSVの取り込みに失敗しました");
      return;
    }
    setMessage(`月次実績CSVを取り込みました（取込 ${result?.imported ?? 0} 件 / スキップ ${result?.skipped ?? 0} 件）`);
    if ((result?.imported ?? 0) > 0) {
      setActualCsvText("");
      router.refresh();
    }
  }

  function beginDemandEdit(demand: DemandRow) {
    setEditingDemandId(demand.id);
    setDemandDraft({
      productId: demand.product.id,
      dueDate: demand.dueDate,
      demandType: demand.demandType,
      quantity: demand.quantity,
      status: demand.status,
      customerName: demand.customerName ?? "",
      externalRef: demand.externalRef ?? "",
      note: demand.note ?? "",
    });
  }

  async function saveDemand(id: string) {
    if (!demandDraft) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/product-demands/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...demandDraft,
        quantity: ceilDisplayQuantity(Number(demandDraft.quantity)) ?? 0,
        customerName: demandDraft.customerName || null,
        externalRef: demandDraft.externalRef || null,
        note: demandDraft.note || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage("受注/出荷予定の更新に失敗しました");
      return;
    }
    setBusy(true);
    const rescheduleMessage = await maybeRegenerateMonthlyDrafts();
    setBusy(false);
    setMessage(`受注/出荷予定を更新しました${rescheduleMessage}`);
    setEditingDemandId(null);
    setDemandDraft(null);
    router.refresh();
  }

  async function deleteDemand(demand: DemandRow) {
    if (!confirm(`${demand.product.officialName} の受注/出荷予定を取消します。よろしいですか？`)) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/product-demands/${demand.id}`), { method: "DELETE" });
    if (!res.ok) {
      setBusy(false);
      setMessage("受注/出荷予定の取消に失敗しました");
      return;
    }
    const rescheduleMessage = await maybeRegenerateMonthlyDrafts();
    setBusy(false);
    setMessage(`受注/出荷予定を取消しました${rescheduleMessage}`);
    router.refresh();
  }

  async function maybeRegenerateMonthlyDrafts() {
    if (!rescheduleAfterDemandChange) return "。月間予定の再判定は未実行です";
    try {
      const result = await regenerateMonthlyDrafts();
      const created = result.createdCount ?? 0;
      const replaced = result.replacedDraftCount ?? 0;
      const skipped = result.skipped?.length ?? 0;
      return `。在庫生産の自動スケジュールを再判定しました（自動生成draft置換 ${replaced}件 / 作成 ${created}件 / 未配置 ${skipped}件）`;
    } catch (error) {
      return `。ただし在庫生産の再判定に失敗しました: ${error instanceof Error ? error.message : "unknown"}`;
    }
  }

  async function regenerateMonthlyDrafts(): Promise<MonthlyScheduleRegenerateResult> {
    const res = await fetch(kitagoyaApiPath("/product-planning/monthly-schedule"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateFrom: initialDateFrom,
        dateTo: initialDateTo,
        productionLeadDays: 1,
        planningBasis: "historical_actual",
        defaultStartTime: "09:00",
        baselineEndTime: "17:00",
        replaceExistingDrafts: true,
        replaceGeneratedDraftsOnly: true,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as MonthlyScheduleRegenerateResult & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "unknown");
    return json;
  }

  function beginActualEdit(actual: MonthlyActualRow) {
    setEditingActualId(actual.id);
    setActualDraft({
      productId: actual.product.id,
      yearMonth: actual.yearMonth,
      actualQuantity: actual.actualQuantity,
      sourceType: actual.sourceType,
      note: actual.note ?? "",
    });
  }

  async function saveActual(id: string) {
    if (!actualDraft) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/product-monthly-actuals/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...actualDraft,
        actualQuantity: ceilDisplayQuantity(Number(actualDraft.actualQuantity)) ?? 0,
        note: actualDraft.note || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage("月次実績の更新に失敗しました");
      return;
    }
    setMessage("月次実績を更新しました");
    setEditingActualId(null);
    setActualDraft(null);
    router.refresh();
  }

  async function deleteActual(actual: MonthlyActualRow) {
    if (!confirm(`${actual.product.officialName} ${actual.yearMonth} の月次実績を削除します。よろしいですか？`)) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/product-monthly-actuals/${actual.id}`), { method: "DELETE" });
    setBusy(false);
    setMessage(res.ok ? "月次実績を削除しました" : "月次実績の削除に失敗しました");
    if (res.ok) router.refresh();
  }

  return (
    <>
      {message && <div className="alert info">{message}</div>}

      <CollapsiblePanel
        title="生産判断・通知"
        summary={`${planningStatusLabel} / 候補 ${planningStats.candidateCount} / 未処理予定 ${planningStats.demandCount}`}
        className="product-planning-control-panel"
      >
        <div className="product-planning-command">
          <div className="product-planning-command-title">
            <span className={`badge ${planningStatusClass}`}>{planningStatusLabel}</span>
            <strong>生産判断</strong>
            <span className="subtext">
              {initialDateFrom} - {initialDateTo}
            </span>
            <button type="button" className="product-planning-next" onClick={runNextPlanningAction}>
              次: {nextPlanningAction.label}
            </button>
          </div>
          <div className="product-planning-checks">
            <span className={`badge ${planningStats.candidateCount > 0 ? "info" : "success"}`}>
              候補 {planningStats.candidateCount}
            </span>
            <span className={`badge ${planningStats.suggestedCount > 0 ? "warn" : "success"}`}>
              推奨あり {planningStats.suggestedCount}
            </span>
            <span className={`badge ${planningStats.dependencyCount > 0 ? "warn" : "success"}`}>
              入荷確認 {planningStats.dependencyCount}
            </span>
            <span className="badge info">未処理予定 {planningStats.demandCount}</span>
            <span className="badge muted">在庫 {planningStats.stockShortageCount}</span>
            <span className="badge muted">受注 {planningStats.makeToOrderCount}</span>
          </div>
          <div className="product-planning-command-actions">
            <button type="button" className="secondary" onClick={() => setShowInputPanel((current) => !current)}>
              <SlidersHorizontal size={15} aria-hidden="true" />
              {showInputPanel ? "登録パネルを閉じる" : "登録パネル"}
            </button>
            <Link
              className="button-link"
              href={kitagoyaPath(`/production-plans/auto?date=${initialDateFrom}&loadSuggestions=1`)}
            >
              <PackageCheck size={15} aria-hidden="true" />
              候補を読込んでシフト自動作成へ
            </Link>
            <Link
              className="button-link secondary-link"
              href={kitagoyaPath(`/production-plans/monthly?dateFrom=${initialDateFrom}&dateTo=${initialDateTo}`)}
            >
              <ClipboardList size={15} aria-hidden="true" />
              月間生産予定を生成
            </Link>
          </div>
        </div>

        <div className="product-planning-flow-grid" aria-label="製品計画フロー">
          {planningFlowCards.map(({ label, count, detail, action, tone, Icon }) => (
            <button key={label} type="button" className={`product-planning-flow-card ${tone}`} onClick={action}>
              <span>
                <Icon size={15} aria-hidden="true" />
                {label}
              </span>
              <strong>{typeof count === "number" ? count.toLocaleString() : count}</strong>
              <small>{detail}</small>
            </button>
          ))}
        </div>

        <div className="product-planning-queue" aria-label="生産候補レビュー順">
          <button
            type="button"
            className={`product-planning-queue-item ${planningStats.hardShortageCount > 0 ? "warn" : "success"}${suggestionFilter === "hard" ? " is-active" : ""}`}
            onClick={() => setSuggestionFilter((current) => (current === "hard" ? "all" : "hard"))}
          >
            <span>生産が必要</span>
            <strong>{planningStats.hardShortageCount}</strong>
          </button>
          <button
            type="button"
            className={`product-planning-queue-item ${planningStats.dependencyCount > 0 ? "warn" : "success"}${suggestionFilter === "dependency" ? " is-active" : ""}`}
            onClick={() => setSuggestionFilter((current) => (current === "dependency" ? "all" : "dependency"))}
          >
            <span>入荷確認</span>
            <strong>{planningStats.dependencyCount}</strong>
          </button>
          <button
            type="button"
            className={`product-planning-queue-item ${planningStats.suggestedCount > 0 ? "warn" : "success"}${suggestionFilter === "suggested" ? " is-active" : ""}`}
            onClick={() => setSuggestionFilter((current) => (current === "suggested" ? "all" : "suggested"))}
          >
            <span>推奨あり</span>
            <strong>{planningStats.suggestedCount}</strong>
          </button>
          <button
            type="button"
            className={`product-planning-queue-item${suggestionFilter === "stock" ? " is-active" : ""}`}
            onClick={() => setSuggestionFilter((current) => (current === "stock" ? "all" : "stock"))}
          >
            <span>在庫品</span>
            <strong>{planningStats.stockShortageCount}</strong>
          </button>
          <button
            type="button"
            className={`product-planning-queue-item${suggestionFilter === "order" ? " is-active" : ""}`}
            onClick={() => setSuggestionFilter((current) => (current === "order" ? "all" : "order"))}
          >
            <span>受注品</span>
            <strong>{planningStats.makeToOrderCount}</strong>
          </button>
          <button
            type="button"
            className={`product-planning-queue-item${suggestionFilter === "all" ? " is-active" : ""}`}
            onClick={() => setSuggestionFilter("all")}
          >
            <span>全候補</span>
            <strong>{planningStats.candidateCount}</strong>
          </button>
        </div>
      </CollapsiblePanel>

      {showInputPanel && (
      <div id="product-planning-inputs" className="product-planning-input-grid anchor-offset">
        <form className="panel product-planning-secondary-panel" onSubmit={submitStock}>
          <h2>製品在庫を登録</h2>
          <div className="row">
            <label>
              <span>商品</span>
              <ProductCombobox products={products} value={stockProductId} onChange={setStockProductId} required />
            </label>
            <label>
              <span>数量</span>
              <input
                type="number"
                step={1}
                value={stockQuantity}
                onChange={(e) => setStockQuantity(Number(e.target.value))}
              />
            </label>
            <label>
              <span>基準日</span>
              <input type="date" value={stockDate} onChange={(e) => setStockDate(e.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={busy || !stockProductId}>
              在庫調整を登録
            </button>
          </div>
        </form>

        <form className="panel product-planning-demand-panel" onSubmit={submitDemand}>
          <div className="toolbar product-planning-demand-head">
            <h2>受注/出荷予定を登録</h2>
            <label className="inline-check product-planning-reschedule-toggle">
              <input
                type="checkbox"
                checked={rescheduleAfterDemandChange}
                onChange={(e) => setRescheduleAfterDemandChange(e.target.checked)}
              />
              <span>登録後に在庫生産の自動スケジュールを再判定</span>
            </label>
          </div>
          <div className="product-planning-demand-fields">
            <label className="product-planning-product-field">
              <span>商品</span>
              <ProductCombobox
                products={products}
                value={demandProductId}
                onChange={setDemandProductId}
                required
                separateSearchInput
                placeholder="商品を選択"
                searchPlaceholder="管理コード・商品名・別名で候補を検索"
              />
            </label>
            <label>
              <span>種別</span>
              <select value={demandType} onChange={(e) => setDemandType(e.target.value as typeof demandType)}>
                <option value="order">受注</option>
                <option value="shipment">出荷予定</option>
                <option value="forecast">需要予測</option>
              </select>
            </label>
            <label>
              <span>必要日</span>
              <input type="date" value={demandDate} onChange={(e) => setDemandDate(e.target.value)} />
            </label>
            <label>
              <span>数量</span>
              <input
                type="number"
                min={1}
                step={1}
                value={demandQuantity}
                onChange={(e) => setDemandQuantity(Number(e.target.value))}
              />
            </label>
            <label>
              <span>得意先/メモ</span>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </label>
          </div>
          <div className="alert info product-planning-reschedule-note">
            受注を登録すると、確定済み・手入力の予定は残したまま、月間シフト連動で自動生成した在庫生産 draft だけを再計算します。
          </div>
          <div className="form-actions">
            <button type="submit" disabled={busy || !demandProductId}>
              {busy ? "登録中..." : "予定を登録"}
            </button>
          </div>
        </form>

        <form className="panel product-planning-secondary-panel" onSubmit={submitMonthlyActual}>
          <h2>
            月次実績を登録
            <HelpTooltip text="月間予定は、前年対象月の実績に「今年前々月 ÷ 前年前々月」の前年比を掛けて予測します。" />
          </h2>
          <div className="row">
            <label>
              <span>商品</span>
              <ProductCombobox products={products} value={actualProductId} onChange={setActualProductId} required />
            </label>
            <label>
              <span>対象年月</span>
              <input type="month" value={actualYearMonth} onChange={(e) => setActualYearMonth(e.target.value)} required />
            </label>
            <label>
              <span>実績数量</span>
              <input
                type="number"
                min={0}
                step={1}
                value={actualQuantity}
                onChange={(e) => setActualQuantity(Number(e.target.value))}
              />
            </label>
            <label>
              <span>メモ</span>
              <input value={actualNote} onChange={(e) => setActualNote(e.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={busy || !actualProductId}>
              月次実績を保存
            </button>
          </div>
        </form>

        <form className="panel product-planning-secondary-panel" onSubmit={submitMonthlyActualCsv}>
          <div className="toolbar">
            <h2>月次実績 CSV 取込</h2>
            <div className="spacer" />
            <a
              className="button-link secondary-link"
              href={kitagoyaApiPath("/export/master-template?type=product-monthly-actuals")}
            >
              テンプレートCSV
            </a>
          </div>
          <label>
            <span>CSV本文</span>
            <textarea
              rows={8}
              value={actualCsvText}
              onChange={(e) => setActualCsvText(e.target.value)}
              placeholder="product_code,year_month,actual_quantity,source_type,note"
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={busy || actualCsvText.trim() === ""}>
              CSVを取り込む
            </button>
          </div>
        </form>
      </div>
      )}

      <section id="product-planning-stock" className="anchor-offset">
      <h2>製品在庫</h2>
      <div className="table-frame">
        <table>
          <thead>
            <tr>
              <th>管理コード</th>
              <th>商品名</th>
              <th>現在庫</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.productCode}</td>
                <td>{product.officialName}</td>
                <td className="right">
                  {formatCases(stockByProductId[product.id] ?? 0, {
                    casePackQty: product.casePackQty,
                    baseUnit: product.unit,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>

      <section id="product-planning-suggestions" className="anchor-offset">
      <h2>生産候補</h2>
      {suggestions.length === 0 ? (
        <div className="empty-state">対象期間で不足する商品はありません。</div>
      ) : filteredSuggestions.length === 0 ? (
        <div className="empty-state">
          条件に一致する生産候補はありません。
          <button type="button" className="secondary" onClick={() => setSuggestionFilter("all")}>
            <RotateCcw size={15} aria-hidden="true" />
            全候補を表示
          </button>
        </div>
      ) : (
        <>
        <div className="product-planning-filter-status">
          <span className="badge info">
            <ListFilter size={14} aria-hidden="true" />
            表示 {filteredSuggestions.length} / {suggestions.length} 件
          </span>
          {suggestionFilter !== "all" && (
            <button type="button" className="secondary" onClick={() => setSuggestionFilter("all")}>
              <RotateCcw size={15} aria-hidden="true" />
              全候補
            </button>
          )}
        </div>
        <div className="table-frame product-planning-suggestion-frame">
          <table className="product-planning-suggestion-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>現在庫</th>
                <th>予定生産</th>
                <th>受注/出荷</th>
                <th>安全在庫</th>
                <th>不足</th>
                <th>推奨生産数</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuggestions.map((suggestion) => {
                const cp = caseOf(suggestion.productId);
                const fmt = (v: number) => formatCases(v, { casePackQty: cp, baseUnit: suggestion.unit });
                return (
                  <tr
                    key={suggestion.productId}
                    className={`product-planning-suggestion-row ${suggestion.shortageType === "hard_shortage" || suggestion.shortageType === "unconfirmed_dependency" ? "row-needs-action" : ""}`}
                  >
                    <td data-label="商品">
                      <div className="product-planning-product-cell">
                        <strong>{suggestion.productCode} · {suggestion.productName}</strong>
                        <div className="product-planning-row-badges">
                          <span className={`badge ${suggestion.shortageType === "hard_shortage" ? "warn" : "info"}`}>
                            {shortageTypeLabel(suggestion.shortageType)}
                          </span>
                          <span className="badge muted">{productionTypeLabel(suggestion.productionType)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="right" data-label="現在庫">{fmt(suggestion.onHandQuantity)}</td>
                    <td className="right" data-label="予定生産">{fmt(suggestion.plannedProductionQuantity)}</td>
                    <td className="right" data-label="受注/出荷">{fmt(suggestion.openDemandQuantity)}</td>
                    <td className="right" data-label="安全在庫">{fmt(suggestion.safetyStockQuantity)}</td>
                    <td className="right" data-label="不足">{fmt(suggestion.shortageQuantity)}</td>
                    <td className="right" data-label="推奨生産数">
                      <strong>{fmt(suggestion.suggestedQuantity)}</strong>
                    </td>
                    <td data-label="理由">
                      <div className="product-planning-reason">{suggestion.reason}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      </section>

      <section id="product-planning-actuals" className="anchor-offset">
      <h2>月間予測に使う月次実績</h2>
      {monthlyActuals.length === 0 ? (
        <div className="empty-state">対象月の予測に必要な月次実績はまだ登録されていません。</div>
      ) : (
        <div className="table-frame">
          <table>
            <thead>
              <tr>
                <th>対象年月</th>
                <th>商品</th>
                <th>実績数量</th>
                <th>登録元</th>
                <th>メモ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {monthlyActuals.map((actual) => {
                const editing = editingActualId === actual.id && actualDraft;
                const actualCasePackQty = caseOf(actual.product.id);
                return (
                <tr key={actual.id}>
                  {editing ? (
                    <>
                      <td>
                        <input
                          type="month"
                          value={actualDraft.yearMonth}
                          onChange={(e) => setActualDraft({ ...actualDraft, yearMonth: e.target.value })}
                        />
                      </td>
                      <td>
                        <ProductCombobox
                          products={products}
                          value={actualDraft.productId}
                          onChange={(id) => setActualDraft({ ...actualDraft, productId: id })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={actualDraft.actualQuantity}
                          onChange={(e) => setActualDraft({ ...actualDraft, actualQuantity: Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        <select
                          value={actualDraft.sourceType}
                          onChange={(e) => setActualDraft({ ...actualDraft, sourceType: e.target.value })}
                        >
                          <option value="manual">手入力</option>
                          <option value="import">取込</option>
                          <option value="daily_report">日報集計</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={actualDraft.note}
                          onChange={(e) => setActualDraft({ ...actualDraft, note: e.target.value })}
                        />
                      </td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => saveActual(actual.id)} disabled={busy}>
                            保存
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setEditingActualId(null);
                              setActualDraft(null);
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
                      <td>{actual.yearMonth}</td>
                      <td>
                        {actual.product.productCode} · {actual.product.officialName}
                      </td>
                      <td className="right">
                        {formatCases(actual.actualQuantity, {
                          casePackQty: actualCasePackQty,
                          baseUnit: actual.product.unit,
                        })}
                      </td>
                      <td>{sourceTypeLabel(actual.sourceType)}</td>
                      <td>{actual.note ?? "—"}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="secondary" onClick={() => beginActualEdit(actual)}>
                            編集
                          </button>
                          <button type="button" className="danger" onClick={() => deleteActual(actual)} disabled={busy}>
                            削除
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
      </section>

      <section id="product-planning-demands" className="anchor-offset">
      <h2>未処理の受注/出荷予定</h2>
      {demands.length === 0 ? (
        <div className="empty-state">未処理の受注/出荷予定はありません。</div>
      ) : (
        <div className="table-frame">
          <table>
            <thead>
              <tr>
                <th>必要日</th>
                <th>種別</th>
                <th>商品</th>
                <th>数量</th>
                <th>得意先/メモ</th>
                <th>参照</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
            {demands.map((demand) => {
              const editing = editingDemandId === demand.id && demandDraft;
              const demandCasePackQty = caseOf(demand.product.id);
              return (
                <tr key={demand.id}>
                  {editing ? (
                    <>
                      <td>
                        <input
                          type="date"
                          value={demandDraft.dueDate}
                          onChange={(e) => setDemandDraft({ ...demandDraft, dueDate: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          value={demandDraft.demandType}
                          onChange={(e) => setDemandDraft({ ...demandDraft, demandType: e.target.value })}
                        >
                          <option value="order">受注</option>
                          <option value="shipment">出荷予定</option>
                          <option value="forecast">需要予測</option>
                        </select>
                      </td>
                      <td>
                        <ProductCombobox
                          products={products}
                          value={demandDraft.productId}
                          onChange={(id) => setDemandDraft({ ...demandDraft, productId: id })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={demandDraft.quantity}
                          onChange={(e) => setDemandDraft({ ...demandDraft, quantity: Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          value={demandDraft.customerName}
                          onChange={(e) => setDemandDraft({ ...demandDraft, customerName: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          value={demandDraft.externalRef}
                          onChange={(e) => setDemandDraft({ ...demandDraft, externalRef: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          value={demandDraft.status}
                          onChange={(e) => setDemandDraft({ ...demandDraft, status: e.target.value })}
                        >
                          <option value="open">未処理</option>
                          <option value="fulfilled">処理済み</option>
                          <option value="cancelled">取消</option>
                        </select>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => saveDemand(demand.id)} disabled={busy}>
                            保存
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setEditingDemandId(null);
                              setDemandDraft(null);
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
                      <td>{demand.dueDate}</td>
                      <td>{demandTypeLabel(demand.demandType)}</td>
                      <td>
                        {demand.product.productCode} · {demand.product.officialName}
                      </td>
                      <td className="right">
                        {formatCases(demand.quantity, {
                          casePackQty: demandCasePackQty,
                          baseUnit: demand.product.unit,
                        })}
                      </td>
                      <td>{demand.customerName ?? "—"}</td>
                      <td>{demand.externalRef ?? "—"}</td>
                      <td>{demandStatusLabel(demand.status)}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="secondary" onClick={() => beginDemandEdit(demand)}>
                            編集
                          </button>
                          <button type="button" className="danger" onClick={() => deleteDemand(demand)} disabled={busy}>
                            取消
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
      </section>
    </>
  );
}

function sourceTypeLabel(value: string) {
  switch (value) {
    case "manual":
      return "手入力";
    case "import":
      return "取込";
    case "daily_report":
      return "日報集計";
    default:
      return value;
  }
}

function demandTypeLabel(value: string) {
  switch (value) {
    case "order":
      return "受注";
    case "shipment":
      return "出荷予定";
    case "forecast":
      return "需要予測";
    default:
      return value;
  }
}

function demandStatusLabel(value: string) {
  switch (value) {
    case "open":
      return "未処理";
    case "fulfilled":
      return "処理済み";
    case "cancelled":
      return "取消";
    default:
      return value;
  }
}

function shortageTypeLabel(value: SuggestionRow["shortageType"]) {
  switch (value) {
    case "hard_shortage":
      return "生産が必要";
    case "unconfirmed_dependency":
      return "入荷確認";
    case "none":
      return "不足なし";
    default:
      return value;
  }
}

function productionTypeLabel(value: SuggestionRow["productionType"]) {
  switch (value) {
    case "stock":
      return "在庫";
    case "make_to_order":
      return "受注";
    case "both":
      return "共通";
    default:
      return value;
  }
}
