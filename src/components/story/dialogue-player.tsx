"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { CharacterDef, DialogueChoice, Emotion, Scene } from "@/types/story";
import { NARRATOR, PLAYER } from "@/types/story";
import type { EvidenceCardData } from "@/types/ui";
import { cn } from "@/lib/utils";
import { Glyph } from "@/components/kit/glyphs";
import { ScreenButton } from "@/components/kit/screen";
import { typo } from "@/components/kit/typo";
import { EVIDENCE_ITEM_WIDTH, EVIDENCE_KIND_META, EvidenceCard } from "@/components/case/evidence-card";
import { sortByNight } from "@/components/case/evidence-board";
import { PortraitFrame } from "./portrait";
import { useLineAudio, type VoiceState } from "./line-audio";
import { SceneBackdrop, useBackground } from "./scene-backdrop";

export interface DialoguePlayerProps {
  scene: Scene;
  characters: Record<string, CharacterDef>;
  /** Материалы игрока: для предъявления и для проверки `requires` у вариантов */
  evidence?: EvidenceCardData[];
  onChoice?: (choice: DialogueChoice) => void;
  onPresent?: (evidenceId: string) => void;
  /** Сцена закончилась без выбора/предъявления («дальше» или пропуск) */
  onFinish?: () => void;
  /** overlay — поверх стола на весь экран; inline — внутри родителя (position: relative) */
  variant?: "overlay" | "inline";
  /**
   * Титр локации: «Подвал УВД. 14 декабря, 02:31.» Строка — для всех сцен, функция — своя у
   * каждой сцены. Без титра сцена начинается с первой реплики (id локации игроку не показывается)
   */
  locationLabel?: string | ((scene: Scene) => string | undefined);
  /** Имя игрока в логе */
  playerName?: string;
  /** Почему вариант недоступен, по умолчанию «нужна улика» — дописывается к строке курсивом через тире */
  lockedChoiceHint?: (choice: DialogueChoice, missing: string[]) => string;
  defaultMuted?: boolean;
  defaultAutoAdvance?: boolean;
  /** Громкость голосов 0…1 (settings.voiceVolume) */
  voiceVolume?: number;
  /** Скорость печати, знаков в секунду (по умолчанию 26 мс на знак) */
  charsPerSecond?: number;
  /** С какой реплики начать: номер или "end" — сразу к выбору/предъявлению */
  startAt?: number | "end";
  /** Фокус на плеер при появлении (по умолчанию — для overlay) */
  autoFocus?: boolean;
  voiceBasePath?: string;
  portraitBasePath?: string;
  backgroundBasePath?: string;
  /**
   * Картина сцены: id локации (src/data/locations.json) вместо scene.location; null — чистая
   * комната. По умолчанию — scene.location, а у сцены без location — картина прошлой сцены потока
   */
  background?: string | null;
  /**
   * Что остаётся в логе, когда родитель сменил сцену (плеер живёт весь поток сцен, комната и
   * картина не начинаются заново): flow — прошлые сцены остаются выше, предъявленная улика —
   * на столе; scene — каждая сцена начинает лог и стол заново, как отдельный показ. `startAt`
   * действует на каждую новую сцену
   */
  logScope?: "flow" | "scene";
  /** «Меньше движения» из «Параметров»; prefers-reduced-motion учитывается всегда */
  reducedMotion?: boolean;
  /** «Отмена» в предъявлении; без колбэка кнопки нет */
  onCancelPresent?: () => void;
  className?: string;
}

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

/** Запись лога: титр локации или реплика */
interface Entry {
  key: string;
  kind: "title" | "line";
  speaker?: string;
  text: string;
  /** id реплики для озвучки */
  lineId?: string;
  emotion?: Emotion;
}

const TITLE_MS = 22;

