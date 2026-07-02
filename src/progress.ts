export interface LevelResult {
  broken: boolean;
  stars: number; // 0 = fix not done yet
  bestCost: number | null;
}

const KEY = 'datarace-progress';

export function loadProgress(): Record<string, LevelResult> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveLevel(id: string, update: Partial<LevelResult>) {
  const all = loadProgress();
  const prev = all[id] ?? { broken: false, stars: 0, bestCost: null };
  all[id] = {
    broken: prev.broken || !!update.broken,
    stars: Math.max(prev.stars, update.stars ?? 0),
    bestCost:
      update.bestCost != null && (prev.bestCost == null || update.bestCost < prev.bestCost)
        ? update.bestCost
        : prev.bestCost,
  };
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function resetProgress() {
  localStorage.removeItem(KEY);
}
