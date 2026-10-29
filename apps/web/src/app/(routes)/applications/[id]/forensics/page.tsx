'use client';
import { useParams } from 'next/navigation';
import { FindingsPanel } from '@/components/features/FindingsPanel';

export default function ForensicsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return (
    <div style={{ padding: 24 }}>
      {/* Disclaimer */}
      <div style={{ marginBottom: 16, padding: '10px 16px', background: 'color-mix(in srgb, var(--color-validity) 10%, transparent)', border: '1px solid var(--color-validity)', borderRadius: 8, fontSize: 13, color: 'var(--color-validity)' }}>
        ⚠ Forensics surfaces preliminary signals only — it does not issue verdicts. All signals require officer review before any decision is made.
      </div>
      <FindingsPanel appId={id} filterClass="anomaly_signal" />
    </div>
  );
}
