"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { ceilDisplayQuantity, formatCases } from "@/lib/units";

export type DayRequirementRow = {
  itemType: "raw_material" | "packaging";
  itemId: string;
  itemName: string;
  unit: string;
  plannedQuantity: number;
  unitPriceSnapshot: number;
  actualQuantity: number;
};

export type DayPlanRow = {
  planId: string;
  date: string;
  productCode: string;
  productName: string;
  unit: string;
  casePackQty: number | null;
  workAreaName: string;
  planStatus: string;
  plannedQuantity: number;
  plannedPeopleCount: number;
  plannedStartTime: string;
  plannedEndTime: string | null;
  reportStatus: string; // none | draft | confirmed | voided
  confirmedAt: string | null;
  actualQuantity: number;
  requirements: DayRequirementRow[];
};

function reportStatusBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case "confirmed":
      return { label: "確定", cls: "success" };
    case "draft":
      return { label: "下書き", cls: "info" };
    default:
      return { label: "未入力", cls: "muted" };
  }
}

function toNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type QtyMap = Record<string, string>;
type ConsMap = Record<string, Record<string, string>>;

export default function DailyReportDayEntry({ date, rows }: { date: string; rows: DayPlanRow[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<QtyMap>(() =>
    Object.fromEntries(rows.map((r) => [r.planId, String(r.actualQuantity)])),
  );
  const [cons, setCons] = useState<ConsMap>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.planId,
        Object.fromEntries(r.requirements.map((req) => [`${req.itemType}:${req.itemId}`, String(req.actualQuantity)])),
      ]),
    ),
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = useMemo(() => rows.filter((r) => r.reportStatus !== "confirmed"), [rows]);

  function toggle(planId: string) {
    setExpanded((prev) => ({ ...prev, [planId]: !prev[planId] }));
  }
  function setConsValue(planId: string, key: string, value: string) {
    setCons((prev) => ({ ...prev, [planId]: { ...prev[planId], [key]: value } }));
  }

  // 確定対象(=未確定の全行)から送信ペイロードを作る。実数量は表示数量に合わせて切り上げる。
  function buildEntries() {
    return pending.map((r) => ({
      planId: r.planId,
      actualQuantity: ceilDisplayQuantity(toNum(qty[r.planId])) ?? 0,
      consumptions: r.requirements.map((req) => ({
        itemType: req.itemType,
        itemId: req.itemId,
        actualQuantity: toNum(cons[r.planId]?.[`${req.itemType}:${req.itemId}`] ?? "0"),
        unitPriceSnapshot: req.unitPriceSnapshot,
      })),
    }));
  }

  async function submit(confirm: boolean) {
    const entries = buildEntries();
    if (entries.length === 0) return;
    if (confirm && !window.confirm(`当日分 ${entries.length} 件を確定し、実績を在庫・原価に反映します。よろしいですか？`))
      return;

    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(kitagoyaApiPath("/daily-reports/day-entry"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm, entries }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`処理に失敗しました: ${json.error ?? "unknown"}`);
      return;
    }
    const failed = json.failed?.length ?? 0;
    if (confirm) {
      setMessage(`確定 ${json.confirmed} 件${failed ? ` / 失敗 ${failed} 件` : ""}。在庫・原価を更新しました。`);
    } else {
      setMessage(`下書き保存 ${json.saved} 件${failed ? ` / 失敗 ${failed} 件` : ""}。`);
    }
    router.refresh();
  }

  if (rows.length === 0) {
    return <div className="empty-state">この日の生産予定はありません。生産予定を登録してください。</div>;
  }

  return (
    <section>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}

      <div className="table-frame daily-report-day-frame">
        <table className="daily-report-day-table">
          <thead>
            <tr>
              <th>商品</th>
              <th>場所</th>
              <th className="right">予定数量</th>
              <th className="right">実数量</th>
              <th className="right">過不足</th>
              <th>使用量</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const confirmed = r.reportStatus === "confirmed";
              const badge = reportStatusBadge(r.reportStatus);
              const actual = ceilDisplayQuantity(toNum(qty[r.planId])) ?? 0;
              const diff = actual - (ceilDisplayQuantity(r.plannedQuantity) ?? 0);
              const isOpen = !!expanded[r.planId];
              return (
                <Fragment key={r.planId}>
                  <tr className={`dr-plan-row${confirmed ? " row-muted" : ""}`}>
                    <td className="dr-product-cell" data-label="商品">
                      <div>{r.productName}</div>
                      <div className="subtext">{r.productCode}</div>
                    </td>
                    <td data-label="場所">{r.workAreaName}</td>
                    <td className="right" data-label="予定数量">
                      {formatCases(r.plannedQuantity, { casePackQty: r.casePackQty, baseUnit: r.unit })}
                    </td>
                    <td className="right dr-actual-cell" data-label="実数量">
                      {confirmed ? (
                        formatCases(r.actualQuantity, { casePackQty: r.casePackQty, baseUnit: r.unit })
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="dr-qty-input"
                          value={qty[r.planId] ?? ""}
                          onChange={(e) => setQty((prev) => ({ ...prev, [r.planId]: e.target.value }))}
                          aria-label={`${r.productName} 実数量`}
                        />
                      )}
                    </td>
                    <td className="right" data-label="過不足">
                      <span className={`badge ${diff === 0 ? "muted" : diff > 0 ? "success" : "danger"}`}>
                        {diff > 0 ? "+" : ""}
                        {formatCases(diff, { casePackQty: r.casePackQty, baseUnit: r.unit })}
                      </span>
                    </td>
                    <td data-label="使用量">
                      {r.requirements.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <button type="button" className="secondary dr-expand" onClick={() => toggle(r.planId)}>
                          {isOpen ? "▾ 閉じる" : `▸ 実使用量 (${r.requirements.length})`}
                        </button>
                      )}
                    </td>
                    <td data-label="状態">
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      {confirmed && r.confirmedAt && <div className="subtext">{r.confirmedAt}</div>}
                    </td>
                    <td className="right dr-action-cell" data-label="詳細">
                      <Link className="button-link secondary-link" href={kitagoyaPath(`/production-plans/${r.planId}`)}>
                        詳細
                      </Link>
                    </td>
                  </tr>
                  {isOpen && r.requirements.length > 0 && (
                    <tr className="dr-usage-row">
                      <td colSpan={8}>
                        <table className="dr-usage-table">
                          <thead>
                            <tr>
                              <th>区分</th>
                              <th>名称</th>
                              <th className="right">予定使用量</th>
                              <th className="right">実使用量</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.requirements.map((req) => {
                              const key = `${req.itemType}:${req.itemId}`;
                              return (
                                <tr key={key}>
                                  <td>{req.itemType === "raw_material" ? "原料" : "資材"}</td>
                                  <td>{req.itemName}</td>
                                  <td className="right">
                                    {req.plannedQuantity} {req.unit}
                                  </td>
                                  <td className="right">
                                    {confirmed ? (
                                      `${req.actualQuantity} ${req.unit}`
                                    ) : (
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.0001"
                                        className="dr-qty-input"
                                        value={cons[r.planId]?.[key] ?? "0"}
                                        onChange={(e) => setConsValue(r.planId, key, e.target.value)}
                                        aria-label={`${r.productName} ${req.itemName} 実使用量`}
                                      />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row form-actions dr-actions">
        <span className="muted dr-pending-count">未確定 {pending.length} 件</span>
        <div className="spacer" />
        <button type="button" className="secondary" onClick={() => submit(false)} disabled={busy || pending.length === 0}>
          {busy ? "処理中..." : "下書き保存"}
        </button>
        <button type="button" onClick={() => submit(true)} disabled={busy || pending.length === 0}>
          当日分をまとめて確定（在庫へ反映）
        </button>
      </div>
    </section>
  );
}
