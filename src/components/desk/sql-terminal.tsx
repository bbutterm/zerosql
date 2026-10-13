"use client";

import { useSyncExternalStore, type ReactNode, type Ref } from "react";
import dynamic from "next/dynamic";
import type { TableInfo } from "@/types/database";
import type { QueryBudget } from "@/types/ui";
import { cn } from "@/lib/utils";
import { ScreenButton } from "@/components/kit/screen";
import type { SqlEditorHandle } from "./sql-codemirror";
import { useDeskCenterTabs } from "./center-tabs";

export type { SqlEditorHandle } from "./sql-codemirror";

/**
 * Редактор монтируется, когда PT Mono (латиница и кириллица) уже загружен: CodeMirror меряет
 * высоты строк при создании, и запасной шрифт дал бы сдвинутые номера строк.
 */
function fontsFor(sample: string): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return Promise.race([
    document.fonts.load("14px 'PT Mono'", sample),
    new Promise((resolve) => window.setTimeout(resolve, 1500)),
  ]).catch(() => undefined);
}

const SqlCodeMirror = dynamic(async () => {
  const [mod] = await Promise.all([import("./sql-codemirror"), fontsFor("SELECT Аа Ёё")]);
  return mod;
}, {
  ssr: false,
  // Загрузка — текстом, без скелетонов
  loading: () => <p className="py-2.5 pl-[52px] mono-12 text-ink-3">Загрузка редактора…</p>,
});

export interface SqlTerminalProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  /** Схема для автодополнения (только открытые таблицы) */
  schema?: TableInfo[];
  disabled?: boolean;
  /** Почему терминал недоступен — строка под редактором */
  disabledReason?: string;
  /** Запрос выполняется (повторный запуск игнорируется) */
  running?: boolean;
  /** Квота запросов на смену: «квота 6 из 8» */
  budget?: QueryBudget;
  placeholder?: string;
  /** Заголовок панели, по умолчанию «Запрос» */
  title?: string;
  /** Необязательная служебная подпись рядом с заголовком */
  source?: string;
  /** Дополнительные текстовые кнопки в шапке (история, очистка, …) */
  toolbar?: ReactNode;
  /** Императивный доступ: вставка текста из схемы, фокус, отметка ошибки */
  handleRef?: Ref<SqlEditorHandle>;
  /** Ключевые слова в автодополнении: только пройденное к этому делу */
  keywords?: readonly string[];
  className?: string;
}

/* ---------- Ctrl или Cmd: подпись у «Выполнить» ---------- */

const noop = () => () => {};
function useRunKeys(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd+Enter" : "Ctrl+Enter"),
    () => "Ctrl+Enter"
  );
}

/**
 * Терминал (раздел 7.6): заголовок «Запрос» 28 px, справа квота и главная кнопка.
 * На мобильном полоса с квотой и «Выполнить» уходит под редактор и становится 44 px.
 */
export function SqlTerminal({
  value,
  onChange,
  onRun,
  schema,
  disabled = false,
  disabledReason,
  running = false,
  budget,
  placeholder = "-- запрос к зеркалу; Ctrl+Enter — выполнить",
  title = "Запрос",
  source,
  toolbar,
  handleRef,
  keywords,
  className,
}: SqlTerminalProps) {
  const keys = useRunKeys();
  const centerTabs = useDeskCenterTabs();
  const outOfBudget = budget !== undefined && budget.left <= 0;
  const inactive = disabled || outOfBudget;
  const canRun = !inactive && !running && value.trim().length > 0;
  const run = () => {
    if (canRun) onRun();
  };

  return (
    <section
      aria-label="Запрос"
      data-desk-region="query"
      className={cn("flex min-h-0 min-w-0 flex-col bg-scr-base", className)}
    >
      <header
        className={cn(
          "flex h-7 shrink-0 items-center gap-3 border-b border-line px-3",
          "max-lg:order-last max-lg:h-11 max-lg:border-t max-lg:border-b-0 max-lg:bg-scr-chrome"
        )}
      >
        {centerTabs ? (
          <div className="flex h-full min-w-0 shrink-0 items-stretch max-lg:hidden">{centerTabs}</div>
        ) : (
          <h2 className="ui-13 font-medium text-ink-2 max-lg:hidden">{title}</h2>
        )}
        {source && <span className="truncate ui-12 text-ink-3 max-lg:hidden">{source}</span>}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-4 max-lg:justify-between">
          {toolbar}
          {budget && <Quota budget={budget} />}
          <ScreenButton
            variant="primary"
            keys={keys}
            onClick={run}
            disabled={inactive}
            aria-disabled={!canRun}
            className="max-lg:min-w-28"
          >
            Выполнить
          </ScreenButton>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <SqlCodeMirror
            value={value}
            onChange={onChange}
            onRun={run}
            schema={schema}
            readOnly={disabled}
            placeholder={placeholder}
            handleRef={handleRef}
            keywords={keywords}
          />
        </div>
      </div>

      {disabled && (
        <p className="flex h-6 shrink-0 items-center border-t border-line bg-scr-chrome px-3 mono-12 text-ink-3">
          {disabledReason ?? "Терминал недоступен."}
        </p>
      )}
    </section>
  );
}

function Quota({ budget }: { budget: QueryBudget }) {
  const { left, total } = budget;
  if (left <= 0) {
    return (
      <span className="truncate ui-12 text-alarm" aria-live="polite">
        квота исчерпана до конца смены
      </span>
    );
  }
  return (
    <span
      className={cn("tnum ui-12 whitespace-nowrap", left <= 2 ? "text-ink-1" : "text-ink-3")}
      aria-live="polite"
    >
      {total !== undefined ? `квота ${left} из ${total}` : `квота: ${left}`}
    </span>
  );
}
