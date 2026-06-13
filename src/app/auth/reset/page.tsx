import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import ResetPasswordForm from "@/components/ResetPasswordForm";

// Landing page for password-recovery links. The email link goes through
// /auth/callback (code exchange creates the session) and redirects here, so
// by the time this renders the user IS signed in and updateUser can set the
// new password.
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <main className="bg-dreamy flex min-h-screen items-center justify-center px-5 py-16 sm:px-8">
      <div className="glass-strong w-full max-w-md rounded-[22px] p-7 sm:p-9">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Set a new password</h1>
        {user ? (
          <>
            <p className="mb-6 mt-1 text-sm text-ink-500">
              {user.email ? `For ${user.email}.` : "For your account."}
            </p>
            <ResetPasswordForm />
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-500">
            This reset link has expired.{" "}
            <Link href="/login" className="underline underline-offset-4 hover:text-[var(--signal)]">
              Request a new one from the sign-in page.
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
