import type { FindingClass, VerificationStatus, Severity } from '@evidencegraph/domain';

export const FINDING_CLASS_LABELS: Record<FindingClass, string> = {
  completeness_gap: 'Missing document',
  validity_gap: 'Expired or invalid',
  potential_discrepancy: 'Details do not match',
  anomaly_signal: 'Looks unusual — please check',
  confirmed_violation: 'Problem confirmed by officer',
};

export const FINDING_CLASS_COLORS: Record<FindingClass, string> = {
  completeness_gap: 'var(--color-completeness)',
  validity_gap: 'var(--color-validity)',
  potential_discrepancy: 'var(--color-discrepancy)',
  anomaly_signal: 'var(--color-anomaly)',
  confirmed_violation: 'var(--color-violation)',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  low: 'var(--color-pending)',
  medium: 'var(--color-validity)',
  high: 'var(--color-alert)',
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  verified: 'Confirmed with issuer',
  mismatch: 'Does not match issuer',
  expired: 'No longer valid',
  pending: 'Waiting for reply',
  source_unavailable: 'Could not reach the issuer',
  manual_review: 'Needs a person to check',
};

export const VERIFICATION_STATUS_COLORS: Record<VerificationStatus, string> = {
  verified: 'var(--color-verified)',
  mismatch: 'var(--color-mismatch)',
  expired: 'var(--color-expired)',
  pending: 'var(--color-pending)',
  source_unavailable: 'var(--color-pending)',
  manual_review: 'var(--color-accent)',
};

export const AGENT_NODE_LABELS: Record<string, string> = {
  intake: 'Receive and plan',
  doc_reader: 'Read documents',
  forensics: 'Look for tampering',
  source_verifier: 'Ask the issuer',
  confidence_gate: 'Confirm uncertain readings',
  cross_check: 'Compare with other institutions',
  compliance: 'Apply the rules',
  critic: 'Evidence check',
  reporter: 'Write the report',
};

export const AGENT_NODE_ORDER = [
  'intake',
  'doc_reader',
  'forensics',
  'source_verifier',
  'confidence_gate',
  'cross_check',
  'compliance',
  'critic',
  'reporter',
] as const;

export const CYPHER_GHOST_FACULTY = `// Ghost faculty: same person, two institutions, overlapping employment in a session
MATCH (p:Person)<-[e1:EMPLOYS]-(i1:Institution),
      (p)<-[e2:EMPLOYS]-(i2:Institution)
WHERE i1.aicte_id < i2.aicte_id AND e1.session = e2.session
  AND e1.from <= coalesce(e2.to, date()) AND e2.from <= coalesce(e1.to, date())
RETURN p.faculty_id, i1.aicte_id, i2.aicte_id, e1.source_doc, e2.source_doc`;

export const CYPHER_RECYCLED_LAND = `// Recycled land parcel
MATCH (l:LandParcel)<-[:OWNS|LEASES]-(t1:Trust), (l)<-[:OWNS|LEASES]-(t2:Trust)
WHERE t1.reg_no < t2.reg_no
RETURN l.state, l.district, l.survey_no, t1.name, t2.name`;

export const CYPHER_REUSED_FDR = `// Reused FDR in the same session
MATCH (f:FDR)<-[a:PLEDGED]-(i1:Institution), (f)<-[b:PLEDGED]-(i2:Institution)
WHERE i1.aicte_id < i2.aicte_id AND a.session = b.session
RETURN f.bank, i1.aicte_id, i2.aicte_id`;

export const DOC_TYPE_LABELS: Record<string, string> = {
  eoa_form: 'Approval form',
  intake_form: 'Intake form',
  new_programme_form: 'New programme form',
  sale_deed: 'Sale deed',
  fire_noc: 'Fire safety NOC',
  building_completion_certificate: 'Building completion certificate',
  faculty_roster: 'Faculty roster',
  degree_certificate: 'Degree certificate',
  fdr: 'FDR receipt',
  trust_affidavit: 'Trust affidavit',
  trust_registration: 'Trust registration',
  floor_plan: 'Floor plan',
  lab_photo: 'Lab photo',
  classroom_photo: 'Classroom photo',
};

/** Plain label for a document type code; falls back to a readable version of the code. */
export function docTypeLabel(code: string): string {
  return DOC_TYPE_LABELS[code] ?? code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Plain label for a fact key such as "land.form_area" -> "Land · form area". */
export function factKeyLabel(key: string): string {
  const [group = '', ...rest] = key.split('.');
  const head = (DOC_TYPE_LABELS[group] ?? group.replace(/_/g, ' ')).replace(/^./, (c) => c.toUpperCase());
  return rest.length ? `${head} · ${rest.join(' ').replace(/_/g, ' ')}` : head;
}

export const LEDGER_ACTION_LABELS: Record<string, string> = {
  'rulepack.loaded': 'Rule pack loaded',
  'run.completed': 'Checks completed',
  'letter.drafted': 'Letter drafted (not sent)',
  'letter.updated': 'Letter edited',
  'letter.released': 'Letter released',
  'finding.accept': 'Signal accepted',
  'finding.dismiss': 'Signal dismissed',
  'finding.escalate': 'Signal escalated',
  'fact.corrected': 'Reading corrected by officer',
  'rules.published': 'Rules published',
};
