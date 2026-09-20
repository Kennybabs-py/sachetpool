import { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * Extends the built-in session types
   */
  interface Session {
    address?: string;
    user: {
      address?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  /**
   * Extends the built-in JWT types if you need custom properties on `token`
   */
  interface JWT {
    sub?: string;
  }
}
