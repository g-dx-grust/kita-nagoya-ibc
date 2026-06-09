"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileSpreadsheet,
  Gauge,
  Home,
  Package,
  Printer,
  ReceiptText,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { kitagoyaPath, stripKitagoyaBasePath } from "@/lib/paths";

type MenuItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
};

const menuItems: MenuItem[] = [
  { href: kitagoyaPath("/"), label: "HOME", icon: Home, iconColor: "text-blue-600" },
  { href: kitagoyaPath("/production-plans"), label: "生産予定", icon: ClipboardList, iconColor: "text-emerald-600" },
  { href: kitagoyaPath("/production-plans/monthly"), label: "月間予定", icon: CalendarDays, iconColor: "text-purple-600" },
  { href: kitagoyaPath("/production-plans/allocate"), label: "当日割り当て", icon: Users, iconColor: "text-fuchsia-600" },
  // 運用の日報は日報蓄積(B)へ一本化。旧・生産予定連動日報(/daily-reports)は非表示(コードは残置)。
  { href: kitagoyaPath("/production-daily-reports"), label: "日報", icon: ClipboardCheck, iconColor: "text-green-700" },
  { href: kitagoyaPath("/staff-daily-reports"), label: "スタッフ日報", icon: ClipboardList, iconColor: "text-emerald-700" },
  { href: kitagoyaPath("/product-planning"), label: "製品計画", icon: Gauge, iconColor: "text-indigo-600" },
  { href: kitagoyaPath("/inventory"), label: "在庫", icon: Warehouse, iconColor: "text-cyan-700" },
  { href: kitagoyaPath("/purchases"), label: "発注", icon: ShoppingCart, iconColor: "text-orange-700" },
  { href: kitagoyaPath("/masters/products"), label: "商品", icon: Package, iconColor: "text-teal-700" },
  { href: kitagoyaPath("/capacity-review"), label: "能力確認", icon: FileSpreadsheet, iconColor: "text-amber-700" },
  { href: kitagoyaPath("/masters/materials"), label: "原料", icon: Boxes, iconColor: "text-lime-600" },
  { href: kitagoyaPath("/masters/packaging"), label: "資材", icon: Database, iconColor: "text-slate-600" },
  { href: kitagoyaPath("/masters/suppliers"), label: "仕入先", icon: Truck, iconColor: "text-amber-600" },
  { href: kitagoyaPath("/masters/work-areas"), label: "作業場所", icon: Warehouse, iconColor: "text-violet-600" },
  { href: kitagoyaPath("/masters/employees"), label: "従業員", icon: Users, iconColor: "text-rose-600" },
  { href: kitagoyaPath("/shifts"), label: "シフト", icon: CalendarDays, iconColor: "text-sky-700" },
  { href: kitagoyaPath("/prints"), label: "現場印刷", icon: Printer, iconColor: "text-gray-600" },
  { href: kitagoyaPath("/invoices"), label: "請求出力", icon: ReceiptText, iconColor: "text-red-600" },
];

interface SidebarProps {
  className?: string;
  isOpen?: boolean;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

function isActivePath(pathname: string, href: string) {
  const current = stripKitagoyaBasePath(pathname);
  const target = stripKitagoyaBasePath(href);
  return target === "/" ? current === "/" : current === target || current.startsWith(`${target}/`);
}

function SidebarContent({
  isCollapsed = false,
  onItemClick,
}: {
  isCollapsed?: boolean;
  onItemClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn("flex-1 overflow-y-auto px-2 py-3", isCollapsed && "px-2")}
      aria-label="北名古屋ナビゲーション"
    >
      <ul className="space-y-0.5">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onItemClick}
                aria-current={active ? "page" : undefined}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  "flex h-10 items-center rounded-lg text-sm transition-colors hover:no-underline",
                  isCollapsed ? "justify-center px-0" : "gap-3 px-3",
                  active
                    ? "bg-[var(--primary-soft)] font-semibold text-[var(--text)]"
                    : "font-medium text-[var(--muted)] hover:bg-gray-100 hover:text-[var(--text)]",
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", item.iconColor)} />
                <span className={cn("truncate", isCollapsed && "sr-only")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({
  className,
  isOpen,
  isCollapsed = false,
  onToggle,
}: SidebarProps) {
  return (
    <>
      <aside
        className={cn(
          "no-print fixed left-0 top-14 z-40 hidden h-[calc(100vh-3.5rem)] flex-col border-r border-[var(--border)] bg-white transition-[width] duration-200 lg:flex",
          isCollapsed ? "w-[72px]" : "w-[220px]",
          className,
        )}
      >
        <SidebarContent isCollapsed={isCollapsed} />
      </aside>

      {isOpen && <div className="no-print fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onToggle} />}

      {isOpen && (
        <aside className="no-print fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-[var(--border)] bg-white lg:hidden">
          <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
                KS
              </div>
              <span className="text-base font-semibold text-[var(--text)]">メニュー</span>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-transparent text-[var(--muted)] hover:bg-gray-100"
              aria-label="メニューを閉じる"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <SidebarContent onItemClick={onToggle} />
        </aside>
      )}
    </>
  );
}
