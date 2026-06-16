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

  return (
    <div className="panel">
      <div className="row">
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
        <button type="button" onClick={generate} disabled={busy || disabled}>
          {busy ? "生成中..." : "シフト連動で仮予定生成"}
        </button>
      </div>

      {error && <div className="alert danger">{error}</div>}
      {result && (
        <div className="after-table">
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
              <table>
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
                    <tr key={plan.id}>
                      <td>{plan.date}</td>
                      <td>
                        {plan.productCode} · {plan.productName}
                      </td>
                      <td>{plan.workAreaName}</td>
                      <td>
                        {plan.startTime} - {plan.endTime}
                      </td>
                      <td className="right">
                        {plan.quantity.toLocaleString()} {plan.unit}
                      </td>
                      <td className="right">{plan.assignedCount}</td>
                      <td>
                        <WarningBadges warnings={plan.warnings} />
                      </td>
                      <td>
                        <Link href={kitagoyaPath(`/production-plans/${plan.id}`)}>開く</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <table>
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
                    <tr key={`${row.productCode}:${row.preferredDate}:${index}`}>
                      <td>{row.preferredDate}</td>
                      <td>
                        {row.productCode} · {row.productName}
                      </td>
                      <td className="right">
                        {row.remainingQuantity.toLocaleString()} {row.unit}
                      </td>
                      <td>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
