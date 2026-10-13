"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cn } from "@/lib/utils";
import {
  clickSchedule,
  createAmbienceLoop,
  NIGHT_TIMING,
  playSfx,
  type AmbienceLoop,
  type NightRowView,
  type NightStep,
  type NightTextPart,
  type NightView,
  type SfxName,
} from "@/stores/game";
import type { Settings } from "@/stores/game/types";
import { StatusBar } from "@/components/desk/status-bar";
import { Redaction, ScreenButton } from "@/components/kit/screen";
import { typo } from "@/components/kit/typo";
import { isMediaMissing, markMediaMissing, useMediaCacheVersion } from "@/components/story/media-cache";
import { useLineAudio } from "@/components/story/line-audio";

/**
 * «Ночь 03:12» (docs/design/NIGHTS.md): между разбором и вступлением игрок видит
 * свою заблокированную WS-03. Штамп, реплики рассказчика, лента «Приём данных»,
 * строка состояния с прыгающим временем, щелчок в 03:12 и карточка дела с
 * «К делу». Данные — готовый таймлайн из селектора nightView; ядра здесь нет.
 *
 * Время ночи идёт кадрами (requestAnimationFrame): в скрытой вкладке кадры
 * встают сами, голос и гул ставятся на паузу.
 */

/** Фон ночи: картина подвала Б0-03 под слоем --room. Ночная версия кадра заменит id здесь */
export const NIGHT_BACKGROUND = "basement_b0_03_evening";

const WINDOW_ROWS = 6;
const PHONE_ROWS = 4;
const T = NIGHT_TIMING;

export interface NightScreenProps {
  night: NightView;
  /** База дела собрана: «К делу» доступна */
  ready: boolean;
  /** «К делу»: Enter, кнопка, второй Esc на карточке или «Авто» */
  onStart: () => void;
  settings: Pick<Settings, "autoAdvance" | "voiceVolume" | "musicVolume" | "sfxVolume" | "reducedMotion">;
  /** id картины public/backgrounds/<id>.webp; null — чистая комната */
  background?: string | null;
  /** «ноль@зеркало» */
  login?: string;
  voiceBasePath?: string;
  className?: string;
}

type Stage = "stamp" | "steps" | "card";

interface Pos {
  stage: Stage;
  index: number;
  /** мс от начала штампа, такта или карточки */
  t: number;
  /** Голос реплики доиграл в момент t */
  voiceEndT: number | null;
  /** Карточка: дело собрано в момент t */
  readyT: number | null;
}

const START: Pos = { stage: "stamp", index: 0, t: 0, voiceEndT: null, readyT: null };

/* ---------- prefers-reduced-motion как внешний стор ---------- */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false
  );
}

/* ---------- Чистые расчёты по таймлайну ---------- */

const stampEnd = (stamp: string) => T.stampStart + T.stampChar * stamp.length + T.stampHold;

/** Время строки состояния: «10.12.2026 03:12» (с секундами — в такт 03:12) */
function clockText(at: string, seconds = false, short = false): string {
  const m = at.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d:\d\d)(:\d\d)?/);
  if (!m) return at;
  const time = seconds ? `${m[4]}${m[5] ?? ":00"}` : m[4];
  return short ? `${m[3]}.${m[2]} ${time}` : `${m[3]}.${m[2]}.${m[1]} ${time}`;
}

/** Минута до такта: «03:11» */
function minuteBefore(at: string): string {
  const t = Date.parse(`${at.replace(" ", "T")}Z`) - 60_000;
  return new Date(t).toISOString().slice(0, 19).replace("T", " ");
}

/** Конец такта; Infinity — ждём конца голоса */
function stepEnd(step: NightStep, pos: Pos, voicePlaying: boolean): number {
  if (step.kind !== "line") return step.ms;
  if (voicePlaying) return Number.POSITIVE_INFINITY;
  if (pos.voiceEndT !== null) return pos.voiceEndT + T.lineAfterVoice + T.lineOut;
  return step.ms;
}

interface Frame {
  clock: string;
  seconds: boolean;
  sessions: number;
  rows: NightRowView[];
  message: { id: number; text: string } | null;
  line: { id: string; text: string; shown: boolean } | null;
}

