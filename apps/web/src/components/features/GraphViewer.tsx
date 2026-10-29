'use client';
import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { Core } from 'cytoscape';
import type { GraphSubgraph, GraphNode } from '@evidencegraph/domain';

interface GraphViewerProps {
  subgraph: GraphSubgraph;
  focusId?: string;
}

const NODE_COLORS: Record<GraphNode['label'], string> = {
  Institution: '#5bc0eb',
  Trust: '#a78bfa',
  Person: '#e879a6',
  LandParcel: '#8b95a7',
  FDR: '#f5b942',
  Signatory: '#3ddc97',
  StampImage: '#a78bfa',
  Photo: '#e879a6',
};

export function GraphViewer({ subgraph, focusId }: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (subgraph.nodes.length === 0) return;

    let cy: Core | null = null;

    void (async () => {
      const elements = [
        ...subgraph.nodes.map((n) => ({
          data: {
            id: n.id,
            label: n.display,
            nodeType: n.label,
            ...n.props,
          },
        })),
        ...subgraph.edges.map((e) => ({
          data: {
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.type,
            severity: e.severity,
            ...e.props,
          },
        })),
      ];

      if (!containerRef.current) return;

      cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': (ele: cytoscape.NodeSingular) => NODE_COLORS[(ele.data('nodeType') as GraphNode['label']) ?? 'Institution'] ?? '#8b95a7',
              'label': 'data(label)',
              'color': '#e6eaf2',
              'font-size': 10,
              'text-wrap': 'wrap',
              'text-max-width': '100px',
              'text-valign': 'bottom',
              'text-margin-y': 4,
              'width': (ele: cytoscape.NodeSingular) => ele.data('nodeType') === 'Institution' ? 40 : 24,
              'height': (ele: cytoscape.NodeSingular) => ele.data('nodeType') === 'Institution' ? 40 : 24,
              'border-width': (ele: cytoscape.NodeSingular) => ele.data('id') === focusId ? 2 : 0,
              'border-color': '#5bc0eb',
            } as Record<string, unknown>,
          },
          {
            selector: 'edge',
            style: {
              'width': 1.5,
              'line-color': (ele: cytoscape.EdgeSingular) => ele.data('severity') === 'high' ? '#f2555a' : '#49566b',
              'line-style': (ele: cytoscape.EdgeSingular) => ['NEAR_DUPLICATE', 'CONFLICTS_WITH'].includes(ele.data('label') as string) ? 'dashed' : 'solid',
              'target-arrow-shape': 'triangle',
              'target-arrow-color': (ele: cytoscape.EdgeSingular) => ele.data('severity') === 'high' ? '#f2555a' : '#49566b',
              'curve-style': 'bezier',
              'label': 'data(label)',
              'font-size': 9,
              'color': '#8b95a7',
              'text-rotation': 'autorotate',
            } as Record<string, unknown>,
          },
        ],
        layout: { name: 'cose', animate: false, nodeRepulsion: 8000 } as cytoscape.LayoutOptions,
      });
    })();

    return () => {
      cy?.destroy();
    };
  }, [subgraph, focusId]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: 'var(--color-canvas)' }}
      role="img"
      aria-label="Entity graph"
    />
  );
}
