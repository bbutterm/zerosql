"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ChevronRight,
  FastForward,
  Lock,
  MapPin,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { CharacterDef, DialogueChoice, DialogueLine, Scene } from "@/types/story";
import { NARRATOR, PLAYER } from "@/types/story";
import type { EvidenceCardData } from "@/types/ui";
import { cn } from "@/lib/utils";
import { GrainLayer, IceCrack, Kbd, SectionLabel, SteamLayer, Vignette } from "@/components/kit/atmosphere";
import { EvidenceCard } from "@/components/case/evidence-card";
import { PortraitFrame } from "./portrait";
import { isMediaMissing, markMediaMissing, voiceUrl } from "./media-cache";

export interface DialoguePlayerProps {
  scene: Scene;
  characters: Record<string, CharacterDef>;
  /** Улики игрока: для предъявления и для проверки `requires` у вариантов */
  evidence?: EvidenceCardData[];
  onChoice?: (choice: DialogueChoice) => void;
  onPresent?: (evidenceId: string) => void;
  /** Сцена закончилась без выбора/предъявления («Далее» или пропуск) */
  onFinish?: () => void;
  /** overlay — поверх стола на весь экран; inline — внутри родителя (position: relative) */
  variant?: "overlay" | "inline";
  /** Подпись локации в шапке: «Подвал УВД · 02:14» */
  locationLabel?: string;
  /** Имя игрока в плашке */
  playerName?: string;
  /** Подсказка для запертого варианта */
  lockedChoiceHint?: (choice: DialogueChoice, missing: string[]) => string;
  defaultMuted?: boolean;
  defaultAutoAdvance?: boolean;
  /** Скорость печати, символов в секунду */
  charsPerSecond?: number;
  /** С какой реплики начать: номер или "end" — сразу к выбору/предъявлению */
  startAt?: number | "end";
  /** Фокус на плеер при появлении (по умолчанию — для overlay) */
  autoFocus?: boolean;
  voiceBasePath?: string;
  portraitBasePath?: string;
  className?: string;
}

