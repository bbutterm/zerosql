"use client";

/**
 * Звуковая шина (UI_ART_DIRECTION, разд. 9): одна функция playSfx(name) и
 * подписка на стор, которая переводит события стола в звуки. Компоненты звук
 * не грузят. Файлы — public/sfx/<категория>.<имя>.mp3; нет файла — тишина
 * (адрес запоминается и больше не запрашивается). До первого действия игрока
 * браузер звук не пускает — отказ play() глушится.
 */
import type { GameStore } from "./store";
import type { Settings } from "./types";

export type SfxCategory = "amb" | "ui" | "paper" | "notify" | "voice";

export type SfxName =
  | "ui.run"
  | "ui.error"
  | "ui.denied"
  | "ui.objective"
  | "ui.unlock"
  | "ui.sleep"
  | "ui.lock"
  | "paper.print"
  | "paper.slide"
  | "paper.pencil"
  | "paper.dater"
  | "paper.check"
  | "paper.stamp"
  | "paper.seal"
  | "paper.sign"
  | "notify.message"
  | "notify.session"
  | "amb.bay";

/** Множители категорий к общей громкости эффектов */
export const SFX_MIX: Record<SfxCategory, number> = { amb: 0.35, ui: 0.45, paper: 0.7, notify: 0.6, voice: 1 };

const missing = new Set<string>();
const cache = new Map<string, HTMLAudioElement>();

export function sfxUrl(name: SfxName, base = "/sfx"): string {
  return `${base}/${name}.mp3`;
}

/** Проиграть звук; settings — громкость (по умолчанию 0.8) */
export function playSfx(name: SfxName, settings?: Pick<Settings, "sfxVolume">): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  const url = sfxUrl(name);
  if (missing.has(url)) return;
  const category = name.split(".")[0] as SfxCategory;
  const volume = Math.max(0, Math.min(1, (settings?.sfxVolume ?? 0.8) * (SFX_MIX[category] ?? 0.5)));
  if (volume === 0) return;
  try {
    let base = cache.get(url);
    if (!base) {
      base = new Audio(url);
      base.preload = "auto";
      base.addEventListener("error", () => missing.add(url), { once: true });
      cache.set(url, base);
    }
    const audio = base.readyState >= 2 ? (base.cloneNode(true) as HTMLAudioElement) : base;
    audio.volume = volume;
    void audio.play().catch(() => {
      // автозапуск запрещён или файла нет — тишина
    });
  } catch {
    missing.add(url);
  }
}

const SYSTEM_SPEAKERS = new Set(["mira", "system", "narrator"]);

/** Подписка: события стора → звуки. Возвращает отписку */
export function watchSfx(store: GameStore): () => void {
  return store.subscribe((state, prev) => {
    const play = (name: SfxName) => playSfx(name, state.settings);
    if (state.last && state.last !== prev.last) {
      const r = state.last.result;
      if (r.error) play(r.errorKind === "locked_table" || r.errorKind === "read_only" || r.errorKind === "forbidden" ? "ui.denied" : "ui.error");
      else play(state.last.completed.length > 0 ? "ui.objective" : "ui.run");
    }
    const s = state.session;
    const p = prev.session;
    if (s && p && s.caseId === p.caseId) {
      if (s.pins.length > p.pins.length) play("paper.print");
      if (s.protocolAttempts > p.protocolAttempts) play("paper.dater");
      if (s.protocolConfirmed.length > p.protocolConfirmed.length) {
        play(s.closingScene && !p.closingScene ? "paper.stamp" : "paper.check");
      }
      if (Object.keys(s.slots).length && s.slots !== p.slots) play("paper.pencil");
    }
    if (state.schema.length > prev.schema.length && prev.schema.length > 0) play("ui.unlock");
    if (state.barks.length > prev.barks.length) {
      const fresh = state.barks.filter((b) => !prev.barks.some((x) => x.id === b.id));
      if (fresh.some((b) => !SYSTEM_SPEAKERS.has(b.speaker) && b.kind !== "system")) play("notify.message");
    }
  });
}
