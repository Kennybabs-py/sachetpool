import { PrimaryLink } from "@/components/common/primary-link";

/**
 * Where to buy $SACH.
 *
 * TODO: paste the purchase link (DEX, bridge or on-ramp) between the quotes.
 * Until it is set, the section shows a placeholder marker instead of a dead
 * button, so a missing link can never ship as a broken CTA.
 */
const BUY_SACH_URL = "";

const STEPS = [
  {
    title: "Install a wallet",
    body: "A wallet is your account: it holds $SACH and signs transactions. Install a browser extension or mobile app such as MetaMask, Rabby or Rainbow. It generates a secret recovery phrase — write it down offline and never share it with anyone.",
  },
  {
    title: "Add Robinhood Chain",
    body: "Sachet runs on Robinhood Chain. When you connect, your wallet is asked to switch networks — approve it. If the network is not listed yet, add it manually in your wallet's settings using the RPC details from the project docs.",
  },
  {
    title: "Buy and deposit $SACH",
    body: "Buy $SACH using the link below, then send it to your own wallet address on Robinhood Chain. Check the network before you send: tokens sent on the wrong chain are not recoverable.",
  },
  {
    title: "Connect and sign in",
    body: "Open the board, connect your wallet and sign the one-time message. Signing is free, proves the wallet is yours, and never moves funds.",
  },
  {
    title: "Place a small first stake",
    body: "Pick a fixture, choose Home, Draw or Away, and stake the minimum. Your wallet approves the token once, then you confirm the bet and it is in the pool.",
  },
] as const;

/** Primer for first-time wallet users: create a wallet, fund it, place a bet. */
export function NewToWeb3() {
  return (
    <section
      id="new-to-web3"
      className="scroll-mt-20 border-t border-border bg-background"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:py-24">
        <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
          New to Web3?
        </p>
        <h2 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
          From zero to your first stake.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
          You do not need to understand the whole ecosystem. You need a wallet,
          a little $SACH, and five minutes.
        </p>

        <ol className="mt-12 flex flex-col gap-px border border-border bg-border">
          {STEPS.map((step, index) => (
            <li key={step.title} className="bg-background p-6">
              <span className="font-mono text-xs tracking-[0.18em] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-base font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-4 border border-border bg-muted/40 p-6">
          <div>
            <p className="text-sm font-medium">Get $SACH</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Buy the token, then send it to your own wallet on Robinhood Chain.
            </p>
          </div>
          {BUY_SACH_URL ? (
            <PrimaryLink
              href={BUY_SACH_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-auto"
            >
              Buy $SACH
            </PrimaryLink>
          ) : (
            <span className="ml-auto border border-dashed border-border px-4 py-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
              Purchase link not set
            </span>
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Never share your seed phrase. No legitimate site — including Sachet —
          will ever ask for it.
        </p>
      </div>
    </section>
  );
}
