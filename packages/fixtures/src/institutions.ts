/**
 * Synthetic dataset definitions: 12 institutions — 7 carrying the 13 planted
 * faults (spec §16), 5 clean controls. All names, survey numbers, PAN hashes
 * and IDs are fictional. Aadhaar never appears. PAN only as a salted hash
 * prefix, e.g. "pan#a91f…c3".
 */
import type { ApplicationCategory, Institution, SignalStrength } from "@evidencegraph/domain";

export const SESSION = "2026-27";
export const SESSION_START = "2026-08-01";
/** demo tolerance for cross-document equality — confirm against APH [fill in] */
export const AREA_TOLERANCE_ACRES = 0.1;

type InstitutionSeed = {
  id: string;
  name: string;
  short: string;
  region: string;
  category: ApplicationCategory;
  submittedAtDay: number; // minutes-before-due ordering is derived later
  controls?: boolean;
  purchaserRolePin?: string;
  nameVariants?: string[];
};

const SEEDS: InstitutionSeed[] = [
  { id: "EOA-2026-0142", name: "Vikramsheela Institute of Technology", short: "Vikramsheela", region: "KA-South", category: "EOA", submittedAtDay: 4 },
  { id: "INTK-2026-0208", name: "Silverleaf College of Engineering", short: "Silverleaf", region: "KL-Central", category: "INTAKE_INCREASE", submittedAtDay: 6 },
  { id: "EOA-2026-0117", name: "Cedarville Institute of Business Studies", short: "Cedarville", region: "TN-West", category: "EOA", submittedAtDay: 9 },
  { id: "NEW-2026-0031", name: "Northbay Academy of Architecture", short: "Northbay", region: "MH-Coast", category: "NEW_PROGRAMME", submittedAtDay: 2 },
  { id: "EOA-2026-0187", name: "Rajatalanka University College", short: "Rajatalanka", region: "TS-North", category: "EOA", submittedAtDay: 11 },
  { id: "INTK-2026-0229", name: "Pallavaram Institute of Design", short: "Pallavaram", region: "TN-East", category: "INTAKE_INCREASE", submittedAtDay: 3 },
  { id: "NEW-2026-0058", name: "Devanhalli Institute of Allied Health", short: "Devanhalli", region: "KA-North", category: "NEW_PROGRAMME", submittedAtDay: 1 },
  { id: "EOA-2026-0163", name: "Camford Institute of Engineering", short: "Camford", region: "KA-South", category: "EOA", submittedAtDay: 8, controls: true, purchaserRolePin: "camford", nameVariants: ["Camford Inst. of Engineering", "Camford Institute Of Engineering"] },
  { id: "INTK-2026-0210", name: "Mandya District Cooperative College of Pharmacy", short: "Mandya Pharmacy", region: "KA-South", category: "INTAKE_INCREASE", submittedAtDay: 10, controls: true, purchaserRolePin: "mandya" },
  { id: "EOA-2026-0199", name: "Kalyandurg Rural Polytechnic", short: "Kalyandurg", region: "AP-West", category: "EOA", submittedAtDay: 12, controls: true, purchaserRolePin: "kalyandurg" },
  { id: "INTK-2026-0233", name: "Tiruvalla Women's Institute of Nursing", short: "Tiruvalla Nursing", region: "KL-South", category: "INTAKE_INCREASE", submittedAtDay: 5, controls: true, purchaserRolePin: "tiruvalla" },
  { id: "NEW-2026-0062", name: "Bhiwadi Global Skills Academy", short: "Bhiwadi Skills", region: "RJ-East", category: "NEW_PROGRAMME", submittedAtDay: 7, controls: true, purchaserRolePin: "bhiwadi" },
];

export const INSTITUTIONS: Institution[] = SEEDS.map((s, idx) => {
  const submittedAt = iso(2 + s.submittedAtDay * 1);
  return {
    id: s.id,
    name: s.name,
    nameVariants: s.nameVariants ?? [],
    region: s.region,
    trustRegNo: `reg-${100000 + idx * 5123}`,
    aicteId: `aicte-${40000 + idx * 137}`,
    category: s.category,
    sessionId: SESSION,
    submittedAt,
    slaDueAt: iso(2 + s.submittedAtDay * 1, 72 + (idx % 5) * 8),
    applicantRolePin: s.purchaserRolePin,
    controls: !!s.controls,
  };
});

