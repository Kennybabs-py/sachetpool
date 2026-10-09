import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/session";
import { Nav } from "@/components/shared/nav";
import { isAdmin } from "@/lib/admin";

/**
 * App shell for authenticated *and* anonymous visitors.
 *
 * Fixtures (board, pool details) are public — anyone can browse. The wallet is
 * optional here; pages and actions that need a session (My bets, Admin,
 * Sandbox) gate themselves, and staking prompts a wallet connect from the bet
 * sheet.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const admin = user ? isAdmin(user?.address) : false;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <Nav address={user?.address ?? null} admin={admin} />
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
