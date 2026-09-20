import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Address } from "viem";

import {
  type SiweMessage,
  parseSiweMessage,
  validateSiweMessage,
} from "viem/siwe";

import { prisma } from "@/lib/prisma";
import { publicClient } from "@/lib/chain/server-client";

/**
 * NextAuth v5 with Sign-In with Ethereum.
 *
 * The wallet address is the entire identity; the lowercase form is canonical
 * everywhere (sessions, `User.address`, bets). Signature verification runs
 * against the Robinhood Chain RPC so ERC-1271 smart wallets resolve too.
 */

function normaliseAddress(address: string): Address {
  return address.toLowerCase() as Address;
}

export const authOptions: NextAuthConfig = {
  trustHost: true,
  providers: [
    Credentials({
      name: "Ethereum",
      credentials: {
        message: { label: "Message", placeholder: "0x0", type: "text" },
        signature: { label: "Signature", placeholder: "0x0", type: "text" },
      },
      async authorize(credentials) {
        try {
          const siweMessage = parseSiweMessage(
            credentials?.message as string,
          ) as SiweMessage;

          if (!siweMessage?.address) return null;

          const address = normaliseAddress(siweMessage.address);

          if (
            !validateSiweMessage({
              address,
              message: siweMessage,
            })
          ) {
            return null;
          }

          const authUrl =
            process.env.AUTH_URL ||
            process.env.NEXTAUTH_URL ||
            (process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : null);
          if (!authUrl) return null;

          const authHost = new URL(authUrl).host;
          if (siweMessage.domain !== authHost) return null;

          const csrfToken =
            credentials && "csrfToken" in credentials
              ? credentials.csrfToken
              : undefined;

          if (siweMessage.nonce !== csrfToken) return null;

          const valid = await publicClient.verifyMessage({
            address,
            message: credentials?.message as string,
            signature: credentials?.signature as `0x${string}`,
          });

          if (!valid) return null;

          return { id: address };
        } catch {
          return null;
        }
      },
    }),
  ],
  events: {
    /**
     * Upsert the wallet identity on every successful sign-in. Betting itself
     * needs only a wallet (the indexer also upserts any address it sees in
     * `BetPlaced`), so this is a best-effort convenience, not a gate.
     */
    async signIn({ user }) {
      const address = user.id?.toLowerCase();
      if (!address) return;
      try {
        await prisma.user.upsert({
          where: { address },
          update: {},
          create: { address },
        });
      } catch (err) {
        console.error("Failed to upsert user on sign-in:", err);
      }
    },
  },
  callbacks: {
    async session({ session, token }) {
      const address = token.sub?.toLowerCase();
      session.address = address;
      session.user = {
        ...session.user,
        name: address,
        address,
      };
      return session;
    },
  },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
