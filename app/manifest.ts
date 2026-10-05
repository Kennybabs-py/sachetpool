import type { MetadataRoute } from "next";

import { BRAND } from "@/lib/brand";

/** Web app manifest, generated from the shared brand spec. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.wordmark,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.colors.ink,
    theme_color: BRAND.colors.ink,
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
