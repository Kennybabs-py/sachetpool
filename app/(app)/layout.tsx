import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/session";
import { Nav } from "@/components/shared/nav";
import { AuthGate } from "@/components/wallet/auth-gate";

/** SIWE gate for every authenticated route. */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) return <AuthGate />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <Nav address={user.address} />
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
