// ケース換算ユーティリティ。
//
// 方針: 内部の数量(plannedQuantity / actualQuantity / forecastQuantity / onHand / BOM所要量)は
// 一貫して「基本単位(袋/枚/kg)」の生数値で保持し、ケース換算は **表示層のみ** で行う。
// これにより既存の計算ロジック・在庫台帳・原価計算に副作用を出さずにケース表記へ対応できる。
//
// 業務ルール(docs/memo): 「生産予測: ケース数で繰り上げ発行」「在庫表と発注は全てケース数で表記」。
// ユーザー確定仕様: ケースは整数のみ表示し、端数は常に切り上げる。
// ケース入数(casePackQty)が未設定の品目(原料kg等)は従来どおり基本単位で表示する。

export const CASE_UNIT = "ケース";

const numberFmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });

/** 数値を日本語ロケールで整形する。null/NaN は "—"。-0 は 0 に正規化する。 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return numberFmt.format(value === 0 ? 0 : value);
}

/**
 * 現場で扱う数量表示用の丸め。正数は切り上げ、負数は絶対値が大きくなる方向へ切り上げる。
 * 内部計算値はそのまま保持し、表示と入力候補だけ整数化する。
 */
export function ceilDisplayQuantity(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = value >= 0 ? Math.ceil(value) : Math.floor(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatQuantity(
  quantity: number | null | undefined,
  baseUnit?: string | null,
): string {
  const rounded = ceilDisplayQuantity(quantity);
  if (rounded == null) return "—";
  return `${formatNumber(rounded)} ${baseUnit ?? ""}`.trim();
}

/**
 * 基本単位の数量をケース数へ換算する。端数は切り上げ(メモ「ケース数で繰り上げ発行」)。
 * casePackQty が未設定/0以下なら null を返す(= この品目はケース表記不可)。
 */
export function quantityToCases(
  quantity: number,
  casePackQty: number | null | undefined,
): number | null {
  if (casePackQty == null || casePackQty <= 0) return null;
  if (!Number.isFinite(quantity)) return null;
  // 端数は常に「絶対値が大きくなる方向」へ切り上げる。
  // 正(発注/予測/あふれ)は多め、負(在庫不足)は不足を安全側に大きく見せる。
  const cases = quantity >= 0 ? Math.ceil(quantity / casePackQty) : Math.floor(quantity / casePackQty);
  return Object.is(cases, -0) ? 0 : cases; // -0 を 0 に正規化
}

/** 端数なし(ちょうどNケース)か。表示の補助に使う。 */
export function isWholeCases(quantity: number, casePackQty: number | null | undefined): boolean {
  if (casePackQty == null || casePackQty <= 0) return false;
  if (!Number.isFinite(quantity)) return false;
  return Math.abs(quantity % casePackQty) < 1e-9;
}

export type CaseFormatOptions = {
  /** 1ケースあたりの基本単位数。未設定なら基本単位表示にフォールバック。 */
  casePackQty?: number | null;
  /** 基本単位ラベル(袋/枚/kg 等)。フォールバック表示やツールチップに使う。 */
  baseUnit?: string | null;
};

/**
 * 基本単位とケース整数を併記する。casePackQty が無い品目は基本単位のみ表示。
 * 例: formatCases(608, {casePackQty:24, baseUnit:"袋"}) => "608 袋 / 26 ケース"
 */
export function formatCases(
  quantity: number | null | undefined,
  opts: CaseFormatOptions = {},
): string {
  if (quantity == null || !Number.isFinite(quantity)) return "—";
  const base = formatQuantity(quantity, opts.baseUnit);
  const cases = quantityToCases(quantity, opts.casePackQty);
  if (cases == null) {
    return base;
  }
  return `${base} / ${formatNumber(cases)} ${CASE_UNIT}`;
}

/**
 * 表示テキストと、ツールチップ(title属性)用のケース入数説明をまとめて返す。
 * ケース整数は概数になりうる(端数切り上げ)ため、1ケースあたりの基本単位数も残す。
 */
export function formatCasesWithDetail(
  quantity: number | null | undefined,
  opts: CaseFormatOptions = {},
): { text: string; detail: string | null; isCase: boolean } {
  if (quantity == null || !Number.isFinite(quantity)) {
    return { text: "—", detail: null, isCase: false };
  }
  const cases = quantityToCases(quantity, opts.casePackQty);
  const base = formatQuantity(quantity, opts.baseUnit);
  if (cases == null) {
    return { text: base, detail: null, isCase: false };
  }
  const detail = opts.casePackQty
    ? `1ケース=${formatNumber(opts.casePackQty)} ${opts.baseUnit ?? ""}`.trim()
    : base;
  return { text: `${base} / ${formatNumber(cases)} ${CASE_UNIT}`, detail, isCase: true };
}
