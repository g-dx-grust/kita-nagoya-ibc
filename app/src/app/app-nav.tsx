"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { stripKitagoyaBasePath } from "@/lib/paths";

type NavItem = {
  href: string;
  label: string;
};

export default function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const activePathname = stripKitagoyaBasePath(pathname);
  const activeHref =
    [...items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => {
        const href = stripKitagoyaBasePath(item.href);
        return href === "/"
          ? activePathname === "/"
          : activePathname === href || activePathname.startsWith(`${href}/`);
      })?.href ?? null;

  return (
    <nav aria-label="主ナビゲーション">
      {items.map((item) => {
        const isActive = item.href === activeHref;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? "active" : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
