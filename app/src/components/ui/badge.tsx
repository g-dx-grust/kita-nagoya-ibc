import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--primary)] text-white",
        secondary: "border-[var(--border-strong)] bg-[var(--surface-strong)] text-[var(--text)]",
        destructive: "border-transparent bg-[var(--danger)] text-white",
        outline: "border-[var(--border-strong)] bg-white text-[var(--text)]",
        success: "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]",
        warning: "border-[var(--warn-border)] bg-[var(--warn-soft)] text-[var(--warn)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "span";

  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
