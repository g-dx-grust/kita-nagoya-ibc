"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { matchesQuery } from "@/lib/search";

export type ProductComboOption = {
  id: string;
  productCode: string;
  officialName: string;
  displayName?: string | null;
  aliases?: string[];
  specification?: string | null;
  brandName?: string | null;
  unit?: string;
};

/**
 * 生のクエリで素直に部分一致した箇所を <mark> でハイライトするための分割ヘルパ。
 * 大文字小文字を無視した raw indexOf で照合し、ヒットしなければ元テキストをそのまま返す
 * (カナ畳み込み経由のヒットなど、生の一致が無い場合はプレーン表示)。
 */
export function highlightMatch(text: string, rawQuery: string): ReactNode {
  const q = rawQuery.trim();
  if (!q || !text) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let hit = lowerText.indexOf(lowerQuery, from);
  if (hit === -1) return text;
  let key = 0;
  while (hit !== -1) {
    if (hit > from) parts.push(<Fragment key={key++}>{text.slice(from, hit)}</Fragment>);
    parts.push(
      <mark key={key++} className="search-hit">
        {text.slice(hit, hit + q.length)}
      </mark>,
    );
    from = hit + q.length;
    hit = lowerText.indexOf(lowerQuery, from);
  }
  if (from < text.length) parts.push(<Fragment key={key++}>{text.slice(from)}</Fragment>);
  return parts;
}

/**
 * 商品選択用の検索付きコンボボックス（要望C）。
 * 管理コード・正式名称・表示名・別名の部分一致で絞り込める。外部依存なし。
 * 既存の素の <select> を置換するための最小実装。
 */
export default function ProductCombobox({
  products,
  value,
  onChange,
  placeholder = "商品を検索（管理コード・名称・別名）",
  required,
  disabled,
  emptyOptionLabel,
  autoFocus,
}: {
  products: ProductComboOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** 指定すると「未選択に戻す」候補を先頭に出す。 */
  emptyOptionLabel?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => products.find((p) => p.id === value) ?? null, [products, value]);
  const label = selected ? `${selected.productCode} · ${selected.officialName}` : "";

  const filtered = useMemo(() => {
    const q = query.trim();
    // 共有の matchesQuery で全角/半角カナ・カナ↔ひらがな・全角英数を畳み込んで照合する
    // (例:「するめ」で「するめｿｰﾒﾝ」、「ｿｰﾒﾝ」で「するめソーメン」が相互ヒット)。空白区切りは AND。
    const list = q
      ? products.filter((p) =>
          matchesQuery(q, [
            p.productCode,
            p.officialName,
            p.displayName ?? "",
            p.specification ?? "",
            p.brandName ?? "",
            ...(p.aliases ?? []),
          ]),
        )
      : products;
    let sliced = list.slice(0, 80);
    // 商品が80件を超える場合でも、選択中の商品は必ずリストに出す（ネイティブselect同等の発見性）。
    if (!q && selected && !sliced.some((p) => p.id === selected.id)) {
      sliced = [selected, ...sliced].slice(0, 80);
    }
    return sliced;
  }, [products, query, selected]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // アクティブ行を可視範囲へスクロール
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="combobox" ref={rootRef}>
      <input
        className="combobox-input"
        type="text"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={selected ? label : placeholder}
        value={open ? query : label}
        aria-required={required}
        aria-expanded={open}
        role="combobox"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[active]) {
              e.preventDefault();
              choose(filtered[active].id);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul className="combobox-list" role="listbox" ref={listRef}>
          {emptyOptionLabel && (
            <li
              className={`combobox-option ${!value ? "is-selected" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose("");
              }}
            >
              <span className="combobox-name muted">{emptyOptionLabel}</span>
            </li>
          )}
          {filtered.length === 0 && <li className="combobox-empty">該当する商品がありません</li>}
          {filtered.map((p, i) => (
            <li
              key={p.id}
              data-idx={i}
              role="option"
              aria-selected={p.id === value}
              className={`combobox-option ${i === active ? "is-active" : ""} ${
                p.id === value ? "is-selected" : ""
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p.id);
              }}
            >
              <span className="combobox-code">{highlightMatch(p.productCode, query)}</span>
              <span className="combobox-name">{highlightMatch(p.officialName, query)}</span>
              {((p.displayName && p.displayName !== p.officialName) || p.specification || p.brandName || p.unit) && (
                <span className="combobox-sub">
                  {p.displayName && p.displayName !== p.officialName ? p.displayName : null}
                  {p.specification ? `・${p.specification}` : null}
                  {p.brandName ? `・${p.brandName}` : null}
                  {p.unit ? `・${p.unit}` : null}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
