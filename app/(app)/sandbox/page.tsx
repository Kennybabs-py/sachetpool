import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { getSandboxState } from "@/lib/sandbox";
import { SandboxPanel } from "@/components/admin/sandbox-panel";
import { AuthGate } from "@/components/wallet/auth-gate";

export const dynamic = "force-dynamic";

/**
 * Admin sandbox: run a dummy fixture through the full lifecycle — sync, open a
 * pool, bet, resolve, claim — then delete the DB rows.
 *
 * Allowlist-gated here and again inside every server action. The operator key
 * executes all on-chain steps, so the admin's own wallet never signs.
 */
export default async function SandboxPage() {
  const user = await getSessionUser();
  if (!user) return <AuthGate />;
  if (!isAdmin(user.address)) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Not authorized.
      </p>
    );
  }

  const state = await getSandboxState();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Sandbox</h1>
        <p className="text-sm text-muted-foreground">
          Exercise the full pool lifecycle against the contract with a dummy
          fixture. Every on-chain step is signed by the server operator key.
        </p>
      </div>
      <SandboxPanel state={state} />
    </div>
  );
}
