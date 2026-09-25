import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import { InlineMath } from 'react-katex';

export interface TransitionEdgeData extends Record<string, unknown> {
  probability: number;
}

export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

export function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<TransitionFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: '#f9fafb',
            pointerEvents: 'none',
          }}
        >
          <InlineMath math={`p=${data?.probability ?? 0}`} />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
