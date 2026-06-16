// Follow-up email config stored per quiz in the delivery jsonb. One subject and
// body per outcome id so each result gets genuinely different copy.
export interface FollowUpOutcomeTemplate {
  subject: string;
  body: string;
}

export interface FollowUpConfig {
  enabled: boolean;
  // mode "subdomain" sends from the branded Treeflow subdomain. "custom_domain"
  // is added in Phase 3; treat anything other than "custom_domain" as subdomain.
  sender: { mode: "subdomain" | "custom_domain" };
  outcomes: Record<string, FollowUpOutcomeTemplate>;
}

export type TemplateVars = Record<string, string | number | null | undefined>;

// Single-pass token replacement. Unknown tokens render empty; substituted values
// are NOT re-scanned, so a value containing {{...}} is left literal (no template
// injection). Tokens are {{name}} with optional inner whitespace.
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
