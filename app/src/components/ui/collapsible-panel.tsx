import type { ReactNode } from "react";

export default function CollapsiblePanel({
  title,
  summary,
  children,
  open = false,
  className,
  contentClassName,
}: {
  title: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
  open?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <details className={className ? `collapsible-panel ${className}` : "collapsible-panel"} open={open || undefined}>
      <summary className="collapsible-summary">
        <span className="collapsible-indicator" aria-hidden="true" />
        <span className="collapsible-title">{title}</span>
        {summary && <span className="collapsible-meta">{summary}</span>}
      </summary>
      <div className={contentClassName ? `collapsible-content ${contentClassName}` : "collapsible-content"}>{children}</div>
    </details>
  );
}
