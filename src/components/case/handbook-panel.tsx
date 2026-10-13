"use client";

import { useState } from "react";
import type { HandbookEntry } from "@/types/case";
import { cn } from "@/lib/utils";
import { screenButtonClass } from "@/components/kit/screen";
import { RichText } from "@/components/kit/rich-text";
import { typo } from "@/components/kit/typo";

export interface HandbookPanelProps {
  entries: HandbookEntry[];
  /** Пометки предшественницы на полях статей: по id статьи */
  marginNotes?: Record<string, string>;
  /** Клик по примеру — вставить его в редактор */
  onInsert?: (sql: string) => void;
  /** Открытая статья (управляемый режим) */
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
  /** Статья «Клавиши» в конце списка (по умолчанию есть) */
  showKeys?: boolean;
  className?: string;
}

/** Клавиши стола: Alt+1…4 — области, остальное — как в разделах 7.6–7.14 */
const KEYS: Array<[string, string]> = [
  ["Ctrl+Enter", "выполнить запрос"],
  ["Alt+1", "схема"],
  ["Alt+2", "запрос"],
  ["Alt+3", "результат"],
  ["Alt+4", "дело: задания, материалы, справка"],
  ["Стрелки", "по строкам схемы и ячейкам результата"],
  ["Enter", "в схеме — вставить имя в запрос"],
  ["Ctrl+Shift+Enter", "приобщить выбранную строку результата"],
  ["Alt+клик", "вставить значение ячейки литералом"],
  ["Пробел, Enter", "в сцене — допечатать реплику, дальше"],
  ["1–9", "в сцене — выбрать вариант"],
  ["Esc", "закрыть предмет, пропустить сцену"],
];
const KEYS_ID = "__keys";

/**
 * Справка (раздел 7.18): экранный материал правой колонки. Список статей строками 32 px,
 * статья открывается в той же колонке. Код — PT Mono на --scr-base, без рамки; `код` в тексте
 * тоже моноширинный. Пример вставляется текстовой кнопкой, шаблон с заглушками — нет.
 * Пометки предшественницы — PT Serif italic: экран не бумага, почерка здесь нет.
 */
export function HandbookPanel({
  entries,
  marginNotes = {},
  onInsert,
  openId,
  onOpenChange,
  showKeys = true,
  className,
}: HandbookPanelProps) {
  const [inner, setInner] = useState<string | null>(null);
  const active = openId !== undefined ? openId : inner;
  const entry = entries.find((e) => e.id === active);
  const open = (id: string | null) => {
    setInner(id);
    onOpenChange?.(id);
  };

  const back = (
    <button type="button" onClick={() => open(null)} className={cn(screenButtonClass("text"), "self-start max-lg:min-h-11")}>
      ← Все статьи
    </button>
  );

  if (active === KEYS_ID && showKeys) {
    return (
      <article className={cn("flex flex-col gap-4 px-3 pt-2 pb-6", className)}>
        {back}
        <h3 className="ui-15 text-ink-1">Клавиши</h3>
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
          {KEYS.map(([k, what]) => (
            <div key={k} className="contents">
              <dt className="mono-12 leading-[21px] whitespace-nowrap text-ink-1">{k}</dt>
              <dd className="ui-14 text-ink-2">{what}</dd>
            </div>
          ))}
        </dl>
      </article>
    );
  }

  if (!entry) {
    const list = showKeys ? [...entries.map((e) => ({ id: e.id, title: e.title })), { id: KEYS_ID, title: "Клавиши" }] : entries;
    return (
      <ul aria-label="Статьи справки" className={cn("py-1", className)}>
        {list.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => open(e.id)}
              className="flex h-8 w-full items-center px-3 text-left ui-14 text-ink-1 hover:bg-scr-raise max-lg:h-11 max-lg:px-4"
            >
              {e.title}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  const code = (sql: string) => (
    <pre className="block w-full bg-scr-base p-3 text-left mono-13 whitespace-pre-wrap text-ink-1">{sql}</pre>
  );

  return (
    <article className={cn("flex flex-col gap-4 px-3 pt-2 pb-6", className)}>
      {back}
      <h3 className="ui-15 text-ink-1">{entry.title}</h3>
      <p className="ui-14 text-ink-1">
        <RichText text={entry.summary} />
      </p>
      {/* Шаблон с заглушками («столбец») не вставляется: он гарантированно дал бы ошибку */}
      {code(entry.syntax)}
      <div className="flex items-baseline justify-between gap-3">
        <p className="ui-13 text-ink-2">Пример</p>
        {onInsert && (
          <button type="button" onClick={() => onInsert(entry.example)} className={cn(screenButtonClass("text"), "ui-12 max-lg:min-h-11")}>
            вставить в запрос
          </button>
        )}
      </div>
      {code(entry.example)}
      {entry.pitfalls && entry.pitfalls.length > 0 && (
        <ul className="flex list-none flex-col gap-2">
          {entry.pitfalls.map((p, i) => (
            <li key={i} className="ui-14 text-ink-1">
              <RichText text={p} />
            </li>
          ))}
        </ul>
      )}
      {marginNotes[entry.id] && (
        <figure>
          <blockquote className="doc-14 text-ink-2 italic">{typo(marginNotes[entry.id])}</blockquote>
          <figcaption className="mt-1 text-right ui-12 text-ink-3">—&nbsp;пометка на полях</figcaption>
        </figure>
      )}
    </article>
  );
}
