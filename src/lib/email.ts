import "server-only";

// Owner-notification email (build spec §5.6 / §9). This is the REAL proof that
// Claim 3's loop closes: when a lead is captured, the owner gets pinged. Sent
// via Resend's REST API (no SDK dependency). Never throws, delivery must not
// break lead capture; returns whether it sent so the caller can record it.
//
// Config: RESEND_API_KEY + RESEND_FROM (e.g. "Treeflow <leads@yourdomain>").
// No-ops (logs once) if unconfigured, so the player/lead flow runs regardless.

export type OwnerNotification = {
  ownerEmail: string;
  quizTitle: string;
  leadName?: string | null;
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

// Trial-ending reminder (§5.9): sent by the daily cron to subscribers whose
// Stripe trial ends within the next 24-48 hours, so the upcoming charge is
// never a surprise. Same never-throws contract as the lead notification.
type TrialReminder = {
  to: string;
  endsAtIso: string; // the subscription's trial_end
  priceLabel: string; // e.g. "$39/month"
  manageUrl: string; // deep link to the dashboard's Manage billing button
};

export async function sendTrialEndingReminder(r: TrialReminder): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn("[email] RESEND not configured, trial reminder skipped");
    return false;
  }

  const endsAt = new Date(r.endsAtIso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const lines = [
    `<p>Heads up: your Treeflow Pro trial ends on <strong>${escapeHtml(endsAt)}</strong>.</p>`,
    `<p>If Pro is working for you, there is nothing to do. Your ${escapeHtml(r.priceLabel)} subscription starts automatically and you keep unlimited live quizzes, full analytics, and branding control.</p>`,
    `<p>Not ready? <a href="${escapeHtml(r.manageUrl)}">Manage your billing</a> and cancel before then, and you will not be charged.</p>`,
    `<p style="color:#6a72d6;font-size:12px">Sent by Treeflow</p>`,
  ];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: r.to,
        subject: `Your Treeflow Pro trial ends on ${endsAt}`,
        html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6">${lines.join("")}</div>`,
      }),
    });
    if (!res.ok) {
      console.error("[email] trial reminder send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] trial reminder error:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function sendOwnerLeadNotification(n: OwnerNotification): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn("[email] RESEND not configured, owner notification skipped");
    return false;
  }

  const subject = n.leadName
    ? `New lead: ${n.leadName} on "${n.quizTitle}"`
    : `New lead on "${n.quizTitle}"`;
  const lines = [
    `<p><strong>${escapeHtml(n.leadName || n.leadEmail)}</strong> just completed your quiz.</p>`,
    n.leadName ? `<p>Email: ${escapeHtml(n.leadEmail)}</p>` : "",
    n.outcomeName ? `<p>Result: <strong>${escapeHtml(n.outcomeName)}</strong></p>` : "",
    n.leadPhone ? `<p>Phone: ${escapeHtml(n.leadPhone)}</p>` : "",
    `<p><a href="${escapeHtml(n.leadsUrl)}">View all your leads →</a></p>`,
    `<p style="color:#6a72d6;font-size:12px">Sent by Treeflow</p>`,
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

// Resolve the From/Reply-To for a lead follow-up. Default sends from the verified
// Treeflow subdomain with the owner's brand as the display name and replies routed
// to the owner inbox (beats a no-reply sender). customFrom is the verified custom
// domain address (Phase 3); until provisioned, customFrom is null and we fall back
// to the subdomain even when mode is custom_domain.
const FOLLOWUP_SUBDOMAIN_ADDRESS = "leads@contact.treeflow.tech";

export interface FollowUpSenderInput {
  mode: "subdomain" | "custom_domain";
  brandName: string;
  ownerEmail: string;
  customFrom: string | null;
}

export function resolveFollowUpSender(input: FollowUpSenderInput): {
  from: string;
  replyTo: string;
} {
  if (input.mode === "custom_domain" && input.customFrom) {
    return { from: input.customFrom, replyTo: input.ownerEmail };
  }
  // Strip characters that would break the "Name <addr>" header.
  const safeName = input.brandName.replace(/[<>"]/g, "").trim() || "Treeflow";
  return {
    from: `${safeName} <${FOLLOWUP_SUBDOMAIN_ADDRESS}>`,
    replyTo: input.ownerEmail,
  };
}

export interface FollowUpEmail {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
}

// Send one follow-up email via Resend. Returns true on a 2xx. Never throws (the
// outbox decides retry from the boolean), mirroring sendOwnerLeadNotification.
export async function sendFollowUpEmail(email: FollowUpEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY not set; cannot send follow-up");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        reply_to: email.replyTo,
        subject: email.subject,
        html: email.html,
      }),
    });
    if (!res.ok) {
      console.error("[email] follow-up send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] follow-up send error:", err instanceof Error ? err.message : err);
    return false;
  }
}
