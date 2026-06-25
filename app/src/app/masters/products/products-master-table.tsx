"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import { forecastMethodLabel, productionTypeLabel } from "@/lib/labels";
import { kitagoyaApiPath, kitagoyaPath } from "@/lib/paths";
import { matchesQuery, normalizeForSearch } from "@/lib/search";
import MasterDeleteButton from "../master-delete-button";

export type ProductRow = {
  id: string;
  productCode: string;
  officialName: string;
  displayName: string | null;
  aliases: string[];
  packSizeG: number | null;
  casePackQty: number | null;
  packCount: number | null;
  specification: string | null;
  packCountExpression: string | null;
  bundleCount: string | null;
  brandName: string | null;
  bagTrayName: string | null;
  cartonName: string | null;
  accessoryName: string | null;
  sealCount: number | null;
  sourceSheetName: string | null;
  sourceRowNumber: number | null;
  unit: string;
  productionType: string;
  forecastMethod: string;
  category: string | null;
  safetyStockQuantity: number;
  standardProductionLotSize: number;
  rawMaterialLossToleranceRate: number;
  defaultWorkAreaName: string | null;
  bomItemCount: number;
  capacitySummary: string;
  billingEnabled: boolean;
  usedAtKitagoya: boolean;
  hasBom: boolean;
  hasCapacity: boolean;
  hasBilling: boolean;
  validFromLabel: string;
  validToLabel: string;
};