/** Что на экране в позиции pos: время, сеансы, строки ленты, сообщение, реплика */
function frameAt(night: NightView, pos: Pos, voicePlaying: boolean): Frame {
  const out: Frame = { clock: night.from, seconds: false, sessions: 1, rows: [], message: null, line: null };
  if (pos.stage === "stamp") return out;
  const done = pos.stage === "card" ? night.steps.length : pos.index;
  night.steps.forEach((step, i) => {
    if (i > done || (i === done && pos.stage === "card")) return;
    const current = i === done;
    const t = current ? pos.t : Number.POSITIVE_INFINITY;
    switch (step.kind) {
      case "line":
        if (step.at) out.clock = step.at;
        if (current) {
          const end = stepEnd(step, pos, voicePlaying);
          out.line = { id: step.lineId, text: step.text, shown: t < end - T.lineOut };
        }
        break;
      case "status":
        if (step.at) out.clock = step.at;
        out.message = { id: i, text: step.text };
        break;
      case "row":
        out.clock = step.at;
        out.rows.push(step.row);
        break;
      case "sessions":
        if (current) {
          out.clock = step.at;
          out.sessions = 2;
        } else out.clock = step.until;
        break;
      case "click": {
        const plan = clickSchedule(step);
        if (current && t < plan.showAt311Until) out.clock = minuteBefore(step.at);
        else {
          out.clock = step.at;
          out.seconds = current;
        }
        if (step.login && t >= (plan.loginAt ?? 0)) out.rows.push(step.login);
        step.cronRows.forEach((row, k) => t >= plan.cronRows[k] && out.rows.push(row));
        break;
      }
      case "montage": {
        const k = Math.min(step.dates.length - 1, Math.floor(t / T.montageDay));
        if (k >= 0) {
          out.clock = `${step.dates[k]} 03:12:00`;
          out.seconds = current;
        }
        break;
      }
    }
  });
  if (pos.stage === "card") {
    out.clock = night.caseAt;
    out.seconds = false;
  }
  return out;
}

/** Звуки такта на отрезке [from, to) мс от начала такта */
function stepSounds(step: NightStep, from: number, to: number): Array<SfxName | "cut" | "resume"> {
  const out: Array<SfxName | "cut" | "resume"> = [];
  const hit = (x: number | null) => x !== null && from <= x && x < to;
  // Звук такта поверх гула: далёкий салют в паузе перед интерлюдией
  if (step.sfx && hit(0)) out.push(step.sfx);
  switch (step.kind) {
    case "sessions":
      if (hit(0)) out.push("notify.session");
      break;
    case "click": {
      const plan = clickSchedule(step);
      if (hit(plan.cutAt)) out.push("cut");
      if (hit(plan.clickAt)) out.push("ui.key_click");
      for (const b of plan.bursts) if (hit(b)) out.push("ui.key_burst");
      if (hit(plan.resumeAt)) out.push("resume");
      break;
    }
    case "montage":
      step.dates.forEach((_, k) => hit(k * T.montageDay) && out.push("ui.key_click"));
      break;
  }
  return out;
}

const hasRows = (night: NightView) =>
  night.steps.some((s) => s.kind === "row" || (s.kind === "click" && (s.login !== null || s.cronRows.length > 0)));

/* ---------- Компонент ---------- */

