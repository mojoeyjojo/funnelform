import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QuizConfig } from "@/lib/schema";

export const runtime = "nodejs";

// Owner-only CSV export of a quiz's captured leads. RLS (leads_owner) scopes the
// rows to the signed-in owner; guests are walled out entirely. The sheet is the
// real exit for no-website owners who work the leads by hand, so it includes one
// readable column per quiz question (the option LABEL the lead chose), not just
// contact details. Plain CSV on purpose: it opens in Excel / Sheets / Numbers,
// which already do the date filtering and sorting a built-in filter would.

type LeadRow = {
  name: string | null;
  email: string | null;
  phone: string | null;
  outcome_id: string | null;
  answers: Record<string, string> | null;
  created_at: string;
};

// Always-quote, and defuse spreadsheet formula injection: a cell starting with
// = + - @ is prefixed with a space so Excel treats it as text, not a formula.
function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? ` ${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return new Response("Unauthorized", { status: 401 });
  }

  // RLS restricts both reads to this owner; a non-owner id just yields nothing.
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, config")
    .eq("id", id)
    .maybeSingle();
  if (!quiz) return new Response("Not found", { status: 404 });

  const { data } = await supabase
    .from("leads")
    .select("name, email, phone, outcome_id, answers, created_at")
    .eq("quiz_id", id)
    .order("created_at", { ascending: false });
  const leads = (data ?? []) as LeadRow[];

  const config = quiz.config as QuizConfig | null;
  const questions = config?.questions ?? [];
  const outcomeName = new Map((config?.outcomes ?? []).map((o) => [o.id, o.name]));

  const header = ["Name", "Email", "Phone", "Result", "Captured at", ...questions.map((q) => q.text)];
  const rows = leads.map((l) => {
    const base = [
      l.name ?? "",
      l.email ?? "",
      l.phone ?? "",
      (l.outcome_id ? outcomeName.get(l.outcome_id) : "") ?? l.outcome_id ?? "",
      l.created_at,
    ];
    const answerCells = questions.map((q) => {
      const optId = l.answers?.[q.id];
      return q.options.find((o) => o.id === optId)?.label ?? "";
    });
    return [...base, ...answerCells];
  });

  const csv = [header, ...rows]
    .map((r) => r.map((c) => csvCell(String(c))).join(","))
    .join("\r\n");
  // UTF-8 BOM so Excel detects the encoding and renders accented names correctly.
  const body = `﻿${csv}`;

  const safeTitle =
    (quiz.title ?? "quiz")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "quiz";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${safeTitle}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
