"use client";

import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

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
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="default"
          onClick={onMenuClick}
          className="h-10 min-w-[172px] justify-start px-3 text-white lg:hidden"
          aria-label="メニューを開く"
        >
          <Menu className="h-5 w-5" />
          <span>北名古屋 製造</span>
        </Button>
        {onSidebarCollapseToggle && (
          <Button
            variant="default"
            onClick={onSidebarCollapseToggle}
            className="hidden h-10 min-w-[190px] justify-start px-3 text-white lg:inline-flex"
            aria-label={sidebarLabel}
            title={sidebarLabel}
          >
            <SidebarToggleIcon className="h-5 w-5" />
            <span>北名古屋 製造</span>
          </Button>
        )}
        <span className="absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0">{title}</span>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-1 py-1">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-[var(--muted)]" aria-label="通知">
          <Bell className="h-5 w-5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-[var(--border)]" />
        <Button variant="ghost" size="icon" className="h-9 w-9 text-[var(--muted)]" aria-label="設定">
          <Settings className="h-5 w-5" />
        </Button>
        <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-xs font-bold text-white">
          KS
        </div>
      </div>
    </header>
  );
}
