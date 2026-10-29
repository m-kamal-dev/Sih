/**
 * Document builders: every institution gets the standard document set from
 * templates with per-application values. Not real documents — synthetic renders
 * with a "scanned" look (rotation/noise/blur params per page).
 */
import type { DocDraft, FieldSpec, Line, PageDraft } from "./pagetemplate.js";
import { L, pageHeader, scanParams } from "./pagetemplate.js";
/* Roster entries render from the shared fixture faculty list so the same
   person's row appears on each institution's roster the ghost-faculty rule
   compares. Import only for type-safe reference; values are fixture personnel. */
import { FACULTY } from "./institutions.js";

export type Values = {
  instName: string;
  short: string;
  trustName: string;
  regNo: string;
  region: string;
  category: string;
  categoryLabel: string;
  sessionId: string;
  sessionStart: string;
  /* land */
  landAreaForm: string;
  landAreaDeed: string;
  surveyNo: string;
  district: string;
  deedDate: string;
  /* fire NOC */
  fireValidUntil: string; // as printed on the (possibly edited) document
  fireRecordValidUntil?: string; // what the issuer record says (when the mock is online)
  fireNocNo: string;
  /* building completion certificate */
  bccValidUntil: string;
  /* faculty */
  facultyCountForm: number;
  facultyCountRoster: number;
  rosterBlur?: boolean; // fault 11
  /* degree */
  degreeHolder: string;
  degreeRecordHolder?: string; // what the MOCK registrar record holds (pre-override truth)
  degreeRef: string;
  degreeCourse: string;
  degreeYear: string;
  /* FDR */
  fdrId: string;
  fdrBank: string;
  fdrAmount: number;
  /* similarity */
  photoHash: string;
  labHash: string;
  stampHash?: string; // when set, shares a stamp crop
  stampText: string;
  /* misc */
  signatory: string;
  intakeApproved?: number;
  intakeRequested?: number;
  poorScan?: boolean;
  /* fault 12 */
  injectionText?: string;
};

function scan(seed: string, poor = false) {
  return scanParams(seed, poor);
}

const LABEL = (t: string): Line => L(64, 0, t, { size: 22 });
const VALUE = (t: string): Line => L(400, 0, t, { size: 22 });
const row = (y: number, label: string, value: string): Line[] => [
  { ...LABEL(label), y },
  { ...VALUE(value), y },
];

function signBlock(lines: Line[], y: number, trust: string, signatory: string): Line[] {
  return [
    ...lines,
    L(600, y, `${trust}`, { size: 20 }),
    L(600, y + 40, `${signatory}`, { size: 20 }),
    L(600, y + 92, "Signed (fixture signature mark)", { size: 16 }),
  ];
}

/* ---------------- Category-specific application forms ---------------- */

export function buildCategoryForm(v: Values, applicationId: string): DocDraft {
  const catDoc = v.category === "EOA" ? "eoa_form" : v.category === "INTAKE_INCREASE" ? "intake_form" : "programme_form";
  const slot = "category_form";
  const fields: FieldSpec[] = [];
  const pages: PageDraft[] = [];
  const s = scan(applicationId + catDoc, v.poorScan);
  const lines: Line[] = [
    ...pageHeader("APPLICATION FORM", `${v.categoryLabel} — academic session ${v.sessionId}`, v.instName),
    ...row(230, "Institution", v.instName),
    ...row(266, "Trust / society", v.trustName),
    ...row(302, "Region", v.region),
    ...row(338, "Application category", v.categoryLabel),
    ...row(374, "Session", v.sessionId),
    ...row(410, "Session start", v.sessionStart),
    ...row(446, "Land area (acres)", v.landAreaForm),
    ...row(482, "Faculty count (sanctioned)", String(v.facultyCountForm)),
  ];
  const landLine = lines.find((l) => l.text === v.landAreaForm)!;
  const facLine = lines.find((l) => l.text === String(v.facultyCountForm))!;
  fields.push({ key: "land.form_area", display: v.landAreaForm, line: landLine, confidence: 0.98, asOf: v.deedDate, unit: "acre" });
  fields.push({ key: "faculty.form_count", display: String(v.facultyCountForm), line: facLine, confidence: 0.98, asOf: null as unknown as string });
  pages.push({
    title: catDoc,
    lines: signBlock(lines, 560, v.trustName, v.signatory),
    ...s,
  });
  return { docType: catDoc, checklistSlot: slot, pages, fields };
}

