"use client";

import Link from "next/link";
import { Factory, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { kitagoyaPath } from "@/lib/paths";

interface HeaderProps {
  title?: string;
  onMenuClick?: () => void;
  isSidebarCollapsed?: boolean;
  onSidebarCollapseToggle?: () => void;
}

export function Header({
  title = "業務管理システム",
  onMenuClick,
  isSidebarCollapsed = false,
  onSidebarCollapseToggle,
}: HeaderProps) {
  const SidebarToggleIcon = isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const sidebarLabel = isSidebarCollapsed ? "サイドバーを開く" : "サイドバーを閉じる";

  return (
    <header className="no-print fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between border-b border-[var(--border)] bg-white/95 px-3 shadow-[var(--shadow)] backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={onMenuClick}
          className="header-shell-button lg:hidden"
          aria-label="メニューを開く"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {onSidebarCollapseToggle && (
          <Button
            variant="outline"
            size="icon"
            onClick={onSidebarCollapseToggle}
            className="header-shell-button hidden lg:inline-flex"
            aria-label={sidebarLabel}
            title={sidebarLabel}
          >
            <SidebarToggleIcon className="h-5 w-5" />
          </Button>
        )}
        <Link
          href={kitagoyaPath("/")}
          className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface-subtle)] hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 sm:text-base"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-white">
            <Factory className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="truncate">北名古屋 製造</span>
        </Link>
        <span className="absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0">{title}</span>
      </div>

      <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-1.5 py-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-xs font-bold text-white">
          KS
        </div>
      </div>
    </header>
  );
}
