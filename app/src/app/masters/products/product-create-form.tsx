"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import SearchableCombobox from "@/components/ui/searchable-combobox";
import { forecastMethodLabel, productionTypeLabel } from "@/lib/labels";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";

const today = () => new Date().toISOString().slice(0, 10);

export default function ProductCreateForm({
  workAreas,
}: {
  workAreas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 基本情報
  const [productCode, setProductCode] = useState("");
  const [officialName, setOfficialName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [productionType, setProductionType] = useState<"stock" | "make_to_order" | "both">("stock");
  const [category, setCategory] = useState("");
  const [usedAtKitagoya, setUsedAtKitagoya] = useState(true);
  const [aliases, setAliases] = useState("");
  const [specification, setSpecification] = useState("");
  const [brandName, setBrandName] = useState("");

  // 包装
  const [unit, setUnit] = useState("袋");
  const [packSizeG, setPackSizeG] = useState("");
  const [packCount, setPackCount] = useState("");
  const [casePackQty, setCasePackQty] = useState("");
  const [packCountExpression, setPackCountExpression] = useState("");
  const [bundleCount, setBundleCount] = useState("");
  const [bagTrayName, setBagTrayName] = useState("");
  const [cartonName, setCartonName] = useState("");
  const [accessoryName, setAccessoryName] = useState("");
  const [sealCount, setSealCount] = useState("");
  const [classificationNote, setClassificationNote] = useState("");
  const [rawMaterialNote, setRawMaterialNote] = useState("");

  // 予測・在庫
  const [forecastMethod, setForecastMethod] = useState<
    "MANUAL" | "YEAR_RATIO" | "SALES_INPUT" | "NONE"
  >("MANUAL");
  const [safetyStockQuantity, setSafetyStockQuantity] = useState(0);
  const [standardProductionLotSize, setStandardProductionLotSize] = useState(0);
  const [schedulePriority, setSchedulePriority] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");

  // 標準作業場所
  const [defaultWorkAreaId, setDefaultWorkAreaId] = useState("");

  // 生産能力(任意)
  const [capWorkAreaId, setCapWorkAreaId] = useState("");
  const [unitsPerPersonHour, setUnitsPerPersonHour] = useState("");
  const [standardPeople, setStandardPeople] = useState("1");

  // 手間賃単価(任意)
  const [billingUnitPrice, setBillingUnitPrice] = useState("");
  const [billingUnit, setBillingUnit] = useState("");
  const [billingEffectiveFrom, setBillingEffectiveFrom] = useState("");

  // 受注生産の初回予定(任意)
  const [createInitialDemand, setCreateInitialDemand] = useState(false);
  const [initialDemandDate, setInitialDemandDate] = useState(today());
  const [initialDemandQuantity, setInitialDemandQuantity] = useState("100");
  const [initialDemandCustomerName, setInitialDemandCustomerName] = useState("");
  const [initialDemandExternalRef, setInitialDemandExternalRef] = useState("");
  const [initialDemandNote, setInitialDemandNote] = useState("");
  const workAreaOptions = useMemo(
    () => workAreas.map((workArea) => ({ value: workArea.id, label: workArea.name })),
    [workAreas],
  );
  const defaultWorkAreaName = useMemo(
    () => workAreas.find((workArea) => workArea.id === defaultWorkAreaId)?.name ?? null,
    [workAreas, defaultWorkAreaId],
  );
  const capacityWorkAreaName = useMemo(
    () => workAreas.find((workArea) => workArea.id === capWorkAreaId)?.name ?? null,
    [workAreas, capWorkAreaId],
  );
  const createSummary = useMemo(() => {
    const missingCode = !productCode.trim();
    const missingName = !officialName.trim();
    const missingCasePack = usedAtKitagoya && !casePackQty && !packCount;
    const missingDefaultWorkArea = usedAtKitagoya && !defaultWorkAreaId;
    const wantsCapacity = Boolean(unitsPerPersonHour.trim());
    const invalidCapacity =
      wantsCapacity &&
      (!capWorkAreaId || !(Number(unitsPerPersonHour) > 0) || !(Number(standardPeople || "0") > 0));
    const wantsBilling = Boolean(billingUnitPrice.trim());
    const invalidBilling = wantsBilling && !(Number(billingUnitPrice) > 0);
    const isOrderProduction = productionType === "make_to_order" || productionType === "both";
    const invalidInitialDemand =
      isOrderProduction &&
      createInitialDemand &&
      (!initialDemandDate || !(Number(initialDemandQuantity) > 0));
    const needsActionCount = [
      missingCode,
      missingName,
      missingCasePack,
      missingDefaultWorkArea,
      invalidCapacity,
      invalidBilling,
      invalidInitialDemand,
    ].filter(Boolean).length;
    return {
      missingCode,
      missingName,
      missingCasePack,
      missingDefaultWorkArea,
      wantsCapacity,
      invalidCapacity,
      wantsBilling,
      invalidBilling,
      isOrderProduction,
      invalidInitialDemand,
      needsActionCount,
    };
  }, [
    billingUnitPrice,
    capWorkAreaId,
    casePackQty,
    createInitialDemand,
    defaultWorkAreaId,
    initialDemandDate,
    initialDemandQuantity,
    officialName,
    packCount,
    productCode,
    productionType,
    standardPeople,
    unitsPerPersonHour,
    usedAtKitagoya,
  ]);

  function changeProductionType(value: "stock" | "make_to_order" | "both") {
    setProductionType(value);
    if (value === "make_to_order") {
      setForecastMethod("NONE");
      setSafetyStockQuantity(0);
      setStandardProductionLotSize(0);
      setCreateInitialDemand(true);
    }
    if (value === "stock") {
      setCreateInitialDemand(false);
    }
  }

  function resetForm() {
    setProductCode("");
    setOfficialName("");
    setDisplayName("");
    setProductionType("stock");
    setCategory("");
    setUsedAtKitagoya(true);
    setAliases("");
    setSpecification("");
    setBrandName("");
    setUnit("袋");
    setPackSizeG("");
    setPackCount("");
    setCasePackQty("");
    setPackCountExpression("");
    setBundleCount("");
    setBagTrayName("");
    setCartonName("");
    setAccessoryName("");
    setSealCount("");
    setClassificationNote("");
    setRawMaterialNote("");
    setForecastMethod("MANUAL");
    setSafetyStockQuantity(0);
    setStandardProductionLotSize(0);
    setSchedulePriority("");
    setValidFrom("");
    setValidTo("");
    setDefaultWorkAreaId("");
    setCapWorkAreaId("");
    setUnitsPerPersonHour("");
    setStandardPeople("1");
    setBillingUnitPrice("");
    setBillingUnit("");
    setBillingEffectiveFrom("");
    setCreateInitialDemand(false);
    setInitialDemandDate(today());
    setInitialDemandQuantity("100");
    setInitialDemandCustomerName("");
    setInitialDemandExternalRef("");
    setInitialDemandNote("");
  }

  if (!open) {
    return (
      <div className="toolbar">
        <button type="button" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          新規商品
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);

    const shouldCreateInitialDemand = createSummary.isOrderProduction && createInitialDemand;
    if (shouldCreateInitialDemand && createSummary.invalidInitialDemand) {
      setBusy(false);
      setErr("初回受注予定の必要日と数量を確認してください。");
      return;
    }

    const resolvedPackCount = packCount ? Number(packCount) : casePackQty ? Number(casePackQty) : null;
    const resolvedCasePackQty = casePackQty ? Number(casePackQty) : resolvedPackCount;

    // 1) 商品本体を登録
    const res = await fetch(kitagoyaApiPath("/products"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode,
        officialName,
        displayName: displayName.trim() || undefined,
        productionType,
        category: category.trim() || null,
        usedAtKitagoya,
        specification: specification.trim() || null,
        brandName: brandName.trim() || null,
        forecastMethod,
        safetyStockQuantity,
        standardProductionLotSize,
        schedulePriority: schedulePriority.trim() === "" ? null : Number(schedulePriority),
        unit,
        packSizeG: packSizeG ? Number(packSizeG) : null,
        packCount: resolvedPackCount,
        casePackQty: resolvedCasePackQty,
        packCountExpression: packCountExpression.trim() || null,
        bundleCount: bundleCount.trim() || null,
        bagTrayName: bagTrayName.trim() || null,
        cartonName: cartonName.trim() || null,
        accessoryName: accessoryName.trim() || null,
        sealCount: sealCount ? Number(sealCount) : null,
        classificationNote: classificationNote.trim() || null,
        rawMaterialNote: rawMaterialNote.trim() || null,
        defaultWorkAreaId: defaultWorkAreaId || null,
        validFrom: validFrom || null,
        validTo: validTo || null,
        aliases: aliases.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setErr(json.error ?? "商品の登録に失敗しました");
      return;
    }
    const productId: string | undefined = json.id;
    if (!productId) {
      setBusy(false);
      setErr("商品は登録されましたが、IDを取得できませんでした。一覧から編集してください。");
      return;
    }

    // 2) 生産能力(任意) — 1人時生産量 > 0 のときだけ送る
    const uph = unitsPerPersonHour ? Number(unitsPerPersonHour) : 0;
    if (uph > 0) {
      if (!capWorkAreaId) {
        setBusy(false);
        setErr(
          "商品は登録されましたが、生産能力の作業場所が未選択のため保存できませんでした。編集画面で設定してください。",
        );
        router.push(kitagoyaPath(`/masters/products/${productId}`));
        return;
      }
      const people = standardPeople ? Number(standardPeople) : 1;
      const capRes = await fetch(kitagoyaApiPath("/capacities"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          workAreaId: capWorkAreaId,
          unitsPerPersonHour: uph,
          standardPeople: people > 0 ? people : 1,
          standardBreakMinutes: 0,
          candidatePriority: 1,
        }),
      });
      if (!capRes.ok) {
        setBusy(false);
        setErr(
          "商品は登録されましたが、生産能力の保存に失敗しました。編集画面で設定してください。",
        );
        router.push(kitagoyaPath(`/masters/products/${productId}`));
        return;
      }
    }

    // 3) 手間賃単価(任意) — 単価 > 0 のときだけ送る
    const price = billingUnitPrice ? Number(billingUnitPrice) : 0;
    if (price > 0) {
      const billRes = await fetch(kitagoyaApiPath("/billing-prices"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          unitPrice: price,
          unit: billingUnit.trim() || unit,
          effectiveFrom: billingEffectiveFrom || validFrom || today(),
          effectiveTo: null,
          billingTarget: true,
          note: null,
        }),
      });
      if (!billRes.ok) {
        setBusy(false);
        setErr(
          "商品は登録されましたが、手間賃単価の保存に失敗しました。編集画面で設定してください。",
        );
        router.push(kitagoyaPath(`/masters/products/${productId}`));
        return;
      }
    }

    // 4) 受注生産の初回予定(任意)
    if (shouldCreateInitialDemand) {
      const demandRes = await fetch(kitagoyaApiPath("/product-demands"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          dueDate: initialDemandDate,
          demandType: "order",
          quantity: Number(initialDemandQuantity),
          customerName: initialDemandCustomerName.trim() || null,
          externalRef: initialDemandExternalRef.trim() || null,
          note: initialDemandNote.trim() || null,
        }),
      });
      if (!demandRes.ok) {
        setBusy(false);
        setErr(
          "商品は登録されましたが、初回受注予定の保存に失敗しました。製品計画画面で受注予定を登録してください。",
        );
        router.push(kitagoyaPath(`/masters/products/${productId}`));
        return;
      }
    }

    setBusy(false);
    setOpen(false);
    resetForm();
    // 登録 → 編集導線: レシピ(BOM)等は編集画面で設定する
    router.push(kitagoyaPath(`/masters/products/${productId}`));
  }

  return (
    <form className="panel product-create-form" onSubmit={submit}>
      <div className="toolbar flush-top">
        <strong>新規商品</strong>
        <HelpTooltip text="ここでは商品マスターの基本情報を登録します。レシピ（BOM: 原料・資材）は登録後の編集画面で設定します。" />
      </div>
      <div className="product-create-command">
        <div className="product-create-command-title">
          <span className={`badge ${createSummary.needsActionCount > 0 ? "warn" : "success"}`}>
            {createSummary.needsActionCount > 0 ? "確認が必要" : "登録準備OK"}
          </span>
          <strong>登録前チェック</strong>
          <span className="subtext">{createSummary.needsActionCount}項目</span>
        </div>
        <div className="product-create-checks">
          <span className="badge info">{productionTypeLabel(productionType)}</span>
          <span className="badge info">{forecastMethodLabel(forecastMethod)}</span>
          <a
            className={`badge ${createSummary.missingCode || createSummary.missingName ? "warn" : "success"}`}
            href="#product-create-basic"
          >
            基本情報 {createSummary.missingCode || createSummary.missingName ? "要入力" : "OK"}
          </a>
          <a className={`badge ${createSummary.missingCasePack ? "warn" : "success"}`} href="#product-create-package">
            ケース入数 {createSummary.missingCasePack ? "なし" : "OK"}
          </a>
          <a
            className={`badge ${createSummary.missingDefaultWorkArea ? "warn" : "success"}`}
            href="#product-create-work-area"
          >
            標準場所 {defaultWorkAreaName ?? "未設定"}
          </a>
          <a
            className={`badge ${
              createSummary.invalidCapacity ? "warn" : createSummary.wantsCapacity ? "success" : "muted"
            }`}
            href="#product-create-capacity"
          >
            能力 {createSummary.wantsCapacity ? capacityWorkAreaName ?? "要確認" : "後で設定"}
          </a>
          <a
            className={`badge ${
              createSummary.invalidBilling ? "warn" : createSummary.wantsBilling ? "success" : "muted"
            }`}
            href="#product-create-billing"
          >
            手間賃 {createSummary.wantsBilling ? "入力あり" : "後で設定"}
          </a>
          {createSummary.isOrderProduction && (
            <a
              className={`badge ${
                createInitialDemand
                  ? createSummary.invalidInitialDemand
                    ? "warn"
                    : "success"
                  : "muted"
              }`}
              href="#product-create-initial-demand"
            >
              初回受注 {createInitialDemand ? "同時登録" : "後で登録"}
            </a>
          )}
          <span className="badge info">登録後にBOM設定へ</span>
        </div>
      </div>

      <fieldset id="product-create-basic">
        <legend>基本情報</legend>
        <div className="row">
          <label>
            <span>管理コード *</span>
            <input value={productCode} onChange={(e) => setProductCode(e.target.value)} required />
          </label>
          <label>
            <span>正式名称 *</span>
            <input value={officialName} onChange={(e) => setOfficialName(e.target.value)} required />
          </label>
          <label>
            <span>表示名</span>
            <input
              value={displayName}
              placeholder="未入力なら正式名称を使用"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label>
            <span>区分</span>
            <select value={productionType} onChange={(e) => changeProductionType(e.target.value as never)}>
              <option value="stock">在庫生産</option>
              <option value="make_to_order">受注生産</option>
              <option value="both">両方</option>
            </select>
          </label>
          <label>
            <span>カテゴリ</span>
            <input
              value={category}
              placeholder="例: 漬物 / 惣菜"
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label>
            <span>規格</span>
            <input value={specification} placeholder="例: 80g" onChange={(e) => setSpecification(e.target.value)} />
          </label>
          <label>
            <span>ブランド</span>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </label>
          <label className="full-field">
            <span>別名 (カンマ区切り)</span>
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={usedAtKitagoya}
              onChange={(e) => setUsedAtKitagoya(e.target.checked)}
            />
            <span>北名古屋で使用する</span>
          </label>
        </div>
      </fieldset>

      <fieldset id="product-create-package">
        <legend>包装</legend>
        <div className="row">
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
            <input
              value={packCountExpression}
              placeholder="例: 12×20"
              onChange={(e) => setPackCountExpression(e.target.value)}
            />
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
          <label className="full-field">
            <span>分類表備考</span>
            <input value={classificationNote} onChange={(e) => setClassificationNote(e.target.value)} />
          </label>
          <label className="full-field">
            <span>原料メモ</span>
            <input value={rawMaterialNote} onChange={(e) => setRawMaterialNote(e.target.value)} />
          </label>
        </div>
      </fieldset>

      <fieldset id="product-create-forecast">
        <legend>予測・在庫</legend>
        <div className="row">
          <label>
            <span>予測方式</span>
            <select value={forecastMethod} onChange={(e) => setForecastMethod(e.target.value as never)}>
              <option value="MANUAL">手動入力</option>
              <option value="YEAR_RATIO">前年比予測</option>
              <option value="SALES_INPUT">営業予測</option>
              <option value="NONE">予測なし</option>
            </select>
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
            <span>有効開始</span>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </label>
          <label>
            <span>有効終了</span>
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </label>
        </div>
      </fieldset>

      {createSummary.isOrderProduction && (
        <fieldset id="product-create-initial-demand">
          <legend>
            <span className="inline-action">
              初回受注予定（任意）
              <HelpTooltip text="受注生産の商品登録と同時に、製品計画の未処理受注予定を作成します。登録した受注予定は自動生産提案の不足候補に使われます。" />
            </span>
          </legend>
          <div className="row">
            <label className="inline-check full-field">
              <input
                type="checkbox"
                checked={createInitialDemand}
                onChange={(e) => setCreateInitialDemand(e.target.checked)}
              />
              <span>この商品で初回受注予定も登録する</span>
            </label>
            <label>
              <span>必要日</span>
              <input
                type="date"
                value={initialDemandDate}
                onChange={(e) => setInitialDemandDate(e.target.value)}
                disabled={!createInitialDemand}
                required={createInitialDemand}
              />
            </label>
            <label>
              <span>受注数量</span>
              <input
                type="number"
                min={1}
                step={1}
                value={initialDemandQuantity}
                onChange={(e) => setInitialDemandQuantity(e.target.value)}
                disabled={!createInitialDemand}
                required={createInitialDemand}
              />
            </label>
            <label>
              <span>得意先</span>
              <input
                value={initialDemandCustomerName}
                onChange={(e) => setInitialDemandCustomerName(e.target.value)}
                disabled={!createInitialDemand}
              />
            </label>
            <label>
              <span>受注番号/参照</span>
              <input
                value={initialDemandExternalRef}
                onChange={(e) => setInitialDemandExternalRef(e.target.value)}
                disabled={!createInitialDemand}
              />
            </label>
            <label className="full-field">
              <span>受注メモ</span>
              <input
                value={initialDemandNote}
                onChange={(e) => setInitialDemandNote(e.target.value)}
                disabled={!createInitialDemand}
              />
            </label>
          </div>
        </fieldset>
      )}

      <fieldset id="product-create-work-area">
        <legend>標準作業場所</legend>
        <div className="row">
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
        </div>
      </fieldset>

      <fieldset id="product-create-capacity">
        <legend>
          <span className="inline-action">
            生産能力（任意）
            <HelpTooltip text="1人時生産量を入力した場合のみ登録します。" />
          </span>
        </legend>
        <div className="row">
          <label>
            <span>作業場所</span>
            <SearchableCombobox
              value={capWorkAreaId}
              options={workAreaOptions}
              emptyOptionLabel="未設定"
              placeholder="作業場所名で検索"
              onChange={setCapWorkAreaId}
            />
          </label>
          <label>
            <span>1人時生産量</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={unitsPerPersonHour}
              placeholder="例: 100"
              onChange={(e) => setUnitsPerPersonHour(e.target.value)}
            />
          </label>
          <label>
            <span>標準人数</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={standardPeople}
              onChange={(e) => setStandardPeople(e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <fieldset id="product-create-billing">
        <legend>
          <span className="inline-action">
            手間賃単価（任意）
            <HelpTooltip text="単価を入力した場合のみ登録します。" />
          </span>
        </legend>
        <div className="row">
          <label>
            <span>単価</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={billingUnitPrice}
              onChange={(e) => setBillingUnitPrice(e.target.value)}
            />
          </label>
          <label>
            <span className="inline-action">
              単位
              <HelpTooltip text={`空なら商品単位（${unit || "袋"}）を使います。`} />
            </span>
            <input
              className="unit-field"
              value={billingUnit}
              placeholder={unit || "袋"}
              onChange={(e) => setBillingUnit(e.target.value)}
            />
          </label>
          <label>
            <span className="inline-action">
              適用開始日
              <HelpTooltip text="空なら有効開始日、または本日を使います。" />
            </span>
            <input
              type="date"
              value={billingEffectiveFrom}
              onChange={(e) => setBillingEffectiveFrom(e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      {err && <div className="alert danger">{err}</div>}
      <div className="row form-actions">
        <button type="submit" disabled={busy}>
          {busy
            ? "登録中..."
            : createSummary.isOrderProduction && createInitialDemand
              ? "商品と受注予定を登録"
              : "登録してレシピ設定へ"}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={busy}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