export function buildSaleDeed(v: Values, applicationId: string): DocDraft {
  const fields: FieldSpec[] = [];
  const pages: PageDraft[] = [];
  const s = scan(applicationId + "sale_deed", v.poorScan);
  const lines: Line[] = [
    ...pageHeader("SALE DEED", "Fixture synthetic land record", v.instName),
    ...row(230, "Trust (purchaser)", v.trustName),
    ...row(266, "District / tehsil", v.district),
    ...row(302, "Survey number", v.surveyNo),
    ...row(338, "Area (acres)", v.landAreaDeed),
    ...row(374, "Date of deed", v.deedDate),
    ...row(410, "Encumbrances", "None (fixture text)"),
  ];
  const area = lines.find((l) => l.text === v.landAreaDeed)!;
  const survey = lines.find((l) => l.text === v.surveyNo)!;
  fields.push({ key: "land.deed_area", display: v.landAreaDeed, line: area, confidence: 0.97, asOf: v.deedDate, unit: "acre" });
  fields.push({ key: "land.survey_no", display: v.surveyNo, line: survey, confidence: 0.99, asOf: v.deedDate });
  pages.push({
    title: "sale_deed_p1",
    lines: signBlock(lines, 560, v.trustName, v.signatory),
    ...s,
  });
  return { docType: "sale_deed", checklistSlot: "land_documents", pages, fields };
}

export function buildFireNoc(v: Values, applicationId: string): DocDraft {
  const fields: FieldSpec[] = [];
  const pages: PageDraft[] = [];
  const s = scan(applicationId + "fire_noc", v.poorScan);
  const altered = v.fireRecordValidUntil !== undefined && v.fireRecordValidUntil !== v.fireValidUntil;
  const lines: Line[] = [
    ...pageHeader("FIRE SAFETY NO-OBJECTION CERTIFICATE", "Fixture synoptic document", "Municipal fire office (synthetic)"),
    ...row(230, "Beneficiary", v.instName),
    ...row(266, "NOC number", v.fireNocNo),
    ...row(302, "Valid until", v.fireValidUntil),
  ];
  const validLine = lines.find((l) => l.text === v.fireValidUntil)!;
  const nocLine = lines.find((l) => l.text === v.fireNocNo)!;
  fields.push({ key: "fire_noc.valid_until", display: v.fireValidUntil, line: validLine, confidence: altered ? 0.91 : 0.97, asOf: "2026-06-01" });
  fields.push({ key: "fire_noc.noc_no", display: v.fireNocNo, line: nocLine, confidence: 0.98, asOf: "2026-06-01" });
  pages.push({
    title: "fire_noc_p1",
    lines: signBlock(lines, 560, "Office of the Chief Fire Officer (synthetic)", v.signatory),
    ...s,
  });
  return { docType: "fire_noc", checklistSlot: "facility_documents", pages, fields, altered };
}

export function buildBcc(v: Values, applicationId: string): DocDraft {
  const fields: FieldSpec[] = [];
  const pages: PageDraft[] = [];
  const s = scan(applicationId + "bcc", v.poorScan);
  const lines: Line[] = [
    ...pageHeader("BUILDING COMPLETION CERTIFICATE", "Fixture synoptic document", "Municipal corporation (synthetic)"),
    ...row(230, "Beneficiary", v.instName),
    ...row(302, "Valid until", v.bccValidUntil),
  ];
  const validLine = lines.find((l) => l.text === v.bccValidUntil)!;
  fields.push({ key: "bcc.valid_until", display: v.bccValidUntil, line: validLine, confidence: 0.97, asOf: "2026-05-01" });
  pages.push({
    title: "bcc_p1",
    lines: signBlock(lines, 560, "Office of the Building Inspector (synthetic)", v.signatory),
    ...s,
  });
  return { docType: "building_completion_certificate", checklistSlot: "facility_documents", pages, fields };
}

