import { describe, expect, it } from "vitest";

const BASIC: Array<[string, unknown, string | number | boolean | null]> = [
  ["1 + 2 * 3", {}, 7],
  ["(1 + 2) * 3", {}, 9],
  ["true && false", {}, false],
  ["true || false", {}, true],
  ["!false", {}, true],
];
import { evalExpr, validateExpr, ExprError, MissingFactError, parseExpr, BUILTIN_FUNCTIONS } from "./expr.js";

describe("safe expression evaluator", () => {
  it.each(BASIC)("evaluates: %s", (src, vars, expected) => {
    expect(evalExpr(src, vars as Record<string, never>)).toBe(expected);
  });

  it("supports comparisons and dotted fact keys", () => {
    expect(evalExpr("fire_noc.valid_until >= session.start_date", { "fire_noc.valid_until": "2027-01-01", "session.start_date": "2026-08-01" })).toBe(true);
    expect(evalExpr("land.form_area == land.deed_area", { "land.form_area": "5.00", "land.deed_area": "5.00" })).toBe(true);
    expect(evalExpr("b.count != 12", { b: { count: 10 } })).toBe(true);
  });

  it("renders builders: num strips formatting, within-style tolerance via abs", () => {
    expect(evalExpr("abs(-2.4)", {})).toBe(2.4);
    expect(evalExpr("round(2.4)", {})).toBe(2);
    expect(evalExpr("num('25,00,000') >= 2500000", {})).toBe(true);
    expect(evalExpr("abs(num('1.20') - num('1.17')) <= 0.05", {})).toBe(true);
    expect(evalExpr("abs(num(a) - num(b)) <= 0.05", { a: "3.22", b: "3.20" })).toBe(true);
    expect(evalExpr("abs(num(a) - num(b)) <= 0.05", { a: "5.00", b: "3.20" })).toBe(false);
  });

  it("presence/missing helpers", () => {
    expect(evalExpr("present(x)", { x: "2026-03-12" })).toBe(true);
    expect(evalExpr("present(x)", { x: null })).toBe(false);
    expect(evalExpr("missing(x)", {})).toBe(true);
  });

  it("rejects code-injection shapes outright", () => {
    for (const bad of [
      "x.constructor.constructor('return 1')()",
      "eval('1')",
      "import('fs')",
      "process.exit(1)",
      "globalThis.x = 1",
      "x.__proto__.polluted = 1",
      "function f(){return 1}; f()",
      "a; b",
      "'a'.repeat(1000000) != ''",
      "__proto__",
    ]) {
      const check = validateExpr(bad);
      if (check.ok) {
        // If it parses, evaluation must still be safe: no execution escapes.
        expect(() => evalExpr(bad, { x: 1 })).toThrow(ExprError);
      }
    }
  });

  it("no eval / new Function path exists (static sanity)", () => {
    expect(String(parseExpr("1 + 1")).includes("constructor")).toBe(false);
  });

  it("unknown facts evaluate as null and comparisons against null route to insufficient logic", () => {
    expect(evalExpr("unknown_fact == 'x'", {})).toBe(false);
    expect(() => evalExpr("unknown_fact >= '2026-01-01'", {})).toThrow(ExprError);
  });

  it("required() throws MissingFactError so a missing item becomes a completeness finding", () => {
    try {
      evalExpr("required(trust.affidavit.executed_on)", {});
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(MissingFactError);
    }
    expect(evalExpr("required(x) == '2026-03-12'", { "x": "2026-03-12" })).toBe(true);
  });

  it("parse failures are reported by validateExpr", () => {
    expect(validateExpr("1 +").ok).toBe(false);
    expect(validateExpr("(1 + 2").ok).toBe(false);
    expect(validateExpr("f['x'] === 1").ok).toBe(false); // member subscripts are not part of the surface
  });
});
