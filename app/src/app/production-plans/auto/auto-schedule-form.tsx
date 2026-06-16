"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DAILY_BREAK_LABEL } from "@/lib/calculations";
import { productionTypeLabel } from "@/lib/labels";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { formatCases } from "@/lib/units";
import ProductCombobox from "@/components/ui/product-combobox";
import SearchableCombobox from "@/components/ui/searchable-combobox";

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

  useEffect(() => {
    if (!autoLoadSuggestions || initialSuggestionsLoaded) return;
    setInitialSuggestionsLoaded(true);
    void loadProductSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadSuggestions, initialSuggestionsLoaded]);

  function update(index: number, patch: Partial<Row>) {
    const copy = [...rows];
    copy[index] = { ...copy[index], ...patch };
    setRows(copy);
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
    setBusy(true);
    setError(null);
    setMessage(null);
    setResult(null);

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
      <div className="panel">
        <div className="row">
          <label>
            <span>対象日</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            <span>計算モード</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="duration">① 数量固定 → 終了時刻</option>
              <option value="max_quantity">② 時間枠固定 → 最大数量</option>
              <option value="required_people">③ 数量+時間枠 → 必要人数</option>
            </select>
          </label>
          <label>
            <span>開始時刻</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label>
            <span>終了希望</span>
            <input type="time" value={desiredEndTime} onChange={(e) => setDesiredEndTime(e.target.value)} />
          </label>
          <label>
            <span>基準終了</span>
            <input type="time" value={baselineEndTime} onChange={(e) => setBaselineEndTime(e.target.value)} />
          </label>
          <label>
            <span>休憩時間帯</span>
            <input value={DAILY_BREAK_LABEL} readOnly aria-label="休憩時間帯" />
          </label>
        </div>
      </div>

      <div className="toolbar">
        <h2>今日作る商品</h2>
        <div className="spacer" />
        <button
          type="button"
          className="secondary"
          onClick={loadProductSuggestions}
          disabled={loadingSuggestions}
        >
          {loadingSuggestions ? "読込中..." : "製品在庫から不足候補を読込"}
        </button>
      </div>
      <div className="panel">
        <p className="section-note">
          生産能力が1部屋分だけ登録されている商品は、外注以外の部屋にも同じ能力を仮適用して自動配置します。
          自動作成では受注生産を先に配置し、在庫生産は後工程に回します。部屋の使い分けは作業場所マスターの「自動予定の役割」で設定します。
        </p>
        <table>
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
            {rows.map((row, index) => {
              const product = productMap.get(row.productId);
              return (
                <tr key={index}>
                  <td className="right">{index + 1}</td>
                  <td>
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
                  </td>
                  <td>
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
                  <td>
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
                  <td>{product?.defaultWorkAreaName ?? "自動選択"}</td>
                  <td>{product?.capacitySummary ?? "未登録"}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setRows(rows.filter((_, i) => i !== index))}
                      disabled={rows.length === 1}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setRows([
                ...rows,
                {
                  productId: products[0]?.id ?? "",
                  quantity: defaultQuantity(products[0]),
                  productionType: "stock",
                },
              ])
            }
          >
            ＋ 商品を追加
          </button>
          <button type="submit" disabled={busy || products.length === 0}>
            {busy ? "計算中..." : "シフトに合わせてプレビュー"}
          </button>
        </div>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      {result && (
        <div className="panel">
          <h2>{result.persisted ? "確定済みスケジュール" : "自動作成プレビュー"}</h2>
          <div className={result.persisted ? "alert success" : "alert info"}>
            {result.persisted
              ? "生産予定として確定しました。印刷や詳細画面で内容を確認できます。"
              : result.mode === "max_quantity"
                ? "まだ保存されていません。出勤者全員を複数部屋へ自動配置し、作業の終わった人は別部屋へ合流させています（人員はシフトから自動決定）。作業場所は変更でき、細かな人の入れ替えは「当日 人員割り当て」のドラッグ調整で行えます。"
                : "まだ保存されていません。条件や数量を変えて何度でも試せます。問題なければこの内容で確定してください。"}
          </div>
          <div className="table-frame">
          <table>
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
              {result.plans.map((plan, planIndex) => (
                <tr key={plan.id ?? plan.tempId}>
                  <td>{plan.productName}</td>
                  <td>{productionTypeLabel(plan.productionType)}</td>
                  <td>
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
                  <td>
                    {plan.startTime} - {plan.endTime}
                  </td>
                  <td className="right">
                    {formatCases(plan.quantity, {
                      casePackQty: productMap.get(plan.productId)?.casePackQty ?? null,
                      baseUnit: productMap.get(plan.productId)?.unit,
                    })}
                  </td>
                  <td>
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
                  <td>{plan.warnings.length ? plan.warnings.join(" / ") : "なし"}</td>
                  <td>
                    {plan.id ? <Link href={kitagoyaPath(`/production-plans/${plan.id}`)}>詳細</Link> : "未保存"}
                  </td>
                </tr>
              ))}
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
