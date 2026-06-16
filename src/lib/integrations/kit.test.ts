import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import { kit } from "./kit";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init))));
}
beforeEach(() => vi.restoreAllMocks());

describe("kit adapter", () => {
  it("validates via /account with the X-Kit-Api-Key header", async () => {
    let header = "";
    mockFetch((url, init) => {
      header = (init.headers as Record<string, string>)["X-Kit-Api-Key"];
      expect(url).toBe("https://api.kit.com/v4/account");
      return new Response("{}", { status: 200 });
    });
    const res = await kit.validateCredentials({ apiKey: "k123" });
    expect(res.ok).toBe(true);
    expect(header).toBe("k123");
  });

  it("upserts the subscriber, adds to the form, and tags by matching name", async () => {
    const calls: { url: string; method: string }[] = [];
    mockFetch((url, init) => {
      calls.push({ url, method: (init.method as string) ?? "GET" });
      if (url.endsWith("/tags")) return new Response(JSON.stringify({ tags: [{ id: 9, name: "Beginner" }] }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    await kit.upsertSubscriber({ apiKey: "k" }, "form55", { email: "a@b.com", name: "A", tags: ["Beginner"] });
    expect(calls.some((c) => c.url.endsWith("/v4/subscribers") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/v4/forms/form55/subscribers"))).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/v4/tags/9/subscribers"))).toBe(true);
  });
});
