import type { EspProvider } from "@/lib/types";

// Credentials are a single API key for both v1 providers (Mailchimp derives its
// datacenter from the key suffix; Kit uses the key directly).
export interface EspCredentials {
  apiKey: string;
}

// A list / form / audience the owner can push subscribers into.
export interface EspTarget {
  id: string;
  name: string;
}

// The normalized lead handed to every adapter.
export interface EspContact {
  email: string;
  name: string | null;
  tags: string[]; // e.g. [outcome name, quiz title]
  fields: Record<string, string>; // e.g. { outcome: "...", quiz: "..." }
}

export interface EmailDestination {
  id: EspProvider;
  label: string;
  // Cheap authenticated call to confirm the key works. Returns ok:false (never
  // throws) so the connect route can surface a clean error.
  validateCredentials(creds: EspCredentials): Promise<{ ok: boolean; error?: string }>;
  // The owner's lists/forms to choose a target from.
  listTargets(creds: EspCredentials): Promise<EspTarget[]>;
  // Subscribe/upsert the contact into targetId and apply its tags. Throws on
  // failure so the outbox records a retry.
  upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact): Promise<void>;
}
