"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import { forecastMethodLabel, productionTypeLabel } from "@/lib/labels";
import { kitagoyaApiPath } from "@/lib/paths";

type Product = {
  id: string;
  productCode: string;
  officialName: string;
  displayName: string | null;
  productionType: string;
  forecastMethod: string;
  safetyStockQuantity: number;
  standardProductionLotSize: number;
  rawMaterialLossToleranceRate: number;
  schedulePriority: number | null;
  unit: string;
  packSizeG: number | null;
  packCount: number | null;
  casePackQty: number | null;
  sourceSystem: string | null;
  sourceProductKey: string | null;
  sourceSheetName: string | null;
  sourceRowNumber: number | null;
  specification: string | null;
  packCountExpression: string | null;
  bundleCount: string | null;
  brandName: string | null;
  bagTrayName: string | null;
  cartonName: string | null;
  accessoryName: string | null;
  sealCount: number | null;
  classificationNote: string | null;
  rawMaterialNote: string | null;
  defaultWorkAreaId: string | null;
  validFrom: string | null;
  validTo: string | null;
  billingEnabled: boolean;
  usedAtKitagoya: boolean;
  active: boolean;
  aliases: string[];
  note: string | null;
};
type BomRow = {
  itemType: "raw_material" | "packaging";
  itemId: string;
  quantityPerUnit: number;
  unit: string;
  lossRate: number;
};
type CapacityRow = {
  id?: string;
  workAreaId: string;
  unitsPerPersonHour: number;
  standardPeople: number;
  standardBreakMinutes: number;
  candidatePriority: number | null;
};
type BillingPriceRow = {
  id?: string;
  workAreaId: string;
  workAreaNameSnapshot: string | null;
  unitPrice: number;
  unit: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  billingTarget: boolean;
};
type ItemRef = { id: string; code: string; name: string; unit: string };

