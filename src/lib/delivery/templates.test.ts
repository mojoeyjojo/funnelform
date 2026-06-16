import { describe, it, expect } from "vitest";
import { renderTemplate } from "./templates";

describe("renderTemplate", () => {
  it("replaces known tokens", () => {
    const out = renderTemplate("Hi {{name}}, you are {{outcome}}", {
      name: "Sam",
      outcome: "Beginner",
    });
    expect(out).toBe("Hi Sam, you are Beginner");
  });

  it("replaces an unknown token with an empty string", () => {
    expect(renderTemplate("Hi {{name}}{{missing}}", { name: "Sam" })).toBe("Hi Sam");
  });

  it("is tolerant of surrounding whitespace in the token", () => {
    expect(renderTemplate("{{ name }}", { name: "Sam" })).toBe("Sam");
  });

  it("does not recurse into substituted values", () => {
    expect(renderTemplate("{{a}}", { a: "{{b}}", b: "x" })).toBe("{{b}}");
  });
});
