import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createResendDomain,
  verifyResendDomain,
  getResendDomain,
  mapDomainStatus,
  ensureResendDomain,
  deleteResendDomain,
} from "./email-domains";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init))));
}
beforeEach(() => {
  vi.restoreAllMocks();
  process.env.RESEND_API_KEY = "re_test";
});

describe("resend domains client", () => {
  it("creates a domain with POST /domains and Bearer auth", async () => {
    let url = "", method = "", auth = "";
    mockFetch((u, init) => {
      url = u; method = init.method as string; auth = (init.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify({ id: "d1", status: "not_started", records: [{ record: "DKIM", name: "x", type: "TXT", value: "v", status: "not_started" }] }), { status: 201 });
    });
    const d = await createResendDomain("mail.example.com");
    expect(url).toBe("https://api.resend.com/domains");
    expect(method).toBe("POST");
    expect(auth).toBe("Bearer re_test");
    expect(d.id).toBe("d1");
    expect(d.records).toHaveLength(1);
  });

  it("verifies a domain with POST /domains/{id}/verify", async () => {
    let url = "", method = "";
    mockFetch((u, init) => { url = u; method = init.method as string; return new Response("{}", { status: 200 }); });
    await verifyResendDomain("d1");
    expect(url).toBe("https://api.resend.com/domains/d1/verify");
    expect(method).toBe("POST");
  });

  it("gets a domain status with GET /domains/{id}", async () => {
    mockFetch(() => new Response(JSON.stringify({ status: "verified" }), { status: 200 }));
    const s = await getResendDomain("d1");
    expect(s.status).toBe("verified");
  });

  it("throws on a non-ok create", async () => {
    mockFetch(() => new Response("{}", { status: 401 }));
    await expect(createResendDomain("x.com")).rejects.toThrow();
  });
});

describe("ensureResendDomain", () => {
  it("returns the created domain when POST succeeds", async () => {
    mockFetch((u, init) => {
      if (u.endsWith("/domains") && init.method === "POST")
        return new Response(JSON.stringify({ id: "new1", status: "not_started", records: [] }), { status: 201 });
      return new Response("{}", { status: 200 });
    });
    const d = await ensureResendDomain("mail.example.com");
    expect(d.id).toBe("new1");
  });

  it("reuses an existing domain when POST fails but the domain is already registered", async () => {
    mockFetch((u, init) => {
      if (u.endsWith("/domains") && init.method === "POST")
        return new Response(JSON.stringify({ statusCode: 403, message: "The mail.example.com domain has been registered already." }), { status: 403 });
      if (u.endsWith("/domains") && (init.method ?? "GET") === "GET")
        return new Response(JSON.stringify({ data: [{ id: "existing9", name: "mail.example.com" }] }), { status: 200 });
      if (u.endsWith("/domains/existing9"))
        return new Response(JSON.stringify({ id: "existing9", status: "verified", records: [] }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    const d = await ensureResendDomain("mail.example.com");
    expect(d.id).toBe("existing9");
    expect(d.status).toBe("verified");
  });

  it("throws Resend's message when the domain genuinely cannot be created", async () => {
    mockFetch((u, init) => {
      if (u.endsWith("/domains") && init.method === "POST")
        return new Response(JSON.stringify({ statusCode: 403, message: "Your plan includes 1 domain. Upgrade to add more." }), { status: 403 });
      if (u.endsWith("/domains") && (init.method ?? "GET") === "GET")
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    await expect(ensureResendDomain("mail.example.com")).rejects.toThrow(/plan includes 1 domain/i);
  });
});

describe("deleteResendDomain", () => {
  it("treats a 404 as a successful delete (idempotent)", async () => {
    mockFetch(() => new Response("{}", { status: 404 }));
    await expect(deleteResendDomain("gone")).resolves.toBeUndefined();
  });

  it("throws on a non-404 failure", async () => {
    mockFetch(() => new Response("{}", { status: 500 }));
    await expect(deleteResendDomain("d1")).rejects.toThrow();
  });
});

describe("mapDomainStatus", () => {
  it("maps verified through", () => {
    expect(mapDomainStatus("verified")).toBe("verified");
  });
  it("maps failed and temporary_failure to failed", () => {
    expect(mapDomainStatus("failed")).toBe("failed");
    expect(mapDomainStatus("temporary_failure")).toBe("failed");
  });
  it("maps every other Resend state to pending", () => {
    expect(mapDomainStatus("not_started")).toBe("pending");
    expect(mapDomainStatus("pending")).toBe("pending");
    expect(mapDomainStatus("verifying")).toBe("pending");
  });
});
