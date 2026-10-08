import { PrimaryLink } from "@/components/common/primary-link";

const BUY_SACH_URL =
  "https://www.ponsfamily.com/launchpad/0xa8497F4ed068736A202E411eb10D669fB5E0A20b";

export default function GetSach() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-4 border border-border bg-muted/40 p-6">
      <div>
        <p className="text-sm font-medium">Get $SACH</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Buy the token with the wallet you wish to stake with.
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
  );
}