export function NightScreen({
  night,
  ready,
  onStart,
  settings,
  background = NIGHT_BACKGROUND,
  login = "ноль@зеркало",
  voiceBasePath = "/voice",
  className,
}: NightScreenProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = prefersReduced || settings.reducedMotion;
  const [pos, setPos] = useState<Pos>(START);
  const posRef = useRef<Pos>(START);
  const [auto, setAuto] = useState(settings.autoAdvance);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const loopRef = useRef<AmbienceLoop | null>(null);
  const cutRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const commit = (next: Pos) => {
    posRef.current = next;
    setPos(next);
  };

  const step: NightStep | undefined = pos.stage === "steps" ? night.steps[pos.index] : undefined;
  const lineId = step?.kind === "line" ? step.lineId : undefined;
  const voiceDone = (id: string) => {
    const p = posRef.current;
    const s = p.stage === "steps" ? night.steps[p.index] : undefined;
    if (s?.kind === "line" && s.lineId === id && p.voiceEndT === null) commit({ ...p, voiceEndT: p.t });
  };
  const audio = useLineAudio(lineId, {
    enabled: !muted && settings.voiceVolume > 0,
    basePath: voiceBasePath,
    volume: settings.voiceVolume,
    onEnded: voiceDone,
  });
  const voicePlaying = Boolean(lineId) && audio.voice.lineId === lineId && audio.voice.state === "playing";

  /* ---------- Звук: гул подвала, приглушение под голосом ---------- */

  const sfx = (name: SfxName) => playSfx(name, { sfxVolume: muted ? 0 : settings.sfxVolume });
  const enterSound = useEffectEvent(() => {
    playSfx("ui.sleep", { sfxVolume: settings.sfxVolume });
    const loop = createAmbienceLoop("amb.basement", settings);
    loopRef.current = loop;
    loop.start(600);
    return loop;
  });
  useEffect(() => {
    const loop = enterSound();
    return () => {
      loop.stop();
      if (loopRef.current === loop) loopRef.current = null;
    };
  }, []);

  useEffect(() => {
    loopRef.current?.setVolume({ musicVolume: muted ? 0 : settings.musicVolume });
  }, [muted, settings.musicVolume]);

  useEffect(() => {
    loopRef.current?.duck(voicePlaying);
  }, [voicePlaying]);

  /* ---------- Время ночи: кадры, в скрытой вкладке — пауза ---------- */

  const begin = (stage: Stage, index = 0): Pos => ({ stage, index, t: 0, voiceEndT: null, readyT: null });
  const restoreHum = () => {
    if (cutRef.current) {
      cutRef.current = false;
      loopRef.current?.resume(600);
    }
  };

  const start = () => {
    if (startedRef.current || !ready) return;
    startedRef.current = true;
    setStarted(true);
    audio.stop(120);
    onStart();
  };

  const onFrame = useEffectEvent((dt: number) => {
    const p = posRef.current;
    const t = p.t + dt;
    if (p.stage === "stamp") {
      if (t >= stampEnd(night.stamp)) commit(night.steps.length ? begin("steps") : begin("card"));
      else commit({ ...p, t });
      return;
    }
    if (p.stage === "steps") {
      const s = night.steps[p.index];
      if (!s) {
        commit(begin("card"));
        return;
      }
      for (const sound of stepSounds(s, p.t, t)) {
        if (sound === "cut") {
          cutRef.current = true;
          loopRef.current?.cut();
        } else if (sound === "resume") restoreHum();
        else sfx(sound);
      }
      if (t >= stepEnd(s, p, voicePlaying)) {
        restoreHum();
        commit(p.index + 1 < night.steps.length ? begin("steps", p.index + 1) : begin("card"));
      } else commit({ ...p, t });
      return;
    }
    // Карточка: «Авто» уходит в дело через 4 с после готовности
    const readyT = p.readyT ?? (ready ? t : null);
    commit({ ...p, t, readyT });
    if (auto && readyT !== null && t >= T.startDelay && t - readyT >= T.autoStart) start();
  });

  const onHidden = useEffectEvent((hidden: boolean) => {
    if (hidden) {
      audio.pause();
      loopRef.current?.pause();
    } else {
      audio.resume();
      loopRef.current?.play();
    }
  });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // Вкладка вернулась после паузы — время не прыгает
      const dt = Math.min(100, Math.max(0, now - last));
      last = now;
      onFrame(dt);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    const vis = () => {
      last = performance.now();
      onHidden(document.hidden);
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  /* ---------- Управление ---------- */

  useEffect(() => rootRef.current?.focus({ preventScroll: true }), []);

  const next = () => {
    const p = posRef.current;
    if (p.stage === "stamp") {
      commit(night.steps.length ? begin("steps") : begin("card"));
    } else if (p.stage === "steps") {
      audio.stop(120);
      restoreHum();
      commit(p.index + 1 < night.steps.length ? begin("steps", p.index + 1) : begin("card"));
    }
  };

  const skipToCard = () => {
    const p = posRef.current;
    if (p.stage === "card") {
      start();
      return;
    }
    audio.stop(120);
    restoreHum();
    commit(begin("card"));
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const onControl = e.target !== rootRef.current && Boolean((e.target as HTMLElement).closest("button, a"));
    if (e.key === "Escape") {
      e.preventDefault();
      skipToCard();
    } else if (e.code === "KeyA") {
      e.preventDefault();
      setAuto((a) => !a);
    } else if (e.code === "KeyM") {
      e.preventDefault();
      setMuted((m) => !m);
    } else if (e.key === "Enter") {
      if (onControl) return;
      e.preventDefault();
      if (posRef.current.stage === "card") start();
      else next();
    } else if (e.key === " " || e.key === "ArrowRight") {
      if (onControl && e.key === " ") return;
      e.preventDefault();
      next();
    }
  };

  const onClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, footer")) return;
    next();
  };

  /* ---------- Кадр ---------- */

  useMediaCacheVersion();
  const bgUrl = background ? `/backgrounds/${background}.webp` : null;
  const showBg = bgUrl !== null && !isMediaMissing(bgUrl);

  const frame = frameAt(night, pos, voicePlaying);
  const stampTyped = pos.stage !== "stamp" || reduced ? night.stamp.length : Math.max(0, Math.floor((pos.t - T.stampStart) / T.stampChar));
  const stampDone = stampTyped >= night.stamp.length;
  const onCard = pos.stage === "card" && (reduced || pos.t >= T.cardFade);
  const leaving = pos.stage === "card" && !onCard;
  const card = night.card;
  // «До солнца» не разрывается: «До» не висит в конце строки на телефоне
  const cardDate = typo(card.date).replace(/До /, "До\u00A0");
  const dateTyped = reduced ? cardDate.length : Math.max(0, Math.floor((pos.t - T.cardFade) / T.stampChar));
  const showStart = onCard && pos.t >= T.startDelay;
  const rows = frame.rows.slice(-WINDOW_ROWS);
  // На картине текст держит тёмный ореол: светлые места кадра (монитор, лампа) не съедают ink-2 и ink-3
  const halo = showBg ? "[text-shadow:0_1px_2px_rgb(0_0_0/0.9),0_0_12px_rgb(0_0_0/0.7)]" : undefined;
  const fade = (ms: number, curve: "in" | "out") => (reduced ? undefined : `opacity ${ms}ms var(--ease-${curve})`);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="region"
      aria-label="Ночь между делами"
      data-testid="night-screen"
      data-stage={pos.stage}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className={cn("fixed inset-0 z-50 isolate flex flex-col overflow-hidden bg-room text-ink-1 outline-none", className)}
      style={{ animation: reduced ? undefined : "zs-fade-in 240ms var(--ease-in) both" }}
    >
      {showBg && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- картина подвала из public/ */}
          <img
            src={bgUrl}
            alt=""
            draggable={false}
            onError={() => markMediaMissing(bgUrl)}
            className="pointer-events-none absolute inset-0 -z-10 size-full object-cover"
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-room/72 lg:bg-room/55" />
        </>
      )}

      {/* D: управление — справа сверху; на телефоне верхняя полоса 44 px */}
      <div className="flex h-11 shrink-0 items-center justify-end gap-1 px-2 lg:absolute lg:top-9 lg:right-12 lg:px-0">
        <button
          type="button"
          data-testid="night-auto"
          aria-pressed={auto}
          title="Авто (A)"
          onClick={() => setAuto((a) => !a)}
          className={cn("min-h-11 min-w-11 px-2 ui-13 hover:text-ink-1", auto ? "text-ink-1" : "text-ink-2")}
        >
          Авто
        </button>
        {pos.stage !== "card" && (
          <button
            type="button"
            data-testid="night-skip"
            title="Пропустить ночь (Esc)"
            onClick={skipToCard}
            className="min-h-11 min-w-11 px-2 ui-13 text-ink-2 hover:text-ink-1"
          >
            Пропустить ночь
          </button>
        )}
      </div>

      {/* A: штамп и блокировка */}
      <div className={cn("shrink-0 px-4 lg:absolute lg:top-12 lg:left-16 lg:px-0", halo)}>
        <p className="mono-13 text-ink-2" aria-label={night.stamp}>
          <span aria-hidden>{night.stamp.slice(0, stampTyped)}</span>
          <span aria-hidden className="invisible">
            {night.stamp.slice(stampTyped)}
          </span>
        </p>
        <p className="mt-2 ui-15 font-normal text-ink-2" style={{ visibility: stampDone ? "visible" : "hidden" }}>
          Рабочая станция заблокирована.
        </p>
      </div>

      {/* B / E: реплика и лента, затем карточка дела */}
      <div
        className={cn(
          "relative min-h-0 flex-1 px-4 pt-[9vh] pb-20 lg:absolute lg:top-[30%] lg:bottom-10 lg:px-0 lg:pt-0 lg:pb-0",
          showBg ? "lg:right-[9%] lg:left-[49%] lg:max-w-[640px]" : "lg:left-1/2 lg:w-[640px] lg:-translate-x-1/2"
        )}
      >
        {!onCard ? (
          <div className={halo} style={{ opacity: leaving ? 0 : 1, transition: fade(T.cardFade, "in") }}>
            <p
              aria-live="polite"
              className="h-[84px] doc-22 text-[19px] leading-7 text-ink-1 [text-wrap:pretty] lg:h-24 lg:text-[22px] lg:leading-8"
              style={{
                opacity: frame.line?.shown ? 1 : 0,
                transition: frame.line?.shown ? fade(T.lineIn, "out") : fade(T.lineOut, "in"),
              }}
            >
              {frame.line ? typo(frame.line.text) : ""}
            </p>
            <ol role="log" aria-live="polite" aria-label="Приём данных" className="mt-8">
              {rows.length === 0 && !hasRows(night) && pos.stage !== "stamp" && (
                <li className="mono-13 text-ink-3">Новых записей нет.</li>
              )}
              {rows.map((row, i) => (
                <FeedRow key={row.key} row={row} phoneHidden={rows.length - i > PHONE_ROWS} />
              ))}
            </ol>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className={halo}>
              {card.part && <p className="mono-13 text-ink-3">{card.part}</p>}
              <p className="mono-13 text-ink-3">{card.code}</p>
              <h2 className="mt-1 doc-22 text-[19px] leading-7 text-ink-1 lg:text-[22px] lg:leading-8">{typo(card.title)}</h2>
              <p className="doc-15 text-ink-2">{typo(card.subtitle)}</p>
              <p className="mt-3 mono-13 text-ink-2" aria-label={card.date}>
                <span aria-hidden>{cardDate.slice(0, dateTyped)}</span>
                <span aria-hidden className="invisible">
                  {cardDate.slice(dateTyped)}
                </span>
              </p>
            </div>
            <div className="mt-6 min-h-11 max-lg:fixed max-lg:inset-x-4 max-lg:bottom-8 lg:min-h-6">
              {showStart &&
                (ready ? (
                  <ScreenButton
                    variant="primary"
                    data-testid="night-start"
                    keys="Enter"
                    disabled={started}
                    onClick={start}
                    className="max-lg:w-full"
                  >
                    К делу
                  </ScreenButton>
                ) : (
                  <p className="mono-13 text-ink-3 max-lg:text-center max-lg:leading-[44px]" data-testid="night-opening">
                    Открываю дело…
                  </p>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* C: строка состояния; на телефоне — только сеансы и время */}
      <div className="mt-auto lg:absolute lg:inset-x-0 lg:bottom-0">
        <StatusBar
          className="max-lg:hidden"
          login={login}
          mode="станция заблокирована"
          sessions={frame.sessions}
          message={frame.message}
          dateTime={clockText(frame.clock, frame.seconds)}
        />
        <footer className="flex h-6 items-center gap-3 border-t border-line bg-scr-chrome px-4 mono-12 whitespace-nowrap text-ink-3 lg:hidden">
          <span className={cn(frame.sessions > 1 && "text-alarm")}>сеансов: {frame.sessions}</span>
          <span aria-hidden className="h-3 w-px bg-line-strong" />
          <span className="text-ink-2">{clockText(frame.clock, frame.seconds, true)}</span>
        </footer>
      </div>
    </div>
  );
}

/* ---------- Строка ленты ---------- */

function FeedRow({ row, phoneHidden }: { row: NightRowView; phoneHidden: boolean }) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-baseline gap-x-2 py-1 lg:grid lg:grid-cols-[72px_128px_minmax(0,1fr)] lg:gap-x-0 lg:py-0",
        phoneHidden && "max-lg:hidden"
      )}
    >
      <span className="tnum mono-12 text-ink-3 lg:mono-13 lg:text-ink-2">{row.time}</span>
      <span className="truncate mono-12 text-ink-3 lg:mono-13 lg:pr-3">{row.table}</span>
      <span
        className={cn(
          "min-w-0 basis-full mono-13 text-ink-1 lg:basis-auto",
          row.wrap ? "line-clamp-3 break-words whitespace-pre-wrap" : "overflow-hidden text-ellipsis whitespace-pre"
        )}
      >
        {row.parts.map((part, i) => (
          <Part key={i} part={part} />
        ))}
      </span>
    </li>
  );
}

function Part({ part }: { part: NightTextPart }) {
  if ("text" in part) return <span>{part.text}</span>;
  // Маска фиксированной длины: по ней не угадать nol, zero или i.valts
  const prefix = part.mask.startsWith("B-") ? "B-" : "";
  return (
    <span role="img" aria-label="скрыто">
      {prefix && <span aria-hidden>{prefix}</span>}
      <Redaction chars={part.mask.length - prefix.length} className="text-ink-2" />
    </span>
  );
}
