export const CLASSIFICATION_PACKAGING_BOM_NOTE = "商品分類表から包装BOM生成";
export const HISTORICAL_PRODUCT_LINK_NOTE = "旧商品から分類表一致で移行";
export const CLASSIFICATION_PACKAGING_CODE_PREFIX = "KPM";

export type PackagingComponentSource = "bag_tray" | "carton" | "accessory" | "seal";

export type PackagingComponent = {
  source: PackagingComponentSource;
  name: string;
  kind: "bag" | "carton" | "desiccant" | "other";
  unit: string;
  quantityPerUnit: number;
  note: string;
};

export type PackagingComponentIssue = {
  source: PackagingComponentSource;
  value: string;
  reason: string;
};

export function buildClassificationPackagingComponents(input: {
  bagTrayName?: string | null;
  cartonName?: string | null;
  accessoryName?: string | null;
  sealCount?: number | null;
  casePackQty?: number | null;
  classificationNote?: string | null;
}): { components: PackagingComponent[]; issues: PackagingComponentIssue[] } {
  const components: PackagingComponent[] = [];
  const issues: PackagingComponentIssue[] = [];

  for (const name of splitPackagingText(input.bagTrayName)) {
    if (isSkipPackagingText(name)) continue;
    if (isGenericPackagingName(name)) {
      issues.push({ source: "bag_tray", value: name, reason: "generic_packaging_name" });
      continue;
    }
    components.push({
      source: "bag_tray",
      name,
      kind: inferPackagingKind(name, "bag_tray"),
      unit: "枚",
      quantityPerUnit: 1,
      note: `${CLASSIFICATION_PACKAGING_BOM_NOTE}: 袋/トレー`,
    });
  }

  const cartonName = cleanPackagingText(input.cartonName);
  if (cartonName && !isSkipPackagingText(cartonName)) {
    if (isGenericPackagingName(cartonName)) {
      issues.push({ source: "carton", value: cartonName, reason: "generic_packaging_name" });
    } else if (!input.casePackQty || input.casePackQty <= 0) {
      issues.push({ source: "carton", value: cartonName, reason: "carton_without_case_pack_qty" });
    } else {
      components.push({
        source: "carton",
        name: cartonName,
        kind: "carton",
        unit: "枚",
        quantityPerUnit: round6(1 / input.casePackQty),
        note: `${CLASSIFICATION_PACKAGING_BOM_NOTE}: ダンボール 1/${formatQuantity(input.casePackQty)}`,
      });
    }
  }

  for (const name of splitPackagingText(input.accessoryName)) {
    if (isSkipPackagingText(name)) continue;
    if (isInstructionOnlyAccessory(name)) {
      issues.push({ source: "accessory", value: name, reason: "instruction_only_accessory" });
      continue;
    }
    if (isGenericPackagingName(name)) {
      issues.push({ source: "accessory", value: name, reason: "generic_packaging_name" });
      continue;
    }
    const looksLikeSeal = /シール/.test(name);
    components.push({
      source: looksLikeSeal ? "seal" : "accessory",
      name,
      kind: looksLikeSeal ? "other" : inferPackagingKind(name, "accessory"),
      unit: looksLikeSeal ? "枚" : inferPackagingUnit(name),
      quantityPerUnit: looksLikeSeal && input.sealCount && input.sealCount > 0 ? input.sealCount : 1,
      note: looksLikeSeal
        ? `${CLASSIFICATION_PACKAGING_BOM_NOTE}: シール`
        : `${CLASSIFICATION_PACKAGING_BOM_NOTE}: 備品`,
    });
  }

  if (input.sealCount && input.sealCount > 0 && !components.some((component) => component.source === "seal")) {
    const sealName = extractNamedSeal(input.classificationNote);
    if (sealName) {
      components.push({
        source: "seal",
        name: sealName,
        kind: "other",
        unit: "枚",
        quantityPerUnit: input.sealCount,
        note: `${CLASSIFICATION_PACKAGING_BOM_NOTE}: 備考シール`,
      });
    } else {
      issues.push({ source: "seal", value: String(input.sealCount), reason: "seal_count_without_material_name" });
    }
  }

  return dedupeComponents(components, issues);
}

