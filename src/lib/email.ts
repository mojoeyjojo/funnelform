import "server-only";

// Owner-notification email (build spec §5.6 / §9). This is the REAL proof that
// Claim 3's loop closes — when a lead is captured, the owner gets pinged. Sent
// via Resend's REST API (no SDK dependency). Never throws — delivery must not
// break lead capture; returns whether it sent so the caller can record it.
//
// Config: RESEND_API_KEY + RESEND_FROM (e.g. "Funnelform <leads@yourdomain>").
// No-ops (logs once) if unconfigured, so the player/lead flow runs regardless.

type OwnerNotification = {
  ownerEmail: string;
  quizTitle: string;
  leadEmail: string;
  leadPhone?: string | null;
  outcomeName?: string | null;
  leadsUrl: string; // deep link to the owner's leads view
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendOwnerLeadNotification(n: OwnerNotification): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn("[email] RESEND not configured — owner notification skipped");
    return false;
  }

  const subject = `New lead on "${n.quizTitle}"`;
  const lines = [
    `<p><strong>${escapeHtml(n.leadEmail)}</strong> just completed your quiz.</p>`,
    n.outcomeName ? `<p>Result: <strong>${escapeHtml(n.outcomeName)}</strong></p>` : "",
    n.leadPhone ? `<p>Phone: ${escapeHtml(n.leadPhone)}</p>` : "",
    `<p><a href="${escapeHtml(n.leadsUrl)}">View all your leads →</a></p>`,
    `<p style="color:#6a72d6;font-size:12px">Sent by Funnelform</p>`,
  ].filter(Boolean);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: n.ownerEmail,
        subject,
        html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6">${lines.join("")}</div>`,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Resend error:", err instanceof Error ? err.message : err);
    return false;
  }
}
