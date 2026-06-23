"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, ExternalLink, PlusCircle, Save } from "lucide-react";
import { planStatusClass, planStatusLabel } from "@/lib/labels";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { ceilDisplayQuantity, formatCases } from "@/lib/units";

type WorkAreaOption = {
  id: string;
  name: string;
  standardPeople: number | null;
};

type PlanProductionType = "stock" | "make_to_order" | "external" | "trial" | "other";

type DecisionPlan = {
  id: string;
  date: string;
  productId: string;
  productCode: string;
  productName: string;
  productProductionType: string;
  productionType: PlanProductionType;
  unit: string;
  casePackQty: number | null;
  workAreaId: string;
  workAreaName: string;
  workAreaOptions: WorkAreaOption[];
  plannedQuantity: number;
  plannedStartTime: string;
  plannedEndTime: string | null;
  plannedPeopleCount: number;
  status: string;
  hardShortage: boolean;
  unconfirmedDependency: boolean;
  note: string | null;
};

type DemandRow = {
  id: string;
  dueDate: string;
  demandType: string;
  quantity: number;
  plannedQuantity: number;
  remainingQuantity: number;
  coverageStatus: "covered" | "partial" | "unplanned";
  customerName: string | null;
  externalRef: string | null;
  note: string | null;
  product: {
    id: string;
    productCode: string;
    officialName: string;
    productionType: string;
    unit: string;
    casePackQty: number | null;
    workAreaOptions: WorkAreaOption[];
  };
};

type PlanEdit = {
  date: string;
  productionType: PlanProductionType;
  plannedQuantity: number;
  workAreaId: string;
  plannedStartTime: string;
  plannedPeopleCount: number;
};

type DemandDraft = {
  date: string;
  quantity: number;
  workAreaId: string;
  plannedStartTime: string;
  plannedPeopleCount: number;
};

