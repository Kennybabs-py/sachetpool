import type { ComponentProps } from "react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  primaryAction,
  primaryActionSizes,
  type PrimaryActionSize,
} from "@/components/common/primary-button";
import { cn } from "@/lib/utils";

export type PrimaryLinkProps = Omit<
  ComponentProps<typeof Link>,
  "className"
> & {
  className?: string;
  size?: PrimaryActionSize;
};

/**
 * A `next/link` dressed as a `PrimaryButton`. Sharing `buttonVariants` and
 * `primaryAction` keeps navigational CTAs pixel-identical to real buttons.
 */
export function PrimaryLink({
  className,
  size = "md",
  ...props
}: PrimaryLinkProps) {
  return (
    <Link
      className={cn(
        buttonVariants({ variant: "default", size: "default" }),
        primaryAction,
        primaryActionSizes[size],
        className,
      )}
      {...props}
    />
  );
}
