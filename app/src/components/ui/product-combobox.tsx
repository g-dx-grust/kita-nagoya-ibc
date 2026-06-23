"use client";

import { Fragment, type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";

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
  name,
  required,
  disabled,
  emptyOptionLabel,
  ariaLabel,
  autoFocus,
  separateSearchInput = false,
  searchPlaceholder = "商品名・コードで候補を検索",
}: {
  products: ProductComboOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  /** 指定すると「未選択に戻す」候補を先頭に出す。 */
  emptyOptionLabel?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** 選択済み表示と検索入力を分ける。フォーム内で検索文字を Enter しても即選択しない。 */
  separateSearchInput?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [listStyle, setListStyle] = useState<CSSProperties>();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = useMemo(() => products.find((p) => p.id === value) ?? null, [products, value]);
  const label = selected ? `${selected.productCode} · ${selected.officialName}` : "";
  const hasEmptyOption = Boolean(emptyOptionLabel);

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
  const optionCount = filtered.length + (hasEmptyOption ? 1 : 0);

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

  useEffect(() => {
    setActive((current) => {
      if (optionCount <= 0) return -1;
      if (current < 0) return separateSearchInput ? -1 : 0;
      return Math.min(current, optionCount - 1);
    });
  }, [optionCount, separateSearchInput]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 12;
      const maxWidth = Math.max(180, window.innerWidth - viewportPadding * 2);
      const width = Math.min(Math.max(rect.width, 320), maxWidth);
      const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - viewportPadding - width);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(300, openUp ? spaceAbove : spaceBelow));

      setListStyle({
        position: "fixed",
        top: openUp ? undefined : rect.bottom + 2,
        bottom: openUp ? window.innerHeight - rect.top + 2 : undefined,
        left,
        right: "auto",
        width,
        maxHeight,
        zIndex: 70,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function chooseActive() {
    if (active < 0 || active >= optionCount) return;
    if (hasEmptyOption && active === 0) {
      choose("");
      return;
    }
    const option = filtered[active - (hasEmptyOption ? 1 : 0)];
    if (option) choose(option.id);
  }

  function moveActive(delta: 1 | -1) {
    setActive((current) => {
      if (optionCount <= 0) return -1;
      if (current < 0) return delta > 0 ? 0 : optionCount - 1;
      return Math.min(Math.max(current + delta, 0), optionCount - 1);
    });
  }

  const activeDescendant = open && active >= 0 && optionCount > 0 ? `${listId}-option-${active}` : undefined;
  const listbox = open ? (
    <ul className="combobox-list" id={listId} role="listbox" ref={listRef} style={listStyle}>
      {emptyOptionLabel && (
        <li
          id={`${listId}-option-0`}
          data-idx={0}
          role="option"
          aria-selected={!value}
          className={`combobox-option ${active === 0 ? "is-active" : ""} ${!value ? "is-selected" : ""}`}
          onMouseEnter={() => setActive(0)}
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
          id={`${listId}-option-${i + (hasEmptyOption ? 1 : 0)}`}
          data-idx={i + (hasEmptyOption ? 1 : 0)}
          role="option"
          aria-selected={p.id === value}
          className={`combobox-option ${i + (hasEmptyOption ? 1 : 0) === active ? "is-active" : ""} ${
            p.id === value ? "is-selected" : ""
          }`}
          onMouseEnter={() => setActive(i + (hasEmptyOption ? 1 : 0))}
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
  ) : null;

  if (separateSearchInput) {
    return (
      <div className="combobox combobox--separate" ref={rootRef}>
        {name && <input type="hidden" name={name} value={value} />}
        <button
          type="button"
          className={`combobox-trigger ${selected ? "" : "is-placeholder"}`}
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => {
            setOpen((current) => !current);
            setActive(-1);
          }}
        >
          <span>{selected ? label : placeholder}</span>
        </button>
        <input
          className="combobox-input combobox-search-input"
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={searchPlaceholder}
          value={query}
          aria-required={required}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={activeDescendant}
          aria-label={searchPlaceholder}
          role="combobox"
          onFocus={() => {
            setOpen(true);
            setActive(-1);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              moveActive(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              moveActive(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (open && active >= 0) chooseActive();
              else setOpen(true);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {listbox}
      </div>
    );
  }

  return (
    <div className="combobox" ref={rootRef}>
      {name && <input type="hidden" name={name} value={value} />}
      <input
        className="combobox-input"
        type="text"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={selected ? label : placeholder}
        value={open ? query : label}
        aria-required={required}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel ?? placeholder}
        role="combobox"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(hasEmptyOption ? 1 : 0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            moveActive(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveActive(-1);
          } else if (e.key === "Enter") {
            if (open && optionCount > 0) {
              e.preventDefault();
              chooseActive();
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {listbox}
    </div>
  );
}
