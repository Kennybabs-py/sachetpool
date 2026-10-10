import {
  POOL_SOCIAL_SIZE,
  renderPoolSocialImage,
} from "@/components/brand/pool-social-image";

export const runtime = "nodejs";
export const revalidate = 300;
export const size = POOL_SOCIAL_SIZE;
export const contentType = "image/png";
export const alt =
  "SACHET POOL — a pari-mutuel football pool, staked in $SACH on Robinhood Chain.";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return renderPoolSocialImage(id);
}