export default function ProductsMasterTable({ products }: { products: ProductRow[] }) {
  const [query, setQuery] = useState("");
  const [productionType, setProductionType] = useState("");
  const [forecastMethod, setForecastMethod] = useState("");
  const [category, setCategory] = useState("");
  const [unsetupOnly, setUnsetupOnly] = useState(false);
  // 既定で北名古屋使用の商品のみ表示(暫定スコープの確認用)。
  const [kitagoyaOnly, setKitagoyaOnly] = useState(true);

  const productionTypes = useMemo(
    () => distinct(products.map((p) => p.productionType)),
    [products],
  );
  const forecastMethods = useMemo(
    () => distinct(products.map((p) => p.forecastMethod)),
    [products],
  );
  const categories = useMemo(
    () => distinct(products.map((p) => p.category ?? "")),
    [products],
  );

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (kitagoyaOnly && !p.usedAtKitagoya) return false;
        if (productionType && p.productionType !== productionType) return false;
        if (forecastMethod && p.forecastMethod !== forecastMethod) return false;
        if (category && (p.category ?? "") !== category) return false;
        // レシピ/能力/手間賃のいずれかが未設定の商品だけに絞る。
        if (unsetupOnly && p.hasBom && p.hasCapacity && p.hasBilling) return false;
        return matchesQuery(query, [
          p.productCode,
          p.officialName,
          p.displayName,
          p.specification,
          p.brandName,
          p.bagTrayName,
          p.cartonName,
          p.accessoryName,
          p.category,
          p.defaultWorkAreaName,
          p.capacitySummary,
          p.sourceSheetName,
          ...p.aliases,
        ]);
      }),
    [products, query, productionType, forecastMethod, category, unsetupOnly, kitagoyaOnly],
  );

  const hasActiveFilters = !!(
    query ||
    productionType ||
    forecastMethod ||
    category ||
    unsetupOnly ||
    !kitagoyaOnly
  );
  const summary = useMemo(() => {
    const scoped = products.filter((p) => !kitagoyaOnly || p.usedAtKitagoya);
    const missingBom = scoped.filter((p) => !p.hasBom).length;
    const missingCapacity = scoped.filter((p) => !p.hasCapacity).length;
    const missingBilling = scoped.filter((p) => !p.hasBilling).length;
    const missingWorkArea = scoped.filter((p) => p.usedAtKitagoya && !p.defaultWorkAreaName).length;
    const readyCount = scoped.filter(
      (p) => p.hasBom && p.hasCapacity && p.hasBilling && (!p.usedAtKitagoya || p.defaultWorkAreaName),
    ).length;
    return {
      scopedCount: scoped.length,
      readyCount,
      missingBom,
      missingCapacity,
      missingBilling,
      missingWorkArea,
      needsActionCount: scoped.length - readyCount,
    };
  }, [kitagoyaOnly, products]);

  function resetFilters() {
    setQuery("");
    setProductionType("");
    setForecastMethod("");
    setCategory("");
    setUnsetupOnly(false);
    setKitagoyaOnly(true);
  }

  return (
    <>
      <div className="product-master-command">
        <div className="product-master-command-title">
          <span className={`badge ${summary.needsActionCount > 0 ? "warn" : "success"}`}>
            {summary.needsActionCount > 0 ? "整備が必要" : "整備済み"}
          </span>
          <strong>商品整備</strong>
          <span className="subtext">
            {summary.readyCount} / {summary.scopedCount} 商品
          </span>
        </div>
        <div className="product-master-checks">
          <span className={`badge ${summary.missingWorkArea > 0 ? "warn" : "success"}`}>
            標準作業場所未設定 {summary.missingWorkArea}
          </span>
          <span className={`badge ${summary.missingBom > 0 ? "warn" : "success"}`}>レシピ未設定 {summary.missingBom}</span>
          <span className={`badge ${summary.missingCapacity > 0 ? "warn" : "success"}`}>能力未設定 {summary.missingCapacity}</span>
          <span className={`badge ${summary.missingBilling > 0 ? "warn" : "success"}`}>手間賃未設定 {summary.missingBilling}</span>
        </div>
      </div>
      <CollapsiblePanel
        title="表内検索・絞り込み"
        summary={`${filtered.length} / ${products.length} 件${hasActiveFilters ? " / 条件あり" : ""}`}
        open={hasActiveFilters}
      >
        <div className="filter-bar compact-controls">
          <input
            type="search"
            className="filter-search"
            placeholder="管理コード・名称・規格・ブランド・作業場所で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="商品を検索"
          />
          <select value={productionType} onChange={(e) => setProductionType(e.target.value)}>
            <option value="">区分(すべて)</option>
            {productionTypes.map((value) => (
              <option key={value} value={value}>
                {productionTypeLabel(value)}
              </option>
            ))}
          </select>
          <select value={forecastMethod} onChange={(e) => setForecastMethod(e.target.value)}>
            <option value="">予測方式(すべて)</option>
            {forecastMethods.map((value) => (
              <option key={value} value={value}>
                {forecastMethodLabel(value)}
              </option>
            ))}
          </select>
          {categories.length > 0 && (
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">カテゴリ(すべて)</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value || "未設定"}
                </option>
              ))}
            </select>
          )}
          <label className="filter-check">
            <input
              type="checkbox"
              checked={kitagoyaOnly}
              onChange={(e) => setKitagoyaOnly(e.target.checked)}
            />
            北名古屋のみ
          </label>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={unsetupOnly}
              onChange={(e) => setUnsetupOnly(e.target.checked)}
            />
            未整備のみ
          </label>
          <button type="button" className="secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
            条件クリア
          </button>
          <span className="filter-count">
            {filtered.length} / {products.length} 件
          </span>
        </div>
      </CollapsiblePanel>
      <div className="table-frame standard-list-frame products-master-frame">
        <table className="standard-list-table products-master-list-table">
          <colgroup>
            <col className="product-code-col" />
            <col className="product-name-col" />
            <col className="product-spec-col" />
            <col className="product-brand-col" />
            <col className="product-site-col" />
            <col className="product-setup-col" />
            <col className="product-packaging-col" />
            <col className="product-material-col" />
            <col className="product-type-col" />
            <col className="product-forecast-col" />
            <col className="product-category-col" />
            <col className="product-number-col" />
            <col className="product-number-col" />
            <col className="product-number-col" />
            <col className="product-work-area-col" />
            <col className="product-bom-col" />
            <col className="product-capacity-col" />
            <col className="product-billing-col" />
            <col className="product-validity-col" />
            <col className="product-action-col" />
          </colgroup>
          <thead>
            <tr>
              <th>管理コード</th>
              <th>正式名称</th>
              <th>規格</th>
              <th>ブランド</th>
              <th>拠点</th>
              <th>登録状況</th>
              <th>包装</th>
              <th>分類表資材</th>
              <th>区分</th>
              <th>予測方式</th>
              <th>カテゴリ</th>
              <th>安全在庫</th>
              <th>標準ロット</th>
              <th>ロス率許容</th>
              <th>標準作業場所</th>
              <th>BOM</th>
              <th>生産能力 / 人時</th>
              <th>請求</th>
              <th>有効期間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const missingWorkArea = p.usedAtKitagoya && !p.defaultWorkAreaName;
              const needsAction = missingWorkArea || !p.hasBom || !p.hasCapacity || !p.hasBilling;
              return (
              <tr key={p.id} className={`product-master-row${needsAction ? " row-needs-action" : ""}`}>
                <td data-label="管理コード">{highlight(p.productCode, query)}</td>
                <td className="wrap-cell product-name-cell" data-label="正式名称">
                  {highlight(p.officialName, query)}
                  {needsAction && (
                    <div className="product-master-row-badges">
                      {missingWorkArea && <span className="badge warn">標準作業場所未設定</span>}
                      {!p.hasBom && <span className="badge warn">レシピ未設定</span>}
                      {!p.hasCapacity && <span className="badge warn">能力未設定</span>}
                      {!p.hasBilling && <span className="badge warn">手間賃未設定</span>}
                    </div>
                  )}
                  {p.aliases.length > 0 && (
                    <div className="subtext">別名: {p.aliases.join(", ")}</div>
                  )}
                  {p.sourceSheetName && (
                    <div className="subtext">
                      {p.sourceSheetName}
                      {p.sourceRowNumber ? ` ${p.sourceRowNumber}行目` : ""}
                    </div>
                  )}
                </td>
                <td data-label="規格">{p.specification ?? "—"}</td>
                <td data-label="ブランド">{p.brandName ?? "—"}</td>
                <td data-label="拠点">
                  {p.usedAtKitagoya ? (
                    <span className="badge info">北名古屋</span>
                  ) : (
                    <span className="badge muted">対象外</span>
                  )}
                </td>
                <td data-label="登録状況">
                  <SetupBadge set={p.hasBom} label="レシピ" />
                  <SetupBadge set={p.hasCapacity} label="能力" />
                  <SetupBadge set={p.hasBilling} label="手間賃" />
                </td>
                <td className="wrap-cell" data-label="包装">{packagingSummary(p)}</td>
                <td className="wrap-cell" data-label="分類表資材">{materialSummary(p)}</td>
                <td data-label="区分">{productionTypeLabel(p.productionType)}</td>
                <td data-label="予測方式">{forecastMethodLabel(p.forecastMethod)}</td>
                <td data-label="カテゴリ">{p.category ?? "—"}</td>
                <td className="right" data-label="安全在庫">{p.safetyStockQuantity}</td>
                <td className="right" data-label="標準ロット">{p.standardProductionLotSize}</td>
                <td className="right" data-label="ロス率許容">{formatPercent(p.rawMaterialLossToleranceRate)}</td>
                <td data-label="標準作業場所">
                  <span className={`badge ${missingWorkArea ? "warn" : p.defaultWorkAreaName ? "info" : "muted"}`}>
                    {p.defaultWorkAreaName ?? "—"}
                  </span>
                </td>
                <td className="right" data-label="BOM">{p.bomItemCount}</td>
                <td className="wrap-cell" data-label="生産能力 / 人時">{p.capacitySummary}</td>
                <td data-label="請求">{p.billingEnabled ? "対象" : "—"}</td>
                <td data-label="有効期間">
                  {p.validFromLabel}
                  {" 〜 "}
                  {p.validToLabel}
                </td>
                <td className="action-cell" data-label="操作">
                  <div className="table-actions">
                    <Link href={kitagoyaPath(`/masters/products/${p.id}`)}>編集</Link>
                    <MasterDeleteButton
                      endpoint={kitagoyaApiPath(`/products/${p.id}`)}
                      label={`商品「${p.officialName}」`}
                    />
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// 登録状況バッジ。設定済みは緑(success)、未設定は控えめ(muted)に「○未」で表示する。
function SetupBadge({ set, label }: { set: boolean; label: string }) {
  return set ? (
    <span className="badge success">{label}</span>
  ) : (
    <span className="badge muted">{label}未</span>
  );
}

function distinct(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v !== ""))).sort();
}

