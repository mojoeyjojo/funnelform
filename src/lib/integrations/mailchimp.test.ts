import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import { mailchimp } from "./mailchimp";

const KEY = "abc123def456-us21";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init))));
}

beforeEach(() => vi.restoreAllMocks());

describe("mailchimp adapter", () => {
  it("derives the datacenter from the key suffix and pings to validate", async () => {
    let called = "";
    mockFetch((url) => {
      called = url;
      return new Response("{}", { status: 200 });
    });
    const res = await mailchimp.validateCredentials({ apiKey: KEY });
    expect(res.ok).toBe(true);
    expect(called).toBe("https://us21.api.mailchimp.com/3.0/ping");
  });

  it("upserts a member with PUT to the md5 hash and then applies tags", async () => {
    const calls: { url: string; method: string }[] = [];
    mockFetch((url, init) => {
      calls.push({ url, method: init.method as string });
      return new Response("{}", { status: 200 });
    });
    await mailchimp.upsertSubscriber({ apiKey: KEY }, "listABC", {
      email: "Sam@Example.com",
      name: "Sam",
      tags: ["Beginner"],
    });
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("/lists/listABC/members/");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toContain("/tags");
  });

  it("returns ok:false on a 401 rather than throwing in validateCredentials", async () => {
    mockFetch(() => new Response("{}", { status: 401 }));
    const res = await mailchimp.validateCredentials({ apiKey: KEY });
    expect(res.ok).toBe(false);
  });
});
