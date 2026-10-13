"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Окно «Зеркала» на весь экран (раздел 7.19): строка окна 28 px, тело с прокруткой,
 * подвал с кнопками. Общая рамка для разбора, коллекций, параметров, финала и архива.
 */
export function MirrorWindow({
  section,
  status,
  footer,
  children,
  className,
  bodyClassName,
  label,
}: {
  /** «Разбор дела», «Параметры» — после «Зеркало» в строке окна */
  section: string;
  /** Правый край строки окна */
  status?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  label?: string;
}) {
  return (
    <section aria-label={label ?? section} className={cn("flex h-dvh min-h-0 w-full flex-col bg-scr-base text-ink-1", className)}>
      <header className="flex h-7 shrink-0 items-center gap-3 border-b border-line bg-scr-chrome px-4">
        <h1 className="ui-13 font-semibold text-ink-1">Зеркало</h1>
        <span className="truncate ui-13 text-ink-2">{section}</span>
        {status !== undefined && <span className="ml-auto shrink-0 mono-12 text-ink-3">{status}</span>}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-line bg-scr-chrome px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      )}
    </section>
  );
}

/** Подпись поля слева, как в окне входа: сетка 104px | 1fr (на узком — столбиком) */
export function FieldRow({ label, htmlFor, children, note }: { label: string; htmlFor?: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[160px_1fr] sm:items-center">
      <label htmlFor={htmlFor} className="ui-13 text-ink-2 sm:text-right">
        {label}
      </label>
      <div className="min-w-0">
        {children}
        {note && <p className="mt-1 ui-12 text-ink-3">{note}</p>}
      </div>
    </div>
  );
}

export const SELECT_CLASS =
  "h-7 w-full max-w-[320px] rounded-[2px] border border-line-strong bg-room px-2 mono-14 text-ink-1 outline-none focus-visible:border-ink-2";

/** Заголовок раздела внутри окна: Golos 15/600, линия снизу */
export function WindowHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("mt-6 mb-2 border-b border-line pb-1 ui-15 font-semibold text-ink-1 first:mt-0", className)}>{children}</h2>;
}
