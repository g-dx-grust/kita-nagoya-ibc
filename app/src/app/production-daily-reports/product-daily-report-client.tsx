"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { CheckCircle, Image as ImageIcon, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import SectionTabs from "@/components/ui/section-tabs";
import ProductCombobox, { type ProductComboOption } from "@/components/ui/product-combobox";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import {
  DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE,
  computeProductDailyReportMetrics,
  type ProductDailyReportSummaryRow,
} from "@/lib/product-daily-report-calculations";
import { kitagoyaApiPath } from "@/lib/paths";

export type ProductDailyReportBomMaterial = {
  materialId: string;
  materialName: string;
  unitPrice: number;
  quantityPerUnit: number;
};

export type ProductDailyReportProductOption = ProductComboOption & {
  capacityG: number | null;
  materialUnitCostPerKg: number;
  packageCostPerUnit: number;
  unitPrice: number;
  bomMaterials: ProductDailyReportBomMaterial[];
};

export type ProductDailyReportMaterialOption = {
  id: string;
  materialCode: string;
  name: string;
  standardUnitPrice: number;
  unit: string;
};

export type ProductDailyReportLaborRateOption = {
  id: string;
  code: string;
  name: string;
  hourlyRate: number;
};

export type MonthlyLaborFeeRow = {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  perBagLaborFee: number;
  avgPerHourQty: number;
  sampleCount: number;
  status: string;
  appliedAt: string | null;
  currentUnitPrice: number;
};

export type ProductDailyReportRowMaterial = {
  materialId: string | null;
  materialName: string;
  usedKg: number;
  unitPriceSnapshot: number;
};

export type ProductDailyReportLabelPhoto = {
  name: string;
  type: string | null;
  dataUrl: string;
};

export type ProductDailyReportRow = {
  id: string;
  reportDate: string;
  productId: string | null;
  productName: string;
  productCode: string | null;
  displayName: string | null;
  officialName: string | null;
  productMatchStatus: string;
  expiryDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workerCount: number;
  productionQty: number;
  materialUsedKg: number;
  materials: ProductDailyReportRowMaterial[];
  laborFeeRateId: string | null;
  laborFeeRateName: string | null;
  note: string | null;
  approvalStatus: string;
  inventoryReflected: boolean;
  submittedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  labelPhotos: ProductDailyReportLabelPhoto[];
  capacityGSnapshot: number | null;
  materialUnitCostSnapshot: number;
  packageCostPerUnitSnapshot: number;
  unitPriceSnapshot: number;
  laborHourlyRateSnapshot: number;
  operatingMinutes: number;
  totalOperatingMinutes: number;
  perHourQty: number;
  perUnitTimeMinutes: number;
  laborFeePerUnit: number;
  bagWeightG: number;
  lossRate: number;
  materialCost: number;
  packageCost: number;
  totalCost: number;
  sales: number;
  profitRate: number;
  calculationWarnings: string[];
};

type MaterialFormRow = { materialId: string; materialName: string; usedKg: string };

type EntryFormState = {
  reportDate: string;
  productId: string;
  productName: string;
  expiryDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  workerCount: string;
  productionQty: string;
  materials: MaterialFormRow[];
  laborFeeRateId: string;
  note: string;
};

