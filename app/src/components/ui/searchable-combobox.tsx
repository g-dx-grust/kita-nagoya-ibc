"use client";

import { Fragment, type CSSProperties, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { matchesQuery } from "@/lib/search";

export type SearchableComboboxOption = {
  key?: string;
  value: string;
  label: string;
  code?: string;
  description?: string | null;
  searchText?: string;
  disabled?: boolean;
};

export function highlightSearchMatch(text: string, rawQuery: string): ReactNode {
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

export default function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = "検索して選択",
  emptyOptionLabel,
  name,
  required,
  disabled,
  ariaLabel,
  maxVisible = 80,
}: {
  options: SearchableComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyOptionLabel?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  maxVisible?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [listStyle, setListStyle] = useState<CSSProperties>();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);
  const selectedLabel = selected ? optionDisplayLabel(selected) : "";
  const hasEmptyOption = Boolean(emptyOptionLabel);

  const filtered = useMemo(() => {
    const q = query.trim();
    const list = q
      ? options.filter((option) =>
          matchesQuery(q, [option.code ?? "", option.label, option.description ?? "", option.searchText ?? ""]),
        )
      : options;
    let sliced = list.slice(0, maxVisible);
    if (!q && selected && !sliced.some((option) => option.value === selected.value)) {
      sliced = [selected, ...sliced].slice(0, maxVisible);
    }
    return sliced;
  }, [maxVisible, options, query, selected]);
  const optionCount = filtered.length + (hasEmptyOption ? 1 : 0);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(optionCount - 1, 0)));
  }, [optionCount]);

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

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
    setActive(0);
  }

  function chooseActive() {
    if (hasEmptyOption && active === 0) {
      choose("");
      return;
    }
    const option = filtered[active - (hasEmptyOption ? 1 : 0)];
    if (option && !option.disabled) choose(option.value);
  }

  return (
    <div className="combobox" ref={rootRef}>
      {name && <input type="hidden" name={name} value={value} />}
      <input
        className="combobox-input"
        type="text"
        autoComplete="off"
        disabled={disabled}
        placeholder={selected ? selectedLabel : placeholder}
        value={open ? query : selectedLabel}
        aria-required={required}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && optionCount > 0 ? `${listId}-option-${active}` : undefined}
        aria-label={ariaLabel ?? placeholder}
        role="combobox"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(hasEmptyOption ? 1 : 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((current) => Math.min(current + 1, Math.max(optionCount - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            if (open && optionCount > 0) {
              event.preventDefault();
              chooseActive();
            }
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul className="combobox-list" id={listId} role="listbox" ref={listRef} style={listStyle}>
          {emptyOptionLabel && (
            <li
              id={`${listId}-option-0`}
              data-idx={0}
              role="option"
              aria-selected={!value}
              className={`combobox-option ${active === 0 ? "is-active" : ""} ${!value ? "is-selected" : ""}`}
              onMouseEnter={() => setActive(0)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose("");
              }}
            >
              <span className="combobox-name muted">{emptyOptionLabel}</span>
            </li>
          )}
          {filtered.length === 0 && <li className="combobox-empty">該当する候補がありません</li>}
          {filtered.map((option, index) => (
            <li
              key={option.key ?? option.value}
              id={`${listId}-option-${index + (hasEmptyOption ? 1 : 0)}`}
              data-idx={index + (hasEmptyOption ? 1 : 0)}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled}
              className={`combobox-option ${index + (hasEmptyOption ? 1 : 0) === active ? "is-active" : ""} ${
                option.value === value ? "is-selected" : ""
              } ${option.disabled ? "is-disabled" : ""}`}
              onMouseEnter={() => setActive(index + (hasEmptyOption ? 1 : 0))}
              onMouseDown={(event) => {
                event.preventDefault();
                if (option.disabled) return;
                choose(option.value);
              }}
            >
              {option.code && <span className="combobox-code">{highlightSearchMatch(option.code, query)}</span>}
              <span className="combobox-name">{highlightSearchMatch(option.label, query)}</span>
              {option.description && <span className="combobox-sub">{option.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function optionDisplayLabel(option: SearchableComboboxOption): string {
  return option.code ? `${option.code} · ${option.label}` : option.label;
}