export function splitPackagingText(value: string | null | undefined): string[] {
  const cleaned = cleanPackagingText(value);
  if (!cleaned) return [];
  return cleaned
    .split(/[、,，・]|(?:\s{2,})/)
    .map(cleanPackagingText)
    .filter((text): text is string => Boolean(text));
}

export function inferPackagingKind(
  name: string,
  source: PackagingComponentSource,
): "bag" | "carton" | "desiccant" | "other" {
  const normalized = normalizeLinkText(name);
  if (source === "carton" || /段ボール|ダンボール|カートン/.test(name)) return "carton";
  if (source === "bag_tray" && (/トレー/.test(name) || /^(tm|tp|kt|s)-?\d+/i.test(normalized))) {
    return "other";
  }
  if (
    /バイタロン|カンソール|オイテック|アンチモールド|乾燥剤|脱酸素|防湿/.test(normalized) ||
    (source !== "bag_tray" && /no\d+|№\d+/.test(normalized))
  ) {
    return "desiccant";
  }
  if (
    /袋|パック|バッグ|チャック|合掌|三方|アルミ|クラフト|POT|ポット|蓋|おつまみ市場|こだわり宣言|つまみの達人|PHK?|金袋|バリア静防/i.test(
      name,
    )
  ) {
    return "bag";
  }
  if (source === "bag_tray" && /\d+\s*x\s*\d+/i.test(name.normalize("NFKC"))) return "bag";
  return "other";
}

export function normalizeLinkText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[№]/g, "no")
    .replace(/[‐‑–—−]/g, "-")
    .replace(/[×ｘ]/g, "x")
    .replace(/\s+/g, "")
    .replace(/[（）()［］\[\]【】・,，、。\.．:：;；/／\\]/g, "")
    .trim();
}

export function stableClassificationPackagingCode(name: string): string {
  return `${CLASSIFICATION_PACKAGING_CODE_PREFIX}-${hashText(normalizeLinkText(name)).slice(0, 8)}`;
}

function cleanPackagingText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = String(value).normalize("NFKC").replace(/\u00a0/g, " ").trim();
  if (!text || text === "-" || text === "－") return null;
  return text.replace(/\s+/g, " ");
}

function isSkipPackagingText(value: string): boolean {
  const normalized = normalizeLinkText(value);
  return (
    normalized === "" ||
    normalized === "なし" ||
    normalized === "無し" ||
    normalized === "無" ||
    normalized === "トレーなし" ||
    normalized === "トレー無" ||
    normalized === "薬" ||
    normalized === "薬無し" ||
    normalized === "薬無" ||
    normalized === "薬トレー無" ||
    normalized === "バイタロン100無"
  );
}

function isGenericPackagingName(value: string): boolean {
  const normalized = normalizeLinkText(value);
  return (
    normalized === "専用" ||
    normalized === "支給" ||
    normalized === "袋" ||
    normalized === "段ボール" ||
    normalized === "専用袋" ||
    normalized === "専用箱" ||
    normalized === "専用合掌袋" ||
    normalized === "専用スタンドパック" ||
    normalized === "専用スタンド袋" ||
    normalized === "専用チャック袋" ||
    normalized === "支給袋"
  );
}

function isInstructionOnlyAccessory(value: string): boolean {
  const normalized = normalizeLinkText(value);
  return /印字|賞味|固有記号|net|テープ|セット|たて向き|たて1段|左上部|トレー上/.test(normalized);
}

function extractNamedSeal(value: string | null | undefined): string | null {
  const cleaned = cleanPackagingText(value);
  if (!cleaned || !/シール/.test(cleaned)) return null;
  const first = splitPackagingText(cleaned).find((part) => /シール/.test(part) && !isInstructionOnlyAccessory(part));
  return first ?? null;
}

function inferPackagingUnit(name: string): string {
  return inferPackagingKind(name, "accessory") === "desiccant" ? "個" : "枚";
}

function dedupeComponents(
  components: PackagingComponent[],
  issues: PackagingComponentIssue[],
): { components: PackagingComponent[]; issues: PackagingComponentIssue[] } {
  const byKey = new Map<string, PackagingComponent>();
  for (const component of components) {
    const key = `${normalizeLinkText(component.name)}:${component.source}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, component);
      continue;
    }
    existing.quantityPerUnit = Math.max(existing.quantityPerUnit, component.quantityPerUnit);
  }
  return { components: [...byKey.values()], issues };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round6(value));
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0");
}
