"use client";

import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme provider (next-themes). Applies `class="dark"` / `class="light"` to
 * `<html>` before first paint via a blocking script, so there is no flash of
 * the wrong theme. Dark is the default and system preference is ignored —
 * this product is dark-first.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
