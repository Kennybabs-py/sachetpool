import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Canonical primary action: square corners, filled with `--primary`, and
 * inverting to the page background on hover. Every primary CTA in the app —
 * button or link — renders from this one recipe.
 */
export const primaryAction =
  "rounded-none border border-primary bg-primary text-primary-foreground transition-colors duration-100 ease-out hover:bg-background hover:text-foreground";

export const primaryActionSizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5",
  lg: "h-11 px-7",
} as const;

export type PrimaryActionSize = keyof typeof primaryActionSizes;

export type PrimaryButtonProps = Omit<
  ComponentProps<typeof Button>,
  "variant" | "size"
> & {
  size?: PrimaryActionSize;
};

/**
 * The app's primary button. Built on the shadcn `Button` so it keeps the base
 * behaviour (disabled/aria-invalid states, focus ring, press offset) while
 * `primaryAction` pins the look.
 */
export function PrimaryButton({
  className,
  size = "md",
  ...props
}: PrimaryButtonProps) {
  return (
    <Button
      className={cn(primaryAction, primaryActionSizes[size], className)}
      {...props}
    />
  );
}
