import AuthForm from "./AuthForm";

// Mandatory signup overlay. Deliberately non-dismissible: no close button, no
// backdrop click, no Escape. Every quiz operation (edit, open, publish) is
// account-walled, so the overlay sits on top of the thing they want. The
// backdrop is deliberately near-transparent: SEEING the finished quiz is what
// entices the signup, so it must stay readable behind the card.
export default function AuthOverlay({
  next,
  mode = "convert",
  title,
  subtitle,
}: {
  next: string;
  mode?: "signin" | "convert";
  title: string;
  subtitle: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/15 px-5 py-10 backdrop-blur-[2px]">
      <div className="glass-strong w-full max-w-md rounded-[22px] p-7 shadow-2xl sm:p-9">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">{title}</h2>
        <p className="mb-6 mt-1 text-sm text-ink-500">{subtitle}</p>
        <AuthForm next={next} mode={mode} />
      </div>
    </div>
  );
}
