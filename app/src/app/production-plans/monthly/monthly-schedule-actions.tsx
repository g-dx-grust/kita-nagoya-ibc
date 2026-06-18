"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

type CreatedPlan = {
  id: string;
  date: string;
  productCode: string;
  productName: string;
  workAreaName: string;
  startTime: string;
  endTime: string;
  quantity: number;
  unit: string;
  assignedCount: number;
  warnings: string[];
};

type SkippedPlan = {
  productId?: string;
  productCode: string;
  productName: string;
  preferredDate: string;
  remainingQuantity: number;
  unit: string;
  reason: string;
};

type GenerateResult = {
  createdCount: number;
  message: string;
  listUrl?: string;
  plans: CreatedPlan[];
  skipped: SkippedPlan[];
};

export default function MonthlyScheduleActions({
  dateFrom,
  dateTo,
  productionLeadDays,
  planningBasis,
  disabled,
}: {
  dateFrom: string;
  dateTo: string;
  productionLeadDays: number;
  planningBasis: "historical_actual" | "inventory_shortage";
  disabled: boolean;
}) {
  const router = useRouter();
  const [defaultStartTime, setDefaultStartTime] = useState("09:00");
  const [baselineEndTime, setBaselineEndTime] = useState("17:00");
  const [replaceExistingDrafts, setReplaceExistingDrafts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function generate() {
    if (disabled) return;
    if (
      replaceExistingDrafts &&
      !confirm(`対象期間 ${dateFrom} 〜 ${dateTo} の仮予定を削除してから月間予定を作成します。よろしいですか？`)
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch(kitagoyaApiPath("/product-planning/monthly-schedule"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateFrom,
        dateTo,
        productionLeadDays,
        planningBasis,
        defaultStartTime,
        baselineEndTime,
        replaceExistingDrafts,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`月間予定の生成に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    setResult(json);
    router.refresh();
  }

  const planWarningCount = result?.plans.reduce((sum, plan) => sum + plan.warnings.length, 0) ?? 0;
  const hasResultWarnings = result ? planWarningCount > 0 || result.skipped.length > 0 : false;
  const assignedPeopleTotal = result?.plans.reduce((sum, plan) => sum + plan.assignedCount, 0) ?? 0;
  const resultStatusLabel = !result
    ? disabled
      ? "候補なし"
      : "生成待ち"
    : hasResultWarnings
      ? "確認が必要"
      : result.createdCount > 0
        ? "生成済み"
        : "生成なし";
  const resultStatusClass = !result
    ? disabled
      ? "muted"
      : "info"
    : hasResultWarnings
      ? "warn"
      : result.createdCount > 0
        ? "success"
        : "muted";

  return (
    <div className="panel monthly-schedule-action-panel">
      <div className="monthly-schedule-command">
        <div className="monthly-schedule-command-title">
          <span className={`badge ${resultStatusClass}`}>{resultStatusLabel}</span>
          <strong>生成設定</strong>
          <span className="subtext">
            {dateFrom} - {dateTo}
          </span>
        </div>
        <div className="monthly-schedule-checks">
          <span className="badge info">開始 {defaultStartTime}</span>
          <span className="badge info">基準終了 {baselineEndTime}</span>
          <span className="badge muted">{productionLeadDays}日前に作成</span>
          <span className={`badge ${replaceExistingDrafts ? "warn" : "muted"}`}>
            {replaceExistingDrafts ? "仮予定を置換" : "既存仮予定を残す"}
          </span>
        </div>
        <div className="monthly-schedule-command-actions">
          <button type="button" onClick={generate} disabled={busy || disabled}>
            {busy ? "生成中..." : "シフト連動で仮予定生成"}
          </button>
        </div>
      </div>

      <div className="monthly-schedule-fields">
        <label>
          <span>標準開始</span>
          <input type="time" value={defaultStartTime} onChange={(e) => setDefaultStartTime(e.target.value)} />
        </label>
        <label>
          <span>基準終了</span>
          <input type="time" value={baselineEndTime} onChange={(e) => setBaselineEndTime(e.target.value)} />
        </label>
        <label className="inline-check field-row">
          <input
            type="checkbox"
            checked={replaceExistingDrafts}
            onChange={(e) => setReplaceExistingDrafts(e.target.checked)}
          />
          <span>対象期間の仮予定を置き換える</span>
        </label>
      </div>
      {disabled && <div className="alert info monthly-schedule-inline-alert">生成候補がないため、仮予定生成は不要です。</div>}

      {error && <div className="alert danger">{error}</div>}
      {result && (
        <div className="after-table monthly-schedule-result">
          <div className="monthly-schedule-result-summary">
            <span className={`badge ${resultStatusClass}`}>{resultStatusLabel}</span>
            <span className="badge success">作成 {result.createdCount}</span>
            <span className={`badge ${planWarningCount > 0 ? "warn" : "success"}`}>警告 {planWarningCount}</span>
            <span className={`badge ${result.skipped.length > 0 ? "warn" : "success"}`}>未配置 {result.skipped.length}</span>
            <span className="badge info">配置人数 {assignedPeopleTotal}</span>
          </div>
          <div className={hasResultWarnings ? "alert warn" : result.createdCount > 0 ? "alert success" : "alert info"}>
            {result.message}
          </div>
          {hasResultWarnings && (
            <div className="alert warn">
              警告 {planWarningCount} 件 / 未配置 {result.skipped.length} 件。部屋変更、日付前倒し、残業、数量調整を確認してください。
            </div>
          )}
          {result.plans.length > 0 && (
            <>
              <div className="table-frame monthly-schedule-created-frame">
                <table className="monthly-schedule-created-table">
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>商品</th>
                      <th>作業場所</th>
                      <th>時間</th>
                      <th>数量</th>
                      <th>配置人数</th>
                      <th>注意</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.plans.map((plan) => (
                      <tr key={plan.id} className={plan.warnings.length > 0 ? "row-needs-action" : ""}>
                        <td data-label="日付">{plan.date}</td>
                        <td data-label="商品">
                          <div className="monthly-schedule-product-cell">
                            <strong>{plan.productCode} · {plan.productName}</strong>
                            {plan.warnings.length > 0 && <span className="badge warn">注意 {plan.warnings.length}</span>}
                          </div>
                        </td>
                        <td data-label="作業場所">{plan.workAreaName}</td>
                        <td data-label="時間">
                          {plan.startTime} - {plan.endTime}
                        </td>
                        <td className="right" data-label="数量">
                          {plan.quantity.toLocaleString()} {plan.unit}
                        </td>
                        <td className="right" data-label="配置人数">{plan.assignedCount}</td>
                        <td data-label="注意">
                          <WarningBadges warnings={plan.warnings} />
                        </td>
                        <td data-label="操作">
                          <Link href={kitagoyaPath(`/production-plans/${plan.id}`)}>開く</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.listUrl && (
                <div className="form-actions">
                  <Link className="button-link" href={kitagoyaPath(result.listUrl)}>
                    作成した下書きを一覧で確認
                  </Link>
                </div>
              )}
            </>
          )}
          {result.skipped.length > 0 && (
            <>
              <div className="alert warn">
                シフト・部屋・生産能力に収まらない候補が {result.skipped.length} 件あります。
              </div>
              <div className="table-frame monthly-schedule-skipped-frame">
                <table className="monthly-schedule-skipped-table">
                  <thead>
                    <tr>
                      <th>希望日</th>
                      <th>商品</th>
                      <th>未配置数量</th>
                      <th>理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skipped.map((row, index) => (
                      <tr key={`${row.productCode}:${row.preferredDate}:${index}`} className="row-needs-action">
                        <td data-label="希望日">{row.preferredDate}</td>
                        <td data-label="商品">
                          <div className="monthly-schedule-product-cell">
                            <strong>{row.productCode} · {row.productName}</strong>
                            <span className="badge warn">未配置</span>
                          </div>
                        </td>
                        <td className="right" data-label="未配置数量">
                          {row.remainingQuantity.toLocaleString()} {row.unit}
                        </td>
                        <td data-label="理由">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WarningBadges({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return <span className="badge success">なし</span>;
  return (
    <div className="stacked-list">
      {warnings.map((warning, index) => (
        <span key={`${warning}:${index}`} className={`badge ${warningBadgeClass(warning)}`}>
          {warning}
        </span>
      ))}
    </div>
  );
}

function warningBadgeClass(warning: string) {
  return /作りきれず|不足|未配置|配置できるスタッフがいません|未登録/.test(warning) ? "danger" : "warn";
}
