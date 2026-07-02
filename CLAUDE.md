# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Data Race — an interactive concurrency-teaching game (React 19 + TypeScript + Vite, no backend). The player schedules threads by hand to trigger races/deadlocks, then places locks and has an exhaustive model checker verify the fix.

## Commands

- `npm run dev` — dev server on :5173
- `npm run build` — type-check (`tsc -b`) + production build; run this to verify changes
- `npm run lint` — oxlint
- Vite `base: './'` — the build must keep working from any mount point.

## Architecture

Everything hangs off the tiny interpreter in `src/engine.ts`:

- Programs are `Instr[]` per thread (`read`/`write`/`add`/`iflt`/`lock`/`unlock`/`atomic_add`/`noop`) over shared integer variables; each thread has ONE private register (`reg`, rendered as `tmp`). `Sim` = shared vars + per-thread `{pc, reg}` + mutex holders. `step()` is a pure function returning a new `Sim`.
- Blocking is implicit: a thread whose next instruction is `lock(m)` on a held mutex is not runnable. Deadlock = some threads unfinished, all unfinished ones blocked.
- `check()` is an exhaustive BFS over all interleavings (state deduped by JSON key). It returns the shortest counterexample schedule (invariant violation at completion, or any deadlock state) or proves safety. Levels are kept small enough that the full state space is trivial (< thousands of states).
- Fixes are `Patch`es on levels: functions that rewrite `ThreadDef[]` (e.g. `wrapWithLock` inserts visible `lock`/`unlock` instructions, deadlock level reorders acquisitions). The player sees the patched code and the checker runs against it.

`src/components/Play.tsx` drives the level flow as a phase machine: `intro → break → broken → fix → won`. Break phase = manual scheduling (history stack supports undo); `verify()` runs the checker against selected patches and, on failure, auto-replays the counterexample schedule through the same stepping UI. Stars = cost thresholds in `level.fix.starCosts`. Progress persists in localStorage (`datarace-progress`).

## Adding a level

Add a `LevelDef` to `src/levels.ts`. Required beyond the program itself: `story`, `walkthrough` bullets, `breakHint`, `explainViolation` (or `explainDeadlock` for deadlock-goal levels), a `lesson`, and fix patches **including at least one plausible decoy** whose failure teaches something. Keep programs ≤ ~6 instructions/thread and 2–3 threads so the checker's state space stays trivially small. `goal` is `'violate'`, `'deadlock'`, or `'verify-safe'` (no fix phase).

## Writing style for level copy

Explanations are the product. They should name the concept (lost update, TOCTOU, Coffman conditions), explain it in terms of what the player just DID, and connect to production practice — no academic citations, no fluff. Decoy patches deserve explicit lessons about why they fail.
