"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, Plus, Search, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";

import type { ProductComboOption } from "@/components/ui/product-combobox";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import {
  DEFAULT_DAILY_REPORT_LABOR_HOURLY_RATE,
  computeProductDailyReportMetrics,
} from "@/lib/product-daily-report-calculations";
import { kitagoyaApiPath } from "@/lib/paths";
import { matchesQuery } from "@/lib/search";

export type StaffDailyReportBomMaterial = {
  materialId: string;
  materialName: string;
  unitPrice: number;
  quantityPerUnit: number;
};

export type StaffDailyReportProductOption = ProductComboOption & {
  capacityG: number | null;
  materialUnitCostPerKg: number;
  packageCostPerUnit: number;
  unitPrice: number;
  bomMaterials: StaffDailyReportBomMaterial[];
};

export type StaffDailyReportMaterialOption = {
  id: string;
  materialCode: string;
  name: string;
  standardUnitPrice: number;
  unit: string;
};

export type StaffDailyReportLaborRateOption = {
  id: string;
  code: string;
  name: string;
  hourlyRate: number;
};

export type StaffDailyReportPlanSuggestion = {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  plannedQuantity: number;
  unit: string;
  workAreaName: string;
  plannedStartTime: string;
  plannedEndTime: string | null;
  plannedPeopleCount: number;
};

export type StaffDailyReportStaffOption = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

type MaterialRow = {
  materialId: string;
  materialName: string;
  amount: string;
  unitMode: "g" | "kg";
};

type LabelPhoto = {
  name: string;
  type: string | null;
  dataUrl: string;
};

type FormState = {
  reportDate: string;
  submittedBy: string;
  productId: string;
  productName: string;
  expiryDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  workerCount: string;
  productionQty: string;
  materials: MaterialRow[];
  laborFeeRateId: string;
  note: string;
};

