import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, profile }) {
      // TODO: Require a verified Google email.
      // TODO: Lowercase the email before lookup.
      // TODO: Check the normalized email exists in AllowedEmail.
      // TODO: Reject sign-in when the email is not allowlisted.
      void user;
      void profile;
      return true;
    },
    async jwt({ token }) {
      // TODO: Load the application's role from the allowlist/User record.
      return token;
    },
    async session({ session }) {
      // TODO: Expose only the application-safe role/session fields.
      return session;
    },
  },
});
