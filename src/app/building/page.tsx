import PendingBuild from "@/components/PendingBuild";

// Post-auth landing for the signup funnel: replays the stashed prompt with a
// visible build progress widget, then redirects into the editor. All logic is
// client-side (the stash lives in localStorage).
export default function BuildingPage() {
  return (
    <main className="bg-dreamy flex min-h-screen items-center justify-center px-5 py-16 sm:px-8">
      <div className="glass-strong w-full max-w-md rounded-[22px] p-7 text-center sm:p-9">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Building your quiz</h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">This takes a few seconds.</p>
        <PendingBuild />
      </div>
    </main>
  );
}