function iso(dayOffset: number, hourOffset = 0): string {
  const base = Date.parse("2026-09-15T04:30:00Z");
  return new Date(base + (dayOffset - 1) * 86_400_000 + hourOffset * 3_600_000).toISOString();
}

/** The 13 planted faults, where they live, and the expected result (§16). */
export const FAULT_MATRIX = [
  { n: 1, institutions: ["EOA-2026-0142"], document: "fire_noc", mutation: "valid-until text changed in an incremental PDF save", expectedFindings: [{ ruleId: "FORENSICS.PDF_STRUCTURE", findingClass: "anomaly_signal", severity: "medium" }, { ruleId: "fire_noc_validity", findingClass: "validity_gap", severity: "high" }], detector: "Forensics + Compliance", verificationStatus: null, specSection: "Architecture §16; §10", expect: "anomaly_signal(medium) + validity_gap", note: "Fire NOC date edited with an incremental save" },
  { n: 2, institutions: ["EOA-2026-0142"], document: "eoa_form + sale_deed", mutation: "form area 5.00 acres differs from deed area 3.20 acres", expectedFindings: [{ ruleId: "land_area_form_vs_deed", findingClass: "potential_discrepancy", severity: "high" }], detector: "Cross-check", verificationStatus: null, specSection: "Architecture §16; §07", expect: "potential_discrepancy", note: "Form says 5.00 acres, sale deed says 3.20 acres" },
  { n: 3, institutions: ["INTK-2026-0208", "EOA-2026-0117"], document: "faculty_roster", mutation: "same roster-entry identity overlaps in the same session at two institutions", expectedFindings: [{ ruleId: "ghost_faculty_cross_institution", findingClass: "potential_discrepancy", severity: "high" }], detector: "Cross-check", verificationStatus: null, specSection: "Architecture §16; §09", expect: "potential_discrepancy (graph)", note: "Same faculty on two rosters, same session" },
  { n: 4, institutions: ["EOA-2026-0117", "NEW-2026-0031"], document: "fdr", mutation: "same FDR reference pledged by two institutions in one session", expectedFindings: [{ ruleId: "fdr_single_pledge", findingClass: "potential_discrepancy", severity: "high" }], detector: "Cross-check", verificationStatus: null, specSection: "Architecture §16; §09", expect: "potential_discrepancy (graph)", note: "Same FDR pledged by two institutions" },
  { n: 5, institutions: ["EOA-2026-0187", "INTK-2026-0229"], document: "classroom_photo", mutation: "same classroom image hash appears in two institutional submissions", expectedFindings: [{ ruleId: "COMPLIANCE.PHOTO_REUSE", findingClass: "anomaly_signal", severity: "medium" }], detector: "Compliance", verificationStatus: null, specSection: "Architecture §16; §09", expect: "anomaly_signal", note: "Classroom photo reused from another college" },
  { n: 6, institutions: ["INTK-2026-0208", "NEW-2026-0031", "NEW-2026-0058"], document: "trust_affidavit", mutation: "same seal crop hash appears on three trust affidavits", expectedFindings: [{ ruleId: "FORENSICS.STAMP_REUSE", findingClass: "anomaly_signal", severity: "medium" }], detector: "Forensics", verificationStatus: null, specSection: "Architecture §16; §09", expect: "anomaly_signal", note: "One seal pasted onto affidavits of three trusts" },
  { n: 7, institutions: ["INTK-2026-0229"], document: "trust_affidavit", omittedDocument: "trust_affidavit", mutation: "required affidavit document omitted", expectedFindings: [{ ruleId: "trust_affidavit_presence", findingClass: "completeness_gap", severity: "high" }], detector: "Intake presence rule", verificationStatus: null, specSection: "Architecture §16; §04", expect: "completeness_gap (instant)", note: "Missing trust affidavit" },
  { n: 8, institutions: ["NEW-2026-0058"], document: "building_completion_certificate", mutation: "certificate validity end date precedes the application session", expectedFindings: [{ ruleId: "bcc_validity", findingClass: "validity_gap", severity: "high" }], detector: "Compliance", verificationStatus: null, specSection: "Architecture §16; §08", expect: "validity_gap", note: "Building completion certificate expired" },
  { n: 9, institutions: ["INTK-2026-0208"], document: "degree_certificate", mutation: "certificate holder differs from the mock NAD record", expectedFindings: [], detector: "Source verifier", verificationStatus: "mismatch", specSection: "Architecture §16; §11", expect: "verification mismatch", note: "Degree certificate disagrees with mock NAD record" },
  { n: 10, institutions: ["NEW-2026-0031"], document: "degree_certificate", mutation: "signed PDF has bytes appended outside the signed byte range", expectedFindings: [{ ruleId: "FORENSICS.PDF_STRUCTURE", findingClass: "anomaly_signal", severity: "high" }], detector: "Forensics", verificationStatus: null, specSection: "Architecture §16; §10", expect: "anomaly_signal (strong)", note: "Signed PDF modified after signing" },
  { n: 11, institutions: ["EOA-2026-0117"], document: "faculty_roster", mutation: "roster count is blurred below the configured confidence threshold", expectedFindings: [], detector: "Confidence gate", verificationStatus: null, specSection: "Architecture §16; §04", expect: "confidence gate; no false mismatch", note: "Blurred faculty count on a roster" },
  { n: 12, institutions: ["NEW-2026-0058"], document: "trust_affidavit", mutation: "hidden text contains an instruction addressed to an AI model", expectedFindings: [{ ruleId: "DOCREADER.INJECTION", findingClass: "anomaly_signal", severity: "low" }], detector: "Doc reader", verificationStatus: null, specSection: "Architecture §16; §12", expect: "anomaly_signal only", note: "Hidden text instructing the AI to approve" },
  { n: 13, institutions: ["NEW-2026-0058"], document: "fire_noc", mutation: "fire department connector times out on all attempts and opens its breaker", expectedFindings: [], detector: "Source verifier", verificationStatus: "source_unavailable", specSection: "Architecture §16; §11", expect: "source_unavailable + manual queue", note: "Fire department source offline" },
] as const;

