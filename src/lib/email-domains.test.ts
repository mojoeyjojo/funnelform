import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import { createResendDomain, verifyResendDomain, getResendDomain } from "./email-domains";

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
