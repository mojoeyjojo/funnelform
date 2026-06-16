import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import { mailerlite } from "./mailerlite";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init))));
}
beforeEach(() => vi.restoreAllMocks());

describe("mailerlite adapter", () => {
  it("validates via /groups with a Bearer token", async () => {
    let auth = "";
    mockFetch((url, init) => {
      auth = (init.headers as Record<string, string>).Authorization;
      expect(url).toBe("https://connect.mailerlite.com/api/groups?limit=1");
      return new Response("{}", { status: 200 });
    });
    const res = await mailerlite.validateCredentials({ apiKey: "tok" });
    expect(res.ok).toBe(true);
    expect(auth).toBe("Bearer tok");
  });

  it("lists groups as targets", async () => {
    mockFetch(() => new Response(JSON.stringify({ data: [{ id: 12, name: "Leads" }] }), { status: 200 }));
    const targets = await mailerlite.listTargets({ apiKey: "tok" });
    expect(targets).toEqual([{ id: "12", name: "Leads" }]);
  });

  it("upserts a subscriber with fields and the chosen group", async () => {
    let body: Record<string, unknown> = {};
    mockFetch((url, init) => {
      body = JSON.parse(init.body as string);
      expect(url).toBe("https://connect.mailerlite.com/api/subscribers");
      return new Response("{}", { status: 200 });
    });
    await mailerlite.upsertSubscriber({ apiKey: "tok" }, "12", { email: "a@b.com", name: "A", tags: [], fields: { outcome: "Beginner" } });
    expect(body.email).toBe("a@b.com");
    expect(body.groups).toEqual(["12"]);
    expect((body.fields as Record<string, string>).outcome).toBe("Beginner");
    expect((body.fields as Record<string, string>).name).toBe("A");
  });

  it("throws on a non-ok upsert", async () => {
    mockFetch(() => new Response("{}", { status: 500 }));
    await expect(
      mailerlite.upsertSubscriber({ apiKey: "tok" }, "12", { email: "a@b.com", name: null, tags: [], fields: {} }),
    ).rejects.toThrow();
  });
});
