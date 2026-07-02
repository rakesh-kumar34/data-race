import type { Instr, ThreadDef, Sim, LevelDef, CheckResult } from './types';

export function initSim(shared: Record<string, number>, threads: ThreadDef[]): Sim {
  const locks: Record<string, number | null> = {};
  for (const t of threads) {
    for (const ins of t.code) {
      if (ins.op === 'lock' || ins.op === 'unlock') locks[ins.m] = null;
    }
  }
  return {
    shared: { ...shared },
    threads: threads.map(() => ({ pc: 0, reg: 0 })),
    locks,
  };
}

export function isDone(sim: Sim, threads: ThreadDef[], t: number): boolean {
  return sim.threads[t].pc >= threads[t].code.length;
}

export function isBlocked(sim: Sim, threads: ThreadDef[], t: number): boolean {
  if (isDone(sim, threads, t)) return false;
  const ins = threads[t].code[sim.threads[t].pc];
  return ins.op === 'lock' && sim.locks[ins.m] !== null && sim.locks[ins.m] !== t;
}

export function isRunnable(sim: Sim, threads: ThreadDef[], t: number): boolean {
  return !isDone(sim, threads, t) && !isBlocked(sim, threads, t);
}

export function allDone(sim: Sim, threads: ThreadDef[]): boolean {
  return sim.threads.every((_, t) => isDone(sim, threads, t));
}

export function isDeadlocked(sim: Sim, threads: ThreadDef[]): boolean {
  const unfinished = sim.threads.map((_, t) => t).filter((t) => !isDone(sim, threads, t));
  return unfinished.length > 0 && unfinished.every((t) => isBlocked(sim, threads, t));
}

/** Execute one instruction of thread t. Assumes isRunnable. Returns a new Sim. */
export function step(sim: Sim, threads: ThreadDef[], t: number): Sim {
  const next: Sim = {
    shared: { ...sim.shared },
    threads: sim.threads.map((th) => ({ ...th })),
    locks: { ...sim.locks },
  };
  const th = next.threads[t];
  const ins = threads[t].code[th.pc];
  switch (ins.op) {
    case 'read':
      th.reg = next.shared[ins.v];
      th.pc++;
      break;
    case 'write':
      next.shared[ins.v] = th.reg;
      th.pc++;
      break;
    case 'add':
      th.reg += ins.n;
      th.pc++;
      break;
    case 'iflt':
      th.pc += th.reg < ins.n ? ins.skip + 1 : 1;
      break;
    case 'lock':
      next.locks[ins.m] = t;
      th.pc++;
      break;
    case 'unlock':
      next.locks[ins.m] = null;
      th.pc++;
      break;
    case 'atomic_add':
      next.shared[ins.v] += ins.n;
      th.pc++;
      break;
    case 'noop':
      th.pc++;
      break;
  }
  return next;
}

function key(sim: Sim): string {
  return JSON.stringify([sim.shared, sim.threads, sim.locks]);
}

/**
 * Exhaustive BFS over every interleaving. Finds the shortest schedule that
 * violates the invariant or deadlocks, or proves none exists.
 */
export function check(
  shared: Record<string, number>,
  threads: ThreadDef[],
  invariant: (shared: Record<string, number>) => boolean,
  maxStates = 500_000,
): CheckResult {
  const start = initSim(shared, threads);
  const queue: { sim: Sim; schedule: number[] }[] = [{ sim: start, schedule: [] }];
  const seen = new Set([key(start)]);
  let explored = 0;

  while (queue.length) {
    const { sim, schedule } = queue.shift()!;
    explored++;
    if (explored > maxStates) break;

    if (allDone(sim, threads)) {
      if (!invariant(sim.shared)) return { counterexample: schedule, kind: 'violation', statesExplored: explored };
      continue;
    }
    if (isDeadlocked(sim, threads)) {
      return { counterexample: schedule, kind: 'deadlock', statesExplored: explored };
    }
    for (let t = 0; t < threads.length; t++) {
      if (!isRunnable(sim, threads, t)) continue;
      const next = step(sim, threads, t);
      const k = key(next);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push({ sim: next, schedule: [...schedule, t] });
      }
    }
  }
  return { counterexample: null, kind: null, statesExplored: explored };
}

/** Human-readable text for an instruction. */
export function instrText(ins: Instr): string {
  switch (ins.op) {
    case 'read':
      return `tmp = ${ins.v}`;
    case 'write':
      return `${ins.v} = tmp`;
    case 'add':
      return ins.n >= 0 ? `tmp += ${ins.n}` : `tmp -= ${-ins.n}`;
    case 'iflt':
      return `if tmp < ${ins.n}: skip ${ins.skip}`;
    case 'lock':
      return `lock(${ins.m})`;
    case 'unlock':
      return `unlock(${ins.m})`;
    case 'atomic_add':
      return ins.n >= 0 ? `atomic { ${ins.v} += ${ins.n} }` : `atomic { ${ins.v} -= ${-ins.n} }`;
    case 'noop':
      return ins.label;
  }
}

/** Wrap code[from..to] (inclusive) in lock/unlock of mutex m. */
export function wrapWithLock(code: Instr[], from: number, to: number, m: string): Instr[] {
  return [
    ...code.slice(0, from),
    { op: 'lock', m },
    ...code.slice(from, to + 1),
    { op: 'unlock', m },
    ...code.slice(to + 1),
  ];
}

export function applyPatches(level: LevelDef, patchIds: Set<string>): ThreadDef[] {
  let threads = level.threads;
  if (!level.fix) return threads;
  for (const patch of level.fix.patches) {
    if (patchIds.has(patch.id)) threads = patch.apply(threads);
  }
  return threads;
}
