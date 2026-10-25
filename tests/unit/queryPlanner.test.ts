import { describe, expect, it } from "vitest";
import { AppError } from "../../src/domain/errors.js";
import { planQueries } from "../../src/services/queryPlanner.js";

describe("planQueries", () => {
  it("caps queries and does not invent phone numbers or emails", () => {
    const plan = planQueries({
      aliases: ["하늘 별"],
      keywords: ["학교"],
      domains: ["example.test"],
      includeEmailSearch: false,
      emailAddresses: ["person@example.test"],
      maxQueries: 2,
    });
    expect(plan.queries).toHaveLength(2);
    expect(plan.truncated).toBe(true);
    const joined = plan.queries.join("\n");
    expect(joined).not.toContain("person@example.test");
    expect(joined).not.toMatch(/\d{2,}-\d{2,}/);
  });

  it("adds an email only when email search is selected", () => {
    const plan = planQueries({
      aliases: ["하늘"],
      includeEmailSearch: true,
      emailAddresses: ["person@example.test"],
      maxQueries: 8,
    });
    expect(plan.queries).toContain("person@example.test");
  });

  it("rejects a domain that is not a hostname", () => {
    expect(() =>
      planQueries({
        aliases: ["하늘"],
        domains: ["https://example.test/path"],
        maxQueries: 8,
      }),
    ).toThrow(AppError);
  });
});
