"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  BookOpen,
  Clock3,
  Database,
  Menu,
  Pin,
  ScrollText,
  ShieldHalf,
  Target,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import type { DeskPanelId } from "@/types/ui";
import { cn } from "@/lib/utils";

export interface DeskLayoutProps {
  /** «Тёплая вода» */
  caseTitle: string;
  /** «Дело № 01» */
  caseCode?: string;
  /** Внутриигровые дата и время: «пн, 14 декабря 2026 · 02:14» */
  dateTime?: string;
  /** Звание игрока: «стажёр-аналитик» */
  rank?: string;
  onMenu?: () => void;
  /** Дополнительные элементы в шапке справа */
  topBarExtra?: ReactNode;
  /** Левая колонка — обычно SchemaPanel */
  schema: ReactNode;
  /** Центр сверху — SqlTerminal */
  terminal: ReactNode;
  /** Центр снизу — ResultsGrid */
  results: ReactNode;
  /** Вкладки правой колонки */
  panels: Partial<Record<DeskPanelId, ReactNode>>;
  /** Счётчики на вкладках: новые улики, открытые задачи */
  badges?: Partial<Record<DeskPanelId, number | string>>;
  /** Активная вкладка (управляемый режим) */
  panel?: DeskPanelId;
  onPanelChange?: (panel: DeskPanelId) => void;
  defaultPanel?: DeskPanelId;
  /** Доля высоты терминала в центре (0.2–0.75) */
  defaultSplit?: number;
  /** Слой поверх стола: диалог, заставка */
  overlay?: ReactNode;
  className?: string;
}

const PANELS: Array<{ id: DeskPanelId; label: string; short: string; icon: LucideIcon }> = [
  { id: "tasks", label: "Задачи", short: "Задачи", icon: Target },
  { id: "evidence", label: "Улики", short: "Улики", icon: Pin },
  { id: "protocol", label: "Протокол", short: "Протокол", icon: ScrollText },
  { id: "reference", label: "Справочник", short: "Справка", icon: BookOpen },
];

type MobileView = "query" | "schema" | DeskPanelId;

const clampSplit = (v: number) => Math.min(0.75, Math.max(0.2, v));

