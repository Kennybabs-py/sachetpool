"use client";

import { signOut } from "next-auth/react";
import { ChevronDown, LogOut } from "lucide-react";
import { useConnection, useDisconnect } from "wagmi";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SachBalance } from "@/components/wallet/sach-balance";
import { shortAddress } from "@/lib/format";

/**
 * Wallet control for the app nav. The trigger shows the signed-in address; the
 * menu opens with the live `$SACH` balance, the full address, and Disconnect.
 *
 * Disconnecting also ends the SIWE session, otherwise the app would stay
 * "signed in" with no wallet behind it.
 */
export function WalletMenu({ address }: { address: string }) {
  const { isConnected } = useConnection();
  const { mutateAsync } = useDisconnect();

  async function handleDisconnect() {
    if (isConnected) await mutateAsync();
    await signOut({ callbackUrl: "/" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-10 shrink-0 items-center gap-2 rounded-none border border-border px-3 font-mono text-xs font-medium text-foreground transition-colors duration-100 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {shortAddress(address)}
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 rounded-none">
        <div className="px-2 py-1.5">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            Wallet
          </p>
          <p className="mt-1 font-mono text-xs break-all text-foreground">
            {address}
          </p>
        </div>

        <SachBalance />

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={handleDisconnect}>
          <LogOut aria-hidden />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
