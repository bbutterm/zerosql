"use client";

import { useId, useState } from "react";
import type { EvidenceCardData } from "@/types/ui";
import { ScreenButton, ScreenField } from "@/components/kit/screen";
import { Glyph } from "@/components/kit/glyphs";
import { countOf, typo } from "@/components/kit/typo";
import { RichText } from "@/components/kit/rich-text";
import { cn } from "@/lib/utils";

/**
 * Обвинение (библия 6.8): обвинить можно любого из увиденных людей — через поиск, а не
 * выбором из трёх. К обвинению прикладываются карточки, где есть ключ обвиняемого
 * (id, логин, пропуск, номер машины). Ложное обвинение не заканчивает игру.
 */
export function AccusationPanel({
  id,
  prompt,
  query,
  onQuery,
  people,
  cards,
  minCards = 2,
  accepted = false,
  attempts = 0,
  busy = false,
  onAccuse,
}: {
  /** id обвинения в деле (для автотестов) */
  id?: string;
  prompt: string;
  query: string;
  onQuery: (q: string) => void;
  /** Найденные среди увиденного значения */
  people: string[];
  /** Приобщённые строки */
  cards: EvidenceCardData[];
  minCards?: number;
  accepted?: boolean;
  attempts?: number;
  busy?: boolean;
  onAccuse: (person: string, cardIds: string[]) => void;
}) {
  const [person, setPerson] = useState<string | null>(null);
  // В деле бывает два обвинения: id поля поиска уникален для каждого
  const fieldId = useId();
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const ready = Boolean(person) && chosen.length >= minCards && !busy;

  if (accepted) {
    return (
      <section className="border-t border-line px-4 py-4">
        <p className="ui-14 text-ink-1">
          <RichText text={typo(prompt)} />
        </p>
        <p className="mt-1 ui-13 text-ink-3">Обвинение принято.</p>
      </section>
    );
  }

  return (
    <section aria-label="Обвинение" data-testid="accusation" data-accusation-id={id} className="border-t border-line px-4 py-4">
      <p className="ui-15 font-semibold text-ink-1">Обвинение</p>
      <p className="mt-1 ui-14 text-ink-1">
        <RichText text={typo(prompt)} />
      </p>
      {attempts > 0 && <p className="mt-1 ui-12 text-ink-3">Попыток: {attempts}.</p>}

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={fieldId} className="ui-12 text-ink-3">
            Кто — из увиденного
          </label>
          <ScreenField id={fieldId} data-testid="accusation-query" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="фамилия, логин, пропуск" className="mt-1 w-full" />
          <ul role="listbox" aria-label="Увиденные значения" className="mt-1 max-h-48 overflow-auto">
            {people.length === 0 && <li className="py-1 ui-12 text-ink-3">Совпадений нет.</li>}
            {people.map((p) => (
              <li
                key={p}
                role="option"
                aria-selected={person === p}
                tabIndex={0}
                data-value={p}
                onClick={() => setPerson(p)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPerson(p)}
                className={cn("flex h-7 cursor-default items-center gap-2 px-2 mono-13 outline-none focus-visible:outline-1 focus-visible:outline-ink-1", person === p ? "bg-scr-select text-ink-1" : "text-ink-2 hover:bg-scr-raise")}
              >
                <span className="w-3">{person === p && <Glyph name="marker" size={10} />}</span>
                <span className="truncate">{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <p className="ui-12 text-ink-3">
            Приложить: не меньше {countOf(minCards, ["карточки", "карточек", "карточек"])}, выбрано {chosen.length}
          </p>
          <ul className="mt-1 max-h-56 overflow-auto">
            {cards.length === 0 && <li className="py-1 ui-12 text-ink-3">Материалов нет. Строку результата можно приобщить к делу.</li>}
            {cards.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-7 cursor-default items-center gap-2 px-2 hover:bg-scr-raise">
                  <input type="checkbox" data-card-id={c.id} checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} className="size-3.5 accent-[var(--color-ink-1)]" />
                  <span className="truncate ui-13 text-ink-1">{typo(c.title)}</span>
                  {c.source && <span className="ml-auto truncate ui-12 text-ink-3">{c.source}</span>}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <ScreenButton variant="primary" disabled={!ready} onClick={() => person && onAccuse(person, chosen)} data-testid="accuse">
          Обвинить
        </ScreenButton>
      </div>
    </section>
  );
}

/**
 * Предсказание (библия 6.3): «Сколько строк вернёт запрос?» — три варианта перед ключевым
 * запросом. Ответ не обязателен и на оценку не влияет; верный — мастерство понятия.
 */
export function PredictionPrompt({
  question,
  sql,
  options,
  answered,
  explanation,
  onAnswer,
  onDismiss,
}: {
  question: string;
  sql?: string;
  options: number[];
  answered?: { answer: number; correct: boolean };
  explanation?: string;
  onAnswer: (n: number) => void;
  onDismiss?: () => void;
}) {
  return (
    <section aria-label="Предсказание" className="border-b border-line bg-scr-base px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="ui-13 text-ink-1">
          <RichText text={typo(question)} />
        </p>
        <div className="flex items-center gap-2">
          {options.map((n) => {
            const mine = answered?.answer === n;
            return (
              <ScreenButton
                key={n}
                variant="secondary"
                disabled={Boolean(answered)}
                data-testid="prediction-option"
                data-value={n}
                onClick={() => onAnswer(n)}
                className={cn("min-w-10 mono-13 tnum", mine && (answered?.correct ? "border-ink-1 text-ink-1" : "border-alarm text-alarm"))}
              >
                {n}
              </ScreenButton>
            );
          })}
        </div>
        {onDismiss && !answered && (
          <button type="button" onClick={onDismiss} className="ml-auto ui-12 text-ink-3 hover:text-ink-1">
            не сейчас
          </button>
        )}
      </div>
      {sql && <pre className="mt-1 overflow-x-auto mono-12 whitespace-pre text-ink-2">{sql}</pre>}
      {answered && (
        <p className="mt-1 ui-12 text-ink-2">
          {answered.correct ? "Верно." : "Неверно."} {explanation && typo(explanation)}
        </p>
      )}
    </section>
  );
}