/** Per-file forensic signal profile (§10 strengths). Forensics never verdicts. */
export type ForensicProfile = {
  applicationId: string;
  docType: string;
  signal: string; // neutral description of the technical observation
  strength: SignalStrength;
  detail: string;
};

export const FORENSIC_PROFILES: ForensicProfile[] = [
  {
    applicationId: "EOA-2026-0142",
    docType: "fire_noc",
    signal: "Incremental save: text objects in the validity line changed after the file was produced",
    strength: "medium",
    detail: "pikepdf (MOCK): update stream #2 modified the valid-until text object; producer unchanged (legitimate annotation tools also do this).",
  },
  {
    applicationId: "NEW-2026-0031",
    docType: "degree_certificate",
    signal: "Document changed after signing: byte ranges after the signature are not covered by it",
    strength: "strong",
    detail: "pyHanko (MOCK): DSC chain validates against the CCA demo root, but the revision map shows appended bytes after /ByteRange end.",
  },
];

/** Similarity tables, "Qdrant" collections as precomputed fixture data (MOCK). */
export const STAMP_SIMILARITY = [
  // Fault 6: one seal pasted onto affidavits of three trusts (share stamp hash stamp-seal-A)
  { hash: "stamp-seal-A", kind: "stamp", members: ["INTK-2026-0208", "NEW-2026-0031", "NEW-2026-0058"] },
  { hash: "stamp-seal-B1", kind: "stamp", members: ["EOA-2026-0142"] },
  { hash: "stamp-seal-C1", kind: "stamp", members: ["EOA-2026-0117"] },
  { hash: "stamp-seal-E1", kind: "stamp", members: ["EOA-2026-0187"] },
  { hash: "stamp-seal-F1", kind: "stamp", members: ["INTK-2026-0229"] },
  { hash: "stamp-seal-K1", kind: "stamp", members: ["EOA-2026-0163"] },
  { hash: "stamp-seal-K2", kind: "stamp", members: ["INTK-2026-0210"] },
  { hash: "stamp-seal-K3", kind: "stamp", members: ["EOA-2026-0199"] },
  { hash: "stamp-seal-K4", kind: "stamp", members: ["INTK-2026-0233"] },
  { hash: "stamp-seal-K5", kind: "stamp", members: ["NEW-2026-0062"] },
];

