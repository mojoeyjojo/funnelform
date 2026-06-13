import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser, safeNextPath } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  // `next` is attacker-controllable — guard against open redirect.
  const safe = safeNextPath(next);
  // Already signed in with a REAL account → straight through. Guests stay:
  // this page doubles as their upgrade flow (link an identity to the SAME
  // user, so their quizzes come along).
  const user = await getCurrentUser();
  if (user && !user.is_anonymous) redirect(safe);
  const convert = user?.is_anonymous === true;

  return (
    <main className="bg-dreamy flex min-h-screen items-center justify-center px-5 py-16 sm:px-8">
      <div className="glass-strong w-full max-w-md rounded-[22px] p-7 sm:p-9">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">
          {convert ? "Create your free account" : "Sign in to keep going"}
        </h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">
          {convert ? "Your quizzes stay right where they are." : "Welcome back."}
        </p>

      {error === "auth" && (
        <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          That sign-in link didn’t work. Please try again.
        </p>
      )}

        <AuthForm next={safe} mode={convert ? "convert" : "signin"} />
      </div>
    </main>
  );
}
