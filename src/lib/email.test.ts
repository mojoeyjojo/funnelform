import { describe, it, expect, vi } from "vitest";

// server-only throws in non-Next.js environments; mock it so the pure
// resolveFollowUpSender function is testable without a server context.
vi.mock("server-only", () => ({}));

import { resolveFollowUpSender } from "./email";

describe("resolveFollowUpSender", () => {
  it("uses the branded subdomain by default with owner reply-to", () => {
    const s = resolveFollowUpSender({
      mode: "subdomain",
      brandName: "Coach Jane",
      ownerEmail: "jane@example.com",
      customFrom: null,
    });
    expect(s.from).toBe("Coach Jane <leads@contact.treeflow.tech>");
    expect(s.replyTo).toBe("jane@example.com");
  });

  it("falls back to the subdomain when custom domain is requested but not yet provisioned", () => {
    const s = resolveFollowUpSender({
      mode: "custom_domain",
      brandName: "Coach Jane",
      ownerEmail: "jane@example.com",
      customFrom: null,
    });
    expect(s.from).toBe("Coach Jane <leads@contact.treeflow.tech>");
  });

  it("sanitizes a brand name that contains angle brackets", () => {
    const s = resolveFollowUpSender({
      mode: "subdomain",
      brandName: "Jane <x>",
      ownerEmail: "jane@example.com",
      customFrom: null,
    });
    expect(s.from).toBe("Jane x <leads@contact.treeflow.tech>");
  });
});
