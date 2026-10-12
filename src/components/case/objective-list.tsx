"use client";

import type { ReactNode } from "react";
import { Check, Lightbulb, Lock, Sparkles, Target } from "lucide-react";
import type { CharacterDef } from "@/types/story";
import type { ObjectiveView } from "@/types/ui";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/kit/atmosphere";
import { PortraitFrame } from "@/components/story/portrait";

export interface ObjectiveListProps {
  objectives: ObjectiveView[];
  /** Для подписи подсказок персонажами */
  characters?: Record<string, CharacterDef>;
  /** Открыть следующий уровень подсказки */
  onRevealHint?: (objectiveId: string) => void;
  title?: string;
  /** Скрыть шапку (если список уже во вкладке «Задачи») */
  hideHeader?: boolean;
  className?: string;
}

export function ObjectiveList({
  objectives,
  characters = {},
  onRevealHint,
  title = "Задачи",
  hideHeader = false,
  className,
}: ObjectiveListProps) {
  const main = objectives.filter((o) => !o.optional);
  const bonus = objectives.filter((o) => o.optional);
  const done = main.filter((o) => o.state === "done").length;

  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-4", className)}>
      {!hideHeader && (
        <header className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel icon={<Target className="size-3 text-sodium" />}>{title}</SectionLabel>
            <span className="font-mono text-xs text-frost tabular-nums">
              {done}
              <span className="text-frost-dim"> / {main.length}</span>
            </span>
          </div>
          <div className="h-[3px] overflow-hidden rounded-full bg-frost-line" aria-hidden>
            <div
              className="h-full rounded-full bg-gradient-to-r from-aurora/80 to-aurora transition-[width] duration-700"
              style={{ width: `${main.length ? (done / main.length) * 100 : 0}%` }}
            />
          </div>
        </header>
      )}

      <ol className="flex flex-col">
        {main.map((o, i) => (
          <ObjectiveItem
            key={o.id}
            objective={o}
            number={i + 1}
            last={i === main.length - 1}
            characters={characters}
            onRevealHint={onRevealHint}
          />
        ))}
      </ol>

      {bonus.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <SectionLabel icon={<Sparkles className="size-3 text-aurora-violet-soft" />}>Дополнительно</SectionLabel>
            <span aria-hidden className="h-px flex-1 bg-frost-line" />
          </div>
          <ol className="flex flex-col">
            {bonus.map((o, i) => (
              <ObjectiveItem
                key={o.id}
                objective={o}
                number={i + 1}
                last={i === bonus.length - 1}
                characters={characters}
                onRevealHint={onRevealHint}
                bonus
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function ObjectiveItem({
  objective: o,
  number,
  last,
  characters,
  onRevealHint,
  bonus = false,
}: {
  objective: ObjectiveView;
  number: number;
  last: boolean;
  characters: Record<string, CharacterDef>;
  onRevealHint?: (id: string) => void;
  bonus?: boolean;
}) {
  const hints = o.hints ?? [];
  const revealed = Math.min(o.hintsRevealed ?? 0, hints.length);
  const active = o.state === "active";
  const accentText = bonus ? "text-aurora-violet-soft" : "text-sodium";

  return (
    <li className="relative flex gap-3" aria-current={active ? "step" : undefined}>
      {/* Линия-маршрут */}
      <div className="relative flex w-6 shrink-0 flex-col items-center">
        <StateMarker state={o.state} bonus={bonus} />
        {!last && (
          <span
            aria-hidden
            className={cn("mt-1 w-px flex-1", o.state === "done" ? "bg-aurora/40" : "bg-frost-line")}
          />
        )}
      </div>

      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
        {o.state === "locked" ? (
          <div className="flex min-h-6 items-center gap-2" aria-label="Задача ещё не открыта">
            <span className="font-mono text-[11px] text-frost-faint">{String(number).padStart(2, "0")}</span>
            <span className="text-[13px] text-frost-dim italic">Откроется позже</span>
            <span aria-hidden className="h-2 w-16 rounded-full bg-frost/10" />
          </div>
        ) : active ? (
          <div
            className={cn(
              "relative -mt-1 overflow-hidden rounded-lg border p-3",
              bonus
                ? "border-aurora-violet/40 bg-aurora-violet/[0.07]"
                : "border-sodium/35 bg-[linear-gradient(135deg,rgb(255_181_71/0.09),rgb(255_181_71/0.02)_60%)]"
            )}
          >
            <span
              aria-hidden
              className={cn("absolute inset-y-0 left-0 w-[3px]", bonus ? "bg-aurora-violet" : "bg-sodium")}
            />
            <div className="flex items-baseline gap-2">
              <span className={cn("font-mono text-[11px]", accentText)}>{String(number).padStart(2, "0")}</span>
              <SectionLabel className={accentText}>Сейчас</SectionLabel>
            </div>
            <p className="mt-1 text-[14.5px] leading-snug font-medium text-steam">
              <RichText text={o.text} />
            </p>
            {o.detail && <p className="mt-1.5 text-[13px] leading-relaxed text-frost">{o.detail}</p>}

            {revealed > 0 && (
              <ol className="mt-3 flex flex-col gap-2">
                {hints.slice(0, revealed).map((hint, i) => (
                  <HintItem key={i} tier={i + 1} text={hint.text} speaker={hint.speaker ? characters[hint.speaker] : undefined} />
                ))}
              </ol>
            )}

            {hints.length > 0 && onRevealHint && (
              <button
                type="button"
                onClick={() => onRevealHint(o.id)}
                disabled={revealed >= hints.length}
                className={cn(
                  "mt-3 inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
                  "border-frost-line-strong text-frost hover:border-sodium/60 hover:bg-sodium/10 hover:text-sodium",
                  "disabled:cursor-default disabled:border-frost-line disabled:text-frost-dim disabled:hover:bg-transparent"
                )}
              >
                <Lightbulb className="size-3.5" />
                {revealed >= hints.length ? (
                  "Подсказок больше нет"
                ) : (
                  <>
                    Подсказка
                    <span className="font-mono text-[10.5px] tabular-nums opacity-80">
                      ({revealed + 1}/{hints.length})
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="min-h-6">
            <p className="text-[13.5px] leading-snug text-frost">
              <span className="mr-2 font-mono text-[11px] text-aurora/70">{String(number).padStart(2, "0")}</span>
              <RichText text={o.text} />
            </p>
            {o.outcome && (
              <p className="mt-1 border-l border-aurora/30 pl-2 text-[12.5px] leading-relaxed text-frost-dim italic">
                {o.outcome}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function StateMarker({ state, bonus }: { state: ObjectiveView["state"]; bonus: boolean }) {
  if (state === "done") {
    return (
      <span className="grid size-6 place-items-center rounded-full bg-aurora/15 text-aurora ring-1 ring-aurora/50">
        <Check className="size-3.5" strokeWidth={3} aria-label="выполнено" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className={cn(
          "relative grid size-6 place-items-center rounded-full ring-1",
          bonus ? "bg-aurora-violet/15 ring-aurora-violet/60" : "bg-sodium/15 ring-sodium/60"
        )}
      >
        <span
          className={cn(
            "absolute inset-0 rounded-full motion-safe:animate-ping",
            bonus ? "bg-aurora-violet/25" : "bg-sodium/25"
          )}
          style={{ animationDuration: "2.4s" }}
          aria-hidden
        />
        <span className={cn("size-2 rounded-full", bonus ? "bg-aurora-violet" : "bg-sodium")} />
        <span className="sr-only">текущая</span>
      </span>
    );
  }
  return (
    <span className="grid size-6 place-items-center rounded-full border border-dashed border-frost-line-strong text-frost-faint">
      <Lock className="size-3" aria-label="закрыто" />
    </span>
  );
}

function HintItem({ tier, text, speaker }: { tier: number; text: string; speaker?: CharacterDef }) {
  return (
    <li className="flex gap-2.5 rounded-md border border-frost-line bg-ink-deep/60 p-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
      {speaker ? (
        <PortraitFrame character={speaker} size="avatar" className="size-7 shrink-0" />
      ) : (
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sodium/10 text-sodium">
          <Lightbulb className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px]">
          {speaker && (
            <span className="font-semibold" style={{ color: speaker.accent }}>
              {speaker.shortName}
            </span>
          )}
          <span className="font-mono text-frost-dim">уровень {tier}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-steam/90">
          <RichText text={text} />
        </p>
      </div>
    </li>
  );
}

/** `код` в обратных кавычках → моноширинный фрагмент */
function RichText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code
        key={i}
        className="rounded-sm bg-ink-deep px-1 py-px font-mono text-[0.9em] break-words text-aurora [box-decoration-break:clone]"
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
