"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { cn } from "@/lib/utils";

interface MenuCardProps {
  title: string;
  buttonText: string;
  href: string;
  helpText?: string;
  disabled?: boolean;
}

export function MenuCard({ title, buttonText, href, helpText, disabled }: MenuCardProps) {
  const card = (
    <Card
      className={cn(
        "menu-card h-full transition-colors",
        disabled ? "bg-[var(--surface-subtle)]" : "hover:border-[var(--primary)] hover:bg-[var(--surface-subtle)]",
      )}
    >
      <CardHeader className="menu-card-header">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-[15px] font-semibold text-[var(--text)]">{title}</CardTitle>
          {helpText && <HelpTooltip text={helpText} />}
        </div>
      </CardHeader>
      <CardContent className="menu-card-content mt-auto">
        {disabled ? (
          <span className="menu-card-link flex w-full items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-strong)] px-3 text-sm font-semibold text-[var(--muted)]">
            {buttonText}
          </span>
        ) : (
          <span className="menu-card-link flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-3 text-sm font-semibold text-white transition-colors">
            <span>{buttonText}</span>
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </CardContent>
    </Card>
  );

  if (disabled) return card;

  return (
    <Link href={href} className="menu-card-anchor block h-full text-inherit hover:no-underline" aria-label={buttonText}>
      {card}
    </Link>
  );
}
