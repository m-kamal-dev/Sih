import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { analysePdf, extractDates, parsePdfDate } from "./pdfforensics.js";
import { buildPdf, buildSample, SAMPLE_NAMES } from "../../fixtures/src/pdfsamples.js";

const REVIEW = new Date("2026-10-27T00:00:00Z");
const run = (name: Parameters<typeof buildSample>[0]) => analysePdf(buildSample(name), { asOf: REVIEW, fileName: `${name}.pdf` });
const ids = (a: ReturnType<typeof analysePdf>) => a.signals.map((s) => s.id);

describe("live PDF analysis of real files", () => {
  it("a clean certificate raises no signal and is never called genuine", () => {
    const a = run("clean-fire-noc");
    expect(a.signals).toHaveLength(0);
    expect(a.level).toBe("none");
    expect(a.summary).toMatch(/not a statement that the document is genuine/);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.text.extractedChars).toBeGreaterThan(100);
  });

  it("an expired validity date becomes a validity_gap with the date as evidence", () => {
    const a = run("expired-fire-noc");
    const s = a.signals.find((x) => x.id.startsWith("validity_ended"));
    expect(s?.class).toBe("validity_gap");
    expect(s?.evidence.iso).toBe("2026-03-31");
  });

  it("a validity date after the review date does not raise a gap", () => {
    const a = analysePdf(buildSample("expired-fire-noc"), { asOf: new Date("2026-02-01T00:00:00Z") });
    expect(ids(a).some((i) => i.startsWith("validity_ended"))).toBe(false);
  });

  it("an incremental save is detected, diffed and the current text wins", () => {
    const a = run("edited-after-creation");
    expect(a.structure.incrementalUpdates).toBe(1);
    expect(ids(a)).toContain("incremental_update");
    const change = a.revisionChanges[0]!;
    expect(change.removed.join(" ")).toContain("31/03/2026");
    expect(change.added.join(" ")).toContain("31/03/2029");
    // the stale 2026 date must not be reported as the current validity
    expect(ids(a).some((i) => i.startsWith("validity_ended"))).toBe(false);
  });

  it("an intact signed range passes with a matching digest", () => {
    const a = run("signed-intact");
    expect(a.signatures).toHaveLength(1);
    expect(a.signatures[0]!.digestAlgorithm).toBe("sha256");
    expect(a.signatures[0]!.digestMatches).toBe(true);
    expect(a.signals).toHaveLength(0);
  });

  it("editing a signed file in place is a strong digest-mismatch signal", () => {
    const a = run("signed-then-modified");
    expect(a.signatures[0]!.digestMatches).toBe(false);
    const s = a.signals.find((x) => x.id.startsWith("signature_digest_mismatch"));
    expect(s?.strength).toBe("strong");
    expect(a.level).toBe("high");
  });

  it("hidden instruction text is flagged and changes nothing else", () => {
    const a = run("hidden-instruction");
    expect(ids(a)).toEqual(expect.arrayContaining(["hidden_text", "instruction_like_text"]));
    expect(a.level).toBe("medium");
    expect(a.signals.some((s) => s.class === "validity_gap")).toBe(false);
    expect(a.text.hiddenChars).toBeGreaterThan(0);
  });

  it("weak signals alone never exceed low (spec §10)", () => {
    const pdf = buildPdf({ lines: ["Plain page", "Valid up to: 31/12/2030"], info: { producer: "Adobe Photoshop 25.0" } });
    const a = analysePdf(pdf, { asOf: REVIEW });
    expect(ids(a)).toEqual(["image_editor_producer"]);
    expect(a.level).toBe("low");
  });

  it("reads Flate-compressed content streams", () => {
    const content = deflateSync(Buffer.from("BT /F1 12 Tf 50 700 Td (Valid up to: 01/02/2025) Tj ET", "latin1"));
    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n1 0 obj\n<< /Length " + content.length + " /Filter /FlateDecode >>\nstream\n", "latin1"), content, Buffer.from("\nendstream\nendobj\ntrailer\n<< >>\n%%EOF\n", "latin1")];
    const a = analysePdf(Buffer.concat(parts), { asOf: REVIEW });
    expect(a.text.segments[0]?.text).toContain("Valid up to");
    expect(ids(a).some((i) => i.startsWith("validity_ended"))).toBe(true);
  });

  it("flags active content and does not run it", () => {
    const base = buildSample("clean-fire-noc").toString("latin1").replace("/Type /Catalog", "/Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >>");
    const a = analysePdf(Buffer.from(base, "latin1"), { asOf: REVIEW });
    expect(a.structure.activeContent.join(",")).toMatch(/JavaScript/);
    expect(ids(a)).toContain("active_content");
  });

  it("a non-PDF is reported plainly and not analysed further", () => {
    const a = analysePdf(Buffer.from("MZ not a pdf at all"), { asOf: REVIEW });
    expect(ids(a)).toEqual(["not_a_pdf"]);
    expect(a.text.extractedChars).toBe(0);
  });

  it("is deterministic for the same bytes", () => {
    const x = run("signed-then-modified");
    const y = run("signed-then-modified");
    expect(x.sha256).toBe(y.sha256);
    expect(ids(x)).toEqual(ids(y));
  });

  it("never prints banned wording and always lists its limits", () => {
    for (const n of SAMPLE_NAMES) {
      const a = run(n);
      const blob = JSON.stringify({ s: a.signals, sum: a.summary, next: a.nextStep });
      expect(/\b(forged|fake|fraud)\b/i.test(blob)).toBe(false);
      expect(a.limits.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("date helpers", () => {
  it("parses PDF dates with offsets", () => {
    expect(parsePdfDate("D:20260105093000Z")).toBe("2026-01-05T09:30:00.000Z");
    expect(parsePdfDate("D:20260105150000+05'30'")).toBe("2026-01-05T09:30:00.000Z");
  });
  it("reads Indian day-first dates and word months, rejects impossible dates", () => {
    expect(extractDates("Valid until 31/12/2027").map((d) => d.iso)).toEqual(["2027-12-31"]);
    expect(extractDates("Date of issue: 5 March 2025")[0]?.kind).toBe("issue");
    expect(extractDates("Valid up to 31/02/2027")).toHaveLength(0);
  });
});
