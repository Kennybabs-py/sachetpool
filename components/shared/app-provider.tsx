import { type ReactNode, Fragment } from "react";
import { WagmiProvider } from "wagmi";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@/lib/tanstack";
import { wagmiConfig } from "@/config/wagmiConfig";

const queryClient = new QueryClient();

type Props = {
  children: ReactNode;
};
export default function AppProvider({ children }: Props) {
  return (
    <Fragment>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{children}</TooltipProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </Fragment>
  );
}
