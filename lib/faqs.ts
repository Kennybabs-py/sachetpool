/**
 * FAQ content for `/faqs`.
 *
 * Answers are plain strings (no markup) so the same data can feed both the
 * accordion and the `FAQPage` structured data in `app/faqs/page.tsx`.
 */
export type FaqItem = {
  question: string;
  answer: string;
};

export type FaqGroup = {
  title: string;
  items: readonly FaqItem[];
};

export const FAQ_GROUPS: readonly FaqGroup[] = [
  {
    title: "The market",
    items: [
      {
        question: "What is a pari-mutuel market?",
        answer:
          "A pool where every stake on a match goes into one pot. Nobody sets the odds — they fall out of how the crowd splits its money. Winners divide the pot in proportion to what they staked, so you are betting against the other backers, not against a bookmaker.",
      },
      {
        question: "How is this different from a bookmaker?",
        answer:
          "A bookmaker quotes a fixed price and carries the risk of being wrong. Here the price moves as money arrives and the house takes no position — it opens the pool, escrows the stakes and settles the result. The only house cut is a small rake taken from the pot before payouts; the current rate is read from the contract and shown before you stake.",
      },
      {
        question: "Where do the odds come from?",
        answer:
          "The number next to each outcome is the pool divided by the amount staked on that outcome. Back a side and you move its price. Because the rake comes out of the pot before payouts, your realised return is a little below the headline multiple.",
      },
      {
        question: "What is $SACH, and which chain is this on?",
        answer:
          "$SACH is the token every pool is staked in. Sachet runs on Robinhood Chain, testnet first, so the whole flow can be exercised before real value is at stake.",
      },
      {
        question: "What does it cost?",
        answer:
          "One small rake per pool, taken from the pot before payouts. The rate is set on-chain and shown live before you stake. Voided pools take nothing. Joining, claiming and refunds are free — you only pay the network's gas.",
      },
    ],
  },
  {
    title: "Joining a pool",
    items: [
      {
        question: "How do I join a pool?",
        answer:
          "Connect a wallet and sign a one-time message to sign in. That signature is free, sends no transaction, and only proves the wallet is yours. Then pick a fixture on the board, choose Home, Draw or Away, enter a stake and confirm. The first time you stake a token you approve it once, then place the bet.",
      },
      {
        question: "Can I change or cancel a bet?",
        answer:
          "No. A stake is final the moment it enters the pool, which is what lets the contract promise a payout. Betting closes at kickoff and the pool is sealed.",
      },
      {
        question: "Where does my money sit while the pool is open?",
        answer:
          "In the SachetMarket contract, escrowed per pool. The operator can open pools and submit results, but it cannot move your stake: payouts and refunds are computed by the contract and can only be sent to you.",
      },
      {
        question: "Is there a minimum stake?",
        answer:
          "No. Any stake above zero is accepted — the contract only rejects an empty bet. Even a tiny stake earns its proportional share of the pot, though network gas can outweigh dust-sized amounts.",
      },
    ],
  },
  {
    title: "Settlement",
    items: [
      {
        question: "How does a pool settle?",
        answer:
          "After kickoff the operator submits the final result on-chain — Home, Draw or Away — in a single resolve transaction. The contract records the outcome, the winning stake and whether the pool is refunding, all in the event log. The result cannot be edited afterwards.",
      },
      {
        question: "How do I get paid?",
        answer:
          "Claims are pull-based: you call claim yourself and the contract sends your share to your wallet. A winner receives floor((pot − rake) × your stake ÷ winning stake), and you claim once per pool.",
      },
      {
        question: "What if the match is cancelled, or nobody backed the winner?",
        answer:
          "The pool goes into refund mode: every stake comes back in full and no rake is taken. A cancelled fixture is resolved as Void, and refunds work exactly the same way.",
      },
      {
        question: "Do I have to claim, or is it automatic?",
        answer:
          "You claim. The contract never pushes funds — pull payments keep settlement independent of a keeper, so your payout waits for you until you collect it.",
      },
    ],
  },
] as const;

/** Flattened view, used for the `FAQPage` structured data. */
export const FAQS: readonly FaqItem[] = FAQ_GROUPS.flatMap(
  (group) => group.items,
);
