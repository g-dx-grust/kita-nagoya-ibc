"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  PackageCheck,
  Printer,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DAILY_BREAK_LABEL } from "@/lib/calculations";
import { productionTypeLabel } from "@/lib/labels";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { formatCases } from "@/lib/units";
import ProductCombobox from "@/components/ui/product-combobox";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import { HelpTooltip } from "@/components/ui/help-tooltip";

type ProductOption = {
  id: string;
  productCode: string;
  officialName: string;
  specification?: string | null;
  brandName?: string | null;
  unit: string;
  casePackQty: number | null;
  productionType: string;
  standardProductionLotSize: number;
  defaultWorkAreaName: string | null;
  capacitySummary: string | null;
};
type WorkAreaOption = {
  id: string;
  name: string;
};

type Row = {
  productId: string;
  quantity: number;
  productionType: string;
};
type Mode = "duration" | "max_quantity" | "required_people";
type ItemReviewFocus = "all" | "invalid" | "defaults" | "capacity";
type ResultReviewFocus = "all" | "warnings" | "unassigned" | "prints";
type AutoScheduleRequest = {
  date: string;
  mode: Mode;
  startTime: string;
  desiredEndTime: string;
  baselineEndTime: string;
  persist: boolean;
  status: "draft" | "confirmed";
  items: {
    productId: string;
    quantity: number;
    productionType: string;
  }[];
  overrides?: {
    tempId: string;
    workAreaId?: string;
    employeeIds?: string[];
  }[];
};

type Result = {
  date: string;
  mode: string;
  persisted: boolean;
  plans: {
    id?: string;
    tempId?: string;
    productId: string;
    productName: string;
    productionType: string;
    workAreaId: string;
    workAreaName: string;
    startTime: string;
    endTime: string;
    quantity: number;
    assignedCount: number;
    assignedStaff: {
      employeeId: string;
      employeeName: string;
    }[];
    warnings: string[];
  }[];
  availableStaff?: {
    employeeId: string;
    employeeName: string;
    startTime: string;
    endTime: string;
  }[];
  printUrls?: { schedule: string; staff: string };
};

