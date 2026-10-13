"use client";

/**
 * Стор v2 для экранов: синглтон gameStore, хук useGame(selector) и
 * useGameView(view) для производных данных (selectors.ts).
 *
 *   const phase = useGame((s) => s.session?.phase);
 *   const run = useGame((s) => s.runQuery);
 *   const objectives = useGameView(objectivesView);
 *
 * boot() вызывать один раз из корневого клиентского компонента (useEffect):
 * он поднимает сохранение из localStorage (без рассинхрона SSR) и ядро.
 */
import { useMemo } from "react";
import { useStore } from "zustand";
import { createGameStore, type GameState } from "./store";

export const gameStore = createGameStore({ skipHydration: true });

export function useGame<T>(selector: (state: GameState) => T): T {
  return useStore(gameStore, selector);
}

/** Производные данные: пересчитываются, когда меняются сохраняемые срезы или последний результат */
export function useGameView<T>(view: (state: GameState) => T): T {
  const session = useGame((s) => s.session);
  const season = useGame((s) => s.season);
  const profile = useGame((s) => s.profile);
  const settings = useGame((s) => s.settings);
  const last = useGame((s) => s.last);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => view(gameStore.getState()), [view, session, season, profile, settings, last]);
}

export { createGameStore, seasonPoints, isCaseUnlocked, casePlayable } from "./store";
export type { GameState, GameActions, GameStore, GameStoreOptions, OfferInput } from "./store";
export * from "./selectors";
export { computeEnding, endingInputs, ENDING_TITLES } from "./endings";
export { WEATHER_LABELS, DEFAULT_SETTINGS, PIN_ALL_LIMIT } from "./rules";
export { SAVE_KEY, SAVE_VERSION, migrateSave } from "./persist";
export type * from "./types";
