import type { Sim, ThreadDef } from '../types';
import { isBlocked, isDone, isDeadlocked } from '../engine';

const THREAD_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa'];

/**
 * Live waits-for graph: threads on the left, mutexes on the right.
 * Solid edge mutex→thread = "held by"; dashed edge thread→mutex = "waiting for".
 * The whole graph turns red when the waits form a cycle (deadlock).
 */
export default function WaitsForGraph({ sim, threads }: { sim: Sim; threads: ThreadDef[] }) {
  const mutexes = Object.keys(sim.locks);
  if (mutexes.length === 0) return null;

  const W = 320;
  const rowH = 56;
  const H = Math.max(threads.length, mutexes.length) * rowH + 24;
  const tx = 66;
  const mx = W - 66;
  const ty = (i: number) => 34 + i * rowH + (H - 24 - threads.length * rowH) / 2;
  const my = (i: number) => 34 + i * rowH + (H - 24 - mutexes.length * rowH) / 2;
  const dead = isDeadlocked(sim, threads);

  const edges: { x1: number; y1: number; x2: number; y2: number; kind: 'holds' | 'waits'; color: string }[] = [];
  mutexes.forEach((m, mi) => {
    const holder = sim.locks[m];
    if (holder !== null) {
      edges.push({ x1: mx - 26, y1: my(mi), x2: tx + 30, y2: ty(holder), kind: 'holds', color: THREAD_COLORS[holder] });
    }
  });
  threads.forEach((th, t) => {
    if (isBlocked(sim, threads, t)) {
      const ins = th.code[sim.threads[t].pc];
      if (ins.op === 'lock') {
        const mi = mutexes.indexOf(ins.m);
        edges.push({ x1: tx + 30, y1: ty(t), x2: mx - 26, y2: my(mi), kind: 'waits', color: THREAD_COLORS[t] });
      }
    }
  });

  return (
    <div className={`wfg ${dead ? 'dead' : ''}`}>
      <div className="wfg-title">
        WAITS-FOR GRAPH
        {dead && <span className="wfg-cycle">⛔ CYCLE — DEADLOCK</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="wfg-svg">
        <defs>
          <marker id="wfg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {edges.map((e, i) => (
          <g key={i} style={{ color: dead ? '#f87171' : e.color }}>
            <line
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="currentColor"
              strokeWidth={2.2}
              strokeDasharray={e.kind === 'waits' ? '5 5' : undefined}
              markerEnd="url(#wfg-arrow)"
              className={e.kind === 'waits' ? 'wfg-waitline' : ''}
            />
            <text x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - 6} textAnchor="middle" className="wfg-edgelabel">
              {e.kind === 'holds' ? 'held by' : 'waiting for'}
            </text>
          </g>
        ))}
        {threads.map((_th, t) => (
          <g key={t} transform={`translate(${tx},${ty(t)})`} opacity={isDone(sim, threads, t) ? 0.35 : 1}>
            <circle r={20} fill="none" stroke={dead && isBlocked(sim, threads, t) ? '#f87171' : THREAD_COLORS[t]} strokeWidth={2.5} />
            <text y={5} textAnchor="middle" className="wfg-node" fill={THREAD_COLORS[t]}>
              {['A', 'B', 'C'][t]}
            </text>
          </g>
        ))}
        {mutexes.map((m, mi) => (
          <g key={m} transform={`translate(${mx},${my(mi)})`}>
            <rect x={-22} y={-16} width={44} height={32} rx={8} fill="none" stroke={sim.locks[m] !== null ? '#f59e0b' : 'var(--border)'} strokeWidth={2} />
            <text y={5} textAnchor="middle" className="wfg-node" fill={sim.locks[m] !== null ? '#f59e0b' : 'var(--dim)'}>
              🔒{m}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