export default function AutoScheduleForm({
  products,
  workAreas,
  initialDate,
  autoLoadSuggestions,
}: {
  products: ProductOption[];
  workAreas: WorkAreaOption[];
  initialDate: string;
  autoLoadSuggestions?: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [mode, setMode] = useState<Mode>("max_quantity");
  const [startTime, setStartTime] = useState("09:00");
  const [desiredEndTime, setDesiredEndTime] = useState("17:00");
  const [baselineEndTime, setBaselineEndTime] = useState("17:00");
  const [rows, setRows] = useState<Row[]>([
    {
      productId: products[0]?.id ?? "",
      quantity: defaultQuantity(products[0]),
      productionType: "stock",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [initialSuggestionsLoaded, setInitialSuggestionsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [previewRequest, setPreviewRequest] = useState<AutoScheduleRequest | null>(null);
  const [itemReviewFocus, setItemReviewFocus] = useState<ItemReviewFocus>("all");
  const [resultReviewFocus, setResultReviewFocus] = useState<ResultReviewFocus>("all");
  const controlRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const workAreaOptions = useMemo(
    () => workAreas.map((workArea) => ({ value: workArea.id, label: workArea.name })),
    [workAreas],
  );
  const availableStaffOptions = useMemo(
    () =>
      (result?.availableStaff ?? []).map((staff) => ({
        value: staff.employeeId,
        label: staff.employeeName,
        description: `${staff.startTime}-${staff.endTime}`,
      })),
    [result?.availableStaff],
  );
  const itemRows = useMemo(
    () =>
      rows.map((row, index) => {
        const product = row.productId ? productMap.get(row.productId) : undefined;
        return {
          row,
          index,
          product,
          missingProduct: !row.productId,
          invalidQuantity: !Number.isFinite(row.quantity) || row.quantity <= 0,
          missingDefaultArea: Boolean(row.productId && !product?.defaultWorkAreaName),
          missingCapacity: Boolean(row.productId && !product?.capacitySummary),
        };
      }),
    [productMap, rows],
  );
  const inputStats = useMemo(() => {
    const seen = new Set<string>();
    let emptyProductRows = 0;
    let invalidQuantityRows = 0;
    let duplicateRows = 0;
    let stockRows = 0;
    let makeToOrderRows = 0;
    let missingDefaultArea = 0;
    let missingCapacity = 0;
    let totalQuantity = 0;

    for (const item of itemRows) {
      const { row } = item;
      if (!row.productId) {
        emptyProductRows += 1;
        continue;
      }
      if (seen.has(row.productId)) duplicateRows += 1;
      seen.add(row.productId);
      if (row.productionType === "make_to_order") makeToOrderRows += 1;
      if (row.productionType === "stock") stockRows += 1;
      if (item.invalidQuantity) invalidQuantityRows += 1;
      if (item.missingDefaultArea) missingDefaultArea += 1;
      if (item.missingCapacity) missingCapacity += 1;
      totalQuantity += Number.isFinite(row.quantity) && row.quantity > 0 ? row.quantity : 0;
    }

    return {
      productCount: seen.size,
      rowCount: itemRows.filter((item) => item.row.productId).length,
      emptyProductRows,
      invalidQuantityRows,
      duplicateRows,
      stockRows,
      makeToOrderRows,
      missingDefaultArea,
      missingCapacity,
      totalQuantity,
      alertCount: emptyProductRows + invalidQuantityRows + duplicateRows + missingDefaultArea + missingCapacity,
    };
  }, [itemRows]);
  const startMinutes = timeToMinutes(startTime);
  const desiredEndMinutes = timeToMinutes(desiredEndTime);
  const baselineEndMinutes = timeToMinutes(baselineEndTime);
  const invalidTimeRange =
    startMinutes === null ||
    desiredEndMinutes === null ||
    baselineEndMinutes === null ||
    desiredEndMinutes <= startMinutes ||
    baselineEndMinutes <= startMinutes;
  const resultStats = useMemo(() => {
    if (!result) return null;
    const workAreaCount = new Set(result.plans.map((plan) => plan.workAreaId)).size;
    const warningCount = result.plans.reduce((total, plan) => total + plan.warnings.length, 0);
    const assignedPeopleCount = result.plans.reduce(
      (total, plan) => total + (plan.assignedStaff.length > 0 ? plan.assignedStaff.length : plan.assignedCount),
      0,
    );
    const unassignedPlanCount = result.plans.filter(
      (plan) => plan.assignedStaff.length === 0 && plan.assignedCount === 0,
    ).length;

    return {
      planCount: result.plans.length,
      workAreaCount,
      warningCount,
      assignedPeopleCount,
      unassignedPlanCount,
    };
  }, [result]);
  const visibleItemRows = itemRows.filter((item) => {
    if (itemReviewFocus === "invalid") return item.missingProduct || item.invalidQuantity;
    if (itemReviewFocus === "defaults") return item.missingDefaultArea;
    if (itemReviewFocus === "capacity") return item.missingCapacity;
    return true;
  });
  const resultRows = useMemo(
    () => result?.plans.map((plan, planIndex) => ({ plan, planIndex })) ?? [],
    [result?.plans],
  );
  const visibleResultRows = resultRows.filter(({ plan }) => {
    if (resultReviewFocus === "warnings") return plan.warnings.length > 0;
    if (resultReviewFocus === "unassigned") return plan.assignedStaff.length === 0 && plan.assignedCount === 0;
    return true;
  });
  const inputStatusLabel = result?.persisted
    ? "確定済み"
    : result
      ? "プレビュー済み"
      : inputStats.alertCount > 0
        ? "確認あり"
        : "入力中";
  const inputStatusClass = result?.persisted
    ? "success"
    : result
      ? "info"
      : inputStats.alertCount > 0
        ? "warn"
        : "muted";
  const resultStatusClass = result?.persisted
    ? "success"
    : (resultStats?.warningCount ?? 0) + (resultStats?.unassignedPlanCount ?? 0) > 0
      ? "warn"
      : "info";
  const canPreview =
    products.length > 0 &&
    inputStats.rowCount > 0 &&
    inputStats.emptyProductRows === 0 &&
    inputStats.invalidQuantityRows === 0 &&
    inputStats.missingCapacity === 0 &&
    !invalidTimeRange;
  const nextAutoAction = result?.persisted
    ? "印刷へ進む"
    : result
      ? (resultStats?.warningCount ?? 0) > 0 || (resultStats?.unassignedPlanCount ?? 0) > 0
        ? "注意・未配置を確認"
        : "この内容で確定"
      : inputStats.rowCount === 0 || inputStats.emptyProductRows > 0
        ? "商品を選択"
        : inputStats.invalidQuantityRows > 0
          ? "数量を確認"
          : invalidTimeRange
            ? "時間帯を確認"
            : inputStats.missingCapacity > 0
              ? "能力未登録を確認"
              : inputStats.missingDefaultArea > 0
                ? "標準作業場所を確認"
                : "プレビューを作成";
  const resultNextAction = !result
    ? ""
    : result.persisted
      ? "印刷へ進む"
      : (resultStats?.warningCount ?? 0) > 0
        ? "注意行を確認"
        : (resultStats?.unassignedPlanCount ?? 0) > 0
          ? "未配置を確認"
          : "この内容で確定";
  const itemReviewQueues = [
    {
      key: "all" as const,
      label: "商品行",
      count: inputStats.rowCount,
      detail: `${formatNumber(inputStats.totalQuantity)}合計数量`,
      tone: inputStats.rowCount > 0 ? "info" : "warn",
      Icon: ClipboardList,
    },
    {
      key: "invalid" as const,
      label: "数量確認",
      count: inputStats.emptyProductRows + inputStats.invalidQuantityRows,
      detail: "未選択・0以下",
      tone: inputStats.emptyProductRows + inputStats.invalidQuantityRows > 0 ? "danger" : "success",
      Icon: AlertTriangle,
    },
    {
      key: "defaults" as const,
      label: "標準場所",
      count: inputStats.missingDefaultArea,
      detail: "自動選択対象",
      tone: inputStats.missingDefaultArea > 0 ? "warn" : "success",
      Icon: CalendarDays,
    },
    {
      key: "capacity" as const,
      label: "能力登録",
      count: inputStats.missingCapacity,
      detail: "プレビュー前に解消",
      tone: inputStats.missingCapacity > 0 ? "danger" : "success",
      Icon: ListChecks,
    },
  ];
  const resultReviewQueues = [
    {
      key: "all" as const,
      label: "予定",
      count: resultStats?.planCount ?? 0,
      detail: `${resultStats?.workAreaCount ?? 0}か所`,
      tone: "info",
      Icon: PackageCheck,
    },
    {
      key: "warnings" as const,
      label: "注意",
      count: resultStats?.warningCount ?? 0,
      detail: "警告行",
      tone: (resultStats?.warningCount ?? 0) > 0 ? "warn" : "success",
      Icon: AlertTriangle,
    },
    {
      key: "unassigned" as const,
      label: "未配置",
      count: resultStats?.unassignedPlanCount ?? 0,
      detail: "人員なし",
      tone: (resultStats?.unassignedPlanCount ?? 0) > 0 ? "danger" : "success",
      Icon: CheckCircle2,
    },
    {
      key: "prints" as const,
      label: "印刷",
      count: result?.persisted && result.printUrls ? 2 : 0,
      detail: result?.persisted ? "帳票準備" : "確定後",
      tone: result?.persisted && result.printUrls ? "success" : "muted",
      Icon: Printer,
    },
  ];

  useEffect(() => {
    if (!autoLoadSuggestions || initialSuggestionsLoaded) return;
    setInitialSuggestionsLoaded(true);
    void loadProductSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadSuggestions, initialSuggestionsLoaded]);

  function invalidatePreview() {
    setResult(null);
    setPreviewRequest(null);
    setMessage(null);
    setResultReviewFocus("all");
  }

  function scrollToSection(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function showItemReview(focus: ItemReviewFocus) {
    setItemReviewFocus(focus);
    scrollToSection(itemsRef);
  }

  function showResultReview(focus: ResultReviewFocus) {
    setResultReviewFocus(focus);
    scrollToSection(resultRef);
  }

  function moveDate(days: number) {
    setDate(addDays(date, days));
    invalidatePreview();
  }

  function moveToday() {
    setDate(todayInputString());
    invalidatePreview();
  }

  function update(index: number, patch: Partial<Row>) {
    const copy = [...rows];
    copy[index] = { ...copy[index], ...patch };
    setRows(copy);
    invalidatePreview();
  }

  function updateResultPlan(index: number, patch: Partial<Result["plans"][number]>) {
    if (!result || result.persisted) return;
    const plans = [...result.plans];
    plans[index] = { ...plans[index], ...patch };
    setResult({ ...result, plans });
  }

  function updateAssignedStaff(planIndex: number, staffIndex: number, employeeId: string) {
    if (!result || result.persisted) return;
    const staff = result.availableStaff?.find((candidate) => candidate.employeeId === employeeId);
    if (!staff) return;
    const plan = result.plans[planIndex];
    const assignedStaff = [...plan.assignedStaff];
    assignedStaff[staffIndex] = {
      employeeId: staff.employeeId,
      employeeName: staff.employeeName,
    };
    updateResultPlan(planIndex, { assignedStaff, assignedCount: assignedStaff.length });
  }

  function previewOverrides() {
    if (!result) return [];
    return result.plans.map((plan) => ({
      tempId: plan.tempId ?? "",
      workAreaId: plan.workAreaId,
      employeeIds: plan.assignedStaff.map((staff) => staff.employeeId),
    })).filter((override) => override.tempId);
  }

  function requestBody(persist: boolean, status: "draft" | "confirmed"): AutoScheduleRequest {
    return {
      date,
      mode,
      startTime,
      desiredEndTime,
      baselineEndTime,
      persist,
      status,
      items: rows.filter((row) => row.productId).map((row) => ({
        productId: row.productId,
        quantity: row.quantity,
        productionType: row.productionType,
      })),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setResult(null);

    if (!canPreview) {
      setError(previewBlockedLabel(inputStats, invalidTimeRange));
      return;
    }

    setBusy(true);
    const request = requestBody(false, "draft");
    const res = await fetch(kitagoyaApiPath("/production-plans/auto-schedule"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(errorLabel(json.error, json.details));
      return;
    }
    setResult(json);
    setPreviewRequest(request);
  }

  async function confirmPreview() {
    if (!result || result.plans.length === 0 || !previewRequest) return;
    setConfirming(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/production-plans/auto-schedule"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...previewRequest,
        persist: true,
        status: "confirmed",
        overrides: previewOverrides(),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setConfirming(false);
    if (!res.ok) {
      setError(errorLabel(json.error, json.details));
      return;
    }
    setResult(json);
    setMessage(`${json.plans?.length ?? 0}件を確定しました。`);
    router.refresh();
  }

  async function loadProductSuggestions() {
    setLoadingSuggestions(true);
    setError(null);
    invalidatePreview();
    const res = await fetch(
      kitagoyaApiPath(`/product-planning/suggestions?dateFrom=${date}&dateTo=${addDays(date, 30)}`),
    );
    const json = await res.json().catch(() => ({}));
    setLoadingSuggestions(false);
    if (!res.ok) {
      setError("製品在庫からの候補読み込みに失敗しました。");
      return;
    }
    const suggestions = (json.suggestions ?? []) as {
      productId: string;
      suggestedQuantity: number;
      productionType: string;
    }[];
    if (suggestions.length === 0) {
      setError(
        "対象期間で自動作成が必要な不足商品はありません。製品在庫、受注/出荷予定、既存の生産予定を確認してください。",
      );
      return;
    }
    setItemReviewFocus("all");
    setRows(
      suggestions.map((suggestion) => ({
        productId: suggestion.productId,
        quantity: suggestion.suggestedQuantity,
        productionType:
          suggestion.productionType === "make_to_order" ? "make_to_order" : "stock",
      })),
    );
  }

  return (
    <form onSubmit={submit}>
      <div ref={controlRef} className="panel auto-schedule-control-panel">
        <div className="row auto-schedule-fields">
          <label>
            <span>対象日</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                invalidatePreview();
              }}
              required
            />
          </label>
          <label>
            <span>計算モード</span>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                invalidatePreview();
              }}
            >
              <option value="duration">① 数量固定 → 終了時刻</option>
              <option value="max_quantity">② 時間枠固定 → 最大数量</option>
              <option value="required_people">③ 数量+時間枠 → 必要人数</option>
            </select>
          </label>
          <label>
            <span>開始時刻</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value);
                invalidatePreview();
              }}
            />
          </label>
          <label>
            <span>終了希望</span>
            <input
              type="time"
              value={desiredEndTime}
              onChange={(e) => {
                setDesiredEndTime(e.target.value);
                invalidatePreview();
              }}
            />
          </label>
          <label>
            <span>基準終了</span>
            <input
              type="time"
              value={baselineEndTime}
              onChange={(e) => {
                setBaselineEndTime(e.target.value);
                invalidatePreview();
              }}
            />
          </label>
          <label>
            <span>休憩時間帯</span>
            <input value={DAILY_BREAK_LABEL} readOnly aria-label="休憩時間帯" />
          </label>
        </div>
        <div className="auto-schedule-date-jump" aria-label="対象日移動">
          <button type="button" className="secondary" onClick={() => moveDate(-1)}>
            前日
          </button>
          <button type="button" className="secondary" onClick={moveToday}>
            今日
          </button>
          <button type="button" className="secondary" onClick={() => moveDate(1)}>
            翌日
          </button>
        </div>
        <div className="auto-schedule-command">
          <div className="auto-schedule-command-title">
            <span className={`badge ${inputStatusClass}`}>{inputStatusLabel}</span>
            <strong>入力サマリ</strong>
            <span className="subtext">
              {inputStats.rowCount}行 / {formatNumber(inputStats.totalQuantity)}合計数量
            </span>
            <span className="auto-schedule-next">次: {nextAutoAction}</span>
          </div>
          <div className="auto-schedule-checks">
            <span className="badge info">在庫 {inputStats.stockRows}</span>
            <span className="badge info">受注 {inputStats.makeToOrderRows}</span>
            <span className={`badge ${invalidTimeRange ? "warn" : "success"}`}>
              時間 {invalidTimeRange ? "要確認" : "OK"}
            </span>
            <span className={`badge ${inputStats.invalidQuantityRows > 0 ? "danger" : "success"}`}>
              数量 {inputStats.invalidQuantityRows}
            </span>
            <span className={`badge ${inputStats.missingDefaultArea > 0 ? "warn" : "success"}`}>
              標準未設定 {inputStats.missingDefaultArea}
            </span>
            <span className={`badge ${inputStats.missingCapacity > 0 ? "warn" : "success"}`}>
              能力未登録 {inputStats.missingCapacity}
            </span>
            {inputStats.duplicateRows > 0 && <span className="badge warn">重複 {inputStats.duplicateRows}</span>}
          </div>
        </div>
        <div className="auto-schedule-review-queue" aria-label="自動作成入力レビュー順">
          {itemReviewQueues.map(({ key, label, count, detail, tone, Icon }) => (
            <button
              key={key}
              type="button"
              className={`auto-schedule-review-item ${tone}${itemReviewFocus === key ? " is-active" : ""}`}
              onClick={() => showItemReview(key)}
            >
              <span>
                <Icon size={15} aria-hidden="true" />
                {label}
              </span>
              <strong>{count}</strong>
              <small>{detail}</small>
            </button>
          ))}
        </div>
      </div>

      {!result && (
        <div className="panel auto-schedule-start-guide">
          <div className="auto-schedule-start-main">
            <span className="badge muted">未プレビュー</span>
            <strong>{date} の自動作成準備</strong>
            <span>商品候補、作業場所ごとの能力、出勤シフトをそろえてからプレビューへ進みます。</span>
          </div>
          <div className="auto-schedule-start-steps">
            <span>
              <strong>1</strong>
              日付・時間
            </span>
            <span>
              <strong>2</strong>
              商品候補
            </span>
            <span>
              <strong>3</strong>
              シフト
            </span>
            <span>
              <strong>4</strong>
              プレビュー・確定
            </span>
          </div>
          <div className="auto-schedule-start-actions">
            <Link className="button-link secondary-link" href={kitagoyaPath(`/product-planning?date=${date}`)}>
              <PackageCheck size={15} aria-hidden="true" />
              製品計画
            </Link>
            <Link className="button-link secondary-link" href={kitagoyaPath(`/shifts?date=${date}`)}>
              <CalendarDays size={15} aria-hidden="true" />
              シフト確認
            </Link>
            <button type="submit" disabled={busy || !canPreview}>
              <ClipboardList size={15} aria-hidden="true" />
              {busy ? "計算中..." : canPreview ? "プレビュー開始" : "入力を確認"}
            </button>
          </div>
        </div>
      )}

      <div className="toolbar auto-schedule-items-toolbar">
        <h2>
          今日作る商品
          <HelpTooltip text="生産能力が1部屋分だけ登録されている商品は、外注以外の部屋にも同じ能力を仮適用して自動配置します。自動作成では受注生産を先に配置し、在庫生産は後工程に回します。部屋の使い分けは作業場所マスターの自動予定の役割で設定します。" />
        </h2>
        <div className="spacer" />
        <button
          type="button"
          className="secondary"
          onClick={loadProductSuggestions}
          disabled={loadingSuggestions}
        >
          {loadingSuggestions ? "読込中..." : "製品在庫から不足候補を読込"}
        </button>
        {itemReviewFocus !== "all" && (
          <button type="button" className="ghost-button" onClick={() => setItemReviewFocus("all")}>
            <RotateCcw size={15} aria-hidden="true" />
            絞り込み解除
          </button>
        )}
      </div>
      <div ref={itemsRef} className="panel auto-schedule-items-panel">
        <div className="table-frame auto-schedule-item-frame">
          <table className="auto-schedule-item-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>商品</th>
                <th>数量</th>
                <th>区分</th>
                <th>標準作業場所</th>
                <th>生産能力 / 人時</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleItemRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted center">
                    この条件に該当する商品行はありません。
                  </td>
                </tr>
              ) : (
                visibleItemRows.map(({ row, index, product, missingDefaultArea, missingCapacity, invalidQuantity }) => (
                  <tr
                    key={index}
                    className={`auto-schedule-item-row${missingCapacity || invalidQuantity ? " row-needs-action" : ""}`}
                  >
                    <td className="right" data-label="No.">{index + 1}</td>
                    <td data-label="商品">
                      <div className="auto-schedule-product-cell">
                        <ProductCombobox
                          products={products}
                          value={row.productId}
                          onChange={(id) => {
                            const product = productMap.get(id);
                            update(index, {
                              productId: id,
                              quantity: defaultQuantity(product),
                              productionType:
                                product?.productionType === "make_to_order" ? "make_to_order" : "stock",
                            });
                          }}
                          required
                        />
                        {product && (
                          <div className="auto-schedule-product-badges">
                            <span className="badge muted">{productionTypeLabel(product.productionType)}</span>
                            {invalidQuantity && <span className="badge danger">数量確認</span>}
                            {missingDefaultArea && <span className="badge warn">標準未設定</span>}
                            {missingCapacity && <span className="badge warn">能力未登録</span>}
                          </div>
                        )}
                      </div>
                    </td>
                    <td data-label="数量">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.quantity}
                        onChange={(e) => update(index, { quantity: Number(e.target.value) })}
                      />
                      <span className="subtext">
                        {product?.standardProductionLotSize
                          ? `日報生産数: ${formatNumber(product.standardProductionLotSize)}${product.unit}`
                          : product?.unit ?? ""}
                      </span>
                    </td>
                    <td data-label="区分">
                      <select
                        value={row.productionType}
                        onChange={(e) => update(index, { productionType: e.target.value })}
                      >
                        <option value="stock">在庫生産</option>
                        <option value="make_to_order">受注生産</option>
                        <option value="external">外注</option>
                        <option value="trial">試作</option>
                        <option value="other">その他</option>
                      </select>
                    </td>
                    <td data-label="標準作業場所">
                      <span className={`badge ${missingDefaultArea ? "warn" : "info"}`}>
                        {product?.defaultWorkAreaName ?? "自動選択"}
                      </span>
                    </td>
                    <td data-label="生産能力 / 人時">
                      <span className={`badge ${missingCapacity ? "warn" : "success"}`}>
                        {product?.capacitySummary ?? "未登録"}
                      </span>
                    </td>
                    <td data-label="操作">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setRows(rows.filter((_, i) => i !== index));
                          invalidatePreview();
                        }}
                        disabled={rows.length === 1}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="row form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setRows([
                ...rows,
                {
                  productId: products[0]?.id ?? "",
                  quantity: defaultQuantity(products[0]),
                  productionType: "stock",
                },
              ]);
              invalidatePreview();
            }}
          >
            ＋ 商品を追加
          </button>
          <button type="submit" disabled={busy || !canPreview}>
            {busy ? "計算中..." : "シフトに合わせてプレビュー"}
          </button>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      {result && (
        <div ref={resultRef} className="panel auto-schedule-result-panel">
          <h2>
            {result.persisted ? "確定済みスケジュール" : "自動作成プレビュー"}
            {!result.persisted && (
              <HelpTooltip text="出勤者全員を複数部屋へ自動配置し、作業の終わった人は別部屋へ合流させています。作業場所は変更できます。細かな人の入れ替えは当日 人員割り当てで調整します。" />
            )}
          </h2>
          {resultStats && (
            <div className="auto-schedule-result-command">
              <div className="auto-schedule-command-title">
                <span className={`badge ${resultStatusClass}`}>
                  {result.persisted ? "確定済み" : resultStats.warningCount > 0 ? "確認が必要" : "保存できます"}
                </span>
                <strong>{result.persisted ? "生産予定として確定" : "確定前チェック"}</strong>
                <span className="subtext">
                  予定 {resultStats.planCount}件 / 作業場所 {resultStats.workAreaCount}か所
                </span>
                <span className="auto-schedule-next">次: {resultNextAction}</span>
              </div>
              <div className="auto-schedule-checks">
                <span className={`badge ${resultStats.warningCount > 0 ? "warn" : "success"}`}>
                  注意 {resultStats.warningCount}
                </span>
                <span className={`badge ${resultStats.unassignedPlanCount > 0 ? "warn" : "success"}`}>
                  未配置 {resultStats.unassignedPlanCount}
                </span>
                <span className="badge info">配置人数 {resultStats.assignedPeopleCount}</span>
              </div>
              <div className="auto-schedule-result-actions">
                {!result.persisted && (
                  <button type="button" onClick={confirmPreview} disabled={confirming}>
                    {confirming ? "確定中..." : "この内容で確定"}
                  </button>
                )}
                {result.persisted && result.printUrls && (
                  <>
                    <Link className="button-link" href={kitagoyaPath(result.printUrls.schedule)}>
                      生産スケジュール印刷
                    </Link>
                    <Link className="button-link" href={kitagoyaPath(result.printUrls.staff)}>
                      スタッフ配置印刷
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}
          {resultStats && (
            <div className="auto-schedule-review-queue auto-schedule-result-queue" aria-label="自動作成結果レビュー順">
              {resultReviewQueues.map(({ key, label, count, detail, tone, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`auto-schedule-review-item ${tone}${resultReviewFocus === key ? " is-active" : ""}`}
                  onClick={() => showResultReview(key)}
                >
                  <span>
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </span>
                  <strong>{count}</strong>
                  <small>{detail}</small>
                </button>
              ))}
            </div>
          )}
          <div className="table-frame auto-schedule-result-frame">
          <table className="auto-schedule-result-table">
            <thead>
              <tr>
                <th>商品</th>
                <th>区分</th>
                <th>作業場所</th>
                <th>時間</th>
                <th>数量</th>
                <th>配置スタッフ</th>
                <th>注意</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleResultRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted center">
                    この条件に該当する予定はありません。
                  </td>
                </tr>
              ) : (
                visibleResultRows.map(({ plan, planIndex }) => (
                <tr key={plan.id ?? plan.tempId} className={plan.warnings.length > 0 ? "row-needs-action" : ""}>
                  <td data-label="商品">
                    <div className="auto-schedule-result-product">
                      <strong>{plan.productName}</strong>
                      {plan.warnings.length > 0 && <span className="badge warn">注意 {plan.warnings.length}</span>}
                    </div>
                  </td>
                  <td data-label="区分">{productionTypeLabel(plan.productionType)}</td>
                  <td data-label="作業場所">
                    {result.persisted ? (
                      plan.workAreaName
                    ) : (
                      <SearchableCombobox
                        value={plan.workAreaId}
                        options={workAreaOptions}
                        placeholder="作業場所名で検索"
                        ariaLabel={`${plan.productName}の作業場所`}
                        onChange={(workAreaId) => {
                          const workArea = workAreas.find((candidate) => candidate.id === workAreaId);
                          updateResultPlan(planIndex, {
                            workAreaId,
                            workAreaName: workArea?.name ?? plan.workAreaName,
                          });
                        }}
                      />
                    )}
                  </td>
                  <td data-label="時間">
                    {plan.startTime} - {plan.endTime}
                  </td>
                  <td className="right" data-label="数量">
                    {formatCases(plan.quantity, {
                      casePackQty: productMap.get(plan.productId)?.casePackQty ?? null,
                      baseUnit: productMap.get(plan.productId)?.unit,
                    })}
                  </td>
                  <td data-label="配置スタッフ">
                    {result.persisted || result.mode === "max_quantity" ? (
                      plan.assignedStaff.length > 0
                        ? plan.assignedStaff.map((staff) => staff.employeeName).join("、")
                        : `${plan.assignedCount}人`
                    ) : (
                      <div className="stacked-fields">
                        {plan.assignedStaff.map((staff, staffIndex) => (
                          <SearchableCombobox
                            key={`${plan.tempId}-${staffIndex}`}
                            value={staff.employeeId}
                            options={availableStaffOptions.map((option) => ({
                              ...option,
                              disabled: plan.assignedStaff.some(
                                (selected, selectedIndex) =>
                                  selectedIndex !== staffIndex && selected.employeeId === option.value,
                              ),
                            }))}
                            placeholder="スタッフ名で検索"
                            ariaLabel={`${plan.productName}の配置スタッフ`}
                            onChange={(employeeId) => updateAssignedStaff(planIndex, staffIndex, employeeId)}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                  <td data-label="注意">
                    {plan.warnings.length ? (
                      <div className="auto-schedule-warning-list">
                        {plan.warnings.map((warning) => (
                          <span key={warning} className="badge warn">
                            {warning}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="badge success">なし</span>
                    )}
                  </td>
                  <td data-label="操作">
                    {plan.id ? <Link href={kitagoyaPath(`/production-plans/${plan.id}`)}>詳細</Link> : "未保存"}
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          <div className="row form-actions">
            {!result.persisted && (
              <button type="button" onClick={confirmPreview} disabled={confirming}>
                {confirming ? "確定中..." : "この内容で確定"}
              </button>
            )}
            {result.persisted && result.printUrls && (
              <>
                <Link className="button-link" href={kitagoyaPath(result.printUrls.schedule)}>
                  生産スケジュール印刷
                </Link>
                <Link className="button-link" href={kitagoyaPath(result.printUrls.staff)}>
                  スタッフ配置印刷
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </form>
  );
}

function defaultQuantity(product: ProductOption | undefined) {
  if (product && product.standardProductionLotSize > 0) {
    return Math.round(product.standardProductionLotSize);
  }
  return 1000;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function addDays(date: string, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayInputString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeToMinutes(value: string) {
  const [hh, mm] = value.split(":").map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function previewBlockedLabel(
  inputStats: {
    rowCount: number;
    emptyProductRows: number;
    invalidQuantityRows: number;
    missingCapacity: number;
  },
  invalidTimeRange: boolean,
) {
  if (inputStats.rowCount === 0 || inputStats.emptyProductRows > 0) {
    return "プレビュー前に、今日作る商品を選択してください。";
  }
  if (inputStats.invalidQuantityRows > 0) {
    return "数量が0以下、または未入力の商品があります。数量確認のキューから修正してください。";
  }
  if (invalidTimeRange) {
    return "開始時刻、終了希望、基準終了の並びを確認してください。終了時刻は開始時刻より後にしてください。";
  }
  if (inputStats.missingCapacity > 0) {
    return "生産能力が未登録の商品があります。能力登録のキューから対象商品を確認してください。";
  }
  return "プレビュー前に入力内容を確認してください。";
}

function errorLabel(error: string | undefined, details: unknown) {
  if (error === "no_shift_staff") {
    return "対象日の出勤シフトがありません。先にシフト画面で出勤者を登録してください。";
  }
  if (error === "capacity_not_found") {
    const d = details as { productName?: string } | undefined;
    return `${d?.productName ?? "商品"} の社内部屋で使える生産能力が未登録です。商品マスターで少なくとも1件の生産能力を登録してください。`;
  }
  if (error === "no_internal_work_area") return "外注以外の有効な作業場所がありません。作業場所マスターを確認してください。";
  if (error === "product_not_found") return "選択した商品が見つかりません。";
  if (error === "no_schedulable_quantity") return "シフト時間内に作成できる数量がありません。開始時刻、終了希望、シフトを確認してください。";
  if (error === "work_area_not_schedulable") return "選択した作業場所ではこの商品を配置できません。商品マスターの生産能力を確認してください。";
  if (error === "duplicate_preview_staff") return "同じ予定に同じスタッフが重複しています。";
  if (error === "staff_not_found_or_not_scheduled") return "シフトに入っていないスタッフが含まれています。プレビューを作り直してください。";
  if (error === "employee_assignment_outside_shift") return "スタッフの勤務時間外に配置されています。シフトを確認してください。";
  if (error === "employee_assignment_overlap") return "同じ時間帯に重複しているスタッフがいます。配置を確認してください。";
  return "自動作成に失敗しました。入力内容とシフトを確認してください。";
}
