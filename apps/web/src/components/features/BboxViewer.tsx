'use client';
import type { Document, Bbox } from '@evidencegraph/domain';

interface BboxViewerProps {
  document: Document;
  selectedPage?: number;
  highlightBbox?: Bbox | null;
  bboxes?: Array<{ bbox: Bbox; factId: string; color?: string }>;
  onBboxClick?: (bbox: Bbox, factId: string) => void;
}

const PAGE_W = 800;
const PAGE_H = 1100;

export function BboxViewer({ document, selectedPage = 1, highlightBbox, bboxes, onBboxClick }: BboxViewerProps) {
  const page = document.pages.find((p) => p.page === selectedPage) ?? document.pages[0];
  if (!page) return <div style={{ color: 'var(--color-text-muted)', padding: 24 }}>No page data</div>;

  return (
    <div tabIndex={0} role="region" aria-label="Document page" style={{ position: 'relative', width: '100%', overflow: 'auto', background: 'var(--color-raised)', borderRadius: 8 }}>
      {/* MOCK label */}
      <div style={{ padding: '4px 12px', background: 'var(--color-overlay)', borderBottom: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--color-validity)', border: '1px dashed var(--color-validity)', padding: '1px 5px', borderRadius: 3 }}>MOCK</span>
        <span>Synthetic page render — not a PDF renderer · {document.docType} · p.{selectedPage}</span>
      </div>

      <div style={{ position: 'relative', width: PAGE_W, minWidth: PAGE_W, height: PAGE_H, margin: '0 auto', background: 'white', boxShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
        {/* Watermark */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 0 }}>
          <span style={{ fontSize: 48, color: 'rgba(0,0,0,0.04)', fontWeight: 900, transform: 'rotate(-30deg)', letterSpacing: '0.1em', userSelect: 'none' }}>
            SIMULATED PAGE RENDER
          </span>
        </div>

        {/* Text lines */}
        {page.lines.map((line, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: line.x,
              top: line.y,
              fontSize: line.size ?? 14,
              fontWeight: line.bold ? 700 : 400,
              fontFamily: line.mono ? 'var(--font-mono)' : 'serif',
              color: line.hidden ? 'white' : '#1a1a1a',
              lineHeight: 1.2,
              whiteSpace: 'pre',
              zIndex: line.hidden ? 0 : 1,
              opacity: line.hidden ? 0 : 1,
            }}
            title={line.hidden ? `[Hidden text: "${line.text}"]` : undefined}
          >
            {line.hidden ? `[hidden: ${line.text}]` : line.text}
          </div>
        ))}

        {/* Noise overlay */}
        {page.noise && page.noise > 0.2 && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, background: `repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,${page.noise * 0.04}) 1px, rgba(0,0,0,${page.noise * 0.04}) 2px)` }} />
        )}

        {/* SVG bbox overlays */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none' }}>
          {bboxes?.map(({ bbox, factId, color }) => (
            <rect
              key={factId}
              x={bbox[0]}
              y={bbox[1]}
              width={bbox[2] - bbox[0]}
              height={bbox[3] - bbox[1]}
              fill="none"
              stroke={color ?? 'var(--color-accent)'}
              strokeWidth={1.5}
              strokeDasharray="4 2"
              opacity={0.7}
              style={{ cursor: 'pointer', pointerEvents: 'all' }}
              onClick={() => onBboxClick?.(bbox, factId)}
            />
          ))}
          {highlightBbox && (
            <rect
              x={highlightBbox[0]}
              y={highlightBbox[1]}
              width={highlightBbox[2] - highlightBbox[0]}
              height={highlightBbox[3] - highlightBbox[1]}
              fill="color-mix(in srgb, var(--color-accent) 15%, transparent)"
              stroke="var(--color-accent)"
              strokeWidth={2}
              style={{ animation: 'bbox-pulse 240ms ease-out 1', animationFillMode: 'forwards' }}
            />
          )}
        </svg>
      </div>
    </div>
  );
}
