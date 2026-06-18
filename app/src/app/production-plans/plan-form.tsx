"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Minus, Package, Plus, Users } from "lucide-react";
import {
  DAILY_BREAK_LABEL,
  computeMaxQuantityInTimeWindow,
  computeProductionDuration,
  computeRequiredPeople,
} from "@/lib/calculations";
import { planStatusClass, planStatusLabel } from "@/lib/labels";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { ceilDisplayQuantity, formatCases } from "@/lib/units";
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
  defaultWorkAreaId: string | null;
  capacities: {
    workAreaId: string;
    unitsPerPersonHour: number;
    standardPeople: number;
    standardBreakMinutes: number;
  }[];
};
type WorkAreaOption = { id: string; name: string };

type Mode = "duration" | "max_quantity" | "required_people";

export default function PlanForm({
  products,
  workAreas,
  initial,
  planId,
}: {
  products: ProductOption[];
  workAreas: WorkAreaOption[];
  initial?: {
    date: string;
    productId: string;
    productionType: string;
    plannedQuantity: number;
    unit: string;
    workAreaId: string;
    plannedStartTime: string;
    desiredEndTime?: string | null;
    plannedPeopleCount: number;
    baselineEndTime: string;
    note?: string | null;
    status: string;
  };
  planId?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("duration");
  const today = toDateInputValue(new Date());

  const [date, setDate] = useState(initial?.date ?? today);
  const [productId, setProductId] = useState(initial?.productId ?? products[0]?.id ?? "");
  const [productionType, setProductionType] = useState(initial?.productionType ?? "stock");
  const [quantity, setQuantity] = useState<number>(initial?.plannedQuantity ?? 1000);
  const [unit, setUnit] = useState(initial?.unit ?? products[0]?.unit ?? "袋");
  const [workAreaId, setWorkAreaId] = useState(initial?.workAreaId ?? "");
  const [startTime, setStartTime] = useState(initial?.plannedStartTime ?? "09:00");
  const [desiredEndTime, setDesiredEndTime] = useState(initial?.desiredEndTime ?? "17:00");
  const [people, setPeople] = useState<number>(initial?.plannedPeopleCount ?? 5);
  const [baselineEndTime, setBaselineEndTime] = useState(initial?.baselineEndTime ?? "17:00");
  const [note, setNote] = useState(initial?.note ?? "");
  const status = initial?.status ?? "draft";
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const workArea = useMemo(() => workAreas.find((area) => area.id === workAreaId) ?? null, [workAreas, workAreaId]);
  const workAreaNameById = useMemo(() => new Map(workAreas.map((area) => [area.id, area.name])), [workAreas]);
  const workAreaOrderById = useMemo(() => new Map(workAreas.map((area, index) => [area.id, index])), [workAreas]);
  const workAreaOptions = useMemo(
    () => workAreas.map((workArea) => ({ value: workArea.id, label: workArea.name })),
    [workAreas],
  );
  const productDefaultWorkAreaId = useMemo(
    () => (product ? defaultWorkAreaIdForProduct(product, workAreas) : ""),
    [product, workAreas],
  );
  const capacityCandidates = useMemo(() => {
    if (!product) return [];
    const seen = new Set<string>();
    return product.capacities
      .filter((capacity) => {
        if (seen.has(capacity.workAreaId) || !workAreaNameById.has(capacity.workAreaId)) return false;
        seen.add(capacity.workAreaId);
        return true;
      })
      .map((capacity) => ({
        ...capacity,
        workAreaName: workAreaNameById.get(capacity.workAreaId) ?? "",
        order: workAreaOrderById.get(capacity.workAreaId) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.order - b.order || b.unitsPerPersonHour - a.unitsPerPersonHour);
  }, [product, workAreaNameById, workAreaOrderById]);
  const plannedQuantity = ceilDisplayQuantity(Number(quantity)) ?? 0;
  const quantityPreview = formatCases(quantity, { casePackQty: product?.casePackQty ?? null, baseUnit: unit });

  // Default work area + unit when product changes (only for create).
  useEffect(() => {
    if (initial) return;
    if (!product) return;
    setWorkAreaId(productDefaultWorkAreaId);
    setUnit(product.unit);
  }, [initial, product, productDefaultWorkAreaId]);

  const capacity = useMemo(() => {
    if (!product || !workAreaId) return null;
    return product.capacities.find((c) => c.workAreaId === workAreaId) ?? null;
  }, [product, workAreaId]);
  const upph = capacity?.unitsPerPersonHour ?? 0;

  // Live preview calculations
  const durationResult = useMemo(() => {
    if (!upph || people <= 0 || quantity <= 0) return null;
    return computeProductionDuration({
      quantity,
      unitsPerPersonHour: upph,
      peopleCount: people,
      startTime,
      baselineEndTime,
    });
  }, [upph, people, quantity, startTime, baselineEndTime]);

  const maxQtyResult = useMemo(() => {
    if (!upph || people <= 0) return null;
    return computeMaxQuantityInTimeWindow({
      unitsPerPersonHour: upph,
      peopleCount: people,
      startTime,
      endTime: desiredEndTime || baselineEndTime,
      requestedQuantity: quantity,
    });
  }, [upph, people, startTime, desiredEndTime, baselineEndTime, quantity]);

  const peopleResult = useMemo(() => {
    if (!upph || quantity <= 0) return null;
    return computeRequiredPeople({
      quantity,
      unitsPerPersonHour: upph,
      startTime,
      endTime: desiredEndTime || baselineEndTime,
      availablePeople: people,
    });
  }, [upph, quantity, startTime, desiredEndTime, baselineEndTime, people]);

  const inputChecks = [
    { label: "商品", ok: !!productId },
    { label: "作業場所", ok: !!workAreaId },
    { label: "数量", ok: plannedQuantity > 0 },
    { label: "人数", ok: people > 0 },
    { label: "時間", ok: !!startTime && !!baselineEndTime },
    { label: "単位", ok: unit.trim().length > 0 },
  ];
  const missingInputChecks = inputChecks.filter((check) => !check.ok);
  const readyCount = inputChecks.filter((check) => check.ok).length;
  const canSubmit =
    !!productId &&
    !!workAreaId &&
    plannedQuantity > 0 &&
    people > 0 &&
    !!startTime &&
    !!baselineEndTime &&
    unit.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setServerError(null);
    const body = {
      date,
      productId,
      productionType,
      plannedQuantity,
      unit,
      workAreaId,
      plannedStartTime: startTime,
      desiredEndTime: desiredEndTime || null,
      breakMinutes: 0,
      plannedPeopleCount: Number(people),
      baselineEndTime,
      note: note || null,
      status,
    };
    try {
      const url = planId
        ? kitagoyaApiPath(`/production-plans/${planId}`)
        : kitagoyaApiPath("/production-plans");
      const res = await fetch(url, {
        method: planId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "保存に失敗しました");
        return;
      }
      const id = planId ?? json.plan?.id;
      router.push(kitagoyaPath(`/production-plans/${id}`));
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const capacityMissing = !!product && !!workAreaId && !capacity;
  const previewEndTime = durationResult?.endTime ?? "未計算";
  const overtimeMinutes = durationResult?.overtimeMinutes ?? 0;
  const modeWarnings =
    mode === "duration"
      ? durationResult?.warnings ?? []
      : mode === "max_quantity"
        ? maxQtyResult?.warnings ?? []
        : peopleResult?.warnings ?? [];
  const hasPreviewWarning =
    capacityMissing ||
    modeWarnings.length > 0 ||
    !canSubmit;
  const modeInfo = calculationModeInfo(mode);
  const activeWarnings = [
    ...(capacityMissing ? ["capacity_missing"] : []),
    ...modeWarnings,
  ];
  const stepChecks = [
    { label: "基本", ok: !!productId && !!workAreaId },
    { label: "数量・時間", ok: plannedQuantity > 0 && people > 0 && !!startTime && !!baselineEndTime },
    { label: "計算", ok: canSubmit && !capacityMissing && modeWarnings.length === 0 },
    { label: planId ? "更新" : "登録", ok: canSubmit && !submitting },
  ];
  const saveSummaryLabel = !canSubmit
    ? `未入力 ${missingInputChecks.length}件`
    : hasPreviewWarning
      ? "確認して登録"
      : "登録準備OK";
  const saveSummaryText = product
    ? `${product.productCode} / ${workArea?.name ?? "作業場所未選択"} / ${quantityPreview}`
    : "商品未選択";

  function adjustQuantity(delta: number) {
    setQuantity((current) => Math.max(0, Math.round((Number(current) || 0) + delta)));
  }

  function adjustPeople(delta: number) {
    setPeople((current) => Math.max(0.5, roundToHalf((Number(current) || 0) + delta)));
  }

  function adjustStartTime(deltaMinutes: number) {
    setStartTime((current) => addMinutesToTime(current, deltaMinutes));
  }

  function adjustDesiredEndTime(deltaMinutes: number) {
    setDesiredEndTime((current) => addMinutesToTime(current || baselineEndTime, deltaMinutes));
  }

  return (
    <form className="production-plan-form" onSubmit={submit}>
      <div className="production-plan-command-panel">
        <div className="production-plan-command-main">
          <span className={hasPreviewWarning ? "badge warn" : "badge success"}>
            {hasPreviewWarning ? (
              <>
                <AlertTriangle size={14} aria-hidden="true" />
                確認あり
              </>
            ) : (
              <>
                <CheckCircle2 size={14} aria-hidden="true" />
                登録準備OK
              </>
            )}
          </span>
          <strong>{formatDateLabel(date)} の生産予定</strong>
          <span className="muted">
            入力 {readyCount} / {inputChecks.length}
          </span>
        </div>
        <div className="production-plan-command-metrics">
          <div>
            <span>
              <Package size={15} aria-hidden="true" />
              数量
            </span>
            <strong>{quantityPreview}</strong>
          </div>
          <div>
            <span>
              <Users size={15} aria-hidden="true" />
              人数
            </span>
            <strong>{people}人</strong>
          </div>
          <div>
            <span>
              <Clock size={15} aria-hidden="true" />
              終了見込み
            </span>
            <strong className={overtimeMinutes > 0 ? "warn-value" : undefined}>{previewEndTime}</strong>
          </div>
        </div>
        <div className="production-plan-command-checks">
          {inputChecks.map((check) => (
            <span key={check.label} className={check.ok ? "badge success" : "badge danger"}>
              {check.ok ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
              {check.label}
            </span>
          ))}
          {capacityMissing && (
            <span className="badge warn">
              <AlertTriangle size={13} aria-hidden="true" />
              能力未登録
            </span>
          )}
        </div>
        <div className="production-plan-stepper" aria-label="生産予定登録の進行状況">
          {stepChecks.map((step, index) => (
            <span key={step.label} className={step.ok ? "is-complete" : "is-current"}>
              <strong>{index + 1}</strong>
              {step.label}
            </span>
          ))}
        </div>
        <div className="production-plan-command-next">
          {!canSubmit ? (
            <>
              <span className="badge warn">次</span>
              {missingInputChecks.slice(0, 3).map((check) => (
                <span key={check.label}>{check.label}</span>
              ))}
            </>
          ) : hasPreviewWarning ? (
            <>
              <span className="badge warn">確認</span>
              {activeWarnings.slice(0, 3).map((warning) => (
                <span key={warning}>{planWarningShortLabel(warning)}</span>
              ))}
            </>
          ) : (
            <>
              <span className="badge success">次</span>
              <span>{planId ? "更新する" : "登録する"}</span>
            </>
          )}
        </div>
        <div className="production-plan-command-mode">
          <span className="badge info">計算</span>
          <strong>{modeInfo.label}</strong>
          <span>{modeInfo.description}</span>
        </div>
      </div>
      <div className="production-plan-form-layout">
        <div className="panel production-plan-input-panel">
          <section className="production-plan-form-section" aria-labelledby="production-plan-basic-heading">
            <h2 id="production-plan-basic-heading" className="production-plan-section-heading">
              基本情報
            </h2>
            <div className="production-plan-field-grid production-plan-basic-grid">
              <label>
                <span>生産日</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className="production-plan-product-field">
                <span>商品</span>
                <ProductCombobox products={products} value={productId} onChange={setProductId} required />
              </label>
              <label>
                <span>区分</span>
                <select value={productionType} onChange={(e) => setProductionType(e.target.value)}>
                  <option value="stock">在庫生産</option>
                  <option value="make_to_order">受注生産</option>
                  <option value="external">外注</option>
                  <option value="trial">試作</option>
                  <option value="other">その他</option>
                </select>
              </label>
              <div className="production-plan-field production-plan-work-area-field">
                <span>作業場所</span>
                <SearchableCombobox
                  required
                  value={workAreaId}
                  options={workAreaOptions}
                  emptyOptionLabel="選択"
                  placeholder="作業場所名で検索"
                  onChange={setWorkAreaId}
                />
                {capacityCandidates.length > 0 && (
                  <div className="production-plan-work-area-candidates" aria-label="商品別作業場所候補">
                    {capacityCandidates.slice(0, 5).map((candidate) => (
                      <button
                        key={candidate.workAreaId}
                        type="button"
                        className={candidate.workAreaId === workAreaId ? "is-active" : ""}
                        onClick={() => setWorkAreaId(candidate.workAreaId)}
                      >
                        <span>{candidate.workAreaName}</span>
                        <small>{formatRate(candidate.unitsPerPersonHour)}{unit}/人時</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="production-plan-form-section" aria-labelledby="production-plan-volume-heading">
            <h2 id="production-plan-volume-heading" className="production-plan-section-heading">
              数量・時間
            </h2>
            <div className="production-plan-field-grid production-plan-volume-grid">
              <label>
                <span>数量</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  required
                />
                <span className="production-plan-inline-actions" aria-label="数量を調整">
                  <button type="button" className="secondary mini" onClick={() => adjustQuantity(-100)}>
                    <Minus size={13} aria-hidden="true" />
                    100
                  </button>
                  <button type="button" className="secondary mini" onClick={() => adjustQuantity(100)}>
                    <Plus size={13} aria-hidden="true" />
                    100
                  </button>
                  <button type="button" className="secondary mini" onClick={() => adjustQuantity(500)}>
                    <Plus size={13} aria-hidden="true" />
                    500
                  </button>
                </span>
                <span className="subtext">{quantityPreview}</span>
              </label>
              <label className="production-plan-unit-field">
                <span>単位</span>
                <input className="unit-field" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </label>
              <label>
                <span>人数</span>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={people}
                  onChange={(e) => setPeople(Number(e.target.value))}
                  required
                />
                <span className="production-plan-inline-actions" aria-label="人数を調整">
                  <button type="button" className="secondary mini" onClick={() => adjustPeople(-1)}>
                    <Minus size={13} aria-hidden="true" />
                    1
                  </button>
                  <button type="button" className="secondary mini" onClick={() => adjustPeople(1)}>
                    <Plus size={13} aria-hidden="true" />
                    1
                  </button>
                </span>
              </label>
              <label>
                <span>開始時刻</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                <span className="production-plan-inline-actions" aria-label="開始時刻を調整">
                  <button type="button" className="secondary mini" onClick={() => adjustStartTime(-30)}>
                    <Minus size={13} aria-hidden="true" />
                    30分
                  </button>
                  <button type="button" className="secondary mini" onClick={() => adjustStartTime(30)}>
                    <Plus size={13} aria-hidden="true" />
                    30分
                  </button>
                </span>
              </label>
              <label>
                <span>終了希望</span>
                <input
                  type="time"
                  value={desiredEndTime ?? ""}
                  onChange={(e) => setDesiredEndTime(e.target.value)}
                />
                <span className="production-plan-inline-actions" aria-label="終了希望を調整">
                  <button type="button" className="secondary mini" onClick={() => adjustDesiredEndTime(-30)}>
                    <Minus size={13} aria-hidden="true" />
                    30分
                  </button>
                  <button type="button" className="secondary mini" onClick={() => adjustDesiredEndTime(30)}>
                    <Plus size={13} aria-hidden="true" />
                    30分
                  </button>
                </span>
              </label>
              <label>
                <span>基準終了</span>
                <input
                  type="time"
                  value={baselineEndTime}
                  onChange={(e) => setBaselineEndTime(e.target.value)}
                />
              </label>
              <label className="production-plan-status-field">
                <span>状態</span>
                <span className={`badge ${planStatusClass(status)}`}>{planStatusLabel(status)}</span>
              </label>
            </div>
          </section>

          <section className="production-plan-form-section" aria-labelledby="production-plan-note-heading">
            <h2 id="production-plan-note-heading" className="production-plan-section-heading">
              メモ
            </h2>
            <label className="production-plan-note-field">
              <span>担当者メモ</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </label>
          </section>
        </div>

        <aside className="production-plan-side-panel" aria-label="計算プレビューと保存">
          <div className="panel production-plan-preview-panel">
            <div className="production-plan-preview-head">
              <strong>計算プレビュー</strong>
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="duration">① 数量固定 → 終了時刻</option>
                <option value="max_quantity">② 時間枠固定 → 最大数量</option>
                <option value="required_people">③ 数量+時間枠 → 必要人数</option>
              </select>
            </div>

            <dl className="production-plan-summary-list">
              <div>
                <dt>商品</dt>
                <dd>{product ? `${product.productCode} ・ ${product.officialName}` : "未選択"}</dd>
              </div>
              <div>
                <dt>場所</dt>
                <dd>{workArea?.name ?? "未選択"}</dd>
              </div>
              <div>
                <dt>数量</dt>
                <dd>{quantityPreview}</dd>
              </div>
              <div>
                <dt>能力</dt>
                <dd>{upph > 0 ? `${upph} ${unit}/人時` : "未登録"}</dd>
              </div>
            </dl>

            {capacityMissing && (
              <div className="alert warn flush-top">
                この商品×作業場所の生産能力が未登録です。商品マスターで設定してください。
              </div>
            )}

            <div className="production-plan-break-line">
              休憩時間帯: {DAILY_BREAK_LABEL}
            </div>

            {mode === "duration" && durationResult && (
              <CalcLine
                rows={[
                  ["所要稼働時間", `${durationResult.workingMinutes}分`],
                  ["休憩時間帯", `${durationResult.blockedMinutes}分`],
                  ["所要時間", `${durationResult.requiredMinutes}分`],
                  ["終了予定", durationResult.endTime],
                  ["残業見込み", `${durationResult.overtimeMinutes}分`],
                ]}
                warn={durationResult.warnings}
              />
            )}

            {mode === "max_quantity" && maxQtyResult && (
              <CalcLine
                rows={[
                  ["稼働時間(h)", maxQtyResult.workingHours.toFixed(2)],
                  ["休憩時間帯", `${maxQtyResult.blockedMinutes}分`],
                  [
                    "最大生産数量",
                    formatCases(maxQtyResult.maxQuantity, {
                      casePackQty: product?.casePackQty ?? null,
                      baseUnit: unit,
                    }),
                  ],
                  [
                    "あふれ数量",
                    formatCases(maxQtyResult.overflowQuantity, {
                      casePackQty: product?.casePackQty ?? null,
                      baseUnit: unit,
                    }),
                  ],
                ]}
                warn={maxQtyResult.warnings}
              />
            )}

            {mode === "required_people" && peopleResult && (
              <>
                <CalcLine
                  rows={[
                    ["稼働時間(h)", peopleResult.workingHours.toFixed(2)],
                    ["休憩時間帯", `${peopleResult.blockedMinutes}分`],
                    ["必要人数", `${peopleResult.requiredPeople}人`],
                    ["不足人数 (利用可能比)", `${peopleResult.shortagePeople}人`],
                  ]}
                  warn={peopleResult.warnings}
                />
                <div className="table-frame production-plan-candidate-table">
                  <table className="nested-table">
                    <thead>
                      <tr>
                        <th>人数</th>
                        <th>終了時刻</th>
                        <th>残業(分)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {peopleResult.candidates.map((c) => (
                        <tr key={c.people}>
                          <td>{c.people}</td>
                          <td>{c.endTime}</td>
                          <td>{c.overtimeMinutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {serverError && <div className="alert danger">{serverError}</div>}

          <div className="production-plan-form-actions">
            <div className="production-plan-save-summary">
              <strong>{saveSummaryLabel}</strong>
              <span>{saveSummaryText}</span>
            </div>
            <div className="production-plan-save-buttons">
              <button type="submit" disabled={submitting || !canSubmit}>
                {submitting ? "保存中..." : planId ? "更新する" : "登録する"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => router.back()}
                disabled={submitting}
              >
                戻る
              </button>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}

function CalcLine({ rows, warn }: { rows: [string, string][]; warn: string[] }) {
  return (
    <div className="production-plan-calc-grid">
      {rows.map(([k, v]) => (
        <div key={k} className="metric">
          <div className="metric-label">{k}</div>
          <div className="metric-value">{v}</div>
        </div>
      ))}
      {warn.map((w) => (
        <div key={w} className="alert warn full-row flush-top">
          注意: {warnLabel(w)}
        </div>
      ))}
    </div>
  );
}

function warnLabel(w: string) {
  switch (w) {
    case "exceeds_baseline_end":
      return "17時(基準終了時刻)を超過します。残業/翌日繰越/外注を検討してください。";
    case "exceeds_desired_end":
      return "終了希望時刻を超過します。";
    case "non_positive_capacity":
      return "1時間1人あたり生産量が未登録です。";
    case "non_positive_people":
      return "人数が0です。";
    default:
      return w;
  }
}

function planWarningShortLabel(w: string) {
  switch (w) {
    case "capacity_missing":
    case "non_positive_capacity":
      return "能力";
    case "exceeds_baseline_end":
      return "基準終了";
    case "exceeds_desired_end":
      return "終了希望";
    case "non_positive_people":
      return "人数";
    default:
      return "確認";
  }
}

function calculationModeInfo(mode: Mode) {
  switch (mode) {
    case "max_quantity":
      return {
        label: "時間枠固定",
        description: "開始・終了希望・人数から最大数量を見ます。",
      };
    case "required_people":
      return {
        label: "必要人数",
        description: "数量と時間枠から必要人数を見ます。",
      };
    case "duration":
    default:
      return {
        label: "終了時刻",
        description: "数量・人数・開始時刻から終了予定を見ます。",
      };
  }
}

function defaultWorkAreaIdForProduct(product: ProductOption, workAreas: WorkAreaOption[]) {
  const activeWorkAreaIds = new Set(workAreas.map((area) => area.id));
  if (product.defaultWorkAreaId && activeWorkAreaIds.has(product.defaultWorkAreaId)) {
    return product.defaultWorkAreaId;
  }
  return product.capacities.find((capacity) => activeWorkAreaIds.has(capacity.workAreaId))?.workAreaId ?? "";
}

function formatRate(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "日付未設定";
  const [year, month, day] = date.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function addMinutesToTime(time: string, deltaMinutes: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const total = Number(match[1]) * 60 + Number(match[2]) + deltaMinutes;
  const normalized = ((total % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
