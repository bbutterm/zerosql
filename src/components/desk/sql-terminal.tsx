"use client";

import type { ReactNode, Ref } from "react";
import dynamic from "next/dynamic";
import { CornerDownLeft, Loader2, Lock, TerminalSquare } from "lucide-react";
import type { TableInfo } from "@/types/database";
import type { QueryBudget } from "@/types/ui";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/plural";
import { SectionLabel } from "@/components/kit/atmosphere";
import type { SqlEditorHandle } from "./sql-codemirror";

export type { SqlEditorHandle } from "./sql-codemirror";

const SqlCodeMirror = dynamic(() => import("./sql-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full flex-col gap-2 px-12 py-4" aria-hidden>
      <div className="h-3 w-2/5 rounded bg-frost-line motion-safe:animate-pulse" />
      <div className="h-3 w-3/5 rounded bg-frost-line motion-safe:animate-pulse" />
      <div className="h-3 w-1/4 rounded bg-frost-line motion-safe:animate-pulse" />
    </div>
  ),
});

export interface SqlTerminalProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  /** Схема для автодополнения (только открытые таблицы) */
  schema?: TableInfo[];
  disabled?: boolean;
  /** Почему терминал недоступен — показывается поверх редактора */
  disabledReason?: string;
  /** Запрос выполняется */
  running?: boolean;
  /** Бюджет запросов: «осталось 5 запросов» */
  budget?: QueryBudget;
  placeholder?: string;
  title?: string;
  /** Мелкая подпись источника данных */
  source?: string;
  /** Дополнительные кнопки в шапке (история, форматирование, …) */
  toolbar?: ReactNode;
  /** Императивный доступ: вставка текста из схемы, фокус */
  handleRef?: Ref<SqlEditorHandle>;
  className?: string;
}

export function SqlTerminal({
  value,
  onChange,
  onRun,
  schema,
  disabled = false,
  disabledReason,
  running = false,
  budget,
  placeholder = "SELECT * FROM … — пишите запрос, Ctrl+Enter выполнит",
  title = "Терминал",
  source = "зеркало · только чтение",
  toolbar,
  handleRef,
  className,
}: SqlTerminalProps) {
  const outOfBudget = budget !== undefined && budget.left <= 0;
  const canRun = !disabled && !running && !outOfBudget && value.trim().length > 0;
  const run = () => {
    if (canRun) onRun();
  };

  return (
    <section
      aria-label="SQL-терминал"
      className={cn(
        "group/terminal @container relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-frost-line bg-ink-deep transition-[border-color,box-shadow] duration-300",
        "focus-within:border-aurora/35 focus-within:shadow-[0_0_0_1px_rgb(46_230_197/0.12),0_0_40px_-12px_rgb(46_230_197/0.25)]",
        className
      )}
    >
      <header className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-frost-line bg-ink-raised/70 px-3 py-1.5">
        <SectionLabel icon={<TerminalSquare className="size-3.5 text-aurora" />} className="text-frost">
          {title}
        </SectionLabel>
        <span className="hidden truncate font-mono text-[11px] text-frost-dim @2xl:inline">{source}</span>
        <div className="ml-auto flex items-center gap-2.5">
          {toolbar}
          {budget && <BudgetMeter budget={budget} />}
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            title="Выполнить (Ctrl/⌘ + Enter)"
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md bg-sodium pr-1.5 pl-3 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-deep",
              "shadow-[0_0_24px_-6px_rgb(255_181_71/0.6)] transition-[filter,transform,opacity] hover:brightness-110 active:translate-y-px",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            )}
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Выполнить
            <span className="inline-flex h-5 items-center gap-0.5 rounded bg-ink-deep/15 px-1 font-mono text-[10px] normal-case tracking-normal">
              Ctrl
              <CornerDownLeft className="size-3" />
            </span>
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <SqlCodeMirror
            value={value}
            onChange={onChange}
            onRun={run}
            schema={schema}
            readOnly={disabled}
            placeholder={placeholder}
            handleRef={handleRef}
          />
        </div>
        {/* Свечение монитора снизу */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-aurora/[0.04] to-transparent"
        />
        {(disabled || outOfBudget) && (
          <div className="absolute inset-0 grid place-items-center bg-ink-deep/70 backdrop-blur-[2px]">
            <span className="inline-flex items-center gap-2 rounded-md border border-frost-line-strong bg-ink-raised px-3 py-1.5 text-xs text-frost">
              <Lock className="size-3.5 text-frost-dim" />
              {outOfBudget && !disabled
                ? "Запросы на сегодня закончились"
                : (disabledReason ?? "Терминал недоступен")}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function BudgetMeter({ budget }: { budget: QueryBudget }) {
  const { left, total } = budget;
  const tone = left <= 0 ? "text-signal" : left <= 2 ? "text-sodium" : "text-frost";
  const pips = total !== undefined && total <= 12 ? total : 0;
  const label =
    left <= 0 ? "запросов не осталось" : `${plural(left, ["остался", "осталось", "осталось"])} ${left} ${plural(left, ["запрос", "запроса", "запросов"])}`;

  return (
    <div className="flex items-center gap-2" title={total ? `Бюджет запросов: ${left} из ${total}` : undefined}>
      {pips > 0 && (
        <span aria-hidden className="hidden items-center gap-[3px] @lg:flex">
          {Array.from({ length: pips }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 w-1 rounded-full transition-colors",
                i < left ? (left <= 2 ? "bg-sodium" : "bg-aurora/80") : "bg-frost-line-strong"
              )}
            />
          ))}
        </span>
      )}
      <span className={cn("text-xs whitespace-nowrap tabular-nums", tone)} aria-live="polite">
        {label}
      </span>
    </div>
  );
}
