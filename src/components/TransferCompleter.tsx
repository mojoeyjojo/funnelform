"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { takeTransferToken } from "@/lib/pendingPrompt";

// Mounted once in the root layout: after any auth round-trip, if this browser
// holds a transfer token (stashed by prepareTransfer while still a guest) and
// the session is now a PERMANENT user, redeem it — the guest's quizzes get
// reassigned to the signed-in account. Silent no-op on every other page load.
export default function TransferCompleter() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Cheap pre-check before touching the network: no token, no work.
      let hasToken = false;
      try {
        hasToken = Boolean(localStorage.getItem("ff_transfer_token"));
      } catch {
        return;
      }
      if (!hasToken) return;

      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      // Still a guest (or signed out): keep the token; it may be redeemed
      // after the next sign-in. It self-expires server-side after 1h.
      if (!data.user || data.user.is_anonymous === true || cancelled) return;

      const token = takeTransferToken();
      if (!token) return;
      try {
        const res = await fetch("/api/transfer/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const { transferred } = (await res.json()) as { transferred?: boolean };
        // Soft refresh so server-rendered lists (dashboard, editor) pick up
        // the moved quizzes — NOT a hard reload, which would abort an
        // in-flight stashed-prompt generation on the homepage. Only when
        // something actually moved; the common same-user convert path is a
        // no-op.
        if (res.ok && transferred && !cancelled) router.refresh();
      } catch {
        // Network hiccup: token is already consumed client-side, but the
        // quizzes are merely not moved yet; support can re-run via SQL.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