export default function ProductDailyReportClient({
  selectedMonth,
  rows,
  summaries,
  total,
  products,
  materialOptions,
  laborRates,
  monthlyLaborFees,
}: {
  selectedMonth: string;
  rows: ProductDailyReportRow[];
  summaries: ProductDailyReportSummaryRow[];
  total: ProductDailyReportSummaryRow;
  products: ProductDailyReportProductOption[];
  materialOptions: ProductDailyReportMaterialOption[];
  laborRates: ProductDailyReportLaborRateOption[];
  monthlyLaborFees: MonthlyLaborFeeRow[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<EntryFormState>(() => emptyForm(selectedMonth, laborRates));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EntryFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alerts = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.approvalStatus === "submitted" ||
          row.approvalStatus === "rejected" ||
          row.productMatchStatus === "unmatched" ||
          row.productMatchStatus === "fuzzy" ||
          row.unitPriceSnapshot <= 0 ||
          row.calculationWarnings.length > 0,
    ),
    [rows],
  );
  const pendingApproval = useMemo(() => rows.filter((row) => row.approvalStatus === "submitted"), [rows]);
  const preview = usePreview(form, products, materialOptions, laborRates);
  const selectedProduct = useMemo(() => products.find((p) => p.id === form.productId) ?? null, [form.productId, products]);

  function onSelectProduct(setter: Dispatch<SetStateAction<EntryFormState>>, productId: string) {
    const product = products.find((p) => p.id === productId);
    setter((prev) => ({
      ...prev,
      productId,
      productName: "",
      // 商品選択でBOM原料を自動展開(使用量は空欄、現場が実績kgを入力)。
      materials:
        product && product.bomMaterials.length > 0
          ? product.bomMaterials.map((b) => ({ materialId: b.materialId, materialName: b.materialName, usedKg: "" }))
          : prev.materials.length > 0
            ? prev.materials
            : [emptyMaterialRow()],
    }));
  }

  async function createEntry(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath("/production-daily-reports"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(form)),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`保存できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("日報を保存し、在庫へ反映しました。");
    setForm((prev) => ({ ...emptyForm(selectedMonth, laborRates), reportDate: prev.reportDate }));
    router.refresh();
  }

  async function saveEdit(id: string) {
    if (!editForm) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/production-daily-reports/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(editForm)),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`更新できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setEditingId(null);
    setEditForm(null);
    setMessage("日報を更新しました。");
    router.refresh();
  }

  async function deleteRow(row: ProductDailyReportRow) {
    if (!window.confirm(`${row.reportDate} ${displayProductName(row)} を削除します。在庫差引も戻します。よろしいですか？`)) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/production-daily-reports/${row.id}`), { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`削除できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("日報を削除しました。");
    router.refresh();
  }

  async function approveRow(row: ProductDailyReportRow) {
    if (
      !window.confirm(
        `${row.reportDate} ${displayProductName(row)} を計上し、在庫・月次実績・請求対象へ反映します。よろしいですか？`,
      )
    )
      return;
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch(kitagoyaApiPath(`/production-daily-reports/${row.id}/approve`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "管理者" }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`計上できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage(`${row.reportDate} ${displayProductName(row)} を計上しました。`);
    router.refresh();
  }

  return (
    <>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}

      <div className="panel">
        <div className="stat-grid">
          <Metric label="日報行数" value={`${rows.length} 件`} />
          <Metric label="未計上" value={`${pendingApproval.length} 件`} />
          <Metric label="生産数合計" value={formatNumber(total.totalProductionQty)} />
          <Metric label="売値合計" value={formatYen(total.totalSales)} />
          <Metric label="要確認" value={`${alerts.length} 件`} />
        </div>
      </div>

      {pendingApproval.length > 0 && (
        <div className="alert warn">
          スタッフ提出の日報が {pendingApproval.length} 件あります。内容を確認し、問題なければ「計上」を押してください。
        </div>
      )}

      {alerts.length > 0 && (
        <div className="alert warn">
          マスタ照合・売値・原価の確認が必要な日報があります（{alerts.length}件）。
        </div>
      )}

      <SectionTabs
        ariaLabel="日報の表示切り替え"
        initialTabId="review"
        items={[
          {
            id: "review",
            label: "日報確認",
            count: pendingApproval.length > 0 ? `未計上 ${pendingApproval.length}` : rows.length,
            content: (
              <section>
                <div className="daily-report-heading">
                  <h2>月別製造日報</h2>
                  <div className="column-legend" aria-label="列種別">
                    <span className="column-kind input">入力</span>
                    <span className="column-kind auto">自動計算</span>
                  </div>
                </div>
                <div className="table-frame daily-report-frame">
                  <table className="daily-report-table">
                    <thead>
                      <tr>
                        <th className="sticky-date">日付 <ColumnKind kind="input" /></th>
                        <th className="sticky-product">商品名 <ColumnKind kind="input" /></th>
                        <th className="right">入り数(g) <ColumnKind kind="auto" /></th>
                        <th>商品名合算 <ColumnKind kind="auto" /></th>
                        <th>賞味期限 <ColumnKind kind="input" /></th>
                        <th>開始時間 <ColumnKind kind="input" /></th>
                        <th>終了時間 <ColumnKind kind="input" /></th>
                        <th>休憩時間 <ColumnKind kind="input" /></th>
                        <th className="right">稼動時間（M） <ColumnKind kind="auto" /></th>
                        <th className="right">作業人数 <ColumnKind kind="input" /></th>
                        <th className="right">生産数 <ColumnKind kind="input" /></th>
                        <th className="right">使用原料（kg） <ColumnKind kind="input" /></th>
                        <th className="right">合計稼動時間（M） <ColumnKind kind="auto" /></th>
                        <th className="right">1人当たりの1hの生産数(個) <ColumnKind kind="auto" /></th>
                        <th className="right">1個の生産時間（M） <ColumnKind kind="auto" /></th>
                        <th className="right">1袋の手間賃（円） <ColumnKind kind="auto" /></th>
                        <th className="right">1袋の量（g） <ColumnKind kind="auto" /></th>
                        <th className="right">ロス率（％） <ColumnKind kind="auto" /></th>
                        <th className="right">原料原価 <ColumnKind kind="auto" /></th>
                        <th className="right">資材原価 <ColumnKind kind="auto" /></th>
                        <th className="right">合計原価 <ColumnKind kind="auto" /></th>
                        <th className="right">売値 <ColumnKind kind="auto" /></th>
                        <th className="right">利率 <ColumnKind kind="auto" /></th>
                        <th>備考 <ColumnKind kind="input" /></th>
                        <th>確認</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) =>
                        editingId === row.id && editForm ? (
                          <EditRow
                            key={row.id}
                            form={editForm}
                            products={products}
                            materialOptions={materialOptions}
                            laborRates={laborRates}
                            busy={busy}
                            onChange={(key, value) => setFormValue(setEditForm, key, value)}
                            onChangeMaterials={(next) =>
                              setEditForm((prev) => (prev ? { ...prev, materials: next } : prev))
                            }
                            onSave={() => saveEdit(row.id)}
                            onCancel={() => {
                              setEditingId(null);
                              setEditForm(null);
                            }}
                          />
                        ) : (
                          <tr key={row.id}>
                            <td className="sticky-date">{row.reportDate}</td>
                            <td className="sticky-product product-name-cell">
                              <div>{row.productName}</div>
                              {row.productCode && <div className="subtext">{row.productCode}</div>}
                            </td>
                            <td className="right">{formatOptionalNumber(row.capacityGSnapshot)}</td>
                            <td>
                              <div>{consolidatedProductName(row)}</div>
                              {row.productMatchStatus === "unmatched" && <div className="subtext">商品未照合</div>}
                            </td>
                            <td>{row.expiryDate || "—"}</td>
                            <td>{row.startTime}</td>
                            <td>{row.endTime}</td>
                            <td>{formatDuration(row.breakMinutes)}</td>
                            <td className="right">{formatNumber(row.operatingMinutes, 0)}</td>
                            <td className="right">{formatNumber(row.workerCount)}</td>
                            <td className="right">{formatNumber(row.productionQty)}</td>
                            <td className="right material-summary-cell">
                              <div>{formatNumber(row.materialUsedKg)} kg</div>
                              {row.materials.length > 0 && (
                                <div className="subtext">
                                  {row.materials
                                    .map((m) => `${m.materialName} ${formatNumber(m.usedKg)}kg`)
                                    .join(" / ")}
                                </div>
                              )}
                            </td>
                            <td className="right">{formatNumber(row.totalOperatingMinutes, 0)}</td>
                            <td className="right">{formatNumber(row.perHourQty)}</td>
                            <td className="right">{formatNumber(row.perUnitTimeMinutes)}</td>
                            <td className="right">{formatYen(row.laborFeePerUnit)}</td>
                            <td className="right">{formatNumber(row.bagWeightG)}</td>
                            <td className="right">{formatPercent(row.lossRate)}</td>
                            <td className="right">{formatYen(row.materialCost)}</td>
                            <td className="right">{formatYen(row.packageCost)}</td>
                            <td className="right">{formatYen(row.totalCost)}</td>
                            <td className="right">{formatYen(row.sales)}</td>
                            <td className="right">{formatPercent(row.profitRate)}</td>
                            <td className="note-cell">{row.note || "—"}</td>
                            <td>
                              <StatusBadges row={row} />
                              <SubmissionInfo row={row} />
                            </td>
                            <td>
                              <div className="table-actions">
                                {row.approvalStatus === "submitted" && (
                                  <button type="button" className="gap-2" onClick={() => approveRow(row)} disabled={busy}>
                                    <CheckCircle className="h-4 w-4" />
                                    計上
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="secondary gap-2"
                                  onClick={() => {
                                    setEditingId(row.id);
                                    setEditForm(formFromRow(row));
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                  編集
                                </button>
                                <button type="button" className="danger gap-2" onClick={() => deleteRow(row)} disabled={busy}>
                                  <Trash2 className="h-4 w-4" />
                                  削除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ),
                      )}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={26} className="muted">
                            対象月の日報はありません。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ),
          },
          {
            id: "entry",
            label: "日報入力",
            count: "手入力",
            content: (
              <section className="panel">
                <h2>日報入力</h2>
                <form onSubmit={createEntry}>
                  <div className="daily-report-form-layout">
                    <div className="entry-card">
                      <h3>入力項目</h3>
                      <div className="grid grid-4">
                        <label>
                          <span>日付</span>
                          <input
                            type="date"
                            required
                            value={form.reportDate}
                            onChange={(e) => setFormValue(setForm, "reportDate", e.target.value)}
                          />
                        </label>
                        <label className="min-w-[260px]">
                          <span>商品名</span>
                          <ProductCombobox
                            products={products}
                            value={form.productId}
                            onChange={(value) => onSelectProduct(setForm, value)}
                            emptyOptionLabel="商品名を直接入力"
                          />
                        </label>
                        {!form.productId && (
                          <label>
                            <span>商品名（直接入力）</span>
                            <input
                              type="text"
                              value={form.productName}
                              onChange={(e) => setFormValue(setForm, "productName", e.target.value)}
                            />
                          </label>
                        )}
                        <label>
                          <span>賞味期限</span>
                          <input
                            type="date"
                            value={form.expiryDate}
                            onChange={(e) => setFormValue(setForm, "expiryDate", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>開始時間</span>
                          <input
                            type="time"
                            required
                            value={form.startTime}
                            onChange={(e) => setFormValue(setForm, "startTime", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>終了時間</span>
                          <input
                            type="time"
                            required
                            value={form.endTime}
                            onChange={(e) => setFormValue(setForm, "endTime", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>休憩時間（M）</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={form.breakMinutes}
                            onChange={(e) => setFormValue(setForm, "breakMinutes", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>作業人数</span>
                          <input
                            type="number"
                            required
                            min={0.1}
                            step={0.1}
                            value={form.workerCount}
                            onChange={(e) => setFormValue(setForm, "workerCount", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>生産数</span>
                          <input
                            type="number"
                            required
                            min={0}
                            step="any"
                            value={form.productionQty}
                            onChange={(e) => setFormValue(setForm, "productionQty", e.target.value)}
                          />
                        </label>
                        <label>
                          <span>手間賃区分</span>
                          <select
                            value={form.laborFeeRateId}
                            onChange={(e) => setFormValue(setForm, "laborFeeRateId", e.target.value)}
                          >
                            {laborRates.length === 0 && <option value="">標準</option>}
                            {laborRates.map((rate) => (
                              <option key={rate.id} value={rate.id}>
                                {rate.name}（{formatYen(rate.hourlyRate)}/時）
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="min-w-[220px]">
                          <span>備考</span>
                          <input
                            type="text"
                            value={form.note}
                            onChange={(e) => setFormValue(setForm, "note", e.target.value)}
                          />
                        </label>
                      </div>

                      <MaterialsEditor
                        materials={form.materials}
                        materialOptions={materialOptions}
                        onChange={(next) => setForm((prev) => ({ ...prev, materials: next }))}
                      />
                    </div>

                    <div className="entry-card calculated">
                      <h3>自動計算</h3>
                      <div className="stat-grid compact-metrics">
                        <Metric label="入り数(g)" value={formatOptionalNumber(selectedProduct?.capacityG ?? null)} />
                        <Metric label="商品名合算" value={selectedProductDisplayName(selectedProduct)} />
                        <Metric label="稼動時間（M）" value={formatNumber(preview.operatingMinutes, 0)} />
                        <Metric label="合計稼動時間（M）" value={formatNumber(preview.totalOperatingMinutes, 0)} />
                        <Metric label="1人当たりの1hの生産数(個)" value={formatNumber(preview.perHourQty)} />
                        <Metric label="1個の生産時間（M）" value={formatNumber(preview.perUnitTimeMinutes)} />
                        <Metric label="1袋の手間賃（円）" value={formatYen(preview.laborFeePerUnit)} />
                        <Metric label="1袋の量（g）" value={formatNumber(preview.bagWeightG)} />
                        <Metric label="ロス率（％）" value={formatPercent(preview.lossRate)} />
                        <Metric label="原料原価" value={formatYen(preview.materialCost)} />
                        <Metric label="資材原価" value={formatYen(preview.packageCost)} />
                        <Metric label="合計原価" value={formatYen(preview.totalCost)} />
                        <Metric label="売値" value={formatYen(preview.sales)} />
                        <Metric label="利率" value={formatPercent(preview.profitRate)} />
                      </div>
                    </div>
                  </div>

                  <div className="row form-actions mt-4">
                    <div className="spacer" />
                    <button type="submit" className="gap-2" disabled={busy}>
                      <Plus className="h-4 w-4" />
                      保存
                    </button>
                  </div>
                </form>
              </section>
            ),
          },
          {
            id: "labor-fee",
            label: "月次手間賃",
            count: monthlyLaborFees.length,
            content: <MonthlyLaborFeePanel selectedMonth={selectedMonth} rows={monthlyLaborFees} />,
          },
          {
            id: "summary",
            label: "商品別集計",
            count: summaries.length,
            content: (
              <section>
                <h2>月次 商品別集計</h2>
                <div className="table-frame">
                  <table>
                    <thead>
                      <tr>
                        <th>商品</th>
                        <th className="right">製造回数</th>
                        <th className="right">生産数合計</th>
                        <th className="right">使用原料合計(kg)</th>
                        <th className="right">売値合計</th>
                        <th className="right">平均利率</th>
                        <th className="right">平均ロス率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((summary) => (
                        <SummaryRow key={summary.productKey} summary={summary} />
                      ))}
                      <SummaryRow summary={total} total />
                      {summaries.length === 0 && (
                        <tr>
                          <td colSpan={7} className="muted">
                            対象月の日報はありません。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ),
          },
        ]}
      />
    </>
  );
}

function MaterialsEditor({
  materials,
  materialOptions,
  onChange,
  compact,
}: {
  materials: MaterialFormRow[];
  materialOptions: ProductDailyReportMaterialOption[];
  onChange: (rows: MaterialFormRow[]) => void;
  compact?: boolean;
}) {
  const materialComboboxOptions = useMemo(
    () =>
      materialOptions.map((option) => ({
        value: option.id,
        code: option.materialCode,
        label: option.name,
        description: `${option.unit}・標準単価 ${formatYen(option.standardUnitPrice)}`,
      })),
    [materialOptions],
  );

  function update(index: number, patch: Partial<MaterialFormRow>) {
    onChange(materials.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }
  function selectMaterial(index: number, materialId: string) {
    const opt = materialOptions.find((o) => o.id === materialId);
    update(index, { materialId, materialName: opt?.name ?? "" });
  }
  return (
    <div className={compact ? "materials-editor compact" : "materials-editor"}>
      {!compact && (
        <div className="row" style={{ alignItems: "center" }}>
          <strong>使用原料（複数可）</strong>
          <span className="subtext">原料を選び、使用量(kg)を入力してください。確定で在庫から差引きます。</span>
        </div>
      )}
      <div className="table-frame">
        <table>
          <thead>
            <tr>
              <th>原料</th>
              <th className="right" style={{ width: 140 }}>使用量(kg)</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m, index) => (
              <tr key={index}>
                <td>
                  <SearchableCombobox
                    value={m.materialId}
                    options={materialComboboxOptions}
                    emptyOptionLabel="（原料を選択）"
                    placeholder="原料番号・名称で検索"
                    onChange={(materialId) => selectMaterial(index, materialId)}
                  />
                </td>
                <td className="right">
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={m.usedKg}
                    onChange={(e) => update(index, { usedKg: e.target.value })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onChange(materials.filter((_, i) => i !== index))}
                    aria-label="原料を削除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {materials.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">原料が未設定です。「原料を追加」で行を追加してください。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className="secondary gap-2 mt-2" onClick={() => onChange([...materials, emptyMaterialRow()])}>
        <Plus className="h-4 w-4" />
        原料を追加
      </button>
    </div>
  );
}

function MonthlyLaborFeePanel({ selectedMonth, rows }: { selectedMonth: string; rows: MonthlyLaborFeeRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function recompute() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch(kitagoyaApiPath("/product-monthly-labor-fees"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearMonth: selectedMonth }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(`再計算できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMsg(`${selectedMonth} の月次手間賃を再計算しました。`);
    router.refresh();
  }

  async function apply(row: MonthlyLaborFeeRow) {
    if (
      !window.confirm(
        `${row.productName} の1袋手間賃を ${formatYen(row.perBagLaborFee)} で売値(翌月適用)に反映します。よろしいですか？`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    const res = await fetch(kitagoyaApiPath(`/product-monthly-labor-fees/${row.id}/apply`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(`反映できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMsg(`${row.productName} の売値を更新しました。`);
    router.refresh();
  }

  return (
    <section className="panel">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>月次手間賃更新（{selectedMonth}）</h2>
        <div className="spacer" />
        <button type="button" className="secondary gap-2" onClick={recompute} disabled={busy}>
          <RefreshCw className="h-4 w-4" />
          対象月の蓄積から再計算
        </button>
      </div>
      <p className="section-note">
        蓄積した日報の実績(1袋手間賃)の中央値を商品別に算出します。「反映」で売値（手間賃単価）を翌月から更新します。
      </p>
      {msg && <div className="alert success">{msg}</div>}
      {err && <div className="alert danger">{err}</div>}
      <div className="table-frame">
        <table>
          <thead>
            <tr>
              <th>商品</th>
              <th className="right">件数</th>
              <th className="right">平均1人1h</th>
              <th className="right">新1袋手間賃(中央値)</th>
              <th className="right">現売値</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div>{row.productName}</div>
                  <div className="subtext">{row.productCode}</div>
                </td>
                <td className="right">{row.sampleCount}</td>
                <td className="right">{formatNumber(row.avgPerHourQty)}</td>
                <td className="right">{formatYen(row.perBagLaborFee)}</td>
                <td className="right">{formatYen(row.currentUnitPrice)}</td>
                <td>
                  {row.status === "applied" ? (
                    <span className="badge success">反映済 {row.appliedAt ?? ""}</span>
                  ) : (
                    <span className="badge warn">未反映</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="gap-2"
                    onClick={() => apply(row)}
                    disabled={busy || !(row.perBagLaborFee > 0)}
                  >
                    <Save className="h-4 w-4" />
                    反映
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  対象月の月次手間賃はありません。「再計算」で蓄積日報から算出してください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditRow({
  form,
  products,
  materialOptions,
  laborRates,
  busy,
  onChange,
  onChangeMaterials,
  onSave,
  onCancel,
}: {
  form: EntryFormState;
  products: ProductDailyReportProductOption[];
  materialOptions: ProductDailyReportMaterialOption[];
  laborRates: ProductDailyReportLaborRateOption[];
  busy: boolean;
  onChange: (key: keyof EntryFormState, value: string) => void;
  onChangeMaterials: (rows: MaterialFormRow[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <tr>
      <td className="sticky-date">
        <input type="date" value={form.reportDate} onChange={(e) => onChange("reportDate", e.target.value)} />
      </td>
      <td className="sticky-product min-w-[260px]">
        <ProductCombobox
          products={products}
          value={form.productId}
          onChange={(value) => {
            onChange("productId", value);
            onChange("productName", "");
          }}
          emptyOptionLabel="商品名を直接入力"
        />
        {!form.productId && (
          <input
            className="mt-2"
            type="text"
            value={form.productName}
            onChange={(e) => onChange("productName", e.target.value)}
          />
        )}
      </td>
      <td className="right muted">自動</td>
      <td className="muted">照合後</td>
      <td>
        <input type="date" value={form.expiryDate} onChange={(e) => onChange("expiryDate", e.target.value)} />
      </td>
      <td>
        <input type="time" value={form.startTime} onChange={(e) => onChange("startTime", e.target.value)} />
      </td>
      <td>
        <input type="time" value={form.endTime} onChange={(e) => onChange("endTime", e.target.value)} />
      </td>
      <td>
        <input type="number" min={0} step={1} value={form.breakMinutes} onChange={(e) => onChange("breakMinutes", e.target.value)} />
      </td>
      <td className="right muted">自動</td>
      <td className="right">
        <input type="number" min={0.1} step={0.1} value={form.workerCount} onChange={(e) => onChange("workerCount", e.target.value)} />
      </td>
      <td className="right">
        <input type="number" min={0} step="any" value={form.productionQty} onChange={(e) => onChange("productionQty", e.target.value)} />
      </td>
      <td>
        <MaterialsEditor materials={form.materials} materialOptions={materialOptions} onChange={onChangeMaterials} compact />
      </td>
      <td colSpan={11}>
        <div className="edit-auto-note">
          <span className="column-kind auto">自動計算</span>
          <select value={form.laborFeeRateId} onChange={(e) => onChange("laborFeeRateId", e.target.value)}>
            {laborRates.length === 0 && <option value="">標準</option>}
            {laborRates.map((rate) => (
              <option key={rate.id} value={rate.id}>
                {rate.name}（{formatYen(rate.hourlyRate)}/時）
              </option>
            ))}
          </select>
        </div>
      </td>
      <td>
        <input type="text" value={form.note} onChange={(e) => onChange("note", e.target.value)} />
      </td>
      <td>
        <span className="muted">状態保持</span>
      </td>
      <td>
        <div className="table-actions">
          <button type="button" className="gap-2" onClick={onSave} disabled={busy}>
            <Save className="h-4 w-4" />
            保存
          </button>
          <button type="button" className="secondary gap-2" onClick={onCancel} disabled={busy}>
            <X className="h-4 w-4" />
            取消
          </button>
        </div>
      </td>
    </tr>
  );
}

function SummaryRow({ summary, total: isTotal }: { summary: ProductDailyReportSummaryRow; total?: boolean }) {
  return (
    <tr className={isTotal ? "row-total" : undefined}>
      <td>{summary.productName}</td>
      <td className="right">{summary.manufacturingCount}</td>
      <td className="right">{formatNumber(summary.totalProductionQty)}</td>
      <td className="right">{formatNumber(summary.totalMaterialUsedKg)}</td>
      <td className="right">{formatYen(summary.totalSales)}</td>
      <td className="right">{formatPercent(summary.averageProfitRate)}</td>
      <td className="right">{formatPercent(summary.averageLossRate)}</td>
    </tr>
  );
}

function SubmissionInfo({ row }: { row: ProductDailyReportRow }) {
  return (
    <div className="submission-info">
      {row.submittedBy && <div className="subtext">入力者: {row.submittedBy}</div>}
      {row.approvedAt && <div className="subtext">計上: {row.approvedAt}</div>}
      {row.labelPhotos.length > 0 ? (
        <div className="label-photo-strip">
          {row.labelPhotos.map((photo, index) => (
            <a key={`${photo.name}-${index}`} href={photo.dataUrl} target="_blank" rel="noreferrer" title={photo.name}>
              <img src={photo.dataUrl} alt={`商品ラベル写真 ${index + 1}`} />
            </a>
          ))}
        </div>
      ) : (
        <span className="badge muted">
          <ImageIcon className="h-3 w-3" />
          写真なし
        </span>
      )}
    </div>
  );
}

function StatusBadges({ row }: { row: ProductDailyReportRow }) {
  return (
    <>
      {row.approvalStatus === "submitted" && <span className="badge warn">未計上</span>}
      {row.approvalStatus === "approved" && <span className="badge success">計上済</span>}
      {row.approvalStatus === "rejected" && <span className="badge danger">差戻し</span>}
      {row.approvalStatus === "approved" && !row.inventoryReflected && <span className="badge info">履歴・在庫未反映</span>}
      {row.productMatchStatus === "unmatched" && <span className="badge danger">商品未照合</span>}
      {row.productMatchStatus === "fuzzy" && <span className="badge warn">曖昧照合</span>}
      {row.productMatchStatus !== "unmatched" && row.productMatchStatus !== "fuzzy" && (
        <span className="badge success">照合済</span>
      )}
      {row.unitPriceSnapshot <= 0 && <span className="badge danger">売値未設定</span>}
      {row.calculationWarnings.includes("missing_material_unit_cost") && <span className="badge warn">原料単価未設定</span>}
      {row.calculationWarnings.includes("missing_package_cost") && <span className="badge warn">資材単価未設定</span>}
      {row.calculationWarnings.includes("missing_capacity_g") && <span className="badge warn">入り数未設定</span>}
    </>
  );
}

function ColumnKind({ kind }: { kind: "input" | "auto" }) {
  return <span className={`column-kind ${kind}`}>{kind === "input" ? "入力" : "自動"}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function usePreview(
  form: EntryFormState,
  products: ProductDailyReportProductOption[],
  materialOptions: ProductDailyReportMaterialOption[],
  laborRates: ProductDailyReportLaborRateOption[],
) {
  return useMemo(() => {
    const product = products.find((p) => p.id === form.productId);
    const laborRate = laborRates.find((rate) => rate.id === form.laborFeeRateId);
    const priceById = new Map(materialOptions.map((o) => [o.id, o.standardUnitPrice]));
    const materials = form.materials.map((m) => ({
      usedKg: toNumber(m.usedKg),
      unitCostPerKg: m.materialId ? priceById.get(m.materialId) ?? 0 : 0,
    }));
    return computeProductDailyReportMetrics({
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: toNumber(form.breakMinutes),
      workerCount: toNumber(form.workerCount),
      productionQty: toNumber(form.productionQty),
      materials,
      capacityG: product?.capacityG,
      packageCostPerUnit: product?.packageCostPerUnit,
      unitPrice: product?.unitPrice,
      laborHourlyRate: laborRate?.hourlyRate ?? DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE,
    });
  }, [form, products, materialOptions, laborRates]);
}

function emptyMaterialRow(): MaterialFormRow {
  return { materialId: "", materialName: "", usedKg: "" };
}

function emptyForm(selectedMonth: string, laborRates: ProductDailyReportLaborRateOption[]): EntryFormState {
  const today = new Date().toISOString().slice(0, 10);
  const reportDate = today.startsWith(selectedMonth) ? today : `${selectedMonth}-01`;
  return {
    reportDate,
    productId: "",
    productName: "",
    expiryDate: "",
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: "60",
    workerCount: "1",
    productionQty: "",
    materials: [emptyMaterialRow()],
    laborFeeRateId: laborRates.find((rate) => rate.code === "standard_1200")?.id ?? laborRates[0]?.id ?? "",
    note: "",
  };
}

function formFromRow(row: ProductDailyReportRow): EntryFormState {
  return {
    reportDate: row.reportDate,
    productId: row.productId ?? "",
    productName: row.productId ? "" : row.productName,
    expiryDate: row.expiryDate,
    startTime: row.startTime,
    endTime: row.endTime,
    breakMinutes: String(row.breakMinutes),
    workerCount: String(row.workerCount),
    productionQty: String(row.productionQty),
    materials:
      row.materials.length > 0
        ? row.materials.map((m) => ({
            materialId: m.materialId ?? "",
            materialName: m.materialName,
            usedKg: String(m.usedKg),
          }))
        : [emptyMaterialRow()],
    laborFeeRateId: row.laborFeeRateId ?? "",
    note: row.note ?? "",
  };
}

function toPayload(form: EntryFormState) {
  const materials = form.materials
    .filter((m) => m.materialId || m.materialName.trim() || toNumber(m.usedKg) > 0)
    .map((m) => ({
      materialId: m.materialId || null,
      materialName: m.materialName.trim() || "(未設定)",
      usedKg: toNumber(m.usedKg),
    }));
  return {
    reportDate: form.reportDate,
    productId: form.productId || null,
    productName: form.productName || null,
    expiryDate: form.expiryDate || null,
    startTime: form.startTime,
    endTime: form.endTime,
    breakMinutes: toNumber(form.breakMinutes),
    workerCount: toNumber(form.workerCount),
    productionQty: toNumber(form.productionQty),
    materials,
    laborFeeRateId: form.laborFeeRateId || null,
    note: form.note || null,
    sourceType: "manual",
  };
}

function setFormValue<T extends EntryFormState | null>(
  setter: Dispatch<SetStateAction<T>>,
  key: keyof EntryFormState,
  value: string,
) {
  setter((prev: T) => (prev ? ({ ...prev, [key]: value } as T) : prev));
}

function displayProductName(row: ProductDailyReportRow) {
  return row.displayName || row.officialName || row.productName;
}

function consolidatedProductName(row: ProductDailyReportRow) {
  return row.productId ? displayProductName(row) : "未照合";
}

function selectedProductDisplayName(product: ProductDailyReportProductOption | null) {
  return product ? product.displayName || product.officialName : "—";
}

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatOptionalNumber(value: number | null | undefined, maximumFractionDigits = 2) {
  return value == null ? "—" : formatNumber(value, maximumFractionDigits);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits }) : "0";
}

function formatYen(value: number) {
  return `¥${formatNumber(value)}`;
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  return `${hours}:${String(rest).padStart(2, "0")}`;
}

function formatPercent(value: number) {
  return `${((Number.isFinite(value) ? value : 0) * 100).toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
  })}%`;
}
