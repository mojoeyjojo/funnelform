import "server-only";
import type { EspProvider } from "@/lib/types";
import type { EmailDestination } from "./types";
import { mailchimp } from "./mailchimp";
import { kit } from "./kit";

const ADAPTERS: Record<EspProvider, EmailDestination> = {
  mailchimp,
  kit,
};

export function getAdapter(provider: EspProvider): EmailDestination {
  return ADAPTERS[provider];
}

export const ALL_ADAPTERS: EmailDestination[] = [mailchimp, kit];
