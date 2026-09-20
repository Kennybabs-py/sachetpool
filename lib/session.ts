import "server-only";

import { auth } from "@/config/nextauthConfg";

/**
 * Server-side session helpers, shared by every RSC page and Server Action.
 *
 * Identity is the lowercase wallet address from the NextAuth SIWE session.
 * Balances and on-chain state are never read from the session — pages read them
 * fresh from the mirror / chain.
 */

export interface SessionUser {
  /** Lowercase wallet address. */
  address: string;
}

/** The signed-in wallet, or `null` when there is no valid session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const address = session?.address?.toLowerCase();
  return address ? { address } : null;
}

/**
 * The signed-in wallet, or throws `UNAUTHORIZED`. Use in Server Actions, which
 * must verify the session independently of the `(app)` layout gate.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
