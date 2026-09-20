import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { listAdminPools, listPoolCandidates } from "@/lib/pools";
import { AdminPanel } from "@/components/admin/admin-panel";

export const dynamic = "force-dynamic";

/**
 * Admin dashboard: open pools on-chain and resolve/void expired ones.
 *
 * Allowlist-gated here and again inside every server action.
 */
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isAdmin(user.address)) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Not authorized.
      </p>
    );
  }

  const [candidates, pools] = await Promise.all([
    listPoolCandidates(),
    listAdminPools(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Create pools and settle results. Actions execute via the server
          operator key.
        </p>
      </div>
      <AdminPanel candidates={candidates} pools={pools} />
    </div>
  );
}
