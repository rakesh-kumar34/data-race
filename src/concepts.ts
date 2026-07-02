export interface Concept {
  term: string;
  def: string;
  /** level where the concept is introduced (drives the per-level notes panel) */
  levelId: string;
}

export const CONCEPTS: Concept[] = [
  // ---- L1: lost-update
  {
    term: 'Data race',
    def: 'Two threads access the same memory location concurrently, at least one of them writes, and nothing synchronizes them. The result depends on scheduling luck — it may be correct a million times and wrong on run one-million-and-one, with no error raised.',
    levelId: 'lost-update',
  },
  {
    term: 'Read-modify-write',
    def: 'Almost every "single" operation (x++, balance -= 80, count = count + 1) is really three machine steps: read into a private register, compute, write back. Any other thread can slip in between the steps — that gap is where lost updates live.',
    levelId: 'lost-update',
  },
  {
    term: 'Critical section',
    def: 'The span of code that must execute without interference for an invariant to survive. Its boundaries are defined by the INVARIANT you are protecting, not by which instruction "looks dangerous" — which is why locking only the write fails.',
    levelId: 'lost-update',
  },
  {
    term: 'Atomicity',
    def: 'Indivisibility: other threads can observe the state before your operation or after it, but never a half-finished middle. Locks fake atomicity by exclusion; hardware atomics provide it for single words.',
    levelId: 'lost-update',
  },
  // ---- L2: toctou
  {
    term: 'TOCTOU (time-of-check to time-of-use)',
    def: 'A decision is made from an observation, and by the time the action runs, the observation is stale. The check was correct WHEN IT RAN — that is what makes the bug so easy to write and so hard to spot in review.',
    levelId: 'toctou',
  },
  {
    term: 'Race window',
    def: 'The interval between observing state and acting on it. Synchronization does not remove decisions — it closes the window by making observation + action a single indivisible unit (e.g. SELECT ... FOR UPDATE at the database layer).',
    levelId: 'toctou',
  },
  // ---- L3: vanishing-money
  {
    term: 'Invariant',
    def: 'A property that must hold in every state the outside world can observe ("A + B == 100", "balance >= 0"). Concurrency bugs are exactly the schedules that expose a state where the invariant is false.',
    levelId: 'vanishing-money',
  },
  {
    term: 'Multi-variable invariants & transactions',
    def: 'When an invariant spans several variables, every intermediate state (debited but not yet credited) is a violation-in-waiting. The critical section must span ALL the writes — this is what a database transaction is: intermediate states made invisible.',
    levelId: 'vanishing-money',
  },
  {
    term: 'Lock granularity',
    def: 'Coarse-grained (one big lock) is simple and slow: everything serializes. Fine-grained (one lock per account) scales — and introduces new failure modes, because now threads hold one lock while acquiring another. That trade-off is the doorway to deadlock.',
    levelId: 'vanishing-money',
  },
  // ---- L4: deadlock
  {
    term: 'Deadlock & the Coffman conditions',
    def: 'A set of threads each waiting for a resource another one holds. Requires all four Coffman conditions: mutual exclusion, hold-and-wait, no preemption, and circular wait. Remove any one and deadlock is impossible — lock ordering removes the cycle.',
    levelId: 'deadlock',
  },
  {
    term: 'Waits-for graph',
    def: 'Threads and locks as nodes; "holds" and "waiting for" as edges. A cycle in this graph IS a deadlock — literally, not metaphorically. Databases build this graph at runtime to detect deadlocks and pick a victim to abort.',
    levelId: 'deadlock',
  },
  {
    term: 'Global lock ordering',
    def: 'Rank every lock; always acquire in ascending order, no exceptions. Cycles become impossible because a cycle needs someone to acquire "downhill". Costs nothing at runtime; the discipline is enforced by convention, lint, or sorting lock addresses.',
    levelId: 'deadlock',
  },
  // ---- L5: atomic
  {
    term: 'Hardware atomics',
    def: 'CPU instructions (fetch-and-add, compare-and-swap) that perform a read-modify-write on one memory word indivisibly, via exclusive cache-line ownership. No lock to forget, order, or deadlock on — but the guarantee covers exactly one word.',
    levelId: 'atomic',
  },
  {
    term: 'Locks vs atomics',
    def: 'Locks compose across variables and arbitrary code, at the cost of blocking, ordering discipline, and deadlock risk. Atomics never block and never deadlock, but stop at single-word invariants. Knowing which regime a problem lives in is the design decision.',
    levelId: 'atomic',
  },
  // ---- L6: lock-free
  {
    term: 'Compare-and-swap (CAS)',
    def: '"If the value still equals what I read, replace it; otherwise tell me I failed." The universal primitive of lock-free programming: take an optimistic snapshot, compute, CAS, and retry on failure with fresh data.',
    levelId: 'lock-free',
  },
  {
    term: 'Optimistic vs pessimistic concurrency',
    def: 'Pessimistic: assume conflict, exclude everyone first (locks). Optimistic: assume no conflict, detect it atomically at commit time, retry the loser (CAS, database optimistic locking, MVCC). Optimistic wins under low contention; pessimistic under high.',
    levelId: 'lock-free',
  },
  {
    term: 'Livelock & progress guarantees',
    def: 'Threads keep executing (retrying) without making progress — the moving cousin of deadlock. CAS loops are LOCK-FREE: some thread\'s CAS always succeeds, so the system progresses, but an individual thread may starve. WAIT-FREE (every thread progresses in bounded steps) is strictly stronger and much rarer.',
    levelId: 'lock-free',
  },
  {
    term: 'The ABA problem',
    def: 'CAS compares values, not histories. If x went A→B→A behind your back, your stale snapshot still passes the check. Harmless for counters; fatal for pointer-based structures where "same pointer" no longer means "same object". Fix: version-tagged pointers (double-width CAS).',
    levelId: 'lock-free',
  },
];

export const conceptsForLevel = (levelId: string) => CONCEPTS.filter((c) => c.levelId === levelId);
