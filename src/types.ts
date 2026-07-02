// ---------- program model ----------

export type Instr =
  | { op: 'read'; v: string } // tmp = shared[v]
  | { op: 'write'; v: string } // shared[v] = tmp
  | { op: 'add'; n: number } // tmp += n
  | { op: 'iflt'; n: number; skip: number } // if tmp < n: skip the next `skip` instructions
  | { op: 'lock'; m: string }
  | { op: 'unlock'; m: string }
  | { op: 'atomic_add'; v: string; n: number } // shared[v] += n, indivisibly
  | { op: 'cas'; v: string; n: number; retryTo: number } // if shared[v]==tmp: shared[v]=tmp+n, else jump to retryTo
  | { op: 'noop'; label: string };

export interface ThreadDef {
  name: string;
  code: Instr[];
}

// ---------- simulation state ----------

export interface SimThread {
  pc: number;
  reg: number;
}

export interface Sim {
  shared: Record<string, number>;
  threads: SimThread[];
  /** mutex name -> holding thread index, or null */
  locks: Record<string, number | null>;
}

// ---------- levels ----------

export interface Patch {
  id: string;
  label: string;
  cost: number;
  apply: (threads: ThreadDef[]) => ThreadDef[];
}

export type Goal = 'violate' | 'deadlock' | 'verify-safe';

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  story: string;
  /** bullet points explaining the code before play */
  walkthrough: string[];
  shared: Record<string, number>;
  threads: ThreadDef[];
  invariant: { text: string; check: (shared: Record<string, number>) => boolean };
  goal: Goal;
  breakHint: string;
  /** shown when the player achieves an invariant violation */
  explainViolation: string;
  /** shown when the player achieves a deadlock (deadlock-goal levels) */
  explainDeadlock?: string;
  fix?: {
    intro: string;
    patches: Patch[];
    /** cost thresholds: <= [0] → 3 stars, <= [1] → 2 stars, else 1 */
    starCosts: [number, number];
  };
  lesson: string;
}

// ---------- model checker result ----------

export interface CheckResult {
  /** schedule of thread indices leading to a violation/deadlock, or null if safe */
  counterexample: number[] | null;
  kind: 'violation' | 'deadlock' | null;
  statesExplored: number;
}
