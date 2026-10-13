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
  | "ui.key_click"
  | "ui.key_burst"
  | "amb.bay"
  | "amb.basement"
  | "amb.newyear";

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

// --- Петля эмбиента (первый потребитель шины amb): гул подвала под ночью ---

/** −8 дБ: приглушение петли под голосом рассказчика (UI_ART_DIRECTION, разд. 9) */
export const DUCK_GAIN = Math.pow(10, -8 / 20);
/** Приглушение — за 150 мс, возврат — за 600 мс */
export const DUCK_IN_MS = 150;
export const DUCK_OUT_MS = 600;

export interface AmbienceLoop {
  /** Поднять петлю за fadeMs (по умолчанию 600) */
  start(fadeMs?: number): void;
  /** Оборвать мгновенно, без фейда (такт 03:12) */
  cut(): void;
  /** Вернуть после обрыва за fadeMs (по умолчанию 600) */
  resume(fadeMs?: number): void;
  /** true — приглушить на −8 дБ за 150 мс (голос), false — вернуть за 600 мс */
  duck(on: boolean): void;
  /** Громкость фона из настроек */
  setVolume(settings: Pick<Settings, "musicVolume">): void;
  /** Скрытая вкладка: пауза и продолжение с того же места */
  pause(): void;
  play(): void;
  /** Остановить и освободить */
  stop(): void;
}

/** Громкость фона: «Музыка и фон» × шина эмбиента */
const ambVolume = (settings?: Pick<Settings, "musicVolume">) => Math.max(0, Math.min(1, (settings?.musicVolume ?? 0.6) * SFX_MIX.amb));

/**
 * Петля эмбиента с приглушением. Файл — public/sfx/<name>.mp3; нет файла или
 * Audio (SSR, тесты) — тихая заглушка с тем же интерфейсом. Громкость — произведение
 * двух огибающих: уровень (старт, обрыв, возврат) и приглушение под голосом.
 */
export function createAmbienceLoop(name: SfxName, settings?: Pick<Settings, "musicVolume">): AmbienceLoop {
  const url = sfxUrl(name);
  let audio: HTMLAudioElement | null = null;
  let base = ambVolume(settings);
  let level = 0;
  let duckLevel = 1;
  let wantPlay = false;
  const ramps: Record<"level" | "duck", number | null> = { level: null, duck: null };

  const apply = () => {
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, base * level * duckLevel));
  };

  const ensure = (): HTMLAudioElement | null => {
    if (audio || missing.has(url) || typeof window === "undefined" || typeof Audio === "undefined") return audio;
    try {
      audio = new Audio(url);
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0;
      audio.addEventListener("error", () => {
        missing.add(url);
        audio = null;
      }, { once: true });
    } catch {
      missing.add(url);
      audio = null;
    }
    return audio;
  };

  const playAudio = () => {
    const a = ensure();
    if (!a || base === 0) return;
    void a.play().catch(() => {
      // автозапуск запрещён или файла нет — тишина
    });
  };

  const ramp = (which: "level" | "duck", to: number, ms: number) => {
    const timer = ramps[which];
    if (timer !== null) window.clearInterval(timer);
    ramps[which] = null;
    const set = (v: number) => {
      if (which === "level") level = v;
      else duckLevel = v;
      apply();
    };
    const from = which === "level" ? level : duckLevel;
    if (ms <= 0 || typeof window === "undefined") {
      set(to);
      return;
    }
    const t0 = Date.now();
    ramps[which] = window.setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      set(from + (to - from) * k);
      if (k >= 1 && ramps[which] !== null) {
        window.clearInterval(ramps[which] as number);
        ramps[which] = null;
      }
    }, 16);
  };

  return {
    start(fadeMs = 600) {
      wantPlay = true;
      playAudio();
      ramp("level", 1, fadeMs);
    },
    cut() {
      ramp("level", 0, 0);
    },
    resume(fadeMs = 600) {
      if (!wantPlay) return;
      playAudio();
      ramp("level", 1, fadeMs);
    },
    duck(on) {
      ramp("duck", on ? DUCK_GAIN : 1, on ? DUCK_IN_MS : DUCK_OUT_MS);
    },
    setVolume(next) {
      base = ambVolume(next);
      apply();
      if (wantPlay && base > 0 && audio?.paused) playAudio();
    },
    pause() {
      audio?.pause();
    },
    play() {
      if (wantPlay) playAudio();
    },
    stop() {
      wantPlay = false;
      for (const k of ["level", "duck"] as const) {
        const timer = ramps[k];
        if (timer !== null) window.clearInterval(timer);
        ramps[k] = null;
      }
      audio?.pause();
      audio = null;
    },
  };
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
