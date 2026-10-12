"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CharacterDef } from "@/types/story";
import type { ObjectiveView } from "@/types/ui";
import { cn } from "@/lib/utils";
import { Glyph } from "@/components/kit/glyphs";
import { Redaction } from "@/components/kit/screen";
import { surnameAccusative, typo } from "@/components/kit/typo";

export interface ObjectiveListProps {
  objectives: ObjectiveView[];
  /** Персонажи — подсказки звучат их голосами */
  characters?: Record<string, CharacterDef>;
  /** Открыть следующий уровень подсказки */
  onRevealHint?: (objectiveId: string) => void;
  title?: string;
  /** Скрыть строку «Выполнено N из M» */
  hideHeader?: boolean;
  className?: string;
}

/**
 * Задания (раздел 7.9) — блокнот следователя: нумерованный чек-лист без коробок,
 * рамок и прогресс-баров. Текущее отмечено натриевым маркером, закрытое вымарано.
 * Подсказки (раздел 7.10) — цитаты голосами персонажей.
 */
export function ObjectiveList({
  objectives,
  characters = {},
  onRevealHint,
  title = "Задания",
  hideHeader = false,
  className,
}: ObjectiveListProps) {
  const main = objectives.filter((o) => !o.optional);
  const extra = objectives.filter((o) => o.optional);
  const done = main.filter((o) => o.state === "done").length;
  // Текущее — первое активное основное задание; остальные активные — «предстоящие открытые»
  const currentId = main.find((o) => o.state === "active")?.id;

  // Задания, выполненные на глазах игрока: их следствие печатается (голос Ноль)
  const prev = useRef<Map<string, ObjectiveView["state"]> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const before = prev.current;
    const now = new Map(objectives.map((o) => [o.id, o.state]));
    prev.current = now;
    if (!before) return;
    const changed = objectives.filter((o) => o.state === "done" && before.get(o.id) && before.get(o.id) !== "done");
    if (changed.length === 0) return;
    const t = window.setTimeout(() => setFresh((s) => new Set([...s, ...changed.map((o) => o.id)])), 0);
    return () => window.clearTimeout(t);
  }, [objectives]);

  const item = (o: ObjectiveView, number: number) => (
    <ObjectiveItem
      key={o.id}
      objective={o}
      number={number}
      current={o.id === currentId || (o.optional === true && o.state === "active")}
      quiet={o.optional === true}
      typeOutcome={fresh.has(o.id)}
      characters={characters}
      onRevealHint={onRevealHint}
    />
  );

  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col px-3 pt-3 pb-6", className)}>
      {!hideHeader && (
        <p className="mb-4 ui-12 text-ink-3">
          Выполнено <span className="tnum">{done}</span> из <span className="tnum">{main.length}</span>
        </p>
      )}

      <ol className="flex flex-col gap-4">{main.map((o, i) => item(o, i + 1))}</ol>

      {extra.length > 0 && (
        <>
          <h3 className="mt-6 mb-3 ui-13 font-medium text-ink-2">Сверх плана</h3>
          <ol className="flex flex-col gap-4">{extra.map((o, i) => item(o, main.length + i + 1))}</ol>
        </>
      )}
    </section>
  );
}

