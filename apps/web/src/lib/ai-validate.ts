/**
 * Validation of what the AI reader found.
 *
 * The AI reads fields; this module checks them with plain deterministic rules
 * (is a reference number present, is the date real, has the certificate expired,
 * do the dates make sense together, did the AI report low confidence).
 * Nothing here says a document is genuine or not. It produces a checklist for a person.
 */

export type FieldLike = { label: string; value: string; confidence: number };

export type CheckState = 'pass' | 'review' | 'missing';

export type ValidationCheck = {
  id: string;
  title: string;
  state: CheckState;
  /** One plain sentence explaining the result. */
  detail: string;
};

export type ValidationReport = {
  checks: ValidationCheck[];
  passed: number;
  needsReview: number;
  missing: number;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function validParts(y: number, m: number, d: number): Date | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** Reads day-first dates (12/03/2025, 12-03-2025, 12 Mar 2025, 12 March 2025) and ISO dates. Returns null when unsure. */
export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[\s/.\-](\d{1,2})[\s/.\-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validParts(year, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s/.\-,]+([A-Za-z]{3,9})\.?[\s/.\-,]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2]!.slice(0, 4).toLowerCase()] ?? MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    if (!month) return null;
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validParts(year, month, Number(m[1]));
  }
  return null;
}

const LABEL_GROUPS = {
  reference: /reference|certificate\s*(no|number)|licen[cs]e|registration|\bref\b/i,
  authority: /authority|issued\s*by|issuing|department|board|registrar/i,
  institution: /institution|institute|college|trust|applicant/i,
  issued: /issue\s*date|issued|date\s*of\s*issue|dated/i,
  validUntil: /valid|expiry|expires|upto|up\s*to/i,
} as const;

function pick(fields: FieldLike[], group: keyof typeof LABEL_GROUPS): FieldLike | undefined {
  // Prefer the most confident match when several labels fit.
  return fields
    .filter((f) => LABEL_GROUPS[group].test(f.label) && !(group === 'issued' && LABEL_GROUPS.validUntil.test(f.label)))
    .sort((a, b) => b.confidence - a.confidence)[0];
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function validateFields(fields: FieldLike[], today: Date = new Date()): ValidationReport {
  const checks: ValidationCheck[] = [];
  const add = (id: string, title: string, state: CheckState, detail: string) => checks.push({ id, title, state, detail });
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const ref = pick(fields, 'reference');
  if (!ref) add('reference', 'Reference number is present', 'missing', 'No certificate or reference number was read from the document.');
  else if (!/\d/.test(ref.value)) add('reference', 'Reference number is present', 'review', `“${ref.value}” has no digits. Please open the document and confirm.`);
  else add('reference', 'Reference number is present', 'pass', `Read as ${ref.value}.`);

  const authority = pick(fields, 'authority');
  add(
    'authority',
    'Issuing authority is named',
    authority ? 'pass' : 'missing',
    authority ? `Read as ${authority.value}.` : 'No issuing authority was read from the document.',
  );

  const institution = pick(fields, 'institution');
  add(
    'institution',
    'Institution is named',
    institution ? 'pass' : 'missing',
    institution ? `Read as ${institution.value}.` : 'No institution name was read from the document.',
  );

  const issuedField = pick(fields, 'issued');
  const validField = pick(fields, 'validUntil');
  const issued = issuedField ? parseDate(issuedField.value) : null;
  const valid = validField ? parseDate(validField.value) : null;

  if (!issuedField) add('issued', 'Issue date is a real date', 'missing', 'No issue date was read from the document.');
  else if (!issued) add('issued', 'Issue date is a real date', 'review', `“${issuedField.value}” could not be read as a calendar date.`);
  else if (issued.getTime() > todayUtc.getTime()) add('issued', 'Issue date is a real date', 'review', `${formatDay(issued)} is in the future. Please confirm.`);
  else add('issued', 'Issue date is a real date', 'pass', `Issued on ${formatDay(issued)}.`);

  if (!validField) add('valid', 'Certificate has not expired', 'missing', 'No valid-until date was read from the document.');
  else if (!valid) add('valid', 'Certificate has not expired', 'review', `“${validField.value}” could not be read as a calendar date.`);
  else if (valid.getTime() < todayUtc.getTime()) add('valid', 'Certificate has not expired', 'review', `Valid until ${formatDay(valid)}, which has passed. A current certificate is needed.`);
  else add('valid', 'Certificate has not expired', 'pass', `Valid until ${formatDay(valid)}.`);

  if (issued && valid) {
    add(
      'order',
      'Dates are in a sensible order',
      valid.getTime() > issued.getTime() ? 'pass' : 'review',
      valid.getTime() > issued.getTime()
        ? 'The valid-until date comes after the issue date.'
        : 'The valid-until date is not after the issue date. Please check both dates.',
    );
  }

  const unsure = fields.filter((f) => f.confidence < 0.5);
  add(
    'confidence',
    'AI is confident about what it read',
    unsure.length === 0 ? 'pass' : 'review',
    unsure.length === 0
      ? 'No field was read with low confidence.'
      : `${unsure.length} field${unsure.length === 1 ? ' was' : 's were'} read with low confidence: ${unsure.map((f) => f.label).join(', ')}.`,
  );

  return {
    checks,
    passed: checks.filter((c) => c.state === 'pass').length,
    needsReview: checks.filter((c) => c.state === 'review').length,
    missing: checks.filter((c) => c.state === 'missing').length,
  };
}
