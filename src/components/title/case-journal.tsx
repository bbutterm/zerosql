"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Redaction, ScreenButton } from "@/components/kit/screen";
import { typo } from "@/components/kit/typo";

export type CaseJournalState = "active" | "done" | "new" | "locked";

export interface CaseJournalEntry {
  id: string;
  /** «01» */
  no: string;
  title: string;
  /** Аннотация строкой ниже: «Кто стоит за контрабандой на Причале 3?» */
  note?: string;
  /** Когда дело открыто: «14.12.2026» */
  opened?: string;
  state: CaseJournalState;
}

const STATE_TEXT: Record<Exclude<CaseJournalState, "locked">, string> = {
  active: "в работе",
  done: "заключение принято",
  new: "не начато",
};

/**
 * Журнал дел (раздел 7.19): окно «Зеркала» на весь экран, таблица дел. Строка 56 px,
 * выбранная — фон --scr-select. «Открыть дело» — главная кнопка внизу справа.
 * Закрытые дела вымараны звёздочками и подписаны «нет допуска».
 */
export function CaseJournal({
  cases,
  defaultSelected,
  onOpen,
  onClose,
  className,
}: {
  cases: CaseJournalEntry[];
  defaultSelected?: string;
  onOpen: (id: string) => void;
  /** «Закрыть» и Esc; без колбэка кнопки нет */
  onClose?: () => void;
  className?: string;
}) {
  const [selected, setSelected] = useState(
    defaultSelected ?? cases.find((c) => c.state === "active")?.id ?? cases.find((c) => c.state !== "locked")?.id
  );
  const listRef = useRef<HTMLTableSectionElement>(null);
  const withDates = cases.some((c) => c.opened);
  const current = cases.find((c) => c.id === selected);
  const canOpen = Boolean(current && current.state !== "locked");

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
  }, []);

  const move = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key === "Escape" && onClose) {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter" && canOpen && current) {
      e.preventDefault();
      onOpen(current.id);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = cases.findIndex((c) => c.id === selected);
    const next = cases[Math.min(cases.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
    setSelected(next.id);
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-case="${next.id}"]`)?.focus({ preventScroll: false })
    );
  };

  return (
    <section
      aria-label="Журнал дел"
      className={cn("flex h-dvh min-h-0 w-full flex-col bg-scr-base text-ink-1", className)}
    >
      <header className="flex h-7 shrink-0 items-center border-b border-line bg-scr-chrome px-4">
        <h1 className="ui-13 font-semibold text-ink-1">Зеркало</h1>
        <span className="ml-3 ui-13 text-ink-2">Журнал дел</span>
        <span className="ml-auto mono-12 text-ink-3">дел: {cases.length}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              <th scope="col" className="sticky top-0 h-7 w-14 border-b border-line-strong bg-scr-chrome px-4 mono-12 font-normal text-ink-2">
                №
              </th>
              <th scope="col" className="sticky top-0 h-7 border-b border-line-strong bg-scr-chrome px-3 mono-12 font-normal text-ink-2">
                Дело
              </th>
              {withDates && (
                <th scope="col" className="sticky top-0 h-7 w-32 border-b border-line-strong bg-scr-chrome px-3 mono-12 font-normal text-ink-2 max-lg:hidden">
                  Открыто
                </th>
              )}
              <th scope="col" className="sticky top-0 h-7 w-48 border-b border-line-strong bg-scr-chrome px-4 mono-12 font-normal text-ink-2 max-lg:w-32">
                Состояние
              </th>
            </tr>
          </thead>
          <tbody ref={listRef} role="listbox" aria-label="Дела" onKeyDown={move}>
            {cases.map((c) => {
              const sel = c.id === selected;
              const locked = c.state === "locked";
              return (
                <tr
                  key={c.id}
                  role="option"
                  aria-selected={sel}
                  aria-disabled={locked || undefined}
                  data-case={c.id}
                  tabIndex={sel ? 0 : -1}
                  onClick={() => setSelected(c.id)}
                  onDoubleClick={() => !locked && onOpen(c.id)}
                  className={cn("cursor-default outline-none focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ink-1", sel ? "bg-scr-select" : "hover:bg-scr-raise")}
                >
                  <td className="h-14 border-b border-line px-4 align-middle mono-13 text-ink-2">{c.no}</td>
                  <td className="border-b border-line px-3 py-2 align-middle">
                    {locked ? (
                      <Redaction chars={c.title.length} className="mono-13 text-ink-3" />
                    ) : (
                      <>
                        <p className="ui-15 text-ink-1">{typo(c.title)}</p>
                        {c.note && <p className="truncate ui-13 text-ink-2">{typo(c.note)}</p>}
                      </>
                    )}
                  </td>
                  {withDates && (
                    <td className="border-b border-line px-3 align-middle mono-12 text-ink-3 max-lg:hidden">{c.opened ?? "—"}</td>
                  )}
                  <td
                    className={cn(
                      "border-b border-line px-4 align-middle ui-13",
                      c.state === "active" ? "text-ink-1" : c.state === "done" ? "text-ink-3" : "text-ink-2"
                    )}
                  >
                    {c.state === "locked" ? <span className="mono-11 text-ink-3">нет допуска</span> : STATE_TEXT[c.state]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-scr-chrome px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        {onClose && (
          <ScreenButton variant="secondary" onClick={onClose}>
            Закрыть
          </ScreenButton>
        )}
        <ScreenButton variant="primary" disabled={!canOpen} onClick={() => current && onOpen(current.id)}>
          Открыть дело
        </ScreenButton>
      </footer>
    </section>
  );
}