/** Сброс состояния при смене сцены — через key */
export function DialoguePlayer(props: DialoguePlayerProps) {
  return <DialoguePlayerInner key={props.scene.id} {...props} />;
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

type VoiceState = "idle" | "playing" | "done" | "none";

const LONG_PAUSE = ".!?…";
const SHORT_PAUSE = ",;:—";

function DialoguePlayerInner({
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
  charsPerSecond = 46,
  startAt = 0,
  autoFocus,
  voiceBasePath = "/voice",
  portraitBasePath = "/portraits",
  className,
}: DialoguePlayerProps) {
  const lines = scene.lines;
  const startEnd = startAt === "end" || lines.length === 0;
  const [index, setIndex] = useState(() =>
    startEnd ? Math.max(lines.length - 1, 0) : Math.min(Math.max(startAt as number, 0), Math.max(lines.length - 1, 0))
  );
  const [shown, setShown] = useState(startEnd ? Number.MAX_SAFE_INTEGER : 0);
  const [atEnd, setAtEnd] = useState(startEnd);
  const [muted, setMuted] = useState(defaultMuted);
  const [auto, setAuto] = useState(defaultAutoAdvance);
  const [voice, setVoice] = useState<{ lineId: string; state: VoiceState }>({ lineId: "", state: "idle" });
  const [picked, setPicked] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reduced = usePrefersReducedMotion();

  const line: DialogueLine | undefined = lines[Math.min(index, lines.length - 1)];
  const text = line?.text ?? "";
  const visible = reduced || atEnd ? text.length : Math.min(shown, text.length);
  const typing = visible < text.length;
  const voiceState: VoiceState = line && voice.lineId === line.id ? voice.state : "idle";

  const owned = new Set(evidence.map((e) => e.id));
  const choices = scene.choices ?? [];
  const present = scene.present;
  const endMode: "present" | "choices" | "next" = present ? "present" : choices.length ? "choices" : "next";

  // Последний говоривший персонаж — остаётся на сцене приглушённым, пока говорят другие
  let stageCharacter: CharacterDef | undefined;
  let stageEmotion = line?.emotion;
  for (let i = Math.min(index, lines.length - 1); i >= 0; i--) {
    const c = characters[lines[i].speaker];
    if (c) {
      stageCharacter = c;
      stageEmotion = lines[i].emotion;
      break;
    }
  }
  const speaker = line ? characters[line.speaker] : undefined;
  const isNarrator = line?.speaker === NARRATOR;
  const isPlayer = line?.speaker === PLAYER;

  /* ---------- Печать ---------- */

  useEffect(() => {
    if (atEnd || reduced || shown >= text.length) return;
    const prev = text[shown - 1] ?? "";
    const base = 1000 / charsPerSecond;
    const delay = LONG_PAUSE.includes(prev) ? base * 9 : SHORT_PAUSE.includes(prev) ? base * 4 : base;
    const t = window.setTimeout(() => setShown((s) => s + 1), delay);
    return () => window.clearTimeout(t);
  }, [atEnd, reduced, shown, text, charsPerSecond]);

  /* ---------- Переходы ---------- */

  const goToEnd = () => {
    setIndex(Math.max(lines.length - 1, 0));
    setShown(Number.MAX_SAFE_INTEGER);
    setAtEnd(true);
  };

  const advance = () => {
    if (atEnd) {
      if (endMode === "next") onFinish?.();
      return;
    }
    if (typing) {
      setShown(text.length);
      return;
    }
    if (index < lines.length - 1) {
      setIndex(index + 1);
      setShown(0);
    } else {
      setAtEnd(true);
    }
  };

  const skip = () => {
    if (endMode === "next") {
      audioRef.current?.pause();
      onFinish?.();
    } else {
      goToEnd();
    }
  };

  const choiceMissing = (choice: DialogueChoice) => (choice.requires ?? []).filter((id) => !owned.has(id));

  const pickChoice = (choice: DialogueChoice) => {
    if (choiceMissing(choice).length > 0) return;
    onChoice?.(choice);
  };

  const presentPicked = (id: string | null = picked) => {
    if (id) onPresent?.(id);
  };

  /* ---------- Озвучка ---------- */

  const onVoiceEnded = useEffectEvent((lineId: string) => {
    setVoice({ lineId, state: "done" });
    if (auto && !atEnd && line?.id === lineId) {
      if (index < lines.length - 1) {
        setIndex(index + 1);
        setShown(0);
      } else {
        setAtEnd(true);
      }
    }
  });

  useEffect(() => {
    if (!line || atEnd || muted) return;
    const url = voiceUrl(line.id, voiceBasePath);
    if (isMediaMissing(url)) return;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    const lineId = line.id;
    let cancelled = false;

    audio.preload = "auto";
    audio.src = url;
    audio.onplaying = () => !cancelled && setVoice({ lineId, state: "playing" });
    audio.onended = () => !cancelled && onVoiceEnded(lineId);
    audio.onerror = () => {
      markMediaMissing(url);
      if (!cancelled) setVoice({ lineId, state: "none" });
    };
    audio.play().catch((err: unknown) => {
      // NotAllowedError — автоплей заблокирован до первого клика; файл при этом есть
      if (!cancelled && err instanceof DOMException && err.name === "NotAllowedError") {
        setVoice({ lineId, state: "none" });
      }
    });

    return () => {
      cancelled = true;
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    };
  }, [line, atEnd, muted, voiceBasePath]);

  useEffect(() => () => audioRef.current?.pause(), []);

  /* ---------- Автопрокрутка без голоса ---------- */

  const autoNext = useEffectEvent(() => advance());

  useEffect(() => {
    if (!auto || atEnd || typing || !line) return;
    if (voiceState === "playing") return;
    const t = window.setTimeout(() => autoNext(), 1100 + text.length * 28);
    return () => window.clearTimeout(t);
  }, [auto, atEnd, typing, line, voiceState, text.length]);

  /* ---------- Фокус ---------- */

  const shouldFocus = autoFocus ?? variant === "overlay";
  useEffect(() => {
    if (shouldFocus) rootRef.current?.focus({ preventScroll: true });
  }, [shouldFocus]);

  /* ---------- Клавиатура ---------- */

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
    if (/^[1-9]$/.test(e.key) && atEnd) {
      const n = Number(e.key) - 1;
      if (endMode === "choices" && choices[n]) {
        e.preventDefault();
        pickChoice(choices[n]);
      } else if (endMode === "present" && evidence[n]) {
        e.preventDefault();
        setPicked(evidence[n].id);
      }
      return;
    }
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
      if (onControl && e.key !== "ArrowRight") return; // кнопка сама обработает
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

  const accent = speaker?.accent ?? (isPlayer ? "#2ee6c5" : "#bccbe0");
  const showPresent = atEnd && endMode === "present";
  const progress = lines.length ? (atEnd ? 1 : (index + (typing ? 0.5 : 1)) / lines.length) : 1;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role={variant === "overlay" ? "dialog" : "region"}
      aria-modal={variant === "overlay" ? true : undefined}
      aria-label="Сцена диалога"
      onKeyDown={onKeyDown}
      className={cn(
        "@container isolate flex flex-col overflow-hidden text-steam outline-none",
        variant === "overlay" ? "fixed inset-0 z-50" : "absolute inset-0 rounded-[inherit]",
        className
      )}
    >
      {/* Фон: затемнённый стол, пар над чёрной водой */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[#060914]/90 backdrop-blur-lg" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(90% 60% at 18% 100%, rgb(46 230 197 / 0.10), transparent 60%), radial-gradient(70% 50% at 85% 90%, rgb(255 181 71 / 0.10), transparent 60%), linear-gradient(180deg, rgb(3 5 11 / 0.2) 0%, rgb(3 5 11 / 0.85) 100%)",
        }}
      />
      <SteamLayer className="-z-10" intensity={1.1} />
      <Vignette className="-z-10" />
      <GrainLayer className="-z-10" opacity={0.06} />

      {/* Шапка */}
      <header className="relative z-20 flex items-center gap-3 px-3 pt-3 @xl:px-6 @xl:pt-4">
        <SectionLabel icon={<MapPin className="size-3 shrink-0 text-sodium" />} className="min-w-0">
          <span className="truncate">{locationLabel ?? scene.location ?? "Сцена"}</span>
        </SectionLabel>
        <div
          className="mx-2 hidden h-[3px] flex-1 overflow-hidden rounded-full bg-frost-line @2xl:block"
          role="progressbar"
          aria-label="Ход сцены"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-aurora/70 to-sodium/80 transition-[width] duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ControlButton
            onClick={() => setAuto((a) => !a)}
            pressed={auto}
            label={auto ? "Автопрокрутка включена (A)" : "Автопрокрутка выключена (A)"}
          >
            {auto ? <Pause /> : <Play />}
            <span className="hidden @2xl:inline">Авто</span>
          </ControlButton>
          <ControlButton
            onClick={() => setMuted((m) => !m)}
            pressed={!muted}
            label={muted ? "Включить озвучку (M)" : "Выключить озвучку (M)"}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </ControlButton>
          <ControlButton onClick={skip} label="Пропустить сцену (Esc)">
            <FastForward />
            <span className="hidden @2xl:inline">Пропустить</span>
            <Kbd className="hidden @2xl:inline-flex">Esc</Kbd>
          </ControlButton>
        </div>
      </header>

      {/* Сцена: контейнер размеров — раскладка зависит от места, а не от окна */}
      <div
        className="relative z-10 min-h-0 flex-1 cursor-pointer [container-type:size]"
        onClick={onStageClick}
      >
        {/* Реплика рассказчика — по центру, курсивом */}
        {isNarrator && !showPresent && (
          <div className="absolute inset-x-0 top-1/2 mx-auto w-full max-w-2xl -translate-y-1/2 px-6 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">
            <IceCrack className="mx-auto mb-5 max-w-[16rem] opacity-70" />
            <p className="font-sans text-lg leading-relaxed text-frost italic @xl:text-xl">
              <TypedText text={text} visible={visible} typing={typing} />
            </p>
            <IceCrack className="mx-auto mt-5 max-w-[16rem] opacity-70" />
            {atEnd && endMode === "next" && <NextButton onClick={() => onFinish?.()} className="mx-auto mt-6" />}
          </div>
        )}

        {/* Портрет: узко — по центру над репликой, широко — слева, реплика заходит на него */}
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 left-1/2 aspect-[2/3] h-[min(70cqh,540px)] -translate-x-1/2 transition-opacity duration-500",
            "[mask-composite:intersect] [mask-image:linear-gradient(to_bottom,transparent,black_9%,black_74%,transparent),linear-gradient(to_right,transparent,black_7%,black_93%,transparent)]",
            "@xl:left-[max(1rem,4cqw)] @xl:h-[min(92cqh,720px)] @xl:translate-x-0",
            (!stageCharacter || isNarrator) && "opacity-0",
            showPresent && "max-@xl:hidden"
          )}
        >
          {stageCharacter && (
            <PortraitFrame
              key={stageCharacter.id}
              character={stageCharacter}
              emotion={stageEmotion}
              size="dialogue"
              speaking={Boolean(speaker) && !atEnd}
              dimmed={!speaker && !isNarrator}
              showEmotion={false}
              basePath={portraitBasePath}
              className="size-full motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-4 motion-safe:duration-500"
            />
          )}
        </div>

        {/* Правая колонка: выбор / предъявление / реплика */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex max-h-full flex-col justify-end px-3 pb-3",
            "@xl:pr-[max(1.25rem,4cqw)] @xl:pb-6",
            stageCharacter
              ? "@xl:pl-[calc(max(1rem,4cqw)_+_min(92cqh,720px)*0.44)]"
              : "@xl:pl-[max(1.25rem,4cqw)]"
          )}
        >
          <div className={cn("flex w-full max-w-3xl min-w-0 flex-col gap-3", !stageCharacter && "mx-auto")}>
            {atEnd && endMode === "choices" && (
              <ol className="flex flex-col gap-2" aria-label="Варианты ответа">
                {choices.map((choice, i) => {
                  const missing = choiceMissing(choice);
                  const locked = missing.length > 0;
                  return (
                    <li
                      key={choice.id}
                      className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-3 motion-safe:fill-mode-both"
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <button
                        type="button"
                        aria-disabled={locked}
                        onClick={() => pickChoice(choice)}
                        className={cn(
                          "group/choice flex w-full items-start gap-3 rounded-md border px-3.5 py-2.5 text-left transition-[transform,border-color,background-color] duration-200",
                          locked
                            ? "cursor-not-allowed border-frost-line bg-ink-deep/90 text-frost-dim"
                            : "frost-panel border-frost-line-strong text-steam hover:translate-x-1 hover:border-sodium/70 hover:bg-ink-high"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-6 shrink-0 place-items-center rounded font-mono text-xs",
                            locked
                              ? "border border-frost-line text-frost-faint"
                              : "bg-sodium/15 text-sodium ring-1 ring-sodium/40 group-hover/choice:bg-sodium group-hover/choice:text-ink-deep"
                          )}
                        >
                          {locked ? <Lock className="size-3" /> : i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] leading-snug">{choice.text}</span>
                          {locked && (
                            <span className="mt-1 block text-xs text-frost-dim">
                              {lockedChoiceHint?.(choice, missing) ??
                                (missing.length === 1
                                  ? "Нужна улика, которой у вас пока нет"
                                  : `Не хватает улик: ${missing.length}`)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            {showPresent && present ? (
              <section
                className="frost-panel flex max-h-[min(88cqh,600px)] min-h-0 flex-col rounded-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300"
                aria-label="Предъявить улику"
              >
                <div className="border-b border-frost-line px-4 pt-4 pb-3 @xl:px-5">
                  <SectionLabel className="text-signal">Предъявить улику</SectionLabel>
                  <p className="mt-1.5 text-[15px] leading-snug text-steam">{present.prompt}</p>
                </div>
                <div className="scrollbar-ice min-h-0 flex-1 overflow-y-auto p-3 @xl:p-4">
                  {evidence.length === 0 ? (
                    <p className="py-6 text-center text-sm text-frost-dim">
                      У вас нет улик. Вернитесь к данным.
                    </p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] gap-2.5">
                      {evidence.map((card, i) => (
                        <EvidenceCard
                          key={card.id}
                          card={{ ...card, isNew: false }}
                          compact
                          index={i}
                          hotkey={i < 9 ? i + 1 : undefined}
                          selected={picked === card.id}
                          onSelect={setPicked}
                          onActivate={(id) => presentPicked(id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-frost-line px-4 py-3 @xl:px-5">
                  <span className="min-w-0 truncate text-xs text-frost-dim">
                    {picked
                      ? evidence.find((e) => e.id === picked)?.title
                      : "Выберите карточку — клик или цифра"}
                  </span>
                  <button
                    type="button"
                    disabled={!picked}
                    onClick={() => presentPicked()}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-signal px-4 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-deep transition-[opacity,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:bg-signal/15 disabled:text-signal/70 disabled:hover:brightness-100"
                  >
                    Предъявить
                    <Kbd className="border-current/30 bg-transparent text-current">Enter</Kbd>
                  </button>
                </div>
              </section>
            ) : (
              !isNarrator &&
              line && (
                <DialogueBox
                  key={isPlayer ? "player" : "npc"}
                  name={isPlayer ? playerName : (speaker?.shortName ?? line.speaker)}
                  role={isPlayer ? undefined : speaker?.role}
                  accent={accent}
                  align={isPlayer ? "right" : "left"}
                  voicePlaying={voiceState === "playing"}
                >
                  <p className="text-base leading-relaxed text-steam @xl:text-[17px]">
                    <TypedText text={text} visible={visible} typing={typing} />
                  </p>
                  <div className="mt-3 flex min-h-9 items-center justify-end gap-3">
                    {atEnd && endMode === "next" ? (
                      <NextButton onClick={() => onFinish?.()} />
                    ) : atEnd ? null : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs text-frost-dim transition-opacity",
                          typing ? "opacity-0" : "opacity-100"
                        )}
                      >
                        <Kbd>Пробел</Kbd>
                        <ChevronRight className="size-3.5 text-sodium motion-safe:animate-pulse" />
                      </span>
                    )}
                  </div>
                </DialogueBox>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Части ---------- */

function TypedText({ text, visible, typing }: { text: string; visible: number; typing: boolean }) {
  return (
    <>
      {/* Читалке экрана — вся реплика сразу, без посимвольного шума */}
      <span className="sr-only" aria-live="polite">
        {text}
      </span>
      <span aria-hidden>{text.slice(0, visible)}</span>
      {typing && (
        <>
          <span
            aria-hidden
            className="ml-px inline-block h-[1.05em] w-[0.5ch] translate-y-[0.15em] bg-sodium/80 motion-safe:animate-caret"
          />
          {/* Остаток текста занимает место, чтобы блок не прыгал */}
          <span aria-hidden className="invisible">
            {text.slice(visible)}
          </span>
        </>
      )}
    </>
  );
}

function DialogueBox({
  name,
  role,
  accent,
  align,
  voicePlaying,
  children,
}: {
  name: string;
  role?: string;
  accent: string;
  align: "left" | "right";
  voicePlaying: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "frost-panel relative mt-4 w-full rounded-xl px-4 pt-6 pb-3 @xl:px-6 @xl:pt-7",
        align === "right" && "@xl:ml-auto @xl:max-w-[88%]",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
      )}
      style={{ "--accent-c": accent } as React.CSSProperties}
    >
      <div
        className={cn(
          "absolute -top-3.5 flex max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-md border border-(--accent-c)/40 bg-ink-deep px-3 py-1.5 shadow-[0_8px_24px_-12px_var(--accent-c)]",
          align === "right" ? "right-4 @xl:right-6" : "left-4 @xl:left-6"
        )}
      >
        <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-(--accent-c)" />
        <span className="shrink-0 font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-(--accent-c)">
          {name}
        </span>
        {role && <span className="hidden min-w-0 truncate text-xs text-frost-dim @lg:inline">{role}</span>}
        {voicePlaying && <VoiceBars />}
      </div>
      {children}
    </div>
  );
}

function VoiceBars() {
  return (
    <span aria-label="Звучит озвучка" className="flex h-3 items-end gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-full w-[2px] origin-bottom rounded-full bg-(--accent-c) motion-safe:animate-voice"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function NextButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md bg-sodium px-4 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-deep transition-[filter,transform] hover:brightness-110 active:translate-y-px motion-safe:animate-glow-pulse",
        className
      )}
    >
      Далее
      <ChevronRight className="size-4" />
    </button>
  );
}

function ControlButton({
  onClick,
  pressed,
  label,
  children,
}: {
  onClick: () => void;
  pressed?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-frost transition-colors hover:bg-steam/8 hover:text-steam [&_svg]:size-4",
        pressed && "text-aurora"
      )}
    >
      {children}
    </button>
  );
}