export default function StaffDailyReportForm({
  date,
  plans,
  staffOptions,
  products,
  materialOptions,
  laborRates,
}: {
  date: string;
  plans: StaffDailyReportPlanSuggestion[];
  staffOptions: StaffDailyReportStaffOption[];
  products: StaffDailyReportProductOption[];
  materialOptions: StaffDailyReportMaterialOption[];
  laborRates: StaffDailyReportLaborRateOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => emptyForm(date, laborRates));
  const [photos, setPhotos] = useState<LabelPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = usePreview(form, products, materialOptions, laborRates);
  const staffComboboxOptions = useMemo(
    () =>
      staffOptions.map((staff) => ({
        key: `${staff.id}-${staff.startTime}`,
        value: staff.name,
        label: staff.name,
        description: `${staff.startTime}-${staff.endTime}`,
        searchText: `${staff.name} ${staff.startTime} ${staff.endTime}`,
      })),
    [staffOptions],
  );

  function applyProduct(productId: string) {
    const product = products.find((p) => p.id === productId);
    setForm((prev) => ({
      ...prev,
      productId,
      productName: "",
      materials:
        product && product.bomMaterials.length > 0
          ? product.bomMaterials.map((b) => ({
              materialId: b.materialId,
              materialName: b.materialName,
              amount: "",
              unitMode: "g",
            }))
          : prev.materials.length > 0
            ? prev.materials
            : [emptyMaterialRow()],
    }));
  }

  function applyPlan(plan: StaffDailyReportPlanSuggestion) {
    applyProduct(plan.productId);
    setForm((prev) => ({
      ...prev,
      productId: plan.productId,
      productName: "",
      productionQty: String(plan.plannedQuantity),
      startTime: plan.plannedStartTime,
      endTime: plan.plannedEndTime ?? prev.endTime,
      workerCount: String(plan.plannedPeopleCount),
      note: prev.note ? prev.note : plan.workAreaName,
    }));
  }

  function updateMaterial(index: number, patch: Partial<MaterialRow>) {
    setForm((prev) => ({
      ...prev,
      materials: prev.materials.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  }

  function selectMaterial(index: number, materialId: string) {
    const option = materialOptions.find((m) => m.id === materialId);
    updateMaterial(index, { materialId, materialName: option?.name ?? "" });
  }

  async function onPhotoChange(files: FileList | null) {
    if (!files) return;
    setError(null);
    const remaining = Math.max(0, 4 - photos.length);
    const nextFiles = Array.from(files).slice(0, remaining);
    const resized = await Promise.all(nextFiles.map(resizePhoto));
    setPhotos((prev) => [...prev, ...resized].slice(0, 4));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.productId) {
      setError("商品を選択してください。");
      return;
    }
    if (form.materials.some((row) => amountToKg(row) > 0 && !row.materialId)) {
      setError("使用量を入力した原料を選択してください。");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    const payload = toPayload(form, photos);
    const res = await fetch(kitagoyaApiPath("/production-daily-reports"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(`提出できませんでした: ${json.error ?? "unknown"}`);
      return;
    }
    setMessage("日報を提出しました。管理者の確認待ちです。");
    setForm((prev) => ({ ...emptyForm(prev.reportDate, laborRates), submittedBy: prev.submittedBy }));
    setPhotos([]);
    router.refresh();
  }

  return (
    <form className="staff-report-form" onSubmit={submit}>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}

      <section className="panel staff-panel">
        <div className="staff-section-title">
          <span>1</span>
          <h2>今日の予定</h2>
        </div>
        <div className="staff-plan-grid">
          {plans.map((plan) => (
            <button key={plan.id} type="button" className="staff-plan-button" onClick={() => applyPlan(plan)}>
              <span className="staff-plan-product">{plan.productName}</span>
              <span className="staff-plan-meta">
                {plan.workAreaName} / {plan.plannedStartTime}〜{plan.plannedEndTime ?? "--:--"} /{" "}
                {formatNumber(plan.plannedQuantity)}
                {plan.unit}
              </span>
            </button>
          ))}
          {plans.length === 0 && <div className="empty-state">この日の予定はありません。商品を選んで入力してください。</div>}
        </div>
      </section>

      <section className="panel staff-panel">
        <div className="staff-section-title">
          <span>2</span>
          <h2>作った商品</h2>
        </div>
        <div className="staff-grid">
          <label>
            <span>日付</span>
            <input
              type="date"
              required
              value={form.reportDate}
              onChange={(e) => setFormValue(setForm, "reportDate", e.target.value)}
            />
          </label>
          <label>
            <span>入力者</span>
            <SearchableCombobox
              required
              value={form.submittedBy}
              options={staffComboboxOptions}
              emptyOptionLabel="シフトメンバーを選択"
              placeholder="名前で検索"
              onChange={(value) => setFormValue(setForm, "submittedBy", value)}
            />
          </label>
          <label className="staff-product-field">
            <span>商品</span>
            <SearchableDropdown
              value={form.productId}
              options={products}
              placeholder="商品を選択"
              searchPlaceholder="商品名・コードで検索"
              getLabel={(product) => `${product.productCode} ${product.displayName || product.officialName}`}
              getSubLabel={(product) => product.specification || product.brandName || ""}
              getSearchValues={(product) => [
                product.productCode,
                product.officialName,
                product.displayName ?? "",
                product.specification ?? "",
                product.brandName ?? "",
                ...(product.aliases ?? []),
              ]}
              onChange={applyProduct}
            />
          </label>
          <label>
            <span>生産数</span>
            <input
              type="number"
              required
              min={0}
              step="any"
              inputMode="decimal"
              value={form.productionQty}
              onChange={(e) => setFormValue(setForm, "productionQty", e.target.value)}
            />
          </label>
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
            <span>休憩(分)</span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
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
              inputMode="decimal"
              value={form.workerCount}
              onChange={(e) => setFormValue(setForm, "workerCount", e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="panel staff-panel">
        <div className="staff-section-title">
          <span>3</span>
          <h2>使った原料</h2>
        </div>
        <div className="staff-material-list">
          {form.materials.map((row, index) => (
            <div key={index} className="staff-material-row">
              <label>
                <span>原料</span>
                <SearchableDropdown
                  value={row.materialId}
                  options={materialOptions}
                  placeholder="原料を選択"
                  searchPlaceholder="原料名・コードで検索"
                  getLabel={(material) => `${material.materialCode} ${material.name}`}
                  getSearchValues={(material) => [material.materialCode, material.name]}
                  onChange={(materialId) => selectMaterial(index, materialId)}
                />
              </label>
              <label>
                <span>使用量</span>
                <input
                  type="number"
                  min={0}
                  step={row.unitMode === "g" ? 1 : 0.001}
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => updateMaterial(index, { amount: e.target.value })}
                  required
                />
              </label>
              <div className="staff-unit-toggle" role="group" aria-label="使用量の単位">
                <button
                  type="button"
                  className={row.unitMode === "g" ? "active" : undefined}
                  onClick={() => updateMaterial(index, { unitMode: "g" })}
                >
                  g
                </button>
                <button
                  type="button"
                  className={row.unitMode === "kg" ? "active" : undefined}
                  onClick={() => updateMaterial(index, { unitMode: "kg" })}
                >
                  kg
                </button>
              </div>
              <button
                type="button"
                className="danger staff-icon-button"
                onClick={() => setForm((prev) => ({ ...prev, materials: prev.materials.filter((_, i) => i !== index) }))}
                aria-label="原料を削除"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="secondary staff-add-button"
          onClick={() => setForm((prev) => ({ ...prev, materials: [...prev.materials, emptyMaterialRow()] }))}
        >
          <Plus className="h-5 w-5" />
          原料を追加
        </button>
      </section>

      <section className="panel staff-panel">
        <div className="staff-section-title">
          <span>4</span>
          <h2>ラベル写真</h2>
        </div>
        <label className="staff-photo-button">
          <Camera className="h-6 w-6" />
          <span>写真を撮る</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => onPhotoChange(e.target.files)}
          />
        </label>
        {photos.length > 0 && (
          <div className="staff-photo-grid">
            {photos.map((photo, index) => (
              <div key={`${photo.name}-${index}`} className="staff-photo-preview">
                <img src={photo.dataUrl} alt={`商品ラベル写真 ${index + 1}`} />
                <button
                  type="button"
                  className="danger staff-photo-remove"
                  onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="写真を削除"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel staff-panel">
        <div className="staff-section-title">
          <span>5</span>
          <h2>確認</h2>
        </div>
        <div className="stat-grid">
          <Metric label="使用原料合計" value={`${formatNumber(preview.totalMaterialKg)} kg`} />
          <Metric label="稼動時間" value={`${formatNumber(preview.operatingMinutes)} 分`} />
          <Metric label="1人1h生産数" value={formatNumber(preview.perHourQty)} />
          <Metric label="ロス率" value={formatPercent(preview.lossRate)} />
        </div>
        {preview.warnings.length > 0 && (
          <div className="alert warn">時間・人数・数量・単価のどれかに確認が必要です。入力値を見直してください。</div>
        )}
        <label className="staff-note-field">
          <span>備考</span>
          <textarea value={form.note} onChange={(e) => setFormValue(setForm, "note", e.target.value)} />
        </label>
        <div className="staff-submit-row">
          <button type="submit" className="staff-submit-button" disabled={busy}>
            {busy ? (
              "提出中..."
            ) : (
              <>
                <Send className="h-5 w-5" />
                日報を提出
              </>
            )}
          </button>
        </div>
      </section>
    </form>
  );
}

function usePreview(
  form: FormState,
  products: StaffDailyReportProductOption[],
  materialOptions: StaffDailyReportMaterialOption[],
  laborRates: StaffDailyReportLaborRateOption[],
) {
  return useMemo(() => {
    const product = products.find((p) => p.id === form.productId);
    const laborRate = laborRates.find((rate) => rate.id === form.laborFeeRateId);
    const priceById = new Map(materialOptions.map((option) => [option.id, option.standardUnitPrice]));
    const materials = form.materials.map((row) => ({
      usedKg: amountToKg(row),
      unitCostPerKg: row.materialId ? priceById.get(row.materialId) ?? 0 : 0,
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

function toPayload(form: FormState, photos: LabelPhoto[]) {
  return {
    reportDate: form.reportDate,
    productId: form.productId || null,
    productName: form.productId ? null : form.productName || null,
    expiryDate: form.expiryDate || null,
    startTime: form.startTime,
    endTime: form.endTime,
    breakMinutes: toNumber(form.breakMinutes),
    workerCount: toNumber(form.workerCount),
    productionQty: toNumber(form.productionQty),
    materials: form.materials
      .filter((row) => row.materialId || row.materialName.trim() || amountToKg(row) > 0)
      .map((row) => ({
        materialId: row.materialId || null,
        materialName: row.materialName.trim() || "(未設定)",
        usedKg: amountToKg(row),
      })),
    laborFeeRateId: form.laborFeeRateId || null,
    note: form.note || null,
    sourceType: "staff_entry",
    approvalStatus: "submitted",
    submittedBy: form.submittedBy || null,
    labelPhotos: photos,
  };
}

function emptyForm(date: string, laborRates: StaffDailyReportLaborRateOption[]): FormState {
  return {
    reportDate: date,
    submittedBy: "",
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

function emptyMaterialRow(): MaterialRow {
  return { materialId: "", materialName: "", amount: "", unitMode: "g" };
}

function amountToKg(row: MaterialRow) {
  const amount = toNumber(row.amount);
  return row.unitMode === "g" ? amount / 1000 : amount;
}

function SearchableDropdown<T extends { id: string }>({
  value,
  options,
  placeholder,
  searchPlaceholder,
  getLabel,
  getSubLabel,
  getSearchValues,
  onChange,
}: {
  value: string;
  options: T[];
  placeholder: string;
  searchPlaceholder: string;
  getLabel: (option: T) => string;
  getSubLabel?: (option: T) => string;
  getSearchValues: (option: T) => string[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.id === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim();
    const list = q ? options.filter((option) => matchesQuery(q, getSearchValues(option))) : options;
    const sliced = list.slice(0, 120);
    if (!selected || sliced.some((option) => option.id === selected.id)) return sliced;
    return [selected, ...sliced].slice(0, 120);
  }, [getSearchValues, options, query, selected]);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="staff-search-dropdown" ref={rootRef}>
      <button
        type="button"
        className={`staff-search-trigger ${selected ? "" : "is-placeholder"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected ? getLabel(selected) : placeholder}</span>
        <ChevronDown className="h-5 w-5" />
      </button>
      {open && (
        <div className="staff-search-menu">
          <div className="staff-search-menu-input">
            <Search className="h-5 w-5" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "Enter" && filtered[0]) {
                  event.preventDefault();
                  choose(filtered[0].id);
                }
              }}
            />
          </div>
          <div className="staff-search-options" role="listbox">
            {filtered.map((option) => {
              const subLabel = getSubLabel?.(option);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={option.id === value ? "is-selected" : undefined}
                  role="option"
                  aria-selected={option.id === value}
                  onClick={() => choose(option.id)}
                >
                  <span>{getLabel(option)}</span>
                  {subLabel && <small>{subLabel}</small>}
                </button>
              );
            })}
            {filtered.length === 0 && <div className="staff-search-empty">候補がありません</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function setFormValue(
  setter: React.Dispatch<React.SetStateAction<FormState>>,
  key: keyof FormState,
  value: string,
) {
  setter((prev) => ({ ...prev, [key]: value }));
}

async function resizePhoto(file: File): Promise<LabelPhoto> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSide = 1000;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { name: file.name, type: file.type || null, dataUrl };
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    name: file.name,
    type: file.type || "image/jpeg",
    dataUrl: canvas.toDataURL("image/jpeg", 0.72),
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">
        <Check className="h-4 w-4" />
        {label}
      </div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: 2 }) : "0";
}

function formatPercent(value: number) {
  return `${((Number.isFinite(value) ? value : 0) * 100).toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
  })}%`;
}