// 包装情報を「単位 / 入り数g / 入数(c/s) / ケース入数」のコンパクト表記にまとめる。未設定は — 。
function packagingSummary(p: ProductRow): string {
  const dash = "—";
  const parts = [
    p.unit || dash,
    p.specification ?? (p.packSizeG != null ? `${p.packSizeG.toLocaleString()}g` : dash),
    p.packCountExpression ?? (p.packCount != null ? p.packCount.toLocaleString() : dash),
    p.casePackQty != null ? p.casePackQty.toLocaleString() : dash,
    p.bundleCount ? `結束${p.bundleCount}` : dash,
  ];
  return parts.join(" / ");
}

function materialSummary(p: ProductRow): string {
  const parts = [
    p.bagTrayName ? `袋: ${p.bagTrayName}` : null,
    p.cartonName ? `箱: ${p.cartonName}` : null,
    p.accessoryName ? `備品: ${p.accessoryName}` : null,
    p.sealCount != null ? `シール: ${p.sealCount}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "—";
}

function formatPercent(value: number) {
  return `${((Number.isFinite(value) ? value : 0) * 100).toLocaleString("ja-JP", {
    maximumFractionDigits: 1,
  })}%`;
}

// 生の文字列に対してベストエフォートでマッチ箇所を <mark> 表示する。
// クエリは空白区切りの最初の語を対象にし、正規化込みで部分一致を探す。
function highlight(text: string, query: string): React.ReactNode {
  const term = normalizeForSearch(query).split(" ")[0];
  if (!term) return text;
  const normalized = normalizeForSearch(text);
  const start = normalized.indexOf(term);
  // 正規化で文字数が変わると元文字列のオフセットがずれるため、長さが一致するときのみ装飾する。
  if (start < 0 || normalized.length !== text.length) return text;
  return (
    <Fragment>
      {text.slice(0, start)}
      <mark className="search-hit">{text.slice(start, start + term.length)}</mark>
      {text.slice(start + term.length)}
    </Fragment>
  );
}