/** Титр из данных: средняя точка-разделитель (U+00B7) становится точкой, в конце — точка */
function titleOf(label: string): string {
  const t = label.replace(/\s*\u00B7\s*/g, ". ").trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function sceneEntries(scene: Scene, label?: string): Entry[] {
  const out: Entry[] = [];
  if (label) out.push({ key: `${scene.id}:title`, kind: "title", text: titleOf(label) });
  for (const line of scene.lines) {
    out.push({
      key: line.id,
      kind: "line",
      speaker: line.speaker,
      text: typo(line.text),
      lineId: line.id,
      emotion: line.emotion,
    });
  }
  return out;
}

/**
 * Диалог (раздел 7.14): комната, портрет слева на всю высоту, справа — лог сцены,
 * растущий снизу вверх. Реплики печатаются; Ноль — единственное окрашенное имя (натрий).
 * Выбор — нумерованные строки PT Serif; предъявление — реестр и предмет на столе.
 * Под всем — картина локации (SceneBackdrop) по цепочке запасных; нет картины — чистая комната.
 */
export function DialoguePlayer({
  scene,
  characters,
  evidence = [],
  onChoice,
  onPresent,
  onFinish,
  variant = "overlay",
  locationLabel,
  playerName = "Ноль",
  lockedChoiceHint,
  defaultMuted = false,
  defaultAutoAdvance = false,
  voiceVolume = 1,
  charsPerSecond = 1000 / 26,
  startAt = 0,
  autoFocus,
  voiceBasePath = "/voice",
  portraitBasePath = "/portraits",
  backgroundBasePath = "/backgrounds",
  background,
  logScope = "flow",
  reducedMotion = false,
  onCancelPresent,
  className,
}: DialoguePlayerProps) {
  const prefersReduced = usePrefersReducedMotion();
  const reduced = prefersReduced || reducedMotion;
  const labelOf = (s: Scene) => (typeof locationLabel === "function" ? locationLabel(s) : locationLabel);

  /* ---------- Сцена и история: лог переживает смену сцены ---------- */

  const initialIndex = (s: Scene, at: number | "end") => {
    const items = sceneEntries(s, labelOf(s));
    if (at === "end") return Math.max(items.length - 1, 0);
    const offset = items[0]?.kind === "title" ? 1 : 0;
    return Math.min(Math.max(at + offset, 0), Math.max(items.length - 1, 0));
  };

  const [current, setCurrent] = useState(scene);
  const [history, setHistory] = useState<Entry[]>([]);
  const [trailing, setTrailing] = useState<Entry[]>([]);
  const [index, setIndex] = useState(() => initialIndex(scene, startAt));
  const [shown, setShown] = useState(() => (startAt === "end" || startAt > 0 ? Number.MAX_SAFE_INTEGER : 0));
  const [atEnd, setAtEnd] = useState(startAt === "end" || scene.lines.length === 0);
  const [resolved, setResolved] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [table, setTable] = useState<{ id: string; raised: boolean } | null>(null);
  const [muted, setMuted] = useState(defaultMuted);
  const [auto, setAuto] = useState(defaultAutoAdvance);
  // Место сцены: своя локация или картина прошлой сцены потока (сцена без location не меняет места)
  const [place, setPlace] = useState<string | null>(() => scene.location ?? null);

  // Новая сцена от родителя: прошлая уходит в историю (или лог начинается заново), печать — с startAt
  if (scene.id !== current.id) {
    if (logScope === "flow") {
      const prevItems = sceneEntries(current, labelOf(current));
      setHistory((h) => [...h, ...prevItems.slice(0, index + 1), ...trailing]);
    } else {
      setHistory([]);
      setTable(null);
    }
    setTrailing([]);
    setCurrent(scene);
    setIndex(initialIndex(scene, startAt));
    setShown(startAt === "end" || startAt > 0 ? Number.MAX_SAFE_INTEGER : 0);
    setAtEnd(startAt === "end" || scene.lines.length === 0);
    setResolved(false);
    setPicked(null);
    setPlace(scene.location ?? place);
  }

  const items = sceneEntries(scene, labelOf(scene));
  const item: Entry | undefined = items[Math.min(index, items.length - 1)];
  const text = item?.text ?? "";
  const visible = reduced || atEnd ? text.length : Math.min(shown, text.length);
  const typing = visible < text.length;

  const owned = new Set(evidence.map((e) => e.id));
  // Предъявление — в порядке реестра «Материалы»: по времени ночи
  const registry = sortByNight(evidence);
  const [advanced, setAdvanced] = useState(startAt !== 0);
  const choices = scene.choices ?? [];
  const present = scene.present;
  const endMode: "present" | "choices" | "next" = present ? "present" : choices.length ? "choices" : "next";

  // На сцене — последний говоривший персонаж (рассказчик и Ноль его не сменяют)
  let stageCharacter: CharacterDef | undefined;
  let stageEmotion: Emotion | undefined;
  const pool = [...history, ...items.slice(0, index + 1)];
  for (let i = pool.length - 1; i >= 0; i--) {
    const c = pool[i].speaker ? characters[pool[i].speaker!] : undefined;
    if (c) {
      stageCharacter = c;
      stageEmotion = pool[i].emotion;
      break;
    }
  }
  const currentSpeaker = item?.speaker ? characters[item.speaker] : undefined;
  const speaking = Boolean(stageCharacter && currentSpeaker && currentSpeaker.id === stageCharacter.id);

  /* ---------- Печать: 26 мс на знак, после запятой +60, после точки +180 ---------- */

  useEffect(() => {
    if (atEnd || reduced || shown >= text.length) return;
    const prev = text[shown - 1] ?? "";
    const base = item?.kind === "title" ? TITLE_MS : 1000 / charsPerSecond;
    const pause = ",;:".includes(prev) ? 60 : ".!?…".includes(prev) && text[shown] === " " ? 180 : 0;
    const t = window.setTimeout(() => setShown((s) => s + 1), base + pause);
    return () => window.clearTimeout(t);
  }, [atEnd, reduced, shown, text, charsPerSecond, item?.kind]);

  /* ---------- Переходы ---------- */

  const goToEnd = () => {
    setIndex(Math.max(items.length - 1, 0));
    setShown(Number.MAX_SAFE_INTEGER);
    setAtEnd(true);
  };

  const advance = () => {
    if (!advanced) setAdvanced(true);
    if (atEnd) {
      if (endMode === "next" && !resolved) {
        setResolved(true);
        onFinish?.();
      }
      return;
    }
    if (typing) {
      setShown(text.length);
      return;
    }
    if (index < items.length - 1) {
      setIndex(index + 1);
      setShown(0);
    } else {
      setAtEnd(true);
    }
  };

  const skip = () => {
    stopVoice();
    if (endMode === "next") {
      setResolved(true);
      onFinish?.();
    } else {
      goToEnd();
    }
  };

  const choiceMissing = (choice: DialogueChoice) => (choice.requires ?? []).filter((id) => !owned.has(id));

  const pickChoice = (choice: DialogueChoice) => {
    if (resolved || choiceMissing(choice).length > 0) return;
    setResolved(true);
    // Выбранный вариант уходит в лог репликой Ноль — её словами, а не строкой меню
    setTrailing((t) => [
      ...t,
      { key: `${scene.id}:choice:${choice.id}`, kind: "line", speaker: PLAYER, text: typo(choice.say ?? choice.text) },
    ]);
    onChoice?.(choice);
  };

  const selectEvidence = (id: string) => {
    setPicked(id);
    setTable({ id, raised: false });
  };

  const presentPicked = () => {
    if (!picked || resolved) return;
    setResolved(true);
    setTable({ id: picked, raised: true });
    onPresent?.(picked);
  };

  /* ---------- Озвучка ---------- */

  // Доиграла реплика — с «Авто» сцена листается дальше
  const handleVoiceEnded = (lineId: string) => {
    if (auto && !atEnd && item?.lineId === lineId) {
      if (index < items.length - 1) {
        setIndex(index + 1);
        setShown(0);
      } else {
        setAtEnd(true);
      }
    }
  };

  const lineId = item?.kind === "line" ? item.lineId : undefined;
  const { voice, stop: stopVoice } = useLineAudio(lineId, {
    enabled: !atEnd && !muted,
    basePath: voiceBasePath,
    volume: voiceVolume,
    onEnded: handleVoiceEnded,
  });
  const voiceState: VoiceState = item?.lineId && voice.lineId === item.lineId ? voice.state : "idle";

  /* ---------- Автопрокрутка без голоса ---------- */

  const autoNext = useEffectEvent(() => advance());
  useEffect(() => {
    if (!auto || atEnd || typing || !item) return;
    if (voiceState === "playing") return;
    const t = window.setTimeout(() => autoNext(), 1100 + text.length * 28);
    return () => window.clearTimeout(t);
  }, [auto, atEnd, typing, item, voiceState, text.length]);

  /* ---------- Фокус и прокрутка лога (мгновенная) ---------- */

  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const shouldFocus = autoFocus ?? variant === "overlay";
  useEffect(() => {
    if (shouldFocus) rootRef.current?.focus({ preventScroll: true });
  }, [shouldFocus]);
  // Новая сцена убрала кнопку под фокусом — клавиатура возвращается плееру
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !shouldFocus) return;
    const active = document.activeElement;
    if (!active || active === document.body || !root.contains(active)) root.focus({ preventScroll: true });
  }, [scene.id, shouldFocus]);

  const logLength = history.length + index + trailing.length + (atEnd ? 1 : 0) + (picked ? 1 : 0);
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLength, visible]);

  /* ---------- Клавиатура: ничего не анимирует ---------- */

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const onControl = target !== rootRef.current && Boolean(target.closest("button, a"));

    if (e.key === "Escape") {
      e.preventDefault();
      skip();
      return;
    }
    if (e.code === "KeyM") {
      e.preventDefault();
      setMuted((m) => !m);
      return;
    }
    if (e.code === "KeyA") {
      e.preventDefault();
      setAuto((a) => !a);
      return;
    }
    if (/^[1-9]$/.test(e.key) && atEnd && !resolved) {
      const n = Number(e.key) - 1;
      if (endMode === "choices" && choices[n]) {
        e.preventDefault();
        pickChoice(choices[n]);
      } else if (endMode === "present" && registry[n]) {
        e.preventDefault();
        selectEvidence(registry[n].id);
      }
      return;
    }
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
      if (onControl && e.key !== "ArrowRight") return;
      e.preventDefault();
      if (atEnd && endMode === "present") {
        if (e.key === "Enter") presentPicked();
        return;
      }
      advance();
    }
  };

  const onStageClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    if (atEnd && endMode !== "next") return;
    advance();
  };

  /* ---------- Разметка ---------- */

  const logEntries: Array<{ entry: Entry; partial?: number }> = [
    ...history.map((entry) => ({ entry })),
    ...items.slice(0, index).map((entry) => ({ entry })),
    ...(item ? [{ entry: item, partial: visible }] : []),
    ...trailing.map((entry) => ({ entry })),
  ];
  const showChoices = atEnd && endMode === "choices" && !resolved;
  const showPresent = atEnd && endMode === "present" && !resolved;
  const showNext = !typing && !showChoices && !showPresent && !(atEnd && resolved);
  const tableCard = table ? evidence.find((e) => e.id === table.id) : undefined;

  // Картина под сценой: проп важнее места сцены; null — чистая комната
  const shownPlace = background !== undefined ? background : place;
  const painting = useBackground(shownPlace, backgroundBasePath).url !== null;
  // Плеер появился поверх стола: гашение экрана (240 мс), затем проявление комнаты (400 мс).
  // Следующие сцены потока идут в том же плеере — вход доигрывает, не начинаясь заново; меньше движения — сразу
  const entering = variant === "overlay" && !reduced;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role={variant === "overlay" ? "dialog" : "region"}
      aria-modal={variant === "overlay" ? true : undefined}
      aria-label="Сцена"
      data-testid="scene"
      data-scene-id={scene.id}
      onKeyDown={onKeyDown}
      className={cn(
        "@container isolate overflow-hidden text-ink-1 outline-none",
        variant === "overlay" ? "fixed inset-0 z-50" : "absolute inset-0 bg-room",
        className
      )}
    >
      {/* Гашение экрана «Зеркала» (240 мс), затем проявление комнаты (400 мс). --zone — зона портрета */}
      <div
        className="absolute inset-0 [--zone:min(640px,44.4cqw)]"
        style={{ animation: entering ? "zs-fade-in 400ms var(--ease-out) 240ms both" : undefined }}
      >
        <SceneBackdrop location={shownPlace} reduced={reduced} basePath={backgroundBasePath} />

        <div className="absolute inset-0 cursor-default" onClick={onStageClick}>
          {/* Портрет: широко — слева на всю высоту; узко — сверху 42 % */}
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-[42%] overflow-hidden [--dossier-bottom:16px] [--portrait-pos:50%_22%]",
              "@3xl:inset-y-0 @3xl:right-auto @3xl:h-auto @3xl:w-(--zone) @3xl:overflow-visible @3xl:[--dossier-bottom:40px] @3xl:[--portrait-pos:50%_18%]"
            )}
          >
            {stageCharacter && (
              <PortraitFrame
                key={stageCharacter.id}
                character={stageCharacter}
                emotion={stageEmotion}
                size="dialogue"
                speaking={speaking}
                dimmed={!speaking}
                basePath={portraitBasePath}
                className="animate-[zs-fade-in_160ms_linear_both]"
              />
            )}

            {/* Предъявляемая улика лежит предметом на столе перед персонажем */}
            {tableCard && (
              <div
                className="absolute bottom-4 left-1/2 @3xl:bottom-10"
                style={{
                  transform: `translateX(-50%) translateY(${table?.raised ? -24 : 0}px) rotate(-1deg)`,
                  transition: "transform 160ms var(--ease-out)",
                }}
              >
                {/* Широко — 320 px, узко — около 60 % ширины: два масштаба, видим один */}
                <div className="hidden @3xl:block" style={{ zoom: 320 / EVIDENCE_ITEM_WIDTH[tableCard.kind] } as CSSProperties}>
                  <EvidenceCard card={tableCard} compact className="shadow-paper" />
                </div>
                <div aria-hidden className="@3xl:hidden" style={{ zoom: 220 / EVIDENCE_ITEM_WIDTH[tableCard.kind] } as CSSProperties}>
                  <EvidenceCard card={tableCard} compact className="shadow-paper" />
                </div>
              </div>
            )}
          </div>

          {/* Лог: растёт снизу вверх, верх уходит в маску прокрутки */}
          <div
            className={cn(
              "absolute inset-x-0 top-[42%] bottom-0 flex flex-col",
              "@3xl:top-0 @3xl:right-[max(48px,calc(100cqw_-_var(--zone)_-_672px))] @3xl:left-[calc(var(--zone)_+_64px)]"
            )}
          >
            <div
              ref={logRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 pt-16 pb-4 @3xl:px-0 @3xl:pb-12"
              style={{
                maskImage: "linear-gradient(transparent, #000 64px)",
                WebkitMaskImage: "linear-gradient(transparent, #000 64px)",
              }}
            >
              <div className="flex min-h-full max-w-[34em] flex-col justify-end gap-5">
                {logEntries.map(({ entry, partial }, i) => (
                  <LogLine
                    key={entry.key + i}
                    entry={entry}
                    partial={partial}
                    age={logEntries.length - 1 - i}
                    characters={characters}
                    playerName={playerName}
                    next={partial !== undefined && showNext}
                    floor={painting ? "ink-2" : "ink-3"}
                  />
                ))}

                {showChoices && (
                  <ol aria-label="Варианты ответа" className="mt-1 flex flex-col gap-2 @max-3xl:pb-[env(safe-area-inset-bottom)]">
                    {choices.map((choice, i) => {
                      const missing = choiceMissing(choice);
                      const locked = missing.length > 0;
                      const reason = (lockedChoiceHint?.(choice, missing) ?? "нужна улика").replace(/^\[|\]$/g, "");
                      return (
                        <li key={choice.id}>
                          <button
                            type="button"
                            aria-disabled={locked}
                            data-testid="scene-choice"
                            data-choice-id={choice.id}
                            onClick={() => pickChoice(choice)}
                            className={cn(
                              "group/choice grid w-full grid-cols-[28px_1fr] text-left font-serif text-[18px] leading-7 @max-3xl:min-h-11 @max-3xl:py-[9px] @max-3xl:text-[17px] @max-3xl:leading-[26px]",
                              locked ? "cursor-default" : "cursor-pointer"
                            )}
                          >
                            <span className="text-ink-3">
                              <span className={cn(!locked && "group-hover/choice:hidden group-focus-visible/choice:hidden")}>
                                {i + 1}.
                              </span>
                              {!locked && (
                                <Glyph
                                  name="marker"
                                  size={10}
                                  className="mt-[9px] hidden text-sodium group-hover/choice:block group-focus-visible/choice:block"
                                />
                              )}
                            </span>
                            <span className={locked ? "text-ink-3" : "text-ink-1"}>
                              {typo(choice.text)}
                              {locked && <span className="italic">{`\u00A0— ${reason}`}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {showPresent && present && (
                  <div aria-label="Предъявление" className="mt-1 flex flex-col gap-3">
                    <p className="doc-18 text-ink-2 italic @max-3xl:text-[17px] @max-3xl:leading-[26px]">
                      {typo(present.prompt)}
                    </p>
                    {evidence.length === 0 ? (
                      <p className="ui-13 text-ink-3">Материалов нет.</p>
                    ) : (
                      <ol aria-label="Материалы" className="border-t border-line">
                        {registry.map((card) => {
                          const sel = picked === card.id;
                          return (
                            <li key={card.id}>
                              {/* Наведение только проясняет текст; выбор — фон, маркер и ink-1 */}
                              <button
                                type="button"
                                aria-pressed={sel}
                                data-testid="scene-present-item"
                                data-item-id={card.id}
                                onClick={() => selectEvidence(card.id)}
                                className={cn(
                                  "group/ev grid h-10 w-full grid-cols-[16px_40px_48px_minmax(0,1fr)] items-baseline border-b border-line pt-2.5 text-left @max-3xl:h-11",
                                  sel && "bg-scr-select"
                                )}
                              >
                                <span className="self-center pl-1 text-sodium">
                                  {sel && <Glyph name="marker" size={10} />}
                                </span>
                                <span className={cn("mono-12", sel ? "text-ink-1" : "text-ink-3 group-hover/ev:text-ink-2")}>{card.at ?? "—"}</span>
                                <span className={cn("mono-11", sel ? "text-ink-2" : "text-ink-3")}>{EVIDENCE_KIND_META[card.kind].code}</span>
                                <span
                                  className={cn(
                                    "truncate pr-3 ui-14",
                                    sel ? "text-ink-1" : "text-ink-2 group-hover/ev:text-ink-1"
                                  )}
                                >
                                  {card.title}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    <div className="flex items-center gap-4">
                      <ScreenButton variant="primary" disabled={!picked} onClick={presentPicked} data-testid="scene-present">
                        Предъявить
                      </ScreenButton>
                      {onCancelPresent && (
                        <ScreenButton variant="text" onClick={onCancelPresent}>
                          Отмена
                        </ScreenButton>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Управление: текстом, справа сверху */}
        <div className="absolute top-3 right-4 flex items-center gap-5 @3xl:top-6 @3xl:right-6">
          {!advanced && !atEnd && <span className="ui-12 text-ink-3 @max-3xl:hidden">Дальше — Пробел</span>}
          <button
            type="button"
            onClick={() => setAuto((a) => !a)}
            aria-pressed={auto}
            title="Автопрокрутка (A)"
            className={cn("ui-12 hover:text-ink-1", auto ? "text-ink-1" : "text-ink-3")}
          >
            Авто
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-pressed={!muted}
            aria-label={muted ? "Включить озвучку (M)" : "Выключить озвучку (M)"}
            title={muted ? "Включить озвучку (M)" : "Выключить озвучку (M)"}
            className="flex h-4 items-center text-ink-3 hover:text-ink-1"
          >
            <Glyph name={muted ? "speaker-off" : "speaker"} size={12} />
          </button>
          <button type="button" onClick={skip} title="Пропустить сцену (Esc)" data-testid="scene-skip" className="ui-12 text-ink-3 hover:text-ink-1">
            Пропустить сцену
          </button>
        </div>
      </div>

      {/* Слой гашения поверх стола (только overlay): 0 → 1 за 240 мс, затем комната проявляется */}
      {variant === "overlay" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-room"
          style={{ animation: entering ? "zs-fade-in 240ms var(--ease-in) both" : undefined }}
        />
      )}
    </div>
  );
}

/* ---------- Строка лога ---------- */

function LogLine({
  entry,
  partial,
  age,
  characters,
  playerName,
  next,
  floor = "ink-3",
}: {
  entry: Entry;
  /** Сколько знаков напечатано (у текущей записи) */
  partial?: number;
  /** 0 — текущая, 1–5 — предыдущие пять, дальше — старше */
  age: number;
  characters: Record<string, CharacterDef>;
  playerName: string;
  next: boolean;
  /** Нижняя ступень затухания: ink-3 на комнате, ink-2 поверх картины локации */
  floor?: "ink-2" | "ink-3";
}) {
  const old = floor === "ink-2" ? "text-ink-2" : "text-ink-3";
  const tone = age === 0 ? "text-ink-1" : age <= 5 ? "text-ink-2" : old;
  const text = entry.text;
  const n = partial ?? text.length;
  const body = (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{text.slice(0, n)}</span>
      {n < text.length && (
        <span aria-hidden className="invisible">
          {text.slice(n)}
        </span>
      )}
      {next && (
        <span aria-hidden className="ml-2 inline-block align-[1px] text-ink-3">
          <Glyph name="next" size={10} />
        </span>
      )}
    </>
  );

  if (entry.kind === "title") {
    return <p className={cn("mono-13", age === 0 ? "text-ink-2" : old)}>{body}</p>;
  }

  const big = "font-serif text-[18px] leading-7 @max-3xl:text-[17px] @max-3xl:leading-[26px]";

  if (entry.speaker === NARRATOR) {
    // Рассказчик на ступень тише реплик, но не ниже нижней ступени
    return <p className={cn(big, "italic", age === 0 ? "text-ink-2" : old)}>{body}</p>;
  }

  const isPlayer = entry.speaker === PLAYER;
  const name = isPlayer ? playerName : (characters[entry.speaker ?? ""]?.shortName ?? entry.speaker);
  // Имя Ноль гаснет до sodium/75 (5,3:1) и не ниже
  const nameTone = isPlayer ? (age === 0 ? "text-sodium" : "text-sodium/75") : "";
  return (
    <p className={cn(big, tone)}>
      <span className={cn("doc-name @max-3xl:text-[16px]", nameTone)}>{name}</span>
      {" — "}
      {body}
    </p>
  );
}
