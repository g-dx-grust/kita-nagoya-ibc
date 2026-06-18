"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck, RotateCcw, Search, Trash2 } from "lucide-react";
import { planStatusClass, planStatusLabel } from "@/lib/labels";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { formatCases } from "@/lib/units";
import { matchesQuery } from "@/lib/search";

type Plan = {
  id: string;
  date: string; // YYYY-MM-DD
  productCode: string;
  productName: string;
  casePackQty: number | null;
  workAreaName: string;
  plannedQuantity: number;
  unit: string;
  plannedPeopleCount: number;
  plannedStartTime: string;
  plannedEndTime: string | null;
  status: string;
  overtimeMinutes: number;
  hardShortage: boolean;
  unconfirmedDep: boolean;
};

type Filter = {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  workAreaId?: string;
};

export default function PlanListTable({
  plans,
  filter,
}: {
  plans: Plan[];
  filter: Filter;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 取得済みの予定をキーワード(管理コード・商品名・場所名)でさらに絞り込む。
  const visiblePlans = useMemo(
    () =>
      plans.filter((p) =>
        matchesQuery(query, [p.productCode, p.productName, p.workAreaName, planStatusLabel(p.status)]),
      ),
    [plans, query],
  );

  const allChecked = visiblePlans.length > 0 && visiblePlans.every((p) => selected.has(p.id));
  const filterActive = useMemo(
    () => !!(filter.dateFrom && filter.dateTo),
    [filter.dateFrom, filter.dateTo],
  );
  const visibleDraftCount = visiblePlans.filter((plan) => plan.status === "draft").length;
  const visibleConfirmedCount = visiblePlans.filter((plan) => plan.status === "confirmed").length;
  const visibleCompletedCount = visiblePlans.filter((plan) => plan.status === "completed").length;
  const visibleAlertCount = visiblePlans.filter(hasPlanAlert).length;
  const selectedPlans = useMemo(
    () => plans.filter((plan) => selected.has(plan.id)),
    [plans, selected],
  );
  const selectedDraftIds = selectedPlans.filter((plan) => plan.status === "draft").map((plan) => plan.id);
  const selectedAlertCount = selectedPlans.filter(hasPlanAlert).length;
  const hasQuery = query.trim().length > 0;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (allChecked) {
      const next = new Set(selected);
      for (const p of visiblePlans) next.delete(p.id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const p of visiblePlans) next.add(p.id);
      setSelected(next);
    }
  }

  function resetSearch() {
    setQuery("");
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`選択中の ${selected.size} 件を削除します。よろしいですか？`)) return;
    await runDelete({ ids: [...selected] });
  }

  async function confirmSelected() {
    if (selectedDraftIds.length === 0) {
      setError("確定できる下書き予定が選択されていません。");
      return;
    }
    if (!confirm(`選択中の下書き ${selectedDraftIds.length} 件を確定します。よろしいですか？`)) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath("/production-plans/bulk-confirm"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedDraftIds }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`確定に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage(`${json.confirmed ?? 0}件を確定しました。`);
    setSelected(new Set());
    router.refresh();
  }

  async function deleteFiltered() {
    if (!filterActive) {
      setError("期間 (開始日〜終了日) を指定してから削除してください。");
      return;
    }
    const conditions = [
      `${filter.dateFrom} 〜 ${filter.dateTo}`,
      filter.status ? `状態=${filter.status}` : null,
      filter.workAreaId ? "作業場所指定あり" : null,
    ]
      .filter(Boolean)
      .join(" / ");
    if (
      !confirm(
        `絞り込み条件 (${conditions}) に該当する生産予定をすべて削除します。よろしいですか？\n※ 確定済み日報がある予定は残ります。`,
      )
    ) {
      return;
    }
    await runDelete({ filter });
  }

  async function runDelete(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath("/production-plans/bulk-delete"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`削除に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage(json.message ?? `${json.deleted}件削除しました`);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <>
      <div className="panel list-control-panel">
        <div className="list-control-head">
          <strong>一覧操作</strong>
          <span className="muted">表示中 {visiblePlans.length} / {plans.length} 件</span>
          {hasQuery && <span className="badge info">表内検索あり</span>}
          {visibleAlertCount > 0 && (
            <span className="badge warn">
              <AlertTriangle size={13} aria-hidden="true" />
              確認 {visibleAlertCount} 件
            </span>
          )}
        </div>
        <div className="plan-list-summary-grid">
          <div className="metric">
            <span className="metric-label">下書き</span>
            <strong className="metric-value">{visibleDraftCount}件</strong>
          </div>
          <div className="metric">
            <span className="metric-label">確定</span>
            <strong className="metric-value">{visibleConfirmedCount}件</strong>
          </div>
          <div className="metric">
            <span className="metric-label">完了</span>
            <strong className="metric-value">{visibleCompletedCount}件</strong>
          </div>
          <div className="metric">
            <span className="metric-label">選択中</span>
            <strong className="metric-value">{selected.size}件</strong>
            <span className="metric-note">
              下書き {selectedDraftIds.length}件 / 確認 {selectedAlertCount}件
            </span>
          </div>
        </div>
        <div className="list-control-body">
          <div className="list-control-search">
            <input
              className="filter-search"
              type="search"
              placeholder="管理コード・商品名・場所・状態で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="生産予定を検索"
            />
            <button type="button" className="secondary" onClick={resetSearch} disabled={!query}>
              <RotateCcw size={15} aria-hidden="true" />
              条件クリア
            </button>
          </div>
          <div className="list-control-actions" aria-label="生産予定の一括操作">
            <button
              type="button"
              onClick={confirmSelected}
              disabled={busy || selectedDraftIds.length === 0}
            >
              <ClipboardCheck size={16} aria-hidden="true" />
              {busy ? "処理中..." : `下書きを確定 (${selectedDraftIds.length})`}
            </button>
            <button
              type="button"
              className="danger"
              onClick={deleteSelected}
              disabled={busy || selected.size === 0}
            >
              <Trash2 size={16} aria-hidden="true" />
              {busy ? "処理中..." : `選択削除 (${selected.size})`}
            </button>
            <button
              type="button"
              className="danger"
              onClick={deleteFiltered}
              disabled={busy || !filterActive}
              title={filterActive ? "" : "期間 (開始日〜終了日) を指定すると有効化されます"}
            >
              <Trash2 size={16} aria-hidden="true" />
              絞り込み結果を全削除
            </button>
          </div>
        </div>
        {selected.size > 0 && (
          <div className="plan-list-selection-bar">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>
              {selected.size}件を選択中。確定対象は下書き {selectedDraftIds.length}件です。
            </span>
          </div>
        )}
      </div>

      {error && <div className="alert danger">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      {visiblePlans.length === 0 ? (
        <div className="empty-state">
          <Search size={18} aria-hidden="true" />
          {plans.length === 0 ? "該当する予定はありません。" : "検索条件に一致する予定はありません。"}
        </div>
      ) : (
        <div className="table-frame standard-list-frame">
          <table className="standard-list-table production-plan-list-table">
            <colgroup>
              <col className="plan-select-col" />
              <col className="plan-date-col" />
              <col className="plan-product-col" />
              <col className="plan-work-area-col" />
              <col className="plan-quantity-col" />
              <col className="plan-people-col" />
              <col className="plan-time-col" />
              <col className="plan-time-col" />
              <col className="plan-status-col" />
              <col className="plan-alert-col" />
              <col className="plan-action-col" />
            </colgroup>
            <thead>
              <tr>
                <th className="select-cell">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="全選択"
                  />
                </th>
                <th>日付</th>
                <th>商品</th>
                <th>場所</th>
                <th>数量</th>
                <th>人数</th>
                <th>開始</th>
                <th>終了</th>
                <th>状態</th>
                <th>アラート</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visiblePlans.map((p) => (
                <tr key={p.id} className={selected.has(p.id) ? "row-selected" : ""}>
                  <td className="select-cell">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`${p.date} ${p.productName} を選択`}
                    />
                  </td>
                  <td>{p.date}</td>
                  <td className="wrap-cell product-name-cell">{p.productName}</td>
                  <td>{p.workAreaName}</td>
                  <td className="right">
                    {formatCases(p.plannedQuantity, { casePackQty: p.casePackQty, baseUnit: p.unit })}
                  </td>
                  <td className="right">{p.plannedPeopleCount}</td>
                  <td>{p.plannedStartTime}</td>
                  <td>{p.plannedEndTime ?? "—"}</td>
                  <td>
                    <span className={`badge ${planStatusClass(p.status)}`}>
                      {planStatusLabel(p.status)}
                    </span>
                  </td>
                  <td>
                    <span className="badge-list">
                      {p.overtimeMinutes > 0 && (
                        <span className="badge warn">17時超 {p.overtimeMinutes}分</span>
                      )}
                      {p.hardShortage && <span className="badge danger">不足</span>}
                      {p.unconfirmedDep && <span className="badge warn">未確定依存</span>}
                    </span>
                  </td>
                  <td className="action-cell">
                    <Link href={kitagoyaPath(`/production-plans/${p.id}`)}>開く</Link>
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

function hasPlanAlert(plan: Plan) {
  return plan.overtimeMinutes > 0 || plan.hardShortage || plan.unconfirmedDep;
}
