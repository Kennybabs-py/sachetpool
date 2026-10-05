"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function NavLink({
  href,
  className,
  children,
  ...props
}: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const active =
    typeof href === "string" &&
    (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : undefined}
      className={cn(
        "relative text-sm font-semibold text-muted-foreground",
        "after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-200 after:ease-out after:content-['']",
        "motion-reduce:after:transition-none",
        "hover:after:origin-left hover:after:scale-x-100",
        "data-[active=true]:after:origin-left data-[active=true]:after:scale-x-100",
        "data-[active=true]:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