export function DeskLayout({
  caseTitle,
  caseCode,
  dateTime,
  rank,
  onMenu,
  topBarExtra,
  schema,
  terminal,
  results,
  panels,
  badges = {},
  panel,
  onPanelChange,
  defaultPanel = "tasks",
  defaultSplit = 0.4,
  overlay,
  className,
}: DeskLayoutProps) {
  const [innerPanel, setInnerPanel] = useState<DeskPanelId>(defaultPanel);
  const activePanel = panel ?? innerPanel;
  const [mobileView, setMobileView] = useState<MobileView>("query");
  const [split, setSplit] = useState(clampSplit(defaultSplit));
  const [dragging, setDragging] = useState(false);
  const centerRef = useRef<HTMLDivElement>(null);

  const selectPanel = (id: DeskPanelId) => {
    setInnerPanel(id);
    onPanelChange?.(id);
  };

  const selectMobile = (view: MobileView) => {
    setMobileView(view);
    if (view !== "query" && view !== "schema") selectPanel(view);
  };

  /* ---------- Разделитель терминал / результат ---------- */

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !centerRef.current) return;
    const rect = centerRef.current.getBoundingClientRect();
    setSplit(clampSplit((e.clientY - rect.top) / rect.height));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };
  const onSplitKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp") setSplit((s) => clampSplit(s - 0.05));
    else if (e.key === "ArrowDown") setSplit((s) => clampSplit(s + 0.05));
    else if (e.key === "Home") setSplit(0.2);
    else if (e.key === "End") setSplit(0.75);
    else return;
    e.preventDefault();
  };

  const sidePanelActive = mobileView !== "query" && mobileView !== "schema";

  return (
    <div
      className={cn(
        "relative isolate flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-ink text-foreground",
        className
      )}
    >
      {/* Глубина: холодное сияние сверху слева, тёплый натрий справа снизу */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 40% at 0% 0%, rgb(46 230 197 / 0.05), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgb(255 181 71 / 0.05), transparent 70%)",
        }}
      />

      {/* ---------- Шапка ---------- */}
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-frost-line bg-ink-deep/85 px-3 backdrop-blur sm:px-4">
        <div className="flex shrink-0 items-center gap-2" aria-label="ZeroSQL">
          <LogoMark />
          <span className="hidden font-display text-[13px] font-bold tracking-tight text-steam md:inline">
            Zero<span className="text-aurora">SQL</span>
          </span>
        </div>
        <span aria-hidden className="h-5 w-px shrink-0 bg-frost-line-strong" />
        <div className="flex min-w-0 flex-1 flex-col justify-center sm:flex-row sm:items-baseline sm:gap-2.5">
          {caseCode && (
            <span className="hidden shrink-0 font-mono text-[11px] text-frost-dim uppercase sm:inline">{caseCode}</span>
          )}
          <h1 className="truncate font-display text-[13px] leading-tight font-semibold text-steam sm:text-sm">
            {caseTitle}
          </h1>
          {dateTime && (
            <span className="truncate text-[10.5px] leading-tight text-frost-dim sm:hidden">{dateTime}</span>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {dateTime && (
            <span className="hidden items-center gap-1.5 text-xs text-frost sm:inline-flex">
              <Clock3 className="size-3.5 text-sodium" aria-hidden />
              <span className="tabular-nums">{dateTime}</span>
            </span>
          )}
          {rank && (
            <span className="hidden items-center gap-1.5 rounded-full border border-frost-line-strong bg-ink-raised px-2.5 py-1 text-[11px] text-frost md:inline-flex">
              <ShieldHalf className="size-3.5 text-aurora" aria-hidden />
              {rank}
            </span>
          )}
          {topBarExtra}
          {onMenu && (
            <button
              type="button"
              onClick={onMenu}
              aria-label="Меню"
              className="grid size-8 place-items-center rounded-md text-frost transition-colors hover:bg-steam/[0.06] hover:text-steam"
            >
              <Menu className="size-4.5" />
            </button>
          )}
        </div>
      </header>

      {/* ---------- Три колонки ---------- */}
      <div className="relative z-10 min-h-0 flex-1 lg:grid lg:grid-cols-[clamp(220px,19vw,290px)_minmax(0,1fr)_clamp(330px,27vw,440px)]">
        {/* Схема */}
        <aside
          className={cn(
            "h-full min-h-0 min-w-0 flex-col border-frost-line bg-ink-raised/50 lg:flex lg:border-r",
            mobileView === "schema" ? "flex" : "hidden"
          )}
        >
          {schema}
        </aside>

        {/* Терминал + результат */}
        <main
          ref={centerRef}
          className={cn(
            "h-full min-h-0 min-w-0 flex-col p-2 sm:p-3 lg:flex",
            mobileView === "query" ? "flex" : "hidden",
            dragging && "cursor-row-resize select-none"
          )}
        >
          <div className="flex min-h-0 flex-col" style={{ flex: `0 0 ${split * 100}%` }}>
            {terminal}
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Граница терминала и результата"
            aria-valuemin={20}
            aria-valuemax={75}
            aria-valuenow={Math.round(split * 100)}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onSplitKey}
            className="group/split relative flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
          >
            <span
              aria-hidden
              className={cn(
                "ice-crack absolute inset-x-6 opacity-50 transition-opacity group-hover/split:opacity-100",
                dragging && "opacity-100"
              )}
            />
            <span
              aria-hidden
              className={cn(
                "relative h-1 w-10 rounded-full bg-frost-line-strong transition-colors group-hover/split:bg-aurora/60",
                dragging && "bg-aurora"
              )}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{results}</div>
        </main>

        {/* Правая колонка: вкладки */}
        <aside
          className={cn(
            "h-full min-h-0 min-w-0 flex-col border-frost-line bg-ink-raised/40 lg:flex lg:border-l",
            sidePanelActive ? "flex" : "hidden"
          )}
        >
          <div
            role="tablist"
            aria-label="Материалы дела"
            className="hidden h-11 shrink-0 items-stretch border-b border-frost-line px-1.5 lg:flex"
          >
            {PANELS.map((p) => {
              const selected = activePanel === p.id;
              const badge = badges[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  id={`desk-tab-${p.id}`}
                  aria-selected={selected}
                  aria-controls={`desk-panel-${p.id}`}
                  onClick={() => selectPanel(p.id)}
                  className={cn(
                    "relative flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1.5 text-[12.5px] transition-colors",
                    selected ? "text-steam" : "text-frost-dim hover:text-frost"
                  )}
                >
                  <p.icon className={cn("hidden size-3.5 shrink-0 2xl:block", selected && "text-sodium")} aria-hidden />
                  <span className="truncate">{p.label}</span>
                  {badge !== undefined && badge !== 0 && <Badge value={badge} hot={p.id === "evidence"} />}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-sodium transition-opacity",
                      selected ? "opacity-100" : "opacity-0"
                    )}
                  />
                </button>
              );
            })}
          </div>
          {PANELS.map((p) => (
            <div
              key={p.id}
              role="tabpanel"
              id={`desk-panel-${p.id}`}
              aria-labelledby={`desk-tab-${p.id}`}
              hidden={activePanel !== p.id}
              className="scrollbar-ice min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"
            >
              {panels[p.id] ?? (
                <p className="py-10 text-center text-sm text-frost-dim">Пока пусто.</p>
              )}
            </div>
          ))}
        </aside>
      </div>

      {/* ---------- Нижняя навигация на узких экранах ---------- */}
      <nav
        aria-label="Разделы стола"
        className="relative z-20 grid shrink-0 grid-cols-6 border-t border-frost-line bg-ink-deep/95 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {(
          [
            { id: "query", label: "Запрос", icon: TerminalSquare },
            { id: "schema", label: "Схема", icon: Database },
            ...PANELS.map((p) => ({ id: p.id, label: p.short, icon: p.icon })),
          ] as Array<{ id: MobileView; label: string; icon: LucideIcon }>
        ).map((item) => {
          const selected = mobileView === item.id;
          const badge = item.id !== "query" && item.id !== "schema" ? badges[item.id] : undefined;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => selectMobile(item.id)}
              className={cn(
                "relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[10px] transition-colors",
                selected ? "text-steam" : "text-frost-dim"
              )}
            >
              <span className="relative">
                <item.icon className={cn("size-[18px]", selected && "text-sodium")} aria-hidden />
                {badge !== undefined && badge !== 0 && (
                  <span className="absolute -top-1.5 -right-2.5">
                    <Badge value={badge} hot={item.id === "evidence"} />
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-0.5">{item.label}</span>
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-3 top-0 h-0.5 rounded-full bg-sodium transition-opacity",
                  selected ? "opacity-100" : "opacity-0"
                )}
              />
            </button>
          );
        })}
      </nav>

      {overlay}
    </div>
  );
}

function Badge({ value, hot }: { value: number | string; hot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9.5px] leading-none font-semibold",
        hot ? "bg-signal text-ink-deep" : "bg-frost-line-strong text-steam"
      )}
    >
      {value}
    </span>
  );
}

/** Знак: ноль-полынья — круг с трещиной и паром */
export function LogoMark({ className }: { className?: string }) {
  const gid = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-mark`;
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2ee6c5" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <ellipse cx="16" cy="17" rx="10" ry="11.5" fill="#03050b" stroke={`url(#${gid})`} strokeWidth="2.4" />
      <path d="M9.5 24.5 L14 18.5 L12.5 15 L17 10.5 L16 7" fill="none" stroke="#bccbe0" strokeOpacity="0.55" strokeWidth="1" />
      <path d="M19 12 C17.5 10 20.5 8.5 19 6.5" fill="none" stroke="#eef3fa" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="21" cy="21" r="1.6" fill="#ffb547" />
    </svg>
  );
}