export const PHOTO_SIMILARITY = [
  // Fault 5: one classroom photo reused across two colleges
  { hash: "photo-classroom-x", kind: "classroom", members: ["EOA-2026-0187", "INTK-2026-0229"] },
  { hash: "photo-lab-a", kind: "lab", members: ["EOA-2026-0142"] },
  { hash: "photo-lab-b", kind: "lab", members: ["EOA-2026-0117"] },
  { hash: "photo-lab-c", kind: "lab", members: ["EOA-2026-0187"] },
  { hash: "photo-lab-d", kind: "lab", members: ["INTK-2026-0229"] },
  { hash: "photo-classroom-c1", kind: "classroom", members: ["INTK-2026-0210"] },
  { hash: "photo-classroom-c2", kind: "classroom", members: ["INTK-2026-0233"] },
];

/** Cross-institution entity data (Neo4j model mirror, §05). */
export const FACULTY = [
  // Fault 3: same person, two rosters, same session, overlapping dates
  { facultyId: "emp-77201", name: "R. Chandrashekhar", panHash: "pan#a91f…c3", institutions: [
    { id: "INTK-2026-0208", from: "2026-04-01", to: null, doc: "faculty_roster" },
    { id: "EOA-2026-0117", from: "2026-05-15", to: null, doc: "faculty_roster" },
  ] },
  // Clean control: genuinely moved colleges mid-year, dates do NOT overlap
  { facultyId: "emp-81004", name: "Sunita Krishnan", panHash: "pan#2bf0…91", institutions: [
    { id: "EOA-2026-0199", from: "2026-04-01", to: "2026-09-30", doc: "faculty_roster" },
    { id: "EOA-2026-0163", from: "2026-10-01", to: null, doc: "faculty_roster" },
  ] },
  { facultyId: "emp-82107", name: "P. Vasanth Kumar", panHash: "pan#77d2…0e", institutions: [
    { id: "EOA-2026-0163", from: "2026-07-01", to: null, doc: "faculty_roster" },
  ] },
  { facultyId: "emp-83418", name: "Meenakshi Raghavan", panHash: "pan#c4a9…f7", institutions: [
    { id: "INTK-2026-0210", from: "2026-01-20", to: null, doc: "faculty_roster" },
  ] },
  { facultyId: "emp-84201", name: "Aravind Menon", panHash: "pan#55f1…22", institutions: [
    { id: "INTK-2026-0233", from: "2026-06-01", to: null, doc: "faculty_roster" },
  ] },
  { facultyId: "emp-85412", name: "G. Suresh Babu", panHash: "pan#0a3b…8d", institutions: [
    { id: "NEW-2026-0062", from: "2026-03-10", to: null, doc: "faculty_roster" },
  ] },
  { facultyId: "emp-86503", name: "Hema Latha", panHash: "pan#9c70…41", institutions: [
    { id: "EOA-2026-0187", from: "2026-02-01", to: null, doc: "faculty_roster" },
  ] },
];

