import type { LevelDef } from '../types';
import { LEVELS } from '../levels';
import { useState } from 'react';
import { loadProgress, resetProgress } from '../progress';

interface HomeProps {
  onPick: (level: LevelDef) => void;
  onGuide: () => void;
}

export default function Home({ onPick, onGuide }: HomeProps) {
  const [resetArmed, setResetArmed] = useState(false);
  const [, forceRefresh] = useState(0);
  const progress = loadProgress();
  const totalStars = Object.values(progress).reduce((a, r) => a + r.stars, 0);
  const anyProgress = Object.keys(progress).length > 0;

  const onReset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    resetProgress();
    setResetArmed(false);
    forceRefresh((n) => n + 1);
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="logo-mark">🧵</div>
        <h1>
          Data <span className="accent">Race</span>
        </h1>
        <p className="tagline">You are the thread scheduler. Break real concurrent code — then prove your fix.</p>
        <p className="pitch">
          Every level is a tiny concurrent program with a real bug from production folklore: lost updates,
          check-then-act races, vanishing money, deadlock. First you <strong>break it</strong> by choosing the exact
          interleaving that triggers the bug. Then you <strong>fix it</strong> with a limited synchronization budget —
          and an exhaustive model checker tries <em>every possible schedule</em> to prove you right or replay the one
          that proves you wrong.
        </p>
        <div className="home-actions">
          <div className="star-total">⭐ {totalStars} / {LEVELS.length * 3}</div>
          <button className="btn guide-btn" onClick={onGuide}>📖 Concurrency field guide</button>
          {anyProgress && (
            <button className={`btn tiny reset-btn ${resetArmed ? 'armed' : ''}`} onClick={onReset} onBlur={() => setResetArmed(false)}>
              {resetArmed ? 'click again to confirm' : '⟲ reset progress'}
            </button>
          )}
        </div>
      </header>

      <div className="level-list">
        {LEVELS.map((level, i) => {
          const p = progress[level.id];
          return (
            <button key={level.id} className="level-card" onClick={() => onPick(level)}>
              <div className="level-num">{String(i + 1).padStart(2, '0')}</div>
              <div className="level-body">
                <div className="level-name">
                  {level.name}
                  {p?.broken && p.stars === 0 && <span className="badge broke">💥 broken · fix pending</span>}
                  {p && p.stars > 0 && <span className="badge stars">{'⭐'.repeat(p.stars)}</span>}
                </div>
                <div className="level-sub">{level.subtitle}</div>
              </div>
              <div className="level-go">▶</div>
            </button>
          );
        })}
      </div>

      <footer className="home-footer">
        Concepts you will own by level 6: atomicity · critical sections · TOCTOU · multi-variable invariants ·
        deadlock &amp; lock ordering · hardware atomics · CAS &amp; lock-free · livelock · the ABA problem · model checking
        <div className="copyright">
          © 2026 <a href="https://rakeshcgk.com">Rakesh Kumar</a> · MIT licensed ·{' '}
          <a href="https://github.com/rakesh-kumar34/data-race">source</a>
        </div>
      </footer>
    </div>
  );
}
