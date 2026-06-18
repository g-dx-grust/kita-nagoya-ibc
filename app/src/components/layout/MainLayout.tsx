"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { stripKitagoyaBasePath } from "@/lib/paths";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "kitagoya:sidebar:collapsed";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activePathname = stripKitagoyaBasePath(pathname);
  const isPublicShiftEntry = activePathname.startsWith("/shift-entry/");

  useEffect(() => {
    setIsSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  function toggleSidebarCollapsed() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  if (isPublicShiftEntry) {
    return <main className="public-entry-shell">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header
        title="北名古屋 製造管理"
        isSidebarCollapsed={isSidebarCollapsed}
        onMenuClick={() => setIsSidebarOpen(true)}
        onSidebarCollapseToggle={toggleSidebarCollapsed}
      />
      <Sidebar
        isOpen={isSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarOpen(false)}
      />
      <main
        className={cn(
          "min-h-[calc(100vh-3.5rem)] min-w-0 overflow-x-hidden pt-14 transition-[margin] duration-200",
          isSidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[220px]",
        )}
      >
        <div className="w-full min-w-0 max-w-full p-4 sm:p-5 lg:p-6 xl:p-7">{children}</div>
      </main>
    </div>
  );
}
