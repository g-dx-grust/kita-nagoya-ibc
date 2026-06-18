"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  const today = new Date().toISOString().slice(0, 10);

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
  const workAreaOptions = useMemo(
    () => workAreas.map((workArea) => ({ value: workArea.id, label: workArea.name })),
    [workAreas],
  );
  const quantityPreview = formatCases(quantity, { casePackQty: product?.casePackQty ?? null, baseUnit: unit });

  // Default work area + unit when product changes (only for create).
  useEffect(() => {
    if (initial) return;
    if (!product) return;
    if (!workAreaId && product.defaultWorkAreaId) setWorkAreaId(product.defaultWorkAreaId);
    setUnit(product.unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setServerError(null);
    const body = {
      date,
      productId,
      productionType,
      plannedQuantity: ceilDisplayQuantity(Number(quantity)) ?? 0,
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

  return (
    <form className="production-plan-form" onSubmit={submit}>
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
              <label className="production-plan-work-area-field">
                <span>作業場所</span>
                <SearchableCombobox
                  required
                  value={workAreaId}
                  options={workAreaOptions}
                  emptyOptionLabel="選択"
                  placeholder="作業場所名で検索"
                  onChange={setWorkAreaId}
                />
              </label>
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
              </label>
              <label>
                <span>開始時刻</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </label>
              <label>
                <span>終了希望</span>
                <input
                  type="time"
                  value={desiredEndTime ?? ""}
                  onChange={(e) => setDesiredEndTime(e.target.value)}
                />
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
            <button type="submit" disabled={submitting || !productId || !workAreaId}>
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
