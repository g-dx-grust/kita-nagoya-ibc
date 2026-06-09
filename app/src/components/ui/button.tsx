import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold outline-none transition-all disabled:pointer-events-none disabled:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--primary)] bg-[var(--primary)] text-white hover:border-[var(--primary-hover)] hover:bg-[var(--primary-hover)]",
        destructive:
          "border border-[var(--danger)] bg-[var(--danger)] text-white hover:border-[var(--danger-hover)] hover:bg-[var(--danger-hover)]",
        outline:
          "border border-[var(--border-strong)] bg-white text-[var(--text)] hover:bg-[var(--surface-subtle)]",
        secondary:
          "border border-[var(--border-strong)] bg-[var(--surface-strong)] text-[var(--text)] hover:bg-[var(--surface-subtle)]",
        ghost: "border border-transparent bg-transparent text-[var(--text)] hover:bg-[var(--surface-subtle)]",
        link: "border border-transparent bg-transparent text-[var(--accent)] underline-offset-4 hover:underline",
        success:
          "border border-[var(--success)] bg-[var(--success)] text-white hover:border-[var(--success-hover)] hover:bg-[var(--success-hover)]",
        warning: "border border-[var(--warn)] bg-white text-[var(--warn)] hover:bg-[var(--warn-soft)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