export default function ProductEditor({
  product,
  bom,
  capacities,
  billingPrices,
  workAreas,
  materials,
  packaging,
}: {
  product: Product;
  bom: BomRow[];
  capacities: CapacityRow[];
  billingPrices: BillingPriceRow[];
  workAreas: { id: string; name: string }[];
  materials: ItemRef[];
  packaging: ItemRef[];
}) {
  const router = useRouter();
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingBom, setSavingBom] = useState(false);
  const [savingCap, setSavingCap] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [productCode, setProductCode] = useState(product.productCode);
  const [officialName, setOfficialName] = useState(product.officialName);
  const [note, setNote] = useState(product.note ?? "");
  const [displayName, setDisplayName] = useState(product.displayName ?? "");
  const [specification, setSpecification] = useState(product.specification ?? "");
  const [brandName, setBrandName] = useState(product.brandName ?? "");
  const [packCountExpression, setPackCountExpression] = useState(product.packCountExpression ?? "");
  const [bundleCount, setBundleCount] = useState(product.bundleCount ?? "");
  const [bagTrayName, setBagTrayName] = useState(product.bagTrayName ?? "");
  const [cartonName, setCartonName] = useState(product.cartonName ?? "");
  const [accessoryName, setAccessoryName] = useState(product.accessoryName ?? "");
  const [sealCount, setSealCount] = useState(product.sealCount != null ? String(product.sealCount) : "");
  const [classificationNote, setClassificationNote] = useState(product.classificationNote ?? "");
  const [rawMaterialNote, setRawMaterialNote] = useState(product.rawMaterialNote ?? "");
  const [productionType, setProductionType] = useState(product.productionType);
  const [forecastMethod, setForecastMethod] = useState(product.forecastMethod);
  const [safetyStockQuantity, setSafetyStockQuantity] = useState(product.safetyStockQuantity);
  const [standardProductionLotSize, setStandardProductionLotSize] = useState(product.standardProductionLotSize);
  const [rawMaterialLossTolerancePercent, setRawMaterialLossTolerancePercent] = useState(
    String(Math.round(product.rawMaterialLossToleranceRate * 1000) / 10),
  );
  const [schedulePriority, setSchedulePriority] = useState(
    product.schedulePriority != null ? String(product.schedulePriority) : "",
  );
  const [unit, setUnit] = useState(product.unit);
  const [packSizeG, setPackSizeG] = useState(product.packSizeG != null ? String(product.packSizeG) : "");
  const [packCount, setPackCount] = useState(product.packCount != null ? String(product.packCount) : "");
  const [casePackQty, setCasePackQty] = useState(
    product.casePackQty != null ? String(product.casePackQty) : "",
  );
  const [defaultWorkAreaId, setDefaultWorkAreaId] = useState(product.defaultWorkAreaId ?? "");
  const [validFrom, setValidFrom] = useState(product.validFrom ?? "");
  const [validTo, setValidTo] = useState(product.validTo ?? "");
  const [billingEnabled, setBillingEnabled] = useState(product.billingEnabled);
  const [usedAtKitagoya, setUsedAtKitagoya] = useState(product.usedAtKitagoya);
  const [active, setActive] = useState(product.active);
  const [aliases, setAliases] = useState(product.aliases.join(", "));

  const [bomRows, setBomRows] = useState<BomRow[]>(bom);
  const [capRows, setCapRows] = useState<CapacityRow[]>(capacities);
  const [billingRows, setBillingRows] = useState<BillingPriceRow[]>(billingPrices);
  const materialComboboxOptions = useMemo(() => itemRefComboboxOptions(materials), [materials]);
  const packagingComboboxOptions = useMemo(() => itemRefComboboxOptions(packaging), [packaging]);
  const workAreaOptions = useMemo(
    () => workAreas.map((workArea) => ({ value: workArea.id, label: workArea.name })),
    [workAreas],
  );
  const defaultWorkAreaName = useMemo(
    () => workAreas.find((workArea) => workArea.id === defaultWorkAreaId)?.name ?? null,
    [workAreas, defaultWorkAreaId],
  );
  const setupSummary = useMemo(() => {
    const invalidBomCount = bomRows.filter((row) => !isValidBomRow(row)).length;
    const invalidCapacityCount = capRows.filter((row) => !isValidCapacityRow(row)).length;
    const validBillingCount = billingRows.filter(isValidBillingRow).length;
    const missingDefaultWorkArea = usedAtKitagoya && !defaultWorkAreaId;
    const missingCasePack = usedAtKitagoya && !casePackQty && !packCount;
    const missingBom = bomRows.length === 0;
    const missingCapacity = capRows.length === 0;
    const missingBilling = billingEnabled && validBillingCount === 0;
    const needsActionCount = [
      missingDefaultWorkArea,
      missingCasePack,
      missingBom,
      invalidBomCount > 0,
      missingCapacity,
      invalidCapacityCount > 0,
      missingBilling,
    ].filter(Boolean).length;
    return {
      invalidBomCount,
      invalidCapacityCount,
      validBillingCount,
      missingDefaultWorkArea,
      missingCasePack,
      missingBom,
      missingCapacity,
      missingBilling,
      needsActionCount,
    };
  }, [
    billingEnabled,
    billingRows,
    bomRows,
    capRows,
    casePackQty,
    defaultWorkAreaId,
    packCount,
    usedAtKitagoya,
  ]);
  const setupActions = useMemo(() => {
    const actions: Array<{ label: string; detail: string; href: string; tone: "warn" | "success" }> = [];
    if (setupSummary.missingDefaultWorkArea || setupSummary.missingCasePack) {
      actions.push({
        label: "基本情報",
        detail: [
          setupSummary.missingDefaultWorkArea ? "標準場所" : null,
          setupSummary.missingCasePack ? "ケース入数" : null,
        ].filter(Boolean).join("・"),
        href: "#product-basic",
        tone: "warn",
      });
    }
    if (setupSummary.missingBom || setupSummary.invalidBomCount > 0) {
      actions.push({
        label: "BOM",
        detail: setupSummary.missingBom ? "未設定" : `要確認 ${setupSummary.invalidBomCount}`,
        href: "#product-bom",
        tone: "warn",
      });
    }
    if (setupSummary.missingCapacity || setupSummary.invalidCapacityCount > 0) {
      actions.push({
        label: "生産能力",
        detail: setupSummary.missingCapacity ? "未設定" : `要確認 ${setupSummary.invalidCapacityCount}`,
        href: "#product-capacity",
        tone: "warn",
      });
    }
    if (setupSummary.missingBilling) {
      actions.push({
        label: "手間賃単価",
        detail: "請求対象の単価なし",
        href: "#product-billing",
        tone: "warn",
      });
    }
    return actions.length > 0
      ? actions
      : [{ label: "内容確認", detail: "主要設定OK", href: "#product-basic", tone: "success" as const }];
  }, [setupSummary]);
  const nextSetupAction = setupActions[0];

  async function saveMeta() {
    setSavingMeta(true);
    setMsg(null);
    const resolvedPackCount = packCount ? Number(packCount) : casePackQty ? Number(casePackQty) : null;
    const resolvedCasePackQty = casePackQty ? Number(casePackQty) : resolvedPackCount;
    const res = await fetch(kitagoyaApiPath(`/products/${product.id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode: productCode.trim(),
        officialName,
        displayName: displayName || null,
        specification: specification || null,
        brandName: brandName || null,
        usedAtKitagoya,
        productionType,
        forecastMethod,
        safetyStockQuantity,
        standardProductionLotSize,
        rawMaterialLossToleranceRate: Number(rawMaterialLossTolerancePercent || "5") / 100,
        schedulePriority: schedulePriority.trim() === "" ? null : Number(schedulePriority),
        unit,
        packSizeG: packSizeG ? Number(packSizeG) : null,
        packCount: resolvedPackCount,
        casePackQty: resolvedCasePackQty,
        packCountExpression: packCountExpression || null,
        bundleCount: bundleCount || null,
        bagTrayName: bagTrayName || null,
        cartonName: cartonName || null,
        accessoryName: accessoryName || null,
        sealCount: sealCount ? Number(sealCount) : null,
        classificationNote: classificationNote || null,
        rawMaterialNote: rawMaterialNote || null,
        defaultWorkAreaId: defaultWorkAreaId || null,
        validFrom: validFrom || null,
        validTo: validTo || null,
        billingEnabled,
        active,
        note: note || null,
        aliases: aliases.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
      }),
    });
    setSavingMeta(false);
    if (res.ok) {
      setMsg("商品情報を更新しました");
      router.refresh();
    } else {
      setMsg("保存に失敗しました");
    }
  }

  async function saveBom() {
    setSavingBom(true);
    const res = await fetch(kitagoyaApiPath(`/products/${product.id}/bom`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: bomRows }),
    });
    setSavingBom(false);
    if (res.ok) {
      setMsg("BOMを保存しました");
      router.refresh();
    } else setMsg("BOM保存に失敗");
  }

  async function saveCapacity(row: CapacityRow, index: number) {
    setSavingCap(true);
    const res = await fetch(kitagoyaApiPath("/capacities"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, ...row, standardBreakMinutes: 0 }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingCap(false);
    if (res.ok) {
      setCapRows((current) => current.map((item, i) => (i === index ? { ...row, id: json.id ?? row.id } : item)));
      setMsg(`生産能力を保存しました`);
      router.refresh();
    } else setMsg("生産能力保存に失敗");
  }

  async function deleteCapacity(row: CapacityRow, index: number) {
    if (!row.id) {
      setCapRows(capRows.filter((_, i) => i !== index));
      return;
    }
    if (!confirm("この生産能力を削除します。よろしいですか？")) return;
    setSavingCap(true);
    const res = await fetch(kitagoyaApiPath(`/capacities/${row.id}`), { method: "DELETE" });
    setSavingCap(false);
    if (res.ok) {
      setCapRows(capRows.filter((_, i) => i !== index));
      setMsg("生産能力を削除しました");
      router.refresh();
    } else {
      setMsg("生産能力削除に失敗");
    }
  }

  async function saveBillingPrice(row: BillingPriceRow, index: number) {
    if (!(row.unitPrice >= 0) || !row.unit.trim() || !row.effectiveFrom) {
      setMsg("手間賃単価・単位・適用開始日を確認してください");
      return;
    }
    const workAreaNameSnapshot = row.workAreaId
      ? workAreas.find((workArea) => workArea.id === row.workAreaId)?.name ?? row.workAreaNameSnapshot
      : null;
    setSavingBilling(true);
    const payload = {
      productId: product.id,
      workAreaId: row.workAreaId || null,
      workAreaNameSnapshot,
      unitPrice: row.unitPrice,
      unit: row.unit,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo || null,
      billingTarget: row.billingTarget,
      note: null,
    };
    const res = await fetch(
      row.id ? kitagoyaApiPath(`/billing-prices/${row.id}`) : kitagoyaApiPath("/billing-prices"),
      {
        method: row.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json = await res.json().catch(() => ({}));
    setSavingBilling(false);
    if (res.ok) {
      setBillingRows((current) =>
        current.map((item, i) => (i === index ? { ...row, workAreaNameSnapshot, id: json.id ?? row.id } : item)),
      );
      setMsg("手間賃単価を保存しました");
      router.refresh();
    } else {
      setMsg("手間賃単価の保存に失敗しました");
    }
  }

  async function deleteBillingPrice(row: BillingPriceRow, index: number) {
    if (!row.id) {
      setBillingRows(billingRows.filter((_, i) => i !== index));
      return;
    }
    if (!confirm("この手間賃単価を削除します。よろしいですか？")) return;
    setSavingBilling(true);
    const res = await fetch(kitagoyaApiPath(`/billing-prices/${row.id}`), { method: "DELETE" });
    setSavingBilling(false);
    if (res.ok) {
      setBillingRows(billingRows.filter((_, i) => i !== index));
      setMsg("手間賃単価を削除しました");
      router.refresh();
    } else {
      setMsg("手間賃単価の削除に失敗しました");
    }
  }

  return (
    <>
      {msg && <div className="alert info">{msg}</div>}

      <div className="panel product-editor-overview">
        <div className="product-editor-status-list">
          <span className={`badge ${active ? "success" : "muted"}`}>{active ? "有効" : "無効"}</span>
          <span className={`badge ${usedAtKitagoya ? "success" : "muted"}`}>
            {usedAtKitagoya ? "北名古屋使用" : "北名古屋対象外"}
          </span>
          <span className="badge info">{productionTypeLabel(productionType)}</span>
          <span className="badge info">{forecastMethodLabel(forecastMethod)}</span>
          <span className={`badge ${defaultWorkAreaId ? "success" : "warn"}`}>
            標準場所 {defaultWorkAreaName ?? "未設定"}
          </span>
          <span className={`badge ${billingEnabled ? "success" : "muted"}`}>
            {billingEnabled ? "請求対象" : "請求対象外"}
          </span>
          <span className={`badge ${bomRows.length > 0 ? "success" : "warn"}`}>BOM {bomRows.length}件</span>
          <span className={`badge ${capRows.length > 0 ? "success" : "warn"}`}>能力 {capRows.length}件</span>
          <span className={`badge ${billingRows.length > 0 ? "success" : "muted"}`}>
            手間賃 {billingRows.length}件
          </span>
        </div>
        <div className="product-editor-command">
          <div className="product-editor-command-title">
            <span className={`badge ${setupSummary.needsActionCount > 0 ? "warn" : "success"}`}>
              {setupSummary.needsActionCount > 0 ? "確認が必要" : "整備済み"}
            </span>
            <strong>商品セットアップ</strong>
            <span className="subtext">{setupSummary.needsActionCount}項目</span>
            <a className="product-editor-next" href={nextSetupAction.href}>
              次: {nextSetupAction.label}
            </a>
          </div>
          <div className="product-editor-checks">
            <a
              className={`badge ${setupSummary.missingDefaultWorkArea ? "warn" : "success"}`}
              href="#product-basic"
            >
              標準場所 {setupSummary.missingDefaultWorkArea ? "未設定" : "設定済み"}
            </a>
            <a className={`badge ${setupSummary.missingCasePack ? "warn" : "success"}`} href="#product-basic">
              ケース入数 {setupSummary.missingCasePack ? "なし" : "設定済み"}
            </a>
            <a
              className={`badge ${setupSummary.missingBom || setupSummary.invalidBomCount > 0 ? "warn" : "success"}`}
              href="#product-bom"
            >
              BOM {setupSummary.missingBom ? "未設定" : `要確認 ${setupSummary.invalidBomCount}`}
            </a>
            <a
              className={`badge ${
                setupSummary.missingCapacity || setupSummary.invalidCapacityCount > 0 ? "warn" : "success"
              }`}
              href="#product-capacity"
            >
              能力 {setupSummary.missingCapacity ? "未設定" : `要確認 ${setupSummary.invalidCapacityCount}`}
            </a>
            <a className={`badge ${setupSummary.missingBilling ? "warn" : "success"}`} href="#product-billing">
              手間賃 {billingEnabled ? `${setupSummary.validBillingCount}件` : "対象外"}
            </a>
          </div>
          <div className="product-editor-next-row" aria-label="商品セットアップの次アクション">
            {setupActions.slice(0, 4).map((action) => (
              <a key={`${action.label}:${action.detail}`} className={`badge ${action.tone}`} href={action.href}>
                {action.label}: {action.detail}
              </a>
            ))}
          </div>
        </div>
        <nav className="product-editor-nav" aria-label="商品編集セクション">
          <a href="#product-basic">基本情報</a>
          <a href="#product-billing">手間賃単価</a>
          <a href="#product-bom">BOM</a>
          <a href="#product-capacity">生産能力</a>
        </nav>
      </div>

      <section className="product-editor-section" id="product-basic">
        <h2>基本情報</h2>
        <div className="panel">
          <div className="product-editor-basic-grid">
          <label>
            <span className="inline-action">
              管理コード *
              <HelpTooltip text="商品分類表にコード列がないため、システム内の管理コードとして扱います。" />
            </span>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} required />
          </label>
          <label>
            <span>正式名称</span>
            <input value={officialName} onChange={(e) => setOfficialName(e.target.value)} />
          </label>
          <label>
            <span>表示名</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>
            <span>規格</span>
            <input value={specification} onChange={(e) => setSpecification(e.target.value)} />
          </label>
          <label>
            <span>ブランド</span>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </label>
          <label>
            <span>区分</span>
            <select value={productionType} onChange={(e) => setProductionType(e.target.value)}>
              <option value="stock">在庫生産</option>
              <option value="make_to_order">受注生産</option>
              <option value="both">両方</option>
            </select>
          </label>
          <label>
            <span>予測方式</span>
            <select value={forecastMethod} onChange={(e) => setForecastMethod(e.target.value)}>
              <option value="MANUAL">手動入力</option>
              <option value="YEAR_RATIO">前年比予測</option>
              <option value="SALES_INPUT">営業予測</option>
              <option value="NONE">予測なし</option>
            </select>
          </label>
          <label>
            <span>単位</span>
            <input className="unit-field" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
          <label>
            <span>入り数g</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={packSizeG}
              onChange={(e) => setPackSizeG(e.target.value)}
            />
          </label>
          <label>
            <span className="inline-action">
              入数(c/s)
              <HelpTooltip text="元Excelの「入り数(c/s)」です。" />
            </span>
            <input
              type="number"
              min={0}
              step="1"
              value={packCount}
              placeholder="例: 24"
              onChange={(e) => setPackCount(e.target.value)}
            />
          </label>
          <label>
            <span>入数表記</span>
            <input value={packCountExpression} onChange={(e) => setPackCountExpression(e.target.value)} />
          </label>
          <label>
            <span className="inline-action">
              ケース入数（{unit || "袋"}/ケース）
              <HelpTooltip text={`1ケースに入る${unit || "袋"}数です。空なら入数(c/s)を使います。`} />
            </span>
            <input
              type="number"
              min={0}
              step="1"
              value={casePackQty}
              placeholder="未設定なら袋表示"
              onChange={(e) => setCasePackQty(e.target.value)}
            />
          </label>
          <label>
            <span>結束</span>
            <input value={bundleCount} onChange={(e) => setBundleCount(e.target.value)} />
          </label>
          <label>
            <span>袋、トレー</span>
            <input value={bagTrayName} onChange={(e) => setBagTrayName(e.target.value)} />
          </label>
          <label>
            <span>ダンボール</span>
            <input value={cartonName} onChange={(e) => setCartonName(e.target.value)} />
          </label>
          <label>
            <span>備品</span>
            <input value={accessoryName} onChange={(e) => setAccessoryName(e.target.value)} />
          </label>
          <label>
            <span>シール数</span>
            <input type="number" min={0} step="0.1" value={sealCount} onChange={(e) => setSealCount(e.target.value)} />
          </label>
          <label>
            <span>安全在庫</span>
            <input
              type="number"
              min={0}
              step={1}
              value={safetyStockQuantity}
              onChange={(e) => setSafetyStockQuantity(Number(e.target.value))}
            />
          </label>
          <label>
            <span>標準ロット</span>
            <input
              type="number"
              min={0}
              step={1}
              value={standardProductionLotSize}
              onChange={(e) => setStandardProductionLotSize(Number(e.target.value))}
            />
          </label>
          <label>
            <span className="inline-action">
              原料ロス率許容(%)
              <HelpTooltip text="スタッフ日報で原料ロス率がこの値を超えると提出を止めます。個包装もの5%、手詰め3%、NTSするめソーメン10gは8%を目安にします。" />
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={rawMaterialLossTolerancePercent}
              onChange={(e) => setRawMaterialLossTolerancePercent(e.target.value)}
            />
          </label>
          <label>
            <span>生産順(優先度)</span>
            <input
              type="number"
              step={1}
              placeholder="空欄=従来順(小さいほど先)"
              value={schedulePriority}
              onChange={(e) => setSchedulePriority(e.target.value)}
            />
          </label>
          <label>
            <span>標準作業場所</span>
            <SearchableCombobox
              value={defaultWorkAreaId}
              options={workAreaOptions}
              emptyOptionLabel="未設定"
              placeholder="作業場所名で検索"
              onChange={setDefaultWorkAreaId}
            />
          </label>
          <label>
            <span>請求対象</span>
            <select value={billingEnabled ? "1" : "0"} onChange={(e) => setBillingEnabled(e.target.value === "1")}>
              <option value="1">対象</option>
              <option value="0">対象外</option>
            </select>
          </label>
          <label>
            <span>北名古屋使用</span>
            <select value={usedAtKitagoya ? "1" : "0"} onChange={(e) => setUsedAtKitagoya(e.target.value === "1")}>
              <option value="1">使用する</option>
              <option value="0">対象外</option>
            </select>
          </label>
          <label>
            <span>有効</span>
            <select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
              <option value="1">有効</option>
              <option value="0">無効</option>
            </select>
          </label>
          <label>
            <span>有効開始</span>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </label>
          <label>
            <span>有効終了</span>
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </label>
          <label>
            <span>取込元</span>
            <input
              value={
                product.sourceSheetName
                  ? `${product.sourceSheetName}${product.sourceRowNumber ? ` ${product.sourceRowNumber}行目` : ""}`
                  : product.sourceSystem ?? ""
              }
              readOnly
            />
          </label>
          </div>
          <div className="row field-row">
          <label className="full-field">
            <span>別名 (カンマ区切り)</span>
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} />
          </label>
          </div>
          <div className="row field-row">
          <label className="full-field">
            <span>備考・メモ（原料/資材のOCR取込内容など）</span>
            <textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          </div>
          <div className="row field-row product-editor-note-grid">
          <label className="full-field">
            <span>分類表備考</span>
            <textarea rows={3} value={classificationNote} onChange={(e) => setClassificationNote(e.target.value)} />
          </label>
          <label className="full-field">
            <span>原料メモ</span>
            <textarea rows={3} value={rawMaterialNote} onChange={(e) => setRawMaterialNote(e.target.value)} />
          </label>
          </div>
          <div className="form-actions">
          <button type="button" onClick={saveMeta} disabled={savingMeta}>
            {savingMeta ? "保存中..." : "基本情報を保存"}
          </button>
          </div>
        </div>
      </section>

      <section className="product-editor-section" id="product-billing">
      <h2>手間賃単価</h2>
      <div className="panel">
        <div className="table-frame">
          <table className="product-editor-table product-editor-billing-table">
          <thead>
            <tr>
              <th>単価</th>
              <th>作業場所</th>
              <th>単位</th>
              <th>適用開始</th>
              <th>適用終了</th>
              <th>請求</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {billingRows.map((r, idx) => {
              const missingUnit = !r.unit.trim();
              const missingEffectiveFrom = !r.effectiveFrom;
              const invalidPrice = !(r.unitPrice >= 0);
              const rowNeedsReview = missingUnit || missingEffectiveFrom || invalidPrice;
              return (
                <tr key={r.id ?? `new-${idx}`} className={rowNeedsReview ? "row-needs-action" : ""}>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.unitPrice}
                      onChange={(e) => {
                        const copy = [...billingRows];
                        copy[idx] = { ...r, unitPrice: Number(e.target.value) };
                        setBillingRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <SearchableCombobox
                      value={r.workAreaId}
                      options={workAreaOptions}
                      emptyOptionLabel="全作業場所"
                      placeholder="作業場所名で検索"
                      onChange={(workAreaId) => {
                        const copy = [...billingRows];
                        copy[idx] = {
                          ...r,
                          workAreaId,
                          workAreaNameSnapshot:
                            workAreas.find((workArea) => workArea.id === workAreaId)?.name ?? null,
                        };
                        setBillingRows(copy);
                      }}
                    />
                    {r.workAreaNameSnapshot && !r.workAreaId && (
                      <div className="subtext">反映時: {r.workAreaNameSnapshot}</div>
                    )}
                  </td>
                  <td>
                    <input
                      className="unit-field"
                      value={r.unit}
                      onChange={(e) => {
                        const copy = [...billingRows];
                        copy[idx] = { ...r, unit: e.target.value };
                        setBillingRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={r.effectiveFrom}
                      onChange={(e) => {
                        const copy = [...billingRows];
                        copy[idx] = { ...r, effectiveFrom: e.target.value };
                        setBillingRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={r.effectiveTo ?? ""}
                      onChange={(e) => {
                        const copy = [...billingRows];
                        copy[idx] = { ...r, effectiveTo: e.target.value || null };
                        setBillingRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={r.billingTarget ? "1" : "0"}
                      onChange={(e) => {
                        const copy = [...billingRows];
                        copy[idx] = { ...r, billingTarget: e.target.value === "1" };
                        setBillingRows(copy);
                      }}
                    >
                      <option value="1">対象</option>
                      <option value="0">対象外</option>
                    </select>
                  </td>
                  <td>
                    <div className="table-actions">
                      {rowNeedsReview && (
                        <div className="product-editor-row-badges">
                          {invalidPrice && <span className="badge warn">単価要確認</span>}
                          {missingUnit && <span className="badge warn">単位なし</span>}
                          {missingEffectiveFrom && <span className="badge warn">開始日なし</span>}
                        </div>
                      )}
                      <button type="button" onClick={() => saveBillingPrice(r, idx)} disabled={savingBilling}>
                        保存
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteBillingPrice(r, idx)}
                        disabled={savingBilling}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
        <div className="row form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setBillingRows([
                ...billingRows,
                {
                  workAreaId: "",
                  workAreaNameSnapshot: null,
                  unitPrice: 0,
                  unit: product.unit || "袋",
                  effectiveFrom: new Date().toISOString().slice(0, 10),
                  effectiveTo: null,
                  billingTarget: true,
                },
              ])
            }
          >
            ＋ 行を追加
          </button>
        </div>
      </div>
      </section>

      <section className="product-editor-section" id="product-bom">
      <h2>BOM (原料・資材)</h2>
      <div className="panel">
        <div className="table-frame">
          <table className="product-editor-table product-editor-bom-table">
          <thead>
            <tr>
              <th>区分</th>
              <th>品目</th>
              <th>商品1単位あたり使用量</th>
              <th>単位</th>
              <th>ロス率</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bomRows.map((r, idx) => {
              const options = r.itemType === "raw_material" ? materials : packaging;
              const comboboxOptions = r.itemType === "raw_material" ? materialComboboxOptions : packagingComboboxOptions;
              const missingItem = !r.itemId;
              const invalidQuantity = !(r.quantityPerUnit > 0);
              const missingUnit = !r.unit.trim();
              const invalidLossRate = r.lossRate < 0;
              const rowNeedsReview = missingItem || invalidQuantity || missingUnit || invalidLossRate;
              return (
                <tr key={idx} className={rowNeedsReview ? "row-needs-action" : ""}>
                  <td>
                    <select
                      value={r.itemType}
                      onChange={(e) => {
                        const copy = [...bomRows];
                        copy[idx] = { ...r, itemType: e.target.value as never, itemId: "" };
                        setBomRows(copy);
                      }}
                    >
                      <option value="raw_material">原料</option>
                      <option value="packaging">資材</option>
                    </select>
                  </td>
                  <td>
                    <SearchableCombobox
                      value={r.itemId}
                      options={comboboxOptions}
                      emptyOptionLabel="選択"
                      placeholder={r.itemType === "raw_material" ? "原料番号・名称で検索" : "資材番号・名称で検索"}
                      onChange={(itemId) => {
                        const copy = [...bomRows];
                        const ref = options.find((o) => o.id === itemId);
                        copy[idx] = { ...r, itemId, unit: ref?.unit ?? r.unit };
                        setBomRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.0001"
                      value={r.quantityPerUnit}
                      onChange={(e) => {
                        const copy = [...bomRows];
                        copy[idx] = { ...r, quantityPerUnit: Number(e.target.value) };
                        setBomRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      value={r.unit}
                      onChange={(e) => {
                        const copy = [...bomRows];
                        copy[idx] = { ...r, unit: e.target.value };
                        setBomRows(copy);
                      }}
                      className="unit-field"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={r.lossRate}
                      onChange={(e) => {
                        const copy = [...bomRows];
                        copy[idx] = { ...r, lossRate: Number(e.target.value) };
                        setBomRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <div className="table-actions product-editor-row-actions">
                      {rowNeedsReview && (
                        <div className="product-editor-row-badges">
                          {missingItem && <span className="badge warn">品目未選択</span>}
                          {invalidQuantity && <span className="badge warn">使用量要確認</span>}
                          {missingUnit && <span className="badge warn">単位なし</span>}
                          {invalidLossRate && <span className="badge warn">ロス率要確認</span>}
                        </div>
                      )}
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setBomRows(bomRows.filter((_, i) => i !== idx))}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
        <div className="row form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setBomRows([
                ...bomRows,
                { itemType: "raw_material", itemId: "", quantityPerUnit: 0, unit: "kg", lossRate: 0 },
              ])
            }
          >
            ＋ 行を追加
          </button>
          <button type="button" onClick={saveBom} disabled={savingBom}>
            {savingBom ? "保存中..." : "BOMを保存"}
          </button>
        </div>
      </div>
      </section>

      <section className="product-editor-section" id="product-capacity">
      <h2>生産能力 (1時間1人あたり生産量)</h2>
      <div className="panel">
        <div className="table-frame">
          <table className="product-editor-table product-editor-capacity-table">
          <thead>
            <tr>
              <th>作業場所</th>
              <th>候補順位</th>
              <th>生産量 / 人時</th>
              <th>基準人数</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {capRows.map((r, idx) => {
              const missingWorkArea = !r.workAreaId;
              const invalidRate = !(r.unitsPerPersonHour > 0);
              const invalidPeople = !(r.standardPeople > 0);
              const rowNeedsReview = missingWorkArea || invalidRate || invalidPeople;
              return (
                <tr key={idx} className={rowNeedsReview ? "row-needs-action" : ""}>
                  <td>
                    <SearchableCombobox
                      value={r.workAreaId}
                      disabled={!!r.id}
                      options={workAreaOptions}
                      emptyOptionLabel="選択"
                      placeholder="作業場所名で検索"
                      onChange={(workAreaId) => {
                        const copy = [...capRows];
                        copy[idx] = { ...r, workAreaId };
                        setCapRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={r.candidatePriority ?? ""}
                      onChange={(e) => {
                        const copy = [...capRows];
                        const value = e.target.value === "" ? null : Number(e.target.value);
                        copy[idx] = { ...r, candidatePriority: value };
                        setCapRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      value={r.unitsPerPersonHour}
                      onChange={(e) => {
                        const copy = [...capRows];
                        copy[idx] = { ...r, unitsPerPersonHour: Number(e.target.value) };
                        setCapRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      value={r.standardPeople}
                      onChange={(e) => {
                        const copy = [...capRows];
                        copy[idx] = { ...r, standardPeople: Number(e.target.value) };
                        setCapRows(copy);
                      }}
                    />
                  </td>
                  <td>
                    <div className="table-actions product-editor-row-actions">
                      {rowNeedsReview && (
                        <div className="product-editor-row-badges">
                          {missingWorkArea && <span className="badge warn">場所未選択</span>}
                          {invalidRate && <span className="badge warn">生産量要確認</span>}
                          {invalidPeople && <span className="badge warn">人数要確認</span>}
                        </div>
                      )}
                      <button type="button" onClick={() => saveCapacity(r, idx)} disabled={savingCap || !r.workAreaId}>
                        保存
                      </button>
                      <button type="button" className="danger" onClick={() => deleteCapacity(r, idx)} disabled={savingCap}>
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
        <div className="row form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setCapRows([
                ...capRows,
                {
                  workAreaId: "",
                  unitsPerPersonHour: 100,
                  standardPeople: 1,
                  standardBreakMinutes: 0,
                  candidatePriority: capRows.length + 1,
                },
              ])
            }
          >
            ＋ 行を追加
          </button>
        </div>
      </div>
      </section>
    </>
  );
}

function itemRefComboboxOptions(items: ItemRef[]) {
  return items.map((item) => ({
    value: item.id,
    code: item.code,
    label: item.name,
    description: item.unit,
  }));
}

function isValidBomRow(row: BomRow) {
  return Boolean(row.itemId && row.quantityPerUnit > 0 && row.unit.trim() && row.lossRate >= 0);
}

function isValidCapacityRow(row: CapacityRow) {
  return Boolean(row.workAreaId && row.unitsPerPersonHour > 0 && row.standardPeople > 0);
}

function isValidBillingRow(row: BillingPriceRow) {
  return Boolean(row.billingTarget && row.unitPrice >= 0 && row.unit.trim() && row.effectiveFrom);
}
