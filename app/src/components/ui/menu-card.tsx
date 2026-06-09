"use client";

import Link from "next/link";
import { ChevronRight, HelpCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MenuCardProps {
  title: string;
  buttonText: string;
  href: string;
  helpText?: string;
  disabled?: boolean;
}

export function MenuCard({ title, buttonText, href, helpText, disabled }: MenuCardProps) {
  return (
    <Card
      className={cn(
        "menu-card transition-colors",
        disabled ? "bg-[var(--surface-subtle)]" : "hover:border-[var(--primary)] hover:bg-[var(--surface-subtle)]",
      )}
    >
      <CardHeader className="menu-card-header">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-[15px] font-semibold text-[var(--text)]">{title}</CardTitle>
          {helpText && (
            <span className="inline-flex cursor-help" title={helpText}>
              <HelpCircle
                className="h-4 w-4 shrink-0 text-[var(--muted)]"
                aria-label={helpText}
              />
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="menu-card-content mt-auto">
        {disabled ? (
          <span className="menu-card-link flex w-full items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-strong)] px-3 text-sm font-semibold text-[var(--muted)]">
            {buttonText}
          </span>
        ) : (
          <Link
            href={href}
            className="menu-card-link flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] hover:no-underline"
          >
            <span>{buttonText}</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