/** Land parcels keyed by survey number (synthetic district/tehsil names). */
export const LAND_PARCELS = [
  { surveyNo: "SUR-KA-2847/2B", district: "Channapatna (synthetic)", state: "Karnataka", areaAcres: 3.2, trust: "Vikramsheela Education Foundation", institution: "EOA-2026-0142" },
  { surveyNo: "SUR-KL-1188/A", district: "Mannarkkad (synthetic)", state: "Kerala", areaAcres: 6.9, trust: "Silverleaf Education Trust", institution: "INTK-2026-0208" },
  { surveyNo: "SUR-TN-5520/1", district: "Coimbatore South (synthetic)", state: "Tamil Nadu", areaAcres: 2.4, trust: "Cedarville Rural Education Society", institution: "EOA-2026-0117" },
  { surveyNo: "SUR-TN-7781/3", district: "Chengalpattu (synthetic)", state: "Tamil Nadu", areaAcres: 1.8, trust: "Pallavaram Design Education Trust", institution: "INTK-2026-0229" },
  { surveyNo: "SUR-MH-3312/9", district: "Alibaug (synthetic)", state: "Maharashtra", areaAcres: 5.2, trust: "Northbay Academy Trust", institution: "NEW-2026-0031" },
  { surveyNo: "SUR-KA-4409/5", district: "Devanhalli East (synthetic)", state: "Karnataka", areaAcres: 3.0, trust: "Devanhalli Allied Health Sciences Foundation", institution: "NEW-2026-0058" },
  { surveyNo: "SUR-AP-6102/Q", district: "Kalyandurg (synthetic)", state: "Andhra Pradesh", areaAcres: 4.1, trust: "Kalyandurg Rural Education Society", institution: "EOA-2026-0199" },
  { surveyNo: "SUR-RJ-2210/8", district: "Bhiwadi (synthetic)", state: "Rajasthan", areaAcres: 2.6, trust: "Bhiwadi Skills Foundation", institution: "NEW-2026-0062" },
];

/** FDR pledges. Fault 4: one FDR pledged by two institutions in the same session. */
export const FDRS = [
  { fdrHash: "fdr:FDR-776281", bank: "Vijaya Bank (synthetic)", amount: 2500000, session: SESSION, institutions: ["EOA-2026-0117", "NEW-2026-0031"] }, // fault 4
  { fdrHash: "fdr:FDR-776282", bank: "Vijaya Bank (synthetic)", amount: 1800000, session: SESSION, institutions: ["INTK-2026-0208"] },
  { fdrHash: "fdr:FDR-881210", bank: "Nagindas Bank (synthetic)", amount: 2200000, session: SESSION, institutions: ["EOA-2026-0187"] },
  { fdrHash: "fdr:FDR-904512", bank: "United Mercantile Bank (synthetic)", amount: 3100000, session: SESSION, institutions: ["INTK-2026-0229"] },
  { fdrHash: "fdr:FDR-918776", bank: "Coastal Cooperative Bank (synthetic)", amount: 2750000, session: SESSION, institutions: ["NEW-2026-0058"] },
  { fdrHash: "fdr:FDR-925300", bank: "Highland Bank (synthetic)", amount: 2600000, session: SESSION, institutions: ["EOA-2026-0163"] },
  { fdrHash: "fdr:FDR-936140", bank: "Highland Bank (synthetic)", amount: 2950000, session: SESSION, institutions: ["INTK-2026-0210"] },
];

export const TRUSTS = [
  { regNo: "reg-100000", name: "Vikramsheela Education Foundation", signatory: "Adv. T. Ranganathan (notary, adv-9021)" },
  { regNo: "reg-105123", name: "Silverleaf Education Trust", signatory: "Adv. T. Ranganathan (notary, adv-9021)" },
  { regNo: "reg-110246", name: "Cedarville Rural Education Society", signatory: "Adv. M. Sekhar (notary, adv-4430)" },
  { regNo: "reg-115369", name: "Northbay Academy Trust", signatory: "Adv. T. Ranganathan (notary, adv-9021)" },
  { regNo: "reg-120492", name: "Rajatalanka Shiksha Samiti", signatory: "Adv. A. Farooqi (notary, adv-3391)" },
  { regNo: "reg-125615", name: "Pallavaram Design Education Trust", signatory: "Adv. K. Balamurugan (notary, adv-7714)" },
  { regNo: "reg-130738", name: "Devanhalli Allied Health Sciences Foundation", signatory: "Adv. T. Ranganathan (notary, adv-9021)" },
  { regNo: "reg-135861", name: "Camford Education Society", signatory: "Adv. P. Deshmukh (notary, adv-5580)" },
];

/** Categories/regions for demo filters. */
export const REGIONS = [...new Set(INSTITUTIONS.map((i) => i.region))];
