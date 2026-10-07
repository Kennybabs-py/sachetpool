import { signOut } from "next-auth/react";
import posthog from "posthog-js";
import { useAccount, useDisconnect } from "wagmi";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * End the wallet connection and the SIWE session together.
 *
 * Clearing only the wallet would leave the session alive, so the app would stay
 * "signed in" with no wallet behind it. Shared by the desktop wallet menu and
 * the mobile nav sheet so the teardown stays identical in both.
 */
export function useDisconnectWallet() {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  return async function disconnectWallet() {
    // Clear the persisted identity before navigation ends this client session.
    if (isPostHogConfigured) posthog.reset();
    if (isConnected) disconnect();
    await signOut({ callbackUrl: "/" });
  };
}
