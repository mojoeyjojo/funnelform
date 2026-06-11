import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  // Already signed in → straight to the dashboard.
  if (await getCurrentUser()) redirect(next ?? "/dashboard");

  return (
    <main className="bg-dreamy flex min-h-screen items-center justify-center px-5 py-16 sm:px-8">
      <div className="glass-strong w-full max-w-md rounded-[22px] p-7 sm:p-9">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
          Funnelform
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-[-0.02em]">
          Sign in to keep going
        </h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">
          No password needed. We’ll email you a link.
        </p>

      {error === "auth" && (
        <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          That sign-in link didn’t work. Please try again.
        </p>
      )}

        <AuthForm next={next ?? "/dashboard"} />

        <p className="mt-6 text-xs text-ink-500">
          <Link href="/" className="underline underline-offset-4 hover:text-signal-600">
            ← Back to the generator
          </Link>
        </p>
      </div>
    </main>
  );
}