export default function MonthlyPlanDecisionClient({
  initialDateFrom,
  initialDateTo,
  plans,
  demands,
  summary,
}: {
  initialDateFrom: string;
  initialDateTo: string;
  plans: DecisionPlan[];
  demands: DemandRow[];
  summary: {
    draftCount: number;
    confirmedCount: number;
    stockDraftCount: number;
    orderDraftCount: number;
    uncoveredDemandCount: number;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planEdits, setPlanEdits] = useState<Record<string, PlanEdit>>(() =>
    Object.fromEntries(plans.map((plan) => [plan.id, editFromPlan(plan)])),
  );
  const [demandDrafts, setDemandDrafts] = useState<Record<string, DemandDraft>>(() =>
    Object.fromEntries(demands.map((demand) => [demand.id, draftFromDemand(demand, initialDateFrom, initialDateTo)])),
  );

  const draftPlanIds = useMemo(() => plans.filter((plan) => plan.status === "draft").map((plan) => plan.id), [plans]);
  const selectedDraftIds = useMemo(
    () => draftPlanIds.filter((id) => selected.has(id)),
    [draftPlanIds, selected],
  );
  const stockPlans = plans.filter((plan) => plan.productionType === "stock");
  const orderPlans = plans.filter((plan) => plan.productionType !== "stock");

  function togglePlan(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectDrafts(rows: DecisionPlan[]) {
    setSelected((current) => {
      const next = new Set(current);
      const ids = rows.filter((row) => row.status === "draft").map((row) => row.id);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function updatePlanEdit(id: string, patch: Partial<PlanEdit>) {
    setPlanEdits((current) => ({ ...current, [id]: { ...(current[id] ?? emptyPlanEdit()), ...patch } }));
  }

  function updateDemandDraft(id: string, patch: Partial<DemandDraft>) {
    setDemandDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? emptyDemandDraft()), ...patch } }));
  }

  async function savePlan(plan: DecisionPlan) {
    const edit = planEdits[plan.id] ?? editFromPlan(plan);
    const quantity = ceilDisplayQuantity(Number(edit.plannedQuantity)) ?? 0;
    if (plan.status !== "draft") {
      setError("本決定済みの予定はこの画面では変更できません。");
      return;
    }
    if (!edit.date || !edit.workAreaId || !edit.plannedStartTime || quantity <= 0 || Number(edit.plannedPeopleCount) <= 0) {
      setError("日付・作業場所・開始時刻・数量・人数を確認してください。");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath(`/production-plans/${plan.id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: edit.date,
        productionType: edit.productionType,
        plannedQuantity: quantity,
        workAreaId: edit.workAreaId,
        plannedStartTime: edit.plannedStartTime,
        plannedPeopleCount: Number(edit.plannedPeopleCount),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`予定の保存に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("予定を保存しました。材料・資材見込みも再計算しました。");
    router.refresh();
  }

  async function confirmSelected() {
    if (selectedDraftIds.length === 0) {
      setError("本決定できる下書き予定が選択されていません。");
      return;
    }
    if (!confirm(`選択中の下書き ${selectedDraftIds.length}件を本決定します。よろしいですか？`)) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/production-plans/bulk-confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedDraftIds }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`本決定に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setSelected(new Set());
    setMessage(`${json.confirmed ?? 0}件を本決定しました。`);
    router.refresh();
  }

  async function createPlanFromDemand(demand: DemandRow) {
    const draft = demandDrafts[demand.id] ?? draftFromDemand(demand, initialDateFrom, initialDateTo);
    const quantity = ceilDisplayQuantity(Number(draft.quantity)) ?? 0;
    if (!draft.date || !draft.workAreaId || !draft.plannedStartTime || quantity <= 0 || Number(draft.plannedPeopleCount) <= 0) {
      setError("受注予定化の日付・作業場所・開始時刻・数量・人数を確認してください。");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/production-plans"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: draft.date,
        productId: demand.product.id,
        productionType: productionTypeForDemand(demand.product.productionType),
        plannedQuantity: quantity,
        unit: demand.product.unit,
        workAreaId: draft.workAreaId,
        plannedStartTime: draft.plannedStartTime,
        breakMinutes: 0,
        plannedPeopleCount: Number(draft.plannedPeopleCount),
        status: "draft",
        baselineEndTime: "17:00",
        note: `受注予定から本決定画面で作成 / 必要日 ${demand.dueDate} / ${demand.customerName ?? "得意先未指定"}`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`受注予定の予定化に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("受注/出荷予定から下書き生産予定を作成しました。");
    router.refresh();
  }

  return (
    <>
      <div className="monthly-decision-command panel">
        <div className="monthly-decision-command-title">
          <span className={`badge ${summary.draftCount > 0 ? "warn" : "success"}`}>
            {summary.draftCount > 0 ? `本決定待ち ${summary.draftCount}` : "本決定待ちなし"}
          </span>
          <strong>社員確認で本決定</strong>
          <span className="subtext">
            {initialDateFrom} - {initialDateTo}
          </span>
        </div>
        <div className="monthly-decision-checks">
          <span className="badge muted">本決定済 {summary.confirmedCount}</span>
          <span className={`badge ${summary.stockDraftCount > 0 ? "warn" : "success"}`}>在庫品下書き {summary.stockDraftCount}</span>
          <span className={`badge ${summary.orderDraftCount > 0 ? "warn" : "success"}`}>受注品下書き {summary.orderDraftCount}</span>
          <span className={`badge ${summary.uncoveredDemandCount > 0 ? "warn" : "success"}`}>未予定受注 {summary.uncoveredDemandCount}</span>
        </div>
        <div className="monthly-decision-actions">
          <button type="button" onClick={confirmSelected} disabled={busy || selectedDraftIds.length === 0}>
            <ClipboardCheck size={16} aria-hidden="true" />
            {busy ? "処理中..." : `選択を本決定 (${selectedDraftIds.length})`}
          </button>
          <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans?dateFrom=${initialDateFrom}&dateTo=${initialDateTo}&status=draft`)}>
            <ExternalLink size={15} aria-hidden="true" />
            一覧で開く
          </Link>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}

      <DecisionPlanTable
        title="在庫商品の本決定"
        rows={stockPlans}
        selected={selected}
        planEdits={planEdits}
        busy={busy}
        onTogglePlan={togglePlan}
        onSelectDrafts={selectDrafts}
        onUpdatePlanEdit={updatePlanEdit}
        onSavePlan={savePlan}
      />

      <DecisionPlanTable
        title="受注商品の本決定"
        rows={orderPlans}
        selected={selected}
        planEdits={planEdits}
        busy={busy}
        onTogglePlan={togglePlan}
        onSelectDrafts={selectDrafts}
        onUpdatePlanEdit={updatePlanEdit}
        onSavePlan={savePlan}
      />

      <DemandPlanningTable
        demands={demands}
        demandDrafts={demandDrafts}
        busy={busy}
        onUpdateDemandDraft={updateDemandDraft}
        onCreatePlanFromDemand={createPlanFromDemand}
      />
    </>
  );
}

function DecisionPlanTable({
  title,
  rows,
  selected,
  planEdits,
  busy,
  onTogglePlan,
  onSelectDrafts,
  onUpdatePlanEdit,
  onSavePlan,
}: {
  title: string;
  rows: DecisionPlan[];
  selected: Set<string>;
  planEdits: Record<string, PlanEdit>;
  busy: boolean;
  onTogglePlan: (id: string) => void;
  onSelectDrafts: (rows: DecisionPlan[]) => void;
  onUpdatePlanEdit: (id: string, patch: Partial<PlanEdit>) => void;
  onSavePlan: (plan: DecisionPlan) => void;
}) {
  const draftRows = rows.filter((row) => row.status === "draft");
  const allDraftSelected = draftRows.length > 0 && draftRows.every((row) => selected.has(row.id));

  return (
    <section className="monthly-decision-section">
      <div className="section-heading-row">
        <h2>{title}</h2>
        <div className="section-heading-actions">
          <span className="badge muted">表示 {rows.length}</span>
          <button type="button" className="secondary" onClick={() => onSelectDrafts(rows)} disabled={draftRows.length === 0}>
            {allDraftSelected ? "選択解除" : "下書きを選択"}
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">対象期間に表示できる予定はありません。</div>
      ) : (
        <div className="table-frame monthly-decision-plan-frame">
          <table className="monthly-decision-plan-table">
            <thead>
              <tr>
                <th>選択</th>
                <th>日付</th>
                <th>商品</th>
                <th>数量</th>
                <th>区分</th>
                <th>作業場所</th>
                <th>開始/人数</th>
                <th>状態</th>
                <th>注意</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((plan) => {
                const edit = planEdits[plan.id] ?? editFromPlan(plan);
                const editable = plan.status === "draft";
                return (
                  <tr key={plan.id} className={plan.hardShortage || plan.unconfirmedDependency ? "row-needs-action" : ""}>
                    <td className="select-cell">
                      <input
                        type="checkbox"
                        checked={selected.has(plan.id)}
                        disabled={!editable}
                        onChange={() => onTogglePlan(plan.id)}
                        aria-label={`${plan.productName} を本決定対象に選択`}
                      />
                    </td>
                    <td>
                      {editable ? (
                        <input
                          type="date"
                          value={edit.date}
                          onChange={(event) => onUpdatePlanEdit(plan.id, { date: event.target.value })}
                        />
                      ) : (
                        plan.date
                      )}
                    </td>
                    <td>
                      <div className="monthly-decision-product-cell">
                        <strong>{plan.productCode} · {plan.productName}</strong>
                        <span className="badge muted">{productProductionTypeLabel(plan.productProductionType)}</span>
                      </div>
                    </td>
                    <td className="right">
                      {editable ? (
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={edit.plannedQuantity}
                          onChange={(event) => onUpdatePlanEdit(plan.id, { plannedQuantity: Number(event.target.value) })}
                        />
                      ) : (
                        formatCases(plan.plannedQuantity, { casePackQty: plan.casePackQty, baseUnit: plan.unit })
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <select
                          value={edit.productionType}
                          onChange={(event) => onUpdatePlanEdit(plan.id, { productionType: event.target.value as PlanProductionType })}
                        >
                          <option value="stock">在庫品</option>
                          <option value="make_to_order">受注品</option>
                          <option value="external">外注</option>
                          <option value="trial">試作</option>
                          <option value="other">その他</option>
                        </select>
                      ) : (
                        productionTypeLabel(plan.productionType)
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <select
                          value={edit.workAreaId}
                          onChange={(event) => onUpdatePlanEdit(plan.id, { workAreaId: event.target.value })}
                        >
                          {plan.workAreaOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        plan.workAreaName
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <div className="monthly-decision-inline-fields">
                          <input
                            type="time"
                            value={edit.plannedStartTime}
                            onChange={(event) => onUpdatePlanEdit(plan.id, { plannedStartTime: event.target.value })}
                            aria-label="開始時刻"
                          />
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={edit.plannedPeopleCount}
                            onChange={(event) => onUpdatePlanEdit(plan.id, { plannedPeopleCount: Number(event.target.value) })}
                            aria-label="人数"
                          />
                        </div>
                      ) : (
                        `${plan.plannedStartTime} - ${plan.plannedEndTime ?? "未計算"} / ${plan.plannedPeopleCount}名`
                      )}
                    </td>
                    <td>
                      <span className={`badge ${planStatusClass(plan.status)}`}>{plan.status === "draft" ? "本決定待ち" : planStatusLabel(plan.status)}</span>
                    </td>
                    <td>
                      <span className="badge-list">
                        {plan.hardShortage && <span className="badge danger">資材不足</span>}
                        {plan.unconfirmedDependency && <span className="badge warn">入荷確認</span>}
                        {!plan.hardShortage && !plan.unconfirmedDependency && <span className="badge success">なし</span>}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        {editable && (
                          <button type="button" onClick={() => onSavePlan(plan)} disabled={busy}>
                            <Save size={15} aria-hidden="true" />
                            保存
                          </button>
                        )}
                        <Link href={kitagoyaPath(`/production-plans/${plan.id}`)}>開く</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DemandPlanningTable({
  demands,
  demandDrafts,
  busy,
  onUpdateDemandDraft,
  onCreatePlanFromDemand,
}: {
  demands: DemandRow[];
  demandDrafts: Record<string, DemandDraft>;
  busy: boolean;
  onUpdateDemandDraft: (id: string, patch: Partial<DemandDraft>) => void;
  onCreatePlanFromDemand: (demand: DemandRow) => void;
}) {
  return (
    <section className="monthly-decision-section">
      <div className="section-heading-row">
        <h2>未処理の受注/出荷予定</h2>
        <div className="section-heading-actions">
          <span className="badge muted">表示 {demands.length}</span>
        </div>
      </div>
      {demands.length === 0 ? (
        <div className="empty-state">未処理の受注/出荷予定はありません。</div>
      ) : (
        <div className="table-frame monthly-decision-demand-frame">
          <table className="monthly-decision-demand-table">
            <thead>
              <tr>
                <th>必要日</th>
                <th>商品</th>
                <th>受注数量</th>
                <th>予定済み</th>
                <th>状態</th>
                <th>作る日/数量</th>
                <th>場所/開始/人数</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {demands.map((demand) => {
                const draft = demandDrafts[demand.id] ?? draftFromDemand(demand, "", "");
                const covered = demand.coverageStatus === "covered";
                return (
                  <tr key={demand.id} className={covered ? "" : "row-needs-action"}>
                    <td>{demand.dueDate}</td>
                    <td>
                      <div className="monthly-decision-product-cell">
                        <strong>{demand.product.productCode} · {demand.product.officialName}</strong>
                        <span className="badge muted">{demandTypeLabel(demand.demandType)}</span>
                        {demand.customerName && <span className="subtext">{demand.customerName}</span>}
                      </div>
                    </td>
                    <td className="right">
                      {formatCases(demand.quantity, { casePackQty: demand.product.casePackQty, baseUnit: demand.product.unit })}
                    </td>
                    <td className="right">
                      {formatCases(demand.plannedQuantity, { casePackQty: demand.product.casePackQty, baseUnit: demand.product.unit })}
                    </td>
                    <td>
                      <span className={`badge ${coverageBadgeClass(demand.coverageStatus)}`}>
                        {coverageLabel(demand.coverageStatus)}
                      </span>
                    </td>
                    <td>
                      <div className="monthly-decision-inline-fields">
                        <input
                          type="date"
                          value={draft.date}
                          disabled={covered}
                          onChange={(event) => onUpdateDemandDraft(demand.id, { date: event.target.value })}
                          aria-label="作る日"
                        />
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={draft.quantity}
                          disabled={covered}
                          onChange={(event) => onUpdateDemandDraft(demand.id, { quantity: Number(event.target.value) })}
                          aria-label="作る数量"
                        />
                      </div>
                    </td>
                    <td>
                      <div className="monthly-decision-demand-fields">
                        <select
                          value={draft.workAreaId}
                          disabled={covered || demand.product.workAreaOptions.length === 0}
                          onChange={(event) => {
                            const option = demand.product.workAreaOptions.find((row) => row.id === event.target.value);
                            onUpdateDemandDraft(demand.id, {
                              workAreaId: event.target.value,
                              plannedPeopleCount: option?.standardPeople ?? draft.plannedPeopleCount,
                            });
                          }}
                        >
                          {demand.product.workAreaOptions.length === 0 ? (
                            <option value="">作業場所未設定</option>
                          ) : (
                            demand.product.workAreaOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))
                          )}
                        </select>
                        <input
                          type="time"
                          value={draft.plannedStartTime}
                          disabled={covered}
                          onChange={(event) => onUpdateDemandDraft(demand.id, { plannedStartTime: event.target.value })}
                          aria-label="開始時刻"
                        />
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={draft.plannedPeopleCount}
                          disabled={covered}
                          onChange={(event) => onUpdateDemandDraft(demand.id, { plannedPeopleCount: Number(event.target.value) })}
                          aria-label="人数"
                        />
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => onCreatePlanFromDemand(demand)}
                        disabled={busy || covered || demand.product.workAreaOptions.length === 0}
                      >
                        <PlusCircle size={15} aria-hidden="true" />
                        下書き予定化
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function editFromPlan(plan: DecisionPlan): PlanEdit {
  return {
    date: plan.date,
    productionType: plan.productionType,
    plannedQuantity: plan.plannedQuantity,
    workAreaId: plan.workAreaId,
    plannedStartTime: plan.plannedStartTime,
    plannedPeopleCount: plan.plannedPeopleCount,
  };
}

function draftFromDemand(demand: DemandRow, dateFrom: string, dateTo: string): DemandDraft {
  const workArea = demand.product.workAreaOptions[0];
  return {
    date: clampDate(subDays(demand.dueDate, 1), dateFrom, dateTo),
    quantity: Math.max(1, demand.remainingQuantity || demand.quantity),
    workAreaId: workArea?.id ?? "",
    plannedStartTime: "09:00",
    plannedPeopleCount: workArea?.standardPeople ?? 1,
  };
}

function emptyPlanEdit(): PlanEdit {
  return {
    date: "",
    productionType: "stock",
    plannedQuantity: 0,
    workAreaId: "",
    plannedStartTime: "09:00",
    plannedPeopleCount: 1,
  };
}

function emptyDemandDraft(): DemandDraft {
  return {
    date: "",
    quantity: 0,
    workAreaId: "",
    plannedStartTime: "09:00",
    plannedPeopleCount: 1,
  };
}

function productionTypeForDemand(productProductionType: string): PlanProductionType {
  return productProductionType === "stock" ? "stock" : "make_to_order";
}

function productProductionTypeLabel(value: string) {
  switch (value) {
    case "stock":
      return "在庫商品";
    case "make_to_order":
      return "受注商品";
    case "both":
      return "在庫/受注";
    default:
      return value;
  }
}

function productionTypeLabel(value: PlanProductionType) {
  switch (value) {
    case "stock":
      return "在庫品";
    case "make_to_order":
      return "受注品";
    case "external":
      return "外注";
    case "trial":
      return "試作";
    case "other":
      return "その他";
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

function coverageLabel(value: DemandRow["coverageStatus"]) {
  switch (value) {
    case "covered":
      return "予定済み";
    case "partial":
      return "一部予定";
    case "unplanned":
      return "未予定";
  }
}

function coverageBadgeClass(value: DemandRow["coverageStatus"]) {
  switch (value) {
    case "covered":
      return "success";
    case "partial":
      return "warn";
    case "unplanned":
      return "danger";
  }
}

function subDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function clampDate(date: string, min: string, max: string) {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}
