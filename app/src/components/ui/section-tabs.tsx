"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";

export type SectionTabItem = {
  id: string;
  label: string;
  count?: number | string;
  heading?: ReactNode;
  content: ReactNode;
};

export default function SectionTabs({
  ariaLabel,
  items,
  initialTabId,
  activeTabId,
  onActiveTabChange,
  className,
  inlineHeader = false,
  hashPrefix,
}: {
  ariaLabel: string;
  items: SectionTabItem[];
  initialTabId?: string;
  activeTabId?: string;
  onActiveTabChange?: (tabId: string) => void;
  className?: string;
  inlineHeader?: boolean;
  hashPrefix?: string;
}) {
  const baseId = useId();
  const firstId = items[0]?.id ?? "";
  const initialId = items.some((item) => item.id === initialTabId) ? initialTabId! : firstId;
  const isControlled = activeTabId != null;
  const [internalActiveId, setInternalActiveId] = useState(initialId);
  const activeId = isControlled && items.some((item) => item.id === activeTabId) ? activeTabId : internalActiveId;
  const activeItem = items.find((item) => item.id === activeId) ?? items[0];

  if (items.length === 0) return null;

  function setActiveId(tabId: string) {
    if (!isControlled) setInternalActiveId(tabId);
    onActiveTabChange?.(tabId);
  }

  useEffect(() => {
    if (!hashPrefix) return;

    function syncFromHash() {
      const hash = window.location.hash.replace(/^#/, "");
      const prefix = `${hashPrefix}-`;
      if (!hash.startsWith(prefix)) return;
      const tabId = hash.slice(prefix.length);
      if (!items.some((item) => item.id === tabId)) return;
      setActiveId(tabId);
      requestAnimationFrame(() => {
        document.getElementById(panelDomId(baseId, tabId, hashPrefix))?.scrollIntoView({ block: "start" });
      });
    }

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [hashPrefix, items]);

  function focusTab(index: number) {
    const next = items[index];
    if (!next) return;
    setActiveId(next.id);
    requestAnimationFrame(() => {
      document.getElementById(tabDomId(baseId, next.id))?.focus();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab((index + 1) % items.length);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab((index - 1 + items.length) % items.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(items.length - 1);
    }
  }

  const tabs = (
    <div className="section-tabs-list" role="tablist" aria-label={ariaLabel}>
      {items.map((item, index) => {
        const active = item.id === activeItem.id;
        return (
          <button
            key={item.id}
            id={tabDomId(baseId, item.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelDomId(baseId, item.id, hashPrefix)}
            className={`section-tab${active ? " is-active" : ""}`}
            tabIndex={active ? 0 : -1}
            onClick={() => setActiveId(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span>{item.label}</span>
            {item.count != null && <span className="section-tab-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={className ? `section-tabs ${className}` : "section-tabs"}>
      {inlineHeader ? (
        <div className="section-tabs-header">
          <h2>{activeItem.heading ?? activeItem.label}</h2>
          {tabs}
        </div>
      ) : (
        tabs
      )}
      {items.map((item) => (
        <div
          key={item.id}
          id={panelDomId(baseId, item.id, hashPrefix)}
          role="tabpanel"
          aria-labelledby={tabDomId(baseId, item.id)}
          className="section-tab-panel"
          hidden={item.id !== activeItem.id}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

function tabDomId(baseId: string, tabId: string) {
  return `${baseId}-tab-${tabId}`;
}

function panelDomId(baseId: string, tabId: string, hashPrefix?: string) {
  return hashPrefix ? `${hashPrefix}-${tabId}` : `${baseId}-panel-${tabId}`;
}