export function buildFacultyRoster(v: Values, applicationId: string): DocDraft {
  const fields: FieldSpec[] = [];
  const pages: PageDraft[] = [];
  const countDisplay = String(v.facultyCountRoster);
  const s = scan(applicationId + "faculty_roster", v.poorScan);
  // Render one roster row per real (fixture) faculty member employed by this
  // institution; the ghost-faculty rule anchors on these entry facts.
  const entries = FACULTY.filter((emp) => emp.institutions.some((li) => li.id === applicationId));
  let entryY = 338;
  const entryLines: Line[] = entries.map((emp, i) => {
    const link = emp.institutions.find((li) => li.id === applicationId);
    const thru = link?.to ? ` (“thru ${link.to}”)` : " (open “thru)”";
    const line = L(96, entryY + i * 36, `${i + 1}. ${emp.name} — ${emp.facultyId} — from ${link?.from ?? "2026-04-01"}${thru}`, { size: 20 });
    fields.push({
      key: `faculty.roster_entry`, // one row per employment entry on this roster
      display: emp.facultyId,
      line,
      confidence: v.rosterBlur ? 0.62 : 0.97,
      asOf: "2026-07-01",
    });
    return line;
  });
  const lines: Line[] = [
    ...pageHeader("FACULTY ROSTER", `Session ${v.sessionId} (fixture personnel names)`, v.instName),
    ...row(230, "Total faculty on roster", countDisplay),
    ...row(266, "Roster as-of date", "2026-07-01"),
    ...row(302, "Sample entry", "1. faculty (synthetic) — Asst. Professor"),
    ...entryLines,
  ];
  const countLine = lines.find((l) => l.text === countDisplay)!;
  fields.push({
    key: "faculty.roster_count",
    display: countDisplay,
    line: countLine,
    confidence: v.rosterBlur ? 0.62 : 0.97,
    asOf: "2026-07-01",
  });
  pages.push({
    title: "faculty_roster_p1",
    lines: signBlock(lines, 560, v.instName, v.signatory),
    blur: v.rosterBlur ? 2.2 : s.blur,
    noise: v.rosterBlur ? 0.55 : s.noise,
    rotation: s.rotation,
  });
  return { docType: "faculty_roster", checklistSlot: "faculty_documents", pages, fields };
}

export function buildDegree(v: Values, applicationId: string): DocDraft {
  const fields: FieldSpec[] = [];
  const pages: PageDraft[] = [];
  const s = scan(applicationId + "degree_certificate", v.poorScan);
  const lines: Line[] = [
    ...pageHeader("DEGREE CERTIFICATE", "Fixture academic award", "Board of a synthetic university"),
    ...row(230, "Award holder", v.degreeHolder),
    ...row(266, "Programme", v.degreeCourse),
    ...row(302, "Year of award", v.degreeYear),
    ...row(338, "Registry reference", v.degreeRef),
  ];
  const holder = lines.find((l) => l.text === v.degreeHolder)!;
  const ref = lines.find((l) => l.text === v.degreeRef)!;
  fields.push({ key: "degree.holder", display: v.degreeHolder, line: holder, confidence: 0.96, asOf: v.degreeYear + "-08-31" });
  fields.push({ key: "degree.registry_ref", display: v.degreeRef, line: ref, confidence: 0.98, asOf: v.degreeYear + "-08-31" });
  pages.push({
    title: "degree_certificate_p1",
    lines: signBlock(lines, 560, "Synthetic University (fixture)", "Registrar (fixture)"),
    ...s,
  });
  return { docType: "degree_certificate", checklistSlot: "faculty_documents", pages, fields, altered: applicationId === "NEW-2026-0031" };
}

export function buildFdr(v: Values, applicationId: string): DocDraft {
  const fields: FieldSpec[] = [];
  const pages: PageDraft[] = [];
  const s = scan(applicationId + "fdr", v.poorScan);
  const lines: Line[] = [
    ...pageHeader("FIXED DEPOSIT RECEIPT", "Fixture bank instrument", v.fdrBank),
    ...row(230, "FDR reference", v.fdrId),
    ...row(266, "Amount", v.fdrAmount.toLocaleString("en-IN")),
    ...row(302, "Holder", v.trustName),
    ...row(338, "Session of pledge", v.sessionId),
  ];
  const ref = lines.find((l) => l.text === v.fdrId)!;
  const amt = lines.find((l) => l.text === v.fdrAmount.toLocaleString("en-IN"))!;
  fields.push({ key: "fdr.ref", display: v.fdrId, line: ref, confidence: 0.98, asOf: "2026-07-01" });
  fields.push({ key: "fdr.amount", display: v.fdrAmount.toLocaleString("en-IN"), line: amt, confidence: 0.97, asOf: "2026-07-01", unit: "INR" });
  pages.push({
    title: "fdr_p1",
    lines: signBlock(lines, 560, v.fdrBank, "Branch manager (fixture)"),
    ...s,
  });
  return { docType: "fdr", checklistSlot: "financial_documents", pages, fields };
}

