import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import { InlineMath } from 'react-katex';

export interface TransitionEdgeData extends Record<string, unknown> {
  probability: number;
  reward: number;
  curveOffset: number;
}

export type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>;

function buildFannedPath(sourceX: number, sourceY: number, targetX: number, targetY: number, offset: number) {
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular to the source->target line, so the fan-out direction
  // stays correct no matter how the two nodes are positioned relative to each other.
  const controlX = midX + (-dy / length) * offset;
  const controlY = midY + (dx / length) * offset;

  return {
    path: `M${sourceX},${sourceY} Q${controlX},${controlY} ${targetX},${targetY}`,
    labelX: controlX,
    labelY: controlY,
  };
}

export function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
}: EdgeProps<TransitionFlowEdge>) {
  const { path, labelX, labelY } = buildFannedPath(sourceX, sourceY, targetX, targetY, data?.curveOffset ?? 0);

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            background: '#f9fafb',
            pointerEvents: 'none',
            fontSize: '0.7rem',
          }}
        >
          <InlineMath math={`p=${data?.probability ?? 0};r=${data?.reward ?? 0}`} />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
