'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoleStore } from '@/store/role-store';
import { BboxViewer } from '@/components/features/BboxViewer';
import { FactsPanel } from '@/components/features/FactsPanel';
import { FindingsPanel } from '@/components/features/FindingsPanel';
import { ConfidenceGateModal } from '@/components/features/ConfidenceGateModal';
import type { Document, Bbox, EvidenceRef, Fact } from '@evidencegraph/domain';
import { useParams, useSearchParams } from 'next/navigation';

export default function EvidencePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const factKey = searchParams.get('factKey');
  const id = params.id;
  const { role } = useRoleStore();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [rightPanel, setRightPanel] = useState<'facts' | 'findings'>('facts');
  const [highlightBbox, setHighlightBbox] = useState<Bbox | null>(null);
  const [gateFactId, setGateFactId] = useState<string | null>(null);

  const { data } = useQuery<{ documents: Document[]; facts: Fact[] }>({
    queryKey: ['application-full', id, role],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${id}`, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<{ documents: Document[]; facts: Fact[] }>;
    },
  });

  const { data: factsData } = useQuery<Fact[]>({
    queryKey: ['facts', id],
    queryFn: async () => {
      const res = await fetch(`/api/applications/${id}/facts`, { headers: { 'x-eg-role': role } });
      return res.json() as Promise<Fact[]>;
    },
  });

  const documents = data?.documents ?? [];
  const currentDoc = (selectedDocId ? documents.find((d) => d.id === selectedDocId) : documents[0]) ?? null;
  const gateFact = gateFactId ? (factsData ?? []).find((f) => f.id === gateFactId) ?? null : null;

  useEffect(() => {
    if (!factKey || !factsData) return;
    const fact = factsData.find((item) => item.key === factKey && item.quarantine && !item.supersededBy);
    if (!fact) return;
    setSelectedFactId(fact.id);
    setSelectedPage(fact.page ?? 1);
    setHighlightBbox(fact.bbox ?? null);
    if (fact.documentId) setSelectedDocId(fact.documentId);
    if (role !== 'applicant') setGateFactId(fact.id);
  }, [factKey, factsData, role]);

  function handleFactSelect(factId: string, bbox: Bbox | null) {
    setSelectedFactId(factId);
    setHighlightBbox(bbox);

    // If the fact is quarantined and user is an officer, open the gate modal
    const fact = (factsData ?? []).find((f) => f.id === factId);
    if (fact?.quarantine && !fact.supersededBy && role !== 'applicant') {
      setGateFactId(factId);
    }
  }

  function handleEvidenceSelect(evidence: EvidenceRef) {
    if (evidence.kind === 'absence_receipt') return;
    const factId = evidence.factId;
    const fact = factId ? (factsData ?? []).find((item) => item.id === factId) : undefined;
    if (!fact) return;
    setRightPanel('facts');
    setSelectedFactId(fact.id);
    setSelectedPage(evidence.page ?? fact.page ?? 1);
    setHighlightBbox(evidence.bbox ?? fact.bbox ?? null);
    if (fact.documentId) setSelectedDocId(fact.documentId);
    if (fact.quarantine && !fact.supersededBy && role !== 'applicant') setGateFactId(fact.id);
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: document viewer */}
      <div tabIndex={0} role="region" aria-label="Document and findings" style={{ flex: '0 0 50%', borderRight: '1px solid var(--color-border)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Document selector */}
        {documents.length > 1 && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, flexWrap: 'wrap', background: 'var(--color-surface)', flexShrink: 0 }}>
            {documents.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDocId(d.id)}
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  background: (selectedDocId ?? documents[0]?.id) === d.id ? 'var(--color-raised)' : 'transparent',
                  color: 'var(--color-text-muted)',
                  transition: 'background 120ms ease',
                }}
              >
                {d.docType}
              </button>
            ))}
          </div>
        )}
        {currentDoc && (
          <BboxViewer
            document={currentDoc}
            selectedPage={selectedPage}
            highlightBbox={highlightBbox}
          />
        )}
        {!currentDoc && (
          <div style={{ padding: 24, color: 'var(--color-text-faint)', fontSize: 13 }}>
            No documents available for this application.
          </div>
        )}
      </div>

      {/* Right: facts + findings panel */}
      <div style={{ flex: '0 0 50%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div role="tablist" aria-label="Evidence details" style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
          {(['facts', 'findings'] as const).map((tab) => (
            <button key={tab} role="tab" aria-selected={rightPanel === tab} onClick={() => setRightPanel(tab)} style={{ padding: '9px 12px', border: 0, borderBottom: rightPanel === tab ? '2px solid var(--color-accent)' : '2px solid transparent', background: 'transparent', color: rightPanel === tab ? 'var(--color-text)' : 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {tab === 'facts' ? 'Extracted Facts' : 'Findings'}
            </button>
          ))}
          {rightPanel === 'facts' && <span style={{ alignSelf: 'center', marginLeft: 8, fontSize: 11, color: 'var(--color-text-faint)' }}>Click a row to highlight · Select a held fact to review</span>}
        </div>
        {rightPanel === 'facts' ? (
          <FactsPanel appId={id} selectedFactId={selectedFactId} onFactSelect={handleFactSelect} />
        ) : (
          <FindingsPanel appId={id} onEvidenceSelect={handleEvidenceSelect} />
        )}
      </div>

      {/* Confidence Gate Modal */}
      {gateFact && (
        <ConfidenceGateModal
          appId={id}
          fact={gateFact}
          open={!!gateFactId}
          onClose={() => setGateFactId(null)}
        />
      )}
    </div>
  );
}
