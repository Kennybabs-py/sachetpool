import { renderSocialImage } from "@/components/brand/social-image";

export const runtime = "nodejs";
// Must stay in sync with `config/brand.json`; `yarn brand:assets` enforces it.
export const alt =
  "SACHET POOL — The crowd sets the odds. The chain settles the pot.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return renderSocialImage();
}
