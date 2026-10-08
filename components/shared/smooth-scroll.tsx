"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getClientSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Lenis smooth scrolling for the whole document.
 *
 * Subscribes to the reduced-motion media query as an external store: smooth
 * scrolling is exactly the motion that setting exists to remove, so when it is
 * set we render the app without Lenis entirely. Anchor links
 * (`#how-it-works`) are handled by Lenis' `anchors` option.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reducedMotion = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (reducedMotion) return <>{children}</>;

  // return (
  //   <ReactLenis
  //     root
  //     options={{
  //       autoRaf: true,
  //       anchors: true,
  //       duration: 1.05,
  //       smoothWheel: true,
  //     }}
  //   >
  //     {children}
  //   </ReactLenis>
  // );

  return <> {children}</>;
}
