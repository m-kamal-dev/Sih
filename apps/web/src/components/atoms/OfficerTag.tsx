import { officerById, officerForActor } from '@evidencegraph/domain';

/** Shows who acted on a ledger entry: a named demo officer, or "System" for automatic entries. */
export function OfficerTag({ officerId, actor }: { officerId: string | null; actor?: string }) {
  const officer = officerById(officerId) ?? (actor ? officerForActor(actor) : null);
  if (!officer) {
    return <span style={{ color: 'var(--color-text-muted)' }}>System{actor ? ` (${actor.replace(/^system:/, '')})` : ''}</span>;
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.3 }}>
      <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{officer.name}</span>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{officer.designation} · {officer.id} · demo identity</span>
    </span>
  );
}
