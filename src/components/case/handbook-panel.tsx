"use client";

import { useState } from "react";
import type { HandbookEntry } from "@/types/case";
import { cn } from "@/lib/utils";
import { screenButtonClass } from "@/components/kit/screen";
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
  className?: string;
}

/**
 * Справка (раздел 7.18): экранный материал правой колонки. Список статей строками 32 px,
 * статья открывается в той же колонке. Код — PT Mono на --scr-base, без рамки.
 * Пометки предшественницы — PT Serif italic: экран не бумага, почерка здесь нет.
 */
export function HandbookPanel({ entries, marginNotes = {}, onInsert, openId, onOpenChange, className }: HandbookPanelProps) {
  const [inner, setInner] = useState<string | null>(null);
  const active = openId !== undefined ? openId : inner;
  const entry = entries.find((e) => e.id === active);
  const open = (id: string | null) => {
    setInner(id);
    onOpenChange?.(id);
  };

  if (!entry) {
    return (
      <ul aria-label="Статьи справки" className={cn("py-1", className)}>
        {entries.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => open(e.id)}
              className="flex h-8 w-full items-center px-3 text-left ui-14 text-ink-1 hover:bg-scr-raise"
            >
              {e.title}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  const code = (sql: string, label: string) => (
    <button
      type="button"
      disabled={!onInsert}
      onClick={() => onInsert?.(sql)}
      title={onInsert ? "Вставить в запрос" : undefined}
      aria-label={`${label}: вставить в запрос`}
      className="block w-full bg-scr-base p-3 text-left mono-13 whitespace-pre-wrap text-ink-1 enabled:hover:bg-scr-raise disabled:cursor-default"
    >
      {sql}
    </button>
  );

  return (
    <article className={cn("flex flex-col gap-4 px-3 pt-2 pb-6", className)}>
      <button type="button" onClick={() => open(null)} className={cn(screenButtonClass("text"), "self-start")}>
        ← Все статьи
      </button>
      <h3 className="ui-15 text-ink-1">{entry.title}</h3>
      <p className="ui-14 text-ink-1">{typo(entry.summary)}</p>
      {code(entry.syntax, "Шаблон")}
      <p className="ui-13 text-ink-2">Пример</p>
      {code(entry.example, "Пример")}
      {entry.pitfalls && entry.pitfalls.length > 0 && (
        <ul className="flex list-none flex-col gap-2">
          {entry.pitfalls.map((p, i) => (
            <li key={i} className="ui-14 text-ink-1">
              {typo(p)}
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
