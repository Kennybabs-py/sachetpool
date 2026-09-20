import "server-only";

/**
 * Admin allowlist.
 *
 * `ADMIN_ADDRESSES` is a CSV of wallet addresses. Admin actions are
 * allowlist-gated in the app but executed by the server operator key — the
 * admin's own wallet never signs (see the plan's key-custody note).
 */

function adminAddresses(): string[] {
  return (process.env.ADMIN_ADDRESSES ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(address: string | null | undefined): boolean {
  if (!address) return false;
  return adminAddresses().includes(address.toLowerCase());
}
