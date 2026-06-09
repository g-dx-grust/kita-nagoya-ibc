"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
};
type BillingPriceRow = {
  id?: string;
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
    setSavingBilling(true);
    const payload = {
      productId: product.id,
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
        current.map((item, i) => (i === index ? { ...row, id: json.id ?? row.id } : item)),
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

      <h2>基本情報</h2>
      <div className="panel">
        <div className="row">
          <label>
            <span>管理コード *</span>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} required />
            <span className="subtext">商品分類表にコード列が無いため、システム内の管理コードとして扱います。</span>
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
            <span>入数(c/s)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={packCount}
              placeholder="例: 24"
              onChange={(e) => setPackCount(e.target.value)}
            />
            <span className="subtext">元Excelの「入り数(c/s)」です。</span>
          </label>
          <label>
            <span>入数表記</span>
            <input value={packCountExpression} onChange={(e) => setPackCountExpression(e.target.value)} />
          </label>
          <label>
            <span>ケース入数（{unit || "袋"}/ケース）</span>
            <input
              type="number"
              min={0}
              step="1"
              value={casePackQty}
              placeholder="未設定なら袋表示"
              onChange={(e) => setCasePackQty(e.target.value)}
            />
            <span className="subtext">1ケースに入る{unit || "袋"}数。空なら入数(c/s)を使います。</span>
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
            <select value={defaultWorkAreaId} onChange={(e) => setDefaultWorkAreaId(e.target.value)}>
              <option value="">未設定</option>
              {workAreas.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
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
        <div className="row field-row">
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

      <h2>手間賃単価</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>単価</th>
              <th>単位</th>
              <th>適用開始</th>
              <th>適用終了</th>
              <th>請求</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {billingRows.map((r, idx) => (
              <tr key={r.id ?? `new-${idx}`}>
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
            ))}
          </tbody>
        </table>
        <div className="row form-actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setBillingRows([
                ...billingRows,
                {
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

      <h2>BOM (原料・資材)</h2>
      <div className="panel">
        <table>
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
              return (
                <tr key={idx}>
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
                    <select
                      value={r.itemId}
                      onChange={(e) => {
                        const copy = [...bomRows];
                        const ref = options.find((o) => o.id === e.target.value);
                        copy[idx] = { ...r, itemId: e.target.value, unit: ref?.unit ?? r.unit };
                        setBomRows(copy);
                      }}
                    >
                      <option value="">選択</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.code} · {o.name}
                        </option>
                      ))}
                    </select>
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
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setBomRows(bomRows.filter((_, i) => i !== idx))}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

      <h2>生産能力 (1時間1人あたり生産量)</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>作業場所</th>
              <th>生産量 / 人時</th>
              <th>基準人数</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {capRows.map((r, idx) => (
              <tr key={idx}>
                <td>
                  <select
                    value={r.workAreaId}
                    disabled={!!r.id}
                    onChange={(e) => {
                      const copy = [...capRows];
                      copy[idx] = { ...r, workAreaId: e.target.value };
                      setCapRows(copy);
                    }}
                  >
                    <option value="">選択</option>
                    {workAreas.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
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
                  <div className="table-actions">
                    <button type="button" onClick={() => saveCapacity(r, idx)} disabled={savingCap || !r.workAreaId}>
                      保存
                    </button>
                    <button type="button" className="danger" onClick={() => deleteCapacity(r, idx)} disabled={savingCap}>
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                },
              ])
            }
          >
            ＋ 行を追加
          </button>
        </div>
      </div>
    </>
  );
}
