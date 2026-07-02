import { useState } from 'react';
import type { LevelDef } from './types';
import { LEVELS } from './levels';
import Home from './components/Home';
import Play from './components/Play';
import './App.css';

export default function App() {
  const [level, setLevel] = useState<LevelDef | null>(null);
  const idx = level ? LEVELS.findIndex((l) => l.id === level.id) : -1;
  return level ? (
    <Play
      key={level.id}
      level={level}
      onBack={() => setLevel(null)}
      onNext={idx < LEVELS.length - 1 ? () => setLevel(LEVELS[idx + 1]) : null}
    />
  ) : (
    <Home onPick={setLevel} />
  );
}
