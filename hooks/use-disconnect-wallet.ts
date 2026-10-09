import { signOut } from "next-auth/react";
import posthog from "posthog-js";
import { useAccount, useDisconnect } from "wagmi";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * Return a callback that disconnects the wallet and signs out of the SIWE session.
 *
 * Clearing only the wallet would leave the session alive, so the app would stay
 * "signed in" with no wallet behind it. Shared by the desktop wallet menu and
 * the mobile nav sheet so the teardown stays identical in both.
 *
 * The callback resets the PostHog identity when configured and signs out without
 * waiting for wallet disconnection. It uses the current URL as NextAuth's default
 * callback URL; the sign-out response controls navigation. Sign-out request and
 * response-parsing failures reject its promise; asynchronous wallet
 * disconnection failures do not.
 */
export function useDisconnectWallet() {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  return async function disconnectWallet() {
    // Clear the persisted identity before navigation ends this client session.
    if (isPostHogConfigured) posthog.reset();
    if (isConnected) disconnect();
    await signOut();
  };
}
