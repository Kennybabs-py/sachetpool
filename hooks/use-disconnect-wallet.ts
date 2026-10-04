import { signOut } from "next-auth/react";
import { useConnection, useDisconnect } from "wagmi";

/**
 * End the wallet connection and the SIWE session together.
 *
 * Clearing only the wallet would leave the session alive, so the app would stay
 * "signed in" with no wallet behind it. Shared by the desktop wallet menu and
 * the mobile nav sheet so the teardown stays identical in both.
 */
export function useDisconnectWallet() {
  const { isConnected } = useConnection();
  const { disconnect } = useDisconnect();

  return async function disconnectWallet() {
    if (isConnected) disconnect();
    await signOut({ callbackUrl: "/" });
  };
}
