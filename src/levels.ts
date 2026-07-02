import type { LevelDef, ThreadDef } from './types';
import { wrapWithLock } from './engine';

const wrap = (threadIdx: number, from: number, to: number, m = 'M') =>
  (threads: ThreadDef[]): ThreadDef[] =>
    threads.map((t, i) => (i === threadIdx ? { ...t, code: wrapWithLock(t.code, from, to, m) } : t));

export const LEVELS: LevelDef[] = [
  // ---------------------------------------------------------------- L1
  {
    id: 'lost-update',
    name: 'The Lost Update',
    subtitle: 'Two threads increment a counter. What could possibly go wrong?',
    story:
      'Two request handlers each bump a page-view counter by 1. The counter starts at 0, so after both finish it must be 2. Each thread does what EVERY counter increment secretly does: read the value into a private register, add 1 to the register, write it back. Three separate steps — and you control the order in which the steps from the two threads interleave.',
    walkthrough: [
      '"tmp = x" copies the shared value into the thread\'s PRIVATE register — each thread has its own tmp.',
      '"tmp += 1" changes only that private copy. Shared memory does not see it.',
      '"x = tmp" publishes the private copy back, overwriting whatever x holds at that moment.',
      'x++ in your favorite language compiles to exactly these three machine steps.',
    ],
    shared: { x: 0 },
    threads: [
      { name: 'Thread A', code: [{ op: 'read', v: 'x' }, { op: 'add', n: 1 }, { op: 'write', v: 'x' }] },
      { name: 'Thread B', code: [{ op: 'read', v: 'x' }, { op: 'add', n: 1 }, { op: 'write', v: 'x' }] },
    ],
    invariant: { text: 'x == 2 when both threads finish', check: (s) => s.x === 2 },
    goal: 'violate',
    breakHint:
      'Let BOTH threads read x while it is still 0 — then each computes 0 + 1 privately, and the second write just repeats the first. One increment evaporates.',
    explainViolation:
      'That is a LOST UPDATE. Both threads read x = 0 before either wrote, so both computed 1, and the second write overwrote the first with the same value. An increment vanished without any error, exception, or log line — the signature of a data race.',
    fix: {
      intro:
        'Make the read-modify-write INDIVISIBLE. Add locks below, then hit Verify — the checker will try every possible interleaving (not just the ones you thought of) and either prove your fix or replay a schedule that breaks it.',
      patches: [
        { id: 'a-full', label: "Lock Thread A's entire read→add→write", cost: 3, apply: wrap(0, 0, 2) },
        { id: 'b-full', label: "Lock Thread B's entire read→add→write", cost: 3, apply: wrap(1, 0, 2) },
        { id: 'a-write', label: "Lock only Thread A's write", cost: 1, apply: wrap(0, 2, 2) },
        { id: 'b-write', label: "Lock only Thread B's write", cost: 1, apply: wrap(1, 2, 2) },
      ],
      starCosts: [6, 7],
    },
    lesson:
      'The unit that must be protected is the whole read-modify-write, not the write. Locking just the write still lets both threads read the same stale value — the damage happens at the READ. This is why "critical section" is defined by the invariant you are protecting, not by which instruction touches memory. Interview echo: this exact bug is why counters need AtomicInteger / atomic fetch-add, and why "is x++ thread-safe?" is a real question with a real answer: no.',
  },

  // ---------------------------------------------------------------- L2
  {
    id: 'toctou',
    name: 'Check, Then Act, Then Cry',
    subtitle: 'The balance check passed. The balance still went negative.',
    story:
      'An account holds $100. Two withdrawals of $80 arrive at once. Each handler is careful: it CHECKS the balance first and only withdraws if funds are sufficient. The invariant a bank cares about: the balance must never go negative. Your job: overdraw the account anyway.',
    walkthrough: [
      'Each thread reads the balance, then "if tmp < 80: skip 2" bails out when funds are short.',
      'If the check passes, the thread subtracts 80 from its private copy and writes it back.',
      'The check and the act are SEPARATE steps — anything can happen between them.',
    ],
    shared: { balance: 100 },
    threads: [
      {
        name: 'Withdraw A ($80)',
        code: [
          { op: 'read', v: 'balance' },
          { op: 'iflt', n: 80, skip: 2 },
          { op: 'add', n: -80 },
          { op: 'write', v: 'balance' },
        ],
      },
      {
        name: 'Withdraw B ($80)',
        code: [
          { op: 'read', v: 'balance' },
          { op: 'iflt', n: 80, skip: 2 },
          { op: 'add', n: -80 },
          { op: 'write', v: 'balance' },
        ],
      },
    ],
    invariant: { text: 'balance >= 0 at the end', check: (s) => s.balance >= 0 },
    goal: 'violate',
    breakHint:
      'Let both threads pass the balance check while balance is still 100 — both see "enough money". Then let both act on that stale decision.',
    explainViolation:
      'Time-Of-Check to Time-Of-Use (TOCTOU): both threads validated against the same $100, then both spent it. The check was correct WHEN IT RAN — it was stale by the time the money moved. Note the final balance: each thread wrote its own private arithmetic, so the account paid out $160 while recording only one $80 debit... or worse.',
    fix: {
      intro:
        'The check and the act must live inside ONE critical section — a decision is only valid while you hold the lock that protects what you decided about.',
      patches: [
        { id: 'a-full', label: 'Lock A: check AND withdraw together', cost: 4, apply: wrap(0, 0, 3) },
        { id: 'b-full', label: 'Lock B: check AND withdraw together', cost: 4, apply: wrap(1, 0, 3) },
        { id: 'a-act', label: 'Lock A: only the money movement (not the check)', cost: 2, apply: wrap(0, 2, 3) },
        { id: 'b-act', label: 'Lock B: only the money movement (not the check)', cost: 2, apply: wrap(1, 2, 3) },
      ],
      starCosts: [8, 10],
    },
    lesson:
      'Locking the "dangerous" part (the write) while leaving the check outside is the most seductive wrong answer in concurrency — it makes each step safe while the DECISION stays racy. The rule: the lock must cover the entire span from observation to action based on that observation. This pattern is everywhere: file "exists?" checks before creation, inventory checks before order placement, idempotency-key lookups before inserts. At the database layer, this same fix is called SELECT ... FOR UPDATE.',
  },

  // ---------------------------------------------------------------- L3
  {
    id: 'vanishing-money',
    name: 'The Vanishing Money',
    subtitle: 'Two transfers, opposite directions. Conservation of money is... optional?',
    story:
      'Account A holds $50, account B holds $50 — $100 total. Thread 1 moves $10 from A to B; thread 2 simultaneously moves $20 from B to A. Transfers can reorder freely — but money must never be created or destroyed: A + B must equal 100 when the dust settles.',
    walkthrough: [
      'Each transfer is two read-modify-write sequences: debit one account, credit the other.',
      'The two threads touch the SAME two accounts in OPPOSITE orders.',
      'Six instructions per thread — and every interleaving of them is fair game.',
    ],
    shared: { A: 50, B: 50 },
    threads: [
      {
        name: 'T1: A →$10→ B',
        code: [
          { op: 'read', v: 'A' },
          { op: 'add', n: -10 },
          { op: 'write', v: 'A' },
          { op: 'read', v: 'B' },
          { op: 'add', n: 10 },
          { op: 'write', v: 'B' },
        ],
      },
      {
        name: 'T2: B →$20→ A',
        code: [
          { op: 'read', v: 'B' },
          { op: 'add', n: -20 },
          { op: 'write', v: 'B' },
          { op: 'read', v: 'A' },
          { op: 'add', n: 20 },
          { op: 'write', v: 'A' },
        ],
      },
    ],
    invariant: { text: 'A + B == 100 (money is conserved)', check: (s) => s.A + s.B === 100 },
    goal: 'violate',
    breakHint:
      'Target ONE account with overlapping read-modify-writes: let T1 read A, then let T2 do its entire credit to A, then let T1 write its stale value back — T2\'s $20 is wiped out of existence.',
    explainViolation:
      'Money was destroyed (or printed) with no error anywhere. One thread\'s credit landed between the other\'s read and write, and the stale write erased it. Every individual instruction executed perfectly — the SEQUENCE was the bug. This is why "it works on my machine" means nothing for concurrent code: correctness depends on schedules you did not test.',
    fix: {
      intro:
        'Each transfer must be atomic with respect to the accounts it touches. Partial protection protects nothing — verify against ALL interleavings.',
      patches: [
        { id: 't1-full', label: "Lock T1's entire transfer", cost: 6, apply: wrap(0, 0, 5) },
        { id: 't2-full', label: "Lock T2's entire transfer", cost: 6, apply: wrap(1, 0, 5) },
        { id: 't1-a', label: "Lock T1's A-side only (debit)", cost: 3, apply: wrap(0, 0, 2) },
        { id: 't2-b', label: "Lock T2's B-side only (debit)", cost: 3, apply: wrap(1, 0, 2) },
      ],
      starCosts: [12, 14],
    },
    lesson:
      'Invariants that SPAN multiple variables (A + B == 100) need critical sections that span every write to any of them — locking each account\'s update separately keeps each account internally consistent while the invariant across them shatters. This is the essence of a transaction: the intermediate states (debited but not yet credited) must be invisible to everyone else. When one big lock is too costly, the real-world answer is fine-grained locks — which is exactly the door to the next level.',
  },

  // ---------------------------------------------------------------- L4
  {
    id: 'deadlock',
    name: 'The Deadly Embrace',
    subtitle: 'Fine-grained locks fixed the races. Now nothing moves at all.',
    story:
      'The bank got smart: one lock per account, and every transfer locks BOTH accounts it touches before moving money. No more lost updates, no more vanished dollars. But T1 grabs lock A then lock B, while T2 grabs lock B then lock A. Your goal this time is different: freeze the bank solid. Reach a state where NOTHING can ever run again.',
    walkthrough: [
      'lock(A) succeeds if A is free (or you already hold it) — otherwise the thread BLOCKS until it frees up.',
      'A blocked thread cannot be scheduled; its column locks up with a 🔒.',
      'Watch what happens when each thread holds the lock the other one needs.',
    ],
    shared: { A: 50, B: 50 },
    threads: [
      {
        name: 'T1: A→B',
        code: [
          { op: 'lock', m: 'A' },
          { op: 'lock', m: 'B' },
          { op: 'noop', label: 'move $10 A→B' },
          { op: 'unlock', m: 'B' },
          { op: 'unlock', m: 'A' },
        ],
      },
      {
        name: 'T2: B→A',
        code: [
          { op: 'lock', m: 'B' },
          { op: 'lock', m: 'A' },
          { op: 'noop', label: 'move $20 B→A' },
          { op: 'unlock', m: 'A' },
          { op: 'unlock', m: 'B' },
        ],
      },
    ],
    invariant: { text: 'no invariant to break — the danger here is permanent freeze', check: () => true },
    goal: 'deadlock',
    breakHint: 'Let T1 take lock A, then let T2 take lock B. Now watch each thread try its SECOND lock.',
    explainViolation: '',
    explainDeadlock:
      'Deadlock. T1 holds A and waits for B; T2 holds B and waits for A. Each is waiting for the other to release — and neither ever will, because both are waiting. All four Coffman conditions just met on your screen: mutual exclusion, hold-and-wait, no preemption, and the fatal one — a CIRCULAR wait. No exception is thrown. The threads are not crashed; they are perfectly, permanently patient.',
    fix: {
      intro:
        'You cannot remove locking here — the races from earlier levels are real. Break the CYCLE instead. Which conditions can you attack?',
      patches: [
        {
          id: 'reorder',
          label: 'Refactor T2 to acquire locks in the same global order (A before B)',
          cost: 1,
          apply: (threads) =>
            threads.map((t, i) =>
              i === 1
                ? {
                    ...t,
                    code: [
                      { op: 'lock', m: 'A' },
                      { op: 'lock', m: 'B' },
                      { op: 'noop', label: 'move $20 B→A' },
                      { op: 'unlock', m: 'B' },
                      { op: 'unlock', m: 'A' },
                    ],
                  }
                : t,
            ),
        },
        {
          id: 'global',
          label: 'Throw away both locks; use one giant global lock',
          cost: 6,
          apply: (threads) =>
            threads.map((t, i) => ({
              ...t,
              code: [
                { op: 'lock', m: 'G' },
                { op: 'noop', label: i === 0 ? 'move $10 A→B' : 'move $20 B→A' },
                { op: 'unlock', m: 'G' },
              ],
            })),
        },
      ],
      starCosts: [1, 6],
    },
    lesson:
      'Deadlock needs a cycle in the waits-for graph, and the cheapest industrial-strength cure is a GLOBAL LOCK ORDER: rank every lock, always acquire in ascending rank. T2 wanting B-then-A simply refactors to A-then-B — one line of discipline, zero runtime cost. The giant global lock also works but serializes everything (this is literally Python\'s GIL trade-off). Real systems encode lock order in the type system, in lint rules, or by sorting lock addresses — because the alternative is a pager going off at 3am for a system that is not crashed, not logging, and not moving.',
  },

  // ---------------------------------------------------------------- L5
  {
    id: 'atomic',
    name: 'Atomic Victory',
    subtitle: 'The same counter — but this time, you cannot break it. Prove it.',
    story:
      'Back to the page-view counter from level 1 — but the increments are now single ATOMIC instructions (hardware fetch-and-add: LOCK XADD on x86). Each thread bumps the counter twice. Try to lose an update. When you give up, run the exhaustive prover: it will walk EVERY reachable interleaving and certify the invariant.',
    walkthrough: [
      '"atomic { x += 1 }" reads, adds, and writes in ONE indivisible step — no other thread can slip between.',
      'There is no private tmp to go stale: the read-modify-write happens inside the memory system.',
      'Schedule the threads any way you like, then let the prover try everything you didn\'t.',
    ],
    shared: { x: 0 },
    threads: [
      {
        name: 'Thread A',
        code: [
          { op: 'noop', label: 'handle request' },
          { op: 'atomic_add', v: 'x', n: 1 },
          { op: 'atomic_add', v: 'x', n: 1 },
        ],
      },
      {
        name: 'Thread B',
        code: [
          { op: 'noop', label: 'handle request' },
          { op: 'atomic_add', v: 'x', n: 1 },
          { op: 'atomic_add', v: 'x', n: 1 },
        ],
      },
    ],
    invariant: { text: 'x == 4 when both threads finish', check: (s) => s.x === 4 },
    goal: 'verify-safe',
    breakHint: 'There is nothing to find — that is the point. Run the prover.',
    explainViolation: '',
    lesson:
      'Atomicity at the right granularity dissolves the race instead of managing it: the three vulnerable steps of level 1 became one indivisible step, so there is no window for interleaving to exploit — and no lock to forget, order, or deadlock on. This is the foundation of lock-free programming: atomic counters, compare-and-swap loops, reference counts. The catch to carry into interviews: hardware atomics cover ONE memory word. The moment your invariant spans two variables (level 3!) or a check-then-act (level 2!), a single atomic instruction can no longer save you — you are back to locks or to CAS-retry designs. Knowing WHICH regime a problem lives in is the staff-level skill.',
  },
];
