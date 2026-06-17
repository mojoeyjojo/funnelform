import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import { brevo } from "./brevo";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init))));
}
beforeEach(() => vi.restoreAllMocks());

describe("brevo adapter", () => {
  it("validates via /account with the api-key header", async () => {
    let key = "";
    mockFetch((url, init) => {
      key = (init.headers as Record<string, string>)["api-key"];
      expect(url).toBe("https://api.brevo.com/v3/account");
      return new Response("{}", { status: 200 });
    });
    const res = await brevo.validateCredentials({ apiKey: "xkeysib-abc" });
    expect(res.ok).toBe(true);
    expect(key).toBe("xkeysib-abc");
  });

  it("surfaces Brevo's own message on a failed validation", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({ message: "We have detected you are using an unrecognised IP address", code: "unauthorized" }),
        { status: 401 },
      ),
    );
    const res = await brevo.validateCredentials({ apiKey: "xkeysib-abc" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("unrecognised IP address");
  });

  it("falls back to the status code when the error body is not JSON", async () => {
    mockFetch(() => new Response("gateway error", { status: 502 }));
    const res = await brevo.validateCredentials({ apiKey: "xkeysib-abc" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Brevo returned 502");
  });

  it("lists contact lists as targets", async () => {
    mockFetch(() => new Response(JSON.stringify({ lists: [{ id: 5, name: "Newsletter" }] }), { status: 200 }));
    const targets = await brevo.listTargets({ apiKey: "k" });
    expect(targets).toEqual([{ id: "5", name: "Newsletter" }]);
  });

  it("upserts a contact with attributes and listIds (numeric)", async () => {
    let body: Record<string, unknown> = {};
    mockFetch((url, init) => {
      body = JSON.parse(init.body as string);
      expect(url).toBe("https://api.brevo.com/v3/contacts");
      return new Response("{}", { status: 201 });
    });
    await brevo.upsertSubscriber({ apiKey: "k" }, "5", { email: "a@b.com", name: "A", tags: [], fields: { outcome: "Beginner" } });
    expect(body.email).toBe("a@b.com");
    expect(body.listIds).toEqual([5]);
    expect(body.updateEnabled).toBe(true);
    expect((body.attributes as Record<string, string>).FIRSTNAME).toBe("A");
    expect((body.attributes as Record<string, string>).OUTCOME).toBe("Beginner");
  });

  it("throws on a non-ok upsert", async () => {
    mockFetch(() => new Response("{}", { status: 400 }));
    await expect(
      brevo.upsertSubscriber({ apiKey: "k" }, "5", { email: "a@b.com", name: null, tags: [], fields: {} }),
    ).rejects.toThrow();
  });
});
