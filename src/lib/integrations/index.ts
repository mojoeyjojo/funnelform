import "server-only";
import type { EspProvider } from "@/lib/types";
import type { EmailDestination } from "./types";
import { mailchimp } from "./mailchimp";
import { kit } from "./kit";
import { mailerlite } from "./mailerlite";
import { brevo } from "./brevo";

const ADAPTERS: Record<EspProvider, EmailDestination> = {
  mailchimp,
  kit,
  mailerlite,
  brevo,
};

export function getAdapter(provider: EspProvider): EmailDestination {
  return ADAPTERS[provider];
}

export const ALL_ADAPTERS: EmailDestination[] = [mailchimp, kit, mailerlite, brevo];
