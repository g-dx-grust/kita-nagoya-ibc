import { CircleHelp } from "lucide-react";

export function HelpTooltip({
  text,
  label = "補足",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={className ? `help-tooltip ${className}` : "help-tooltip"}
      tabIndex={0}
      aria-label={`${label}: ${text}`}
    >
      <CircleHelp className="h-4 w-4" aria-hidden="true" />
      <span className="help-tooltip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
