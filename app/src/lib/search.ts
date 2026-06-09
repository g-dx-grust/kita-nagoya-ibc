// 検索用の日本語テキスト正規化ユーティリティ。
// 商品/原料/資材名には全角・半角カナや全角英数が混在する(例: するめｿｰﾒﾝ, ﾃﾄﾗ, ＡＢＣ123)。
// 「するめ」「ｽﾙﾒ」「スルメ」を相互にヒットさせるため、NFKC で幅を揃え、カタカナを
// ひらがなへ畳み込み、小文字化する。検索ボックス全般(在庫・マスタ・一覧・コンボボックス)で再利用する。

/** 検索照合用に文字列を正規化する(NFKC → カタカナ→ひらがな → 小文字 → 余白圧縮)。 */
export function normalizeForSearch(input: string | null | undefined): string {
  if (!input) return "";
  let s = input.normalize("NFKC").toLowerCase();
  // カタカナ(全角)→ひらがな に畳み込み、カナ表記ゆれを吸収する。
  s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  return s.replace(/\s+/g, " ").trim();
}

/**
 * クエリが対象フィールド群にヒットするか。
 * - 空クエリは常に true(全件表示)。
 * - 空白区切りの各語をすべて含む(AND)場合にヒット。
 * - 双方を normalizeForSearch で正規化して比較する。
 */
export function matchesQuery(query: string, fields: Array<string | null | undefined>): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const haystack = normalizeForSearch(fields.filter(Boolean).join(" "));
  return q.split(" ").every((term) => term === "" || haystack.includes(term));
}

/**
 * 正規化込みで部分一致するかを返す簡易ヘルパ(単一フィールド向け)。
 */
export function normalizedIncludes(haystack: string | null | undefined, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return normalizeForSearch(haystack).includes(q);
}
