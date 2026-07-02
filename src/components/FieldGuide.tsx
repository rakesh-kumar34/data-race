import { CONCEPTS } from '../concepts';
import { LEVELS } from '../levels';

export default function FieldGuide({ onBack }: { onBack: () => void }) {
  return (
    <div className="guide">
      <header className="play-header">
        <button className="btn ghost" onClick={onBack}>← Levels</button>
        <div className="play-title">
          <h2>📖 Concurrency Field Guide</h2>
          <span className="subtitle">
            Every concept the game teaches, in one place — the vocabulary of real incident reviews and staff-level interviews.
          </span>
        </div>
      </header>
      {LEVELS.map((level, i) => (
        <section key={level.id} className="guide-section">
          <h3>
            <span className="guide-level">Level {String(i + 1).padStart(2, '0')}</span> {level.name}
          </h3>
          <dl>
            {CONCEPTS.filter((c) => c.levelId === level.id).map((c) => (
              <div key={c.term} className="guide-entry">
                <dt>{c.term}</dt>
                <dd>{c.def}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
