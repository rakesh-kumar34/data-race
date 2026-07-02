import { useEffect, useMemo, useRef, useState } from 'react';
import type { LevelDef, Sim, ThreadDef } from '../types';
import {
  initSim,
  step,
  isDone,
  isBlocked,
  isRunnable,
  allDone,
  isDeadlocked,
  check,
  instrText,
  applyPatches,
} from '../engine';
import { saveLevel } from '../progress';
import WaitsForGraph from './WaitsForGraph';
import { conceptsForLevel } from '../concepts';

const THREAD_COLORS = ['#f59e0b', '#38bdf8', '#a78bfa'];

type Phase = 'intro' | 'break' | 'broken' | 'fix' | 'won';

interface Props {
  level: LevelDef;
  onBack: () => void;
  onNext: (() => void) | null;
}

export default function Play({ level, onBack, onNext }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [threads, setThreads] = useState<ThreadDef[]>(level.threads);
  const [history, setHistory] = useState<{ sim: Sim; actor: number | null }[]>([
    { sim: initSim(level.shared, level.threads), actor: null },
  ]);
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [patchIds, setPatchIds] = useState<Set<string>>(new Set());
  const [verifyMsg, setVerifyMsg] = useState<{ kind: 'fail' | 'safe' | 'proving'; text: string } | null>(null);
  const [replay, setReplay] = useState<number[] | null>(null);
  const [stars, setStars] = useState(0);
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const replayTimer = useRef<number | null>(null);

  const sim = history[history.length - 1].sim;
  const finished = allDone(sim, threads);
  const deadlocked = isDeadlocked(sim, threads);
  const violated = finished && !level.invariant.check(sim.shared);

  const cost = useMemo(
    () => (level.fix ? level.fix.patches.filter((p) => patchIds.has(p.id)).reduce((a, p) => a + p.cost, 0) : 0),
    [level, patchIds],
  );

  // detect break-phase success
  useEffect(() => {
    if (phase !== 'break') return;
    if (level.goal === 'violate' && violated) {
      saveLevel(level.id, { broken: true });
      setPhase('broken');
    } else if (level.goal === 'deadlock' && deadlocked) {
      saveLevel(level.id, { broken: true });
      setPhase('broken');
    } else if (finished && level.goal !== 'verify-safe') {
      setAttempts((a) => a + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [violated, deadlocked, finished, phase]);

  // replay animation for fix-phase counterexamples
  useEffect(() => {
    if (!replay || replay.length === 0) return;
    replayTimer.current = window.setTimeout(() => {
      const [t, ...rest] = replay;
      doStep(t);
      setReplay(rest.length ? rest : null);
    }, 650);
    return () => {
      if (replayTimer.current) clearTimeout(replayTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, history]);

  const doStep = (t: number) => {
    if (!isRunnable(sim, threads, t)) return;
    const before = sim.shared;
    const next = step(sim, threads, t);
    const changed: Record<string, boolean> = {};
    for (const k of Object.keys(next.shared)) if (next.shared[k] !== before[k]) changed[k] = true;
    setFlash(changed);
    window.setTimeout(() => setFlash({}), 500);
    setHistory((h) => [...h, { sim: next, actor: t }]);
  };

  const reset = (newThreads?: ThreadDef[]) => {
    const th = newThreads ?? threads;
    setHistory([{ sim: initSim(level.shared, th), actor: null }]);
    setFlash({});
  };

  const undo = () => {
    if (history.length > 1) setHistory((h) => h.slice(0, -1));
  };

  const startFix = () => {
    setPhase('fix');
    setThreads(applyPatches(level, patchIds));
    reset(applyPatches(level, patchIds));
    setVerifyMsg(null);
  };

  const togglePatch = (id: string) => {
    const next = new Set(patchIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPatchIds(next);
    const th = applyPatches(level, next);
    setThreads(th);
    reset(th);
    setVerifyMsg(null);
    setReplay(null);
  };

  const verify = () => {
    const th = applyPatches(level, patchIds);
    setVerifyMsg({ kind: 'proving', text: 'Exploring every interleaving…' });
    window.setTimeout(() => {
      const result = check(level.shared, th, level.invariant.check);
      if (result.counterexample) {
        setVerifyMsg({
          kind: 'fail',
          text:
            result.kind === 'deadlock'
              ? `Still broken: the checker found a schedule that DEADLOCKS (after exploring ${result.statesExplored.toLocaleString()} states). Watch it happen —`
              : `Still broken: the checker found a schedule that violates the invariant (after exploring ${result.statesExplored.toLocaleString()} states). Watch it happen —`,
        });
        reset(th);
        setReplay(result.counterexample);
      } else {
        const [three, two] = level.fix!.starCosts;
        const s = cost <= three ? 3 : cost <= two ? 2 : 1;
        setStars(s);
        saveLevel(level.id, { stars: s, bestCost: cost });
        setVerifyMsg({
          kind: 'safe',
          text: `PROVEN SAFE — the checker explored all ${result.statesExplored.toLocaleString()} reachable states: no interleaving can break the invariant${level.goal === 'deadlock' ? ' or deadlock' : ''}.`,
        });
        setPhase('won');
      }
    }, 350);
  };

  const prove = () => {
    setVerifyMsg({ kind: 'proving', text: 'Exploring every interleaving…' });
    window.setTimeout(() => {
      const result = check(level.shared, threads, level.invariant.check);
      setVerifyMsg({
        kind: 'safe',
        text: `PROVEN SAFE — all ${result.statesExplored.toLocaleString()} reachable states explored; the invariant holds in every one of them. Atomicity leaves the race nowhere to hide.`,
      });
      saveLevel(level.id, { stars: 3, bestCost: 0 });
      setPhase('won');
    }, 350);
  };

  const goalText =
    level.goal === 'violate'
      ? `🎯 Break it: find a schedule that violates the invariant — ${level.invariant.text}`
      : level.goal === 'deadlock'
        ? '🎯 Break it: freeze the program — reach a state where no thread can ever run'
        : '🎯 Try to break it — then prove that nobody can';

  return (
    <div className="play">
      <header className="play-header">
        <button className="btn ghost" onClick={onBack}>← Levels</button>
        <div className="play-title">
          <h2>{level.name}</h2>
          <span className="subtitle">{level.subtitle}</span>
        </div>
        <span className={`phase-chip ${phase}`}>
          {phase === 'break' || phase === 'intro' ? 'PHASE 1 · BREAK' : phase === 'won' ? 'COMPLETE' : phase === 'broken' ? 'BROKEN!' : 'PHASE 2 · FIX'}
        </span>
      </header>

      {phase === 'intro' && (
        <div className="modal-scrim">
          <div className="modal">
            <h3>{level.name}</h3>
            <p className="story">{level.story}</p>
            <div className="walkthrough">
              <div className="wt-title">Reading the code</div>
              <ul>
                {level.walkthrough.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
            <div className="invariant-box">🛡 Invariant: {level.invariant.text}</div>
            <button className="btn primary big" onClick={() => setPhase('break')}>
              Take the scheduler's seat →
            </button>
          </div>
        </div>
      )}

      <div className="goal-banner">{goalText}</div>

      <details className="notes-panel" open>
        <summary>📓 Concept notes for this level</summary>
        <dl>
          {conceptsForLevel(level.id).map((c) => (
            <div key={c.term} className="guide-entry">
              <dt>{c.term}</dt>
              <dd>{c.def}</dd>
            </div>
          ))}
        </dl>
        <button className="btn tiny" onClick={() => setPhase('intro')}>
          re-read the level briefing
        </button>
      </details>

      <div className="stage">
        <div className="memory-panel">
          <div className="panel-label">SHARED MEMORY</div>
          <div className="mem-cells">
            {Object.entries(sim.shared).map(([k, v]) => (
              <div key={k} className={`mem-cell ${flash[k] ? 'flash' : ''}`}>
                <span className="mem-name">{k}</span>
                <span className="mem-value">{v}</span>
              </div>
            ))}
            {Object.keys(sim.locks).length > 0 && <WaitsForGraph sim={sim} threads={threads} />}
          </div>
          <div className={`invariant-strip ${violated ? 'bad' : ''}`}>
            🛡 {level.invariant.text}
            {finished && (violated ? ' — VIOLATED' : ' — held')}
          </div>
        </div>

        <div className="threads-row">
          {threads.map((th, t) => {
            const done = isDone(sim, threads, t);
            const blocked = isBlocked(sim, threads, t);
            const runnable = isRunnable(sim, threads, t) && !replay && (phase === 'break' || phase === 'fix');
            const blockingLock =
              blocked && threads[t].code[sim.threads[t].pc].op === 'lock'
                ? (threads[t].code[sim.threads[t].pc] as { m: string }).m
                : null;
            return (
              <div key={t} className={`thread-col ${blocked ? 'blocked' : ''} ${done ? 'done' : ''}`}>
                <div className="thread-head" style={{ borderColor: THREAD_COLORS[t] }}>
                  <span className="thread-name" style={{ color: THREAD_COLORS[t] }}>{th.name}</span>
                  <span className="thread-reg">tmp = {sim.threads[t].reg}</span>
                </div>
                <div className="instr-list">
                  {th.code.map((ins, i) => {
                    const isPc = i === sim.threads[t].pc && !done;
                    const executed = i < sim.threads[t].pc;
                    const isLockInstr = ins.op === 'lock' || ins.op === 'unlock';
                    return (
                      <div
                        key={i}
                        className={`instr ${isPc ? 'pc' : ''} ${executed ? 'executed' : ''} ${isLockInstr ? 'lockline' : ''}`}
                      >
                        <span className="instr-arrow">{isPc ? '▶' : ''}</span>
                        <code>{instrText(ins)}</code>
                      </div>
                    );
                  })}
                </div>
                {done && <div className="thread-status">✓ finished</div>}
                {blocked && <div className="thread-status blocked-status">🔒 blocked — waiting for {blockingLock}</div>}
                {!done && !blocked && (
                  <button
                    className="btn run-btn"
                    style={{ background: THREAD_COLORS[t], borderColor: THREAD_COLORS[t] }}
                    disabled={!runnable}
                    onClick={() => doStep(t)}
                  >
                    Run next instruction
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="timeline">
          <span className="panel-label">SCHEDULE</span>
          <div className="timeline-chips">
            {history.slice(1).map((h, i) => (
              <span key={i} className="chip" style={{ background: THREAD_COLORS[h.actor!] }}>
                {['A', 'B', 'C'][h.actor!]}
              </span>
            ))}
            {history.length === 1 && <span className="timeline-empty">you haven't scheduled anything yet — click a thread's button</span>}
          </div>
          <div className="timeline-actions">
            <button className="btn" onClick={undo} disabled={history.length === 1 || !!replay}>↩ Undo</button>
            <button className="btn" onClick={() => reset()} disabled={!!replay}>⟲ Reset</button>
            {phase === 'break' && level.goal !== 'verify-safe' && (
              <button className="btn" onClick={() => setShowHint(true)}>💡 Hint</button>
            )}
            {phase === 'break' && level.goal === 'verify-safe' && (
              <button className="btn primary" onClick={prove}>🔬 Run exhaustive proof</button>
            )}
          </div>
        </div>

        {showHint && phase === 'break' && (
          <div className="hintbox">
            💡 {level.breakHint}
            <button className="btn tiny" onClick={() => setShowHint(false)}>dismiss</button>
          </div>
        )}

        {phase === 'break' && finished && !violated && level.goal === 'violate' && (
          <div className="feedback neutral">
            The invariant held this time ({attempts} attempt{attempts === 1 ? '' : 's'}). Undo or reset and try a different interleaving — the bug is in there.
          </div>
        )}

        {phase === 'broken' && (
          <div className="feedback success">
            <strong>💥 You broke it!</strong>
            <p>{level.goal === 'deadlock' ? level.explainDeadlock : level.explainViolation}</p>
            {level.fix ? (
              <button className="btn primary big" onClick={startFix}>Phase 2: now FIX it →</button>
            ) : (
              <button className="btn primary big" onClick={onBack}>Back to levels</button>
            )}
          </div>
        )}

        {(phase === 'fix' || (phase === 'won' && level.fix && stars > 0)) && level.fix && (
          <div className="fix-panel">
            <div className="panel-label">FIX IT — synchronization budget</div>
            <p className="fix-intro">{level.fix.intro}</p>
            <div className="patches">
              {level.fix.patches.map((p) => (
                <label key={p.id} className={`patch ${patchIds.has(p.id) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={patchIds.has(p.id)}
                    onChange={() => togglePatch(p.id)}
                    disabled={phase === 'won' || !!replay}
                  />
                  <span>{p.label}</span>
                  <span className="patch-cost">cost {p.cost}</span>
                </label>
              ))}
            </div>
            <div className="verify-row">
              <span className="cost-meter">total cost: <strong>{cost}</strong> (fewer = more ⭐)</span>
              {phase === 'fix' && (
                <button className="btn primary" onClick={verify} disabled={!!replay}>
                  🔬 Verify against ALL interleavings
                </button>
              )}
            </div>
            {verifyMsg && (
              <div className={`feedback ${verifyMsg.kind === 'safe' ? 'success' : verifyMsg.kind === 'fail' ? 'danger' : 'neutral'}`}>
                {verifyMsg.text}
              </div>
            )}
          </div>
        )}

        {phase === 'won' && (
          <div className="feedback lesson">
            <div className="stars">{'⭐'.repeat(stars || 3)}</div>
            <strong>Level complete{level.fix ? ` — synchronization cost ${cost}` : ''}</strong>
            <p>{level.lesson}</p>
            <div className="won-actions">
              <button className="btn" onClick={onBack}>All levels</button>
              {onNext && <button className="btn primary" onClick={onNext}>Next level →</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