function ObjectiveItem({
  objective: o,
  number,
  current,
  quiet = false,
  typeOutcome,
  characters,
  onRevealHint,
}: {
  objective: ObjectiveView;
  number: number;
  current: boolean;
  /** Сверх плана: маркер без натрия — тёплое пятно на столе одно */
  quiet?: boolean;
  typeOutcome: boolean;
  characters: Record<string, CharacterDef>;
  onRevealHint?: (id: string) => void;
}) {
  const hints = o.hints ?? [];
  const revealed = Math.min(o.hintsRevealed ?? 0, hints.length);
  const nextHint = hints[revealed];
  const nextBy = nextHint?.speaker ? characters[nextHint.speaker] : undefined;
  const askLabel = nextBy
    ? `Спросить ${nextBy.shortNameAcc ?? surnameAccusative(nextBy.shortName)}`
    : "Запросить методическую помощь";

  if (o.state === "locked") {
    // Длины плашек — по длине скрытого текста, чтобы строка не выдавала содержание
    const len = o.text.length;
    const bars = len > 44 ? [Math.min(34, Math.round(len * 0.45)), Math.round(len * 0.35), 9] : [Math.max(12, Math.round(len * 0.7)), 8];
    return (
      <li className="grid grid-cols-[24px_1fr] items-start" aria-label={`Задание ${number} закрыто`}>
        <span className="mono-12 leading-[20px] text-ink-4">{number}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-[9px] pt-[6px] font-mono text-[12px] leading-none">
          {bars.map((w, i) => (
            <Redaction key={i} chars={w} height={8} />
          ))}
        </span>
      </li>
    );
  }

  if (o.state === "done") {
    return (
      <li className="grid grid-cols-[24px_1fr]">
        <span className="pt-[5px] text-ink-3">
          <Glyph name="check" size={12} label="выполнено" />
        </span>
        <div className="min-w-0">
          <p className="ui-14 text-ink-3">
            <RichText text={o.text} />
          </p>
          {o.outcome && (
            <p className="mt-1 doc-14 text-ink-2 italic">
              <Typed text={typo(o.outcome)} active={typeOutcome} />
            </p>
          )}
        </div>
      </li>
    );
  }

  if (!current) {
    return (
      <li className="grid grid-cols-[24px_1fr]">
        <span className="pt-px mono-12 text-ink-3">{number}</span>
        <p className="min-w-0 ui-14 text-ink-2">
          <RichText text={o.text} />
        </p>
      </li>
    );
  }

  return (
    <li className="grid grid-cols-[24px_1fr]" aria-current="step">
      <span className={cn("flex items-center gap-[3px] self-start pt-px", quiet ? "text-ink-3" : "text-sodium")}>
        <Glyph name="marker" size={10} />
        <span className="sr-only">текущее</span>
      </span>
      <div className="min-w-0">
        <p className="ui-14 text-ink-1">
          <span className="mr-2 mono-12 text-ink-1">{number}</span>
          <RichText text={o.text} />
        </p>
        {o.detail && (
          <p className="mt-1 ui-13 text-ink-2">
            <RichText text={o.detail} />
          </p>
        )}

        {revealed > 0 && (
          <div className="mt-3 flex flex-col gap-3">
            {hints.slice(0, revealed).map((hint, i) => {
              const by = hint.speaker ? characters[hint.speaker] : undefined;
              return (
                <figure key={i} className="border-l border-line-strong pl-3">
                  <blockquote className="doc-14 text-ink-1 italic">
                    «<RichText text={hint.text} serif />»
                  </blockquote>
                  <figcaption className="mt-1 text-right ui-12 text-ink-3">
                    —&nbsp;{by ? by.shortName : "пометка на полях"}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}

        {hints.length > 0 && onRevealHint && revealed < hints.length && (
          <div className="mt-3 flex items-baseline gap-3">
            <button
              type="button"
              onClick={() => onRevealHint(o.id)}
              className="ui-13 text-ink-2 underline-offset-[3px] hover:text-ink-1 hover:underline max-lg:min-h-11"
            >
              {askLabel}
            </button>
            <span className="tnum ui-12 text-ink-3">
              {revealed + 1}&nbsp;из&nbsp;{hints.length}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

/** Следствие печатается по 18 мс на знак — это голос Ноль */
function Typed({ text, active }: { text: string; active: boolean }) {
  const [shown, setShown] = useState(active ? 0 : text.length);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = window.setTimeout(() => setShown(text.length), 0);
      return () => window.clearTimeout(t);
    }
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= text.length) window.clearInterval(t);
    }, 18);
    return () => window.clearInterval(t);
  }, [active, text]);
  const visible = Math.min(shown, text.length);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{text.slice(0, visible)}</span>
      {visible < text.length && (
        <span aria-hidden className="invisible">
          {text.slice(visible)}
        </span>
      )}
    </>
  );
}

/** `код` в обратных кавычках → PT Mono, без подложки и цвета */
function RichText({ text, serif = false }: { text: string; serif?: boolean }): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      <code key={i} className={cn("font-mono text-[0.93em] break-words not-italic", serif && "text-[0.88em]")}>
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{typo(part)}</span>
    )
  );
}