export function buildTrustAffidavit(v: Values, applicationId: string, sharedStamp: boolean): DocDraft {
  const s = scan(applicationId + "trust_affidavit", v.poorScan);
  const stamp = sharedStamp
    ? "ROUND SEAL (fixture image, shared crop stampHash=" + (v.stampHash ?? "shared") + ")"
    : "ROUND SEAL (fixture image)";
  const lines: Line[] = [
    ...pageHeader("AFFIDAVIT", "Fixture notarised statement", v.instName),
    L(64, 240, "This affidavit is made by " + v.trustName + " for the", { size: 22 }),
    L(64, 274, v.categoryLabel + " application of session " + v.sessionId + ".", { size: 22 }),
    L(64, 330, "Statement of truth (fixture body paragraphs follow):", { size: 20 }),
    L(96, 380, "the trust holds the land and facilities described in the", { size: 22 }),
    L(96, 414, "application and will maintain them for the session.", { size: 22 }),
    L(64, 470, stamp, { size: 18, mono: true }),
  ];
  const executed = L(64, 505, "Executed on 2026-03-12 before Notary (fixture)", { size: 20 });
  lines.push(executed);
  if (v.injectionText) {
    // Hidden prompt-instruction text (fault 12): white-on-white in the render.
    lines.push(L(64, 520, v.injectionText, { size: 22, hidden: true }));
  }
  const pages = [
    {
      title: "trust_affidavit_p1",
      lines: signBlock(lines, 640, v.trustName, v.signatory),
      ...s,
    },
  ];
  return { docType: "trust_affidavit", checklistSlot: "trust_documents", pages,
    fields: [{ key: "trust.affidavit.executed_on", display: "2026-03-12", line: executed, confidence: 0.96, asOf: "2026-03-12" }],
  };
}

export function buildTrustRegistration(v: Values, applicationId: string): DocDraft {
  const fields: FieldSpec[] = [];
  const pages: PageDraft[] = [];
  const s = scan(applicationId + "trust_registration", v.poorScan);
  const lines: Line[] = [
    ...pageHeader("TRUST REGISTRATION CERTIFICATE", "Fixture registry extract", "Registrar of societies (synthetic)"),
    ...row(230, "Trust name", v.trustName),
    ...row(266, "Registration number", v.regNo),
    ...row(302, "Registered", "2015-03-12"),
  ];
  const reg = lines.find((l) => l.text === v.regNo)!;
  fields.push({ key: "trust.reg_no", display: v.regNo, line: reg, confidence: 0.98, asOf: "2015-03-12" });
  pages.push({ title: "trust_registration_p1", lines: signBlock(lines, 560, "Registrar of Societies (fixture)", "Registrar (fixture)"), ...s });
  return { docType: "trust_registration", checklistSlot: "trust_documents", pages, fields };
}

export function buildFloorPlan(v: Values, applicationId: string): DocDraft {
  const s = scan(applicationId + "floor_plan", v.poorScan);
  const n = applicationId === "EOA-2026-0117" ? "12 classrooms · 3 labs · 1 library" : "16 classrooms · 4 labs · 1 library";
  const lines: Line[] = [
    ...pageHeader("FLOOR PLAN", "Fixture architectural summary diagram", v.instName),
    L(64, 300, "Rooms: " + n, { size: 22 }),
    L(64, 620, "[ floor plan drawing — fixture SVG blocks, not a real plan ]", { size: 18 }),
  ];
  const pages = [{ title: "floor_plan_p1", lines: signBlock(lines, 900, v.trustName, v.signatory), ...s }];
  const fields: FieldSpec[] = [{ key: "facility.rooms_summary", display: n, line: lines[3] as Line, confidence: 0.9, asOf: "2026-05-01" }];
  return { docType: "floor_plan", checklistSlot: "facility_documents", pages, fields };
}

export function buildPhotoDoc(v: Values, applicationId: string, kind: "lab" | "classroom"): DocDraft {
  const s = scan(applicationId + (kind === "lab" ? "lab_photo" : "classroom_photo"), true);
  const hash = kind === "lab" ? v.labHash : v.photoHash;
  const lines: Line[] = [
    ...pageHeader(kind === "lab" ? "LABORATORY PHOTOGRAPHS" : "CLASSROOM PHOTOGRAPHS", "Fixture image set placeholder", v.instName),
    L(64, 380, "[ synthetic photograph: desk, benches, signage ]", { size: 20 }),
    L(64, 430, `phash=${hash}`, { size: 18, mono: true }),
  ];
  const pages = [{ title: kind + "_photo_p1", lines, noise: s.noise, rotation: s.rotation, blur: s.blur }];
  return {
    docType: kind === "lab" ? "lab_photo" : "classroom_photo",
    checklistSlot: "facility_documents",
    pages,
    fields: [],
  };
}
