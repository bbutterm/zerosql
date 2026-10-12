"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { DeskCenterView, DeskPanelId } from "@/types/ui";
import { cn } from "@/lib/utils";
import { FieldDivider, PanelHeader, TabBar, screenButtonClass } from "@/components/kit/screen";
import { MirrorMenuBar, MirrorMenuButton, type DeskMenuAction, type DeskMenuGroup } from "./menu-bar";
import { StatusBar, type StatusMessage } from "./status-bar";

export type { DeskMenuAction, DeskMenuGroup } from "./menu-bar";
export type { StatusMessage } from "./status-bar";

export interface DeskLayoutProps {
  /** «Тёплая вода» */
  caseTitle: string;
  /** «Дело 01» */
  caseCode?: string;
  /** Игровые дата и время для строки состояния: «14.12.2026 02:44» */
  dateTime?: string;
  /** Устарело: роль игрока теперь видна как логин в строке состояния */
  rank?: string;
  /** Открыто меню (мобильный «Зеркало») */
  onMenu?: () => void;
  /** Дополнительные элементы в строке окна справа */
  topBarExtra?: ReactNode;
  /** Левая колонка — обычно SchemaPanel */
  schema: ReactNode;
  /** Центр сверху — SqlTerminal */
  terminal: ReactNode;
  /** Центр снизу — ResultsGrid */
  results: ReactNode;
  /** Содержимое вкладок. protocol показывается в центре (бланк на столе), остальное — справа */
  panels: Partial<Record<DeskPanelId, ReactNode>>;
  /** Счётчики на вкладках: «Материалы 7» */
  badges?: Partial<Record<DeskPanelId, number | string>>;
  /** Вкладки, чей счётчик горит натрием (есть непросмотренное) */
  badgeAlerts?: DeskPanelId[];
  /** Активная вкладка правой колонки (управляемый режим) */
  panel?: DeskPanelId;
  onPanelChange?: (panel: DeskPanelId) => void;
  defaultPanel?: DeskPanelId;
  /** Вид центральной зоны (управляемый режим): запрос, заключение, стена */
  centerView?: DeskCenterView;
  onCenterViewChange?: (view: DeskCenterView) => void;
  defaultCenterView?: DeskCenterView;
  /** Центральный вид «Стена» — обычно EvidenceWall */
  wall?: ReactNode;
  /** Доля высоты запроса в центре (0.2–0.75); по умолчанию — 8 строк редактора */
  defaultSplit?: number;
  /** Строка состояния */
  login?: string;
  accessMode?: string;
  sessions?: number;
  sessionsAlarm?: boolean;
  statusMessage?: StatusMessage | null;
  /** Строка меню: свои пункты и обработчик команд */
  menus?: DeskMenuGroup[];
  onMenuAction?: (action: DeskMenuAction) => void;
  /** Слой поверх стола: диалог, блокировка */
  overlay?: ReactNode;
  className?: string;
}

const SIDE_PANELS: Array<{ id: Exclude<DeskPanelId, "protocol">; label: string }> = [
  { id: "tasks", label: "Задания" },
  { id: "evidence", label: "Материалы" },
  { id: "reference", label: "Справка" },
];

type MobileView = "schema" | "query" | "case" | "protocol";

/** Заголовок 28 + 8 строк редактора по 22 + отступы 10/10 */
const DEFAULT_TERMINAL = 224;
const MIN_TERMINAL = 28 + 22 * 3 + 20;

/**
 * Стол (раздел 6.2): строка окна, три колонки (схема 248 | центр | дело 384), строка состояния.
 * Центр показывает один вид из трёх: запрос, бланк заключения, стену. Переключение мгновенное.
 * Ниже 1024 px — одна колонка и нижние вкладки (раздел 6.4).
 */
export function DeskLayout({
  caseTitle,
  caseCode,
  dateTime,
  onMenu,
  topBarExtra,
  schema,
  terminal,
  results,
  panels,
  badges = {},
  badgeAlerts = [],
  panel,
  onPanelChange,
  defaultPanel = "tasks",
  centerView,
  onCenterViewChange,
  defaultCenterView = "query",
  wall,
  defaultSplit,
  login,
  accessMode,
  sessions,
  sessionsAlarm,
  statusMessage,
  menus,
  onMenuAction,
  overlay,
  className,
}: DeskLayoutProps) {
  const [innerPanel, setInnerPanel] = useState<DeskPanelId>(defaultPanel === "protocol" ? "tasks" : defaultPanel);
  const sidePanel = panel && panel !== "protocol" ? panel : innerPanel;
  const [innerCenter, setInnerCenter] = useState<DeskCenterView>(
    defaultPanel === "protocol" ? "protocol" : defaultCenterView
  );
  const center = centerView ?? (panel === "protocol" ? "protocol" : innerCenter);
  const [mobileView, setMobileView] = useState<MobileView>("query");
  const [schemaOpen, setSchemaOpen] = useState(false);

  const [terminalPx, setTerminalPx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const centerRef = useRef<HTMLDivElement>(null);

  const hasProtocol = panels.protocol !== undefined;

  const selectPanel = (id: DeskPanelId) => {
    if (id === "protocol") {
      setCenter("protocol");
      return;
    }
    setInnerPanel(id);
    onPanelChange?.(id);
  };
  const setCenter = (view: DeskCenterView) => {
    setInnerCenter(view);
    onCenterViewChange?.(view);
    if (view === "protocol") onPanelChange?.("protocol");
  };

  const handleMenu = (action: DeskMenuAction) => {
    if (action === "tasks" || action === "evidence" || action === "reference") {
      selectPanel(action);
      setMobileView("case");
    } else if (action === "protocol") {
      setCenter("protocol");
      setMobileView("protocol");
    } else if (action === "wall") {
      setCenter("wall");
      setMobileView("query");
    } else if (action === "run" || action === "clear" || action === "history") {
      setCenter("query");
      setMobileView("query");
    }
    onMenuAction?.(action);
  };

  /* ---------- Граница запрос / результат: 1 px, зона захвата 7 px, стрелки — по строке ---------- */

  const clampTerminal = (px: number) => {
    const total = centerRef.current?.getBoundingClientRect().height ?? 800;
    return Math.round(Math.min(total - 28 - 24 - 72, Math.max(MIN_TERMINAL, px)));
  };
  const currentTerminal = () =>
    terminalPx ??
    (defaultSplit !== undefined && centerRef.current
      ? centerRef.current.getBoundingClientRect().height * defaultSplit
      : DEFAULT_TERMINAL);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !centerRef.current) return;
    const rect = centerRef.current.getBoundingClientRect();
    setTerminalPx(clampTerminal(e.clientY - rect.top));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };
  const onSplitKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = currentTerminal();
    if (e.key === "ArrowUp") setTerminalPx(clampTerminal(cur - 22));
    else if (e.key === "ArrowDown") setTerminalPx(clampTerminal(cur + 22));
    else if (e.key === "Home") setTerminalPx(clampTerminal(MIN_TERMINAL));
    else if (e.key === "End") setTerminalPx(clampTerminal(10_000));
    else return;
    e.preventDefault();
  };

  const terminalBasis = {
    "--term":
      terminalPx !== null
        ? `${terminalPx}px`
        : defaultSplit !== undefined
          ? `${Math.min(0.75, Math.max(0.2, defaultSplit)) * 100}%`
          : `${DEFAULT_TERMINAL}px`,
  } as CSSProperties;

  const caseLabel = caseCode ? `${caseCode}. ${caseTitle}` : caseTitle;
  const time = dateTime?.match(/\d{1,2}:\d{2}/)?.[0];

  /* ---------- Центр: один вид из трёх ---------- */

  const queryView = (
    <div
      ref={centerRef}
      className={cn("flex h-full min-h-0 min-w-0 flex-col", dragging && "cursor-row-resize select-none")}
      style={terminalBasis}
    >
      <div className="flex min-h-0 shrink-0 flex-col max-lg:h-[calc(40%+44px)] max-lg:min-h-[204px] lg:h-(--term)">
        {terminal}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Граница запроса и результата"
        aria-valuemin={MIN_TERMINAL}
        aria-valuenow={Math.round(terminalPx ?? DEFAULT_TERMINAL)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onSplitKey}
        className="relative z-10 hidden h-px shrink-0 cursor-row-resize touch-none bg-line outline-none before:absolute before:inset-x-0 before:-top-[3px] before:h-[7px] focus-visible:bg-ink-1 lg:block"
      />
      <div className="flex min-h-0 flex-1 flex-col max-lg:border-t max-lg:border-line">{results}</div>
    </div>
  );

  const backToQuery = (
    <button type="button" onClick={() => setCenter("query")} className={screenButtonClass("text")}>
      Вернуться к запросу
    </button>
  );

  const protocolView = (
    <div
      className="flex h-full min-h-0 flex-col bg-room"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) setCenter("query");
      }}
    >
      <PanelHeader title="Заключение" className="bg-scr-base max-lg:hidden">
        {backToQuery}
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">{panels.protocol}</div>
    </div>
  );

  const wallView = (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) setCenter("query");
      }}
    >
      <PanelHeader title="Стена" className="bg-scr-base">
        {backToQuery}
      </PanelHeader>
      <div className="relative min-h-0 flex-1">{wall}</div>
    </div>
  );

  const centerContent =
    center === "protocol" && hasProtocol ? protocolView : center === "wall" && wall ? wallView : queryView;

  /* ---------- Правая колонка ---------- */

  const sideTabs = SIDE_PANELS.map((p) => ({
    id: p.id,
    label: p.label,
    count: badges[p.id],
    alert: badgeAlerts.includes(p.id),
    controls: `desk-panel-${p.id}`,
    // Цель полёта приобщённой строки
    attrs: p.id === "evidence" ? { "data-pin-target": "" } : undefined,
  }));

  const sidePanels = SIDE_PANELS.map((p) => (
    <div
      key={p.id}
      role="tabpanel"
      id={`desk-panel-${p.id}`}
      aria-labelledby={`desk-tab-${p.id}`}
      hidden={sidePanel !== p.id}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      {panels[p.id] ?? <p className="p-3 ui-13 text-ink-3">Записей нет.</p>}
    </div>
  ));

  const wallLink = wall && sidePanel === "evidence" && (
    <div className="flex h-8 shrink-0 items-center border-t border-line px-3 max-lg:h-11">
      <button
        type="button"
        onClick={() => {
          setCenter("wall");
          setMobileView("query");
        }}
        className={screenButtonClass("text")}
      >
        Стена
      </button>
    </div>
  );

  return (
    <div
      data-desk
      className={cn(
        "relative isolate flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-room text-ink-1",
        className
      )}
    >
      {/* ---------- Строка окна ---------- */}
      <MirrorMenuBar
        menus={menus}
        onAction={handleMenu}
        className="max-lg:hidden"
        right={
          <>
            {topBarExtra}
            <span className="truncate ui-13 text-ink-2">{caseLabel}</span>
          </>
        }
      />
      <div className="flex h-8 shrink-0 items-center gap-4 border-b border-line bg-scr-chrome px-4 lg:hidden">
        <MirrorMenuButton menus={menus} onAction={handleMenu} onOpen={onMenu} />
        <span className="min-w-0 flex-1 truncate ui-13 text-ink-2">{caseCode ?? caseTitle}</span>
        {time && <span className="mono-12 text-ink-2">{time}</span>}
      </div>

      {/* ---------- Три колонки ---------- */}
      <div
        className={cn(
          "relative min-h-0 flex-1 lg:grid",
          schemaOpen
            ? "lg:grid-cols-[216px_minmax(0,1fr)_336px]"
            : "lg:grid-cols-[28px_minmax(0,1fr)_336px]",
          "xl:grid-cols-[232px_minmax(560px,1fr)_352px] min-[1440px]:grid-cols-[248px_minmax(560px,1fr)_384px]"
        )}
      >
        {/* Схема */}
        <aside
          className={cn(
            "h-full min-h-0 min-w-0 flex-col border-line bg-scr-side lg:flex lg:border-r",
            mobileView === "schema" ? "flex" : "hidden"
          )}
        >
          {/* 1024–1279: свёрнутая полоса с вертикальной надписью */}
          <button
            type="button"
            onClick={() => setSchemaOpen(true)}
            aria-label="Показать схему"
            className={cn(
              "hidden h-full w-7 items-start justify-center pt-3 ui-13 font-medium text-ink-2 hover:bg-scr-raise hover:text-ink-1 xl:hidden",
              !schemaOpen && "lg:flex"
            )}
          >
            <span className="[writing-mode:vertical-rl]">Схема</span>
          </button>
          <div className={cn("flex min-h-0 flex-1 flex-col", !schemaOpen && "lg:max-xl:hidden")}>
            {schema}
            <div className="hidden h-6 shrink-0 items-center border-t border-line px-3 lg:max-xl:flex">
              <button
                type="button"
                onClick={() => setSchemaOpen(false)}
                className="ui-12 text-ink-3 hover:text-ink-1"
              >
                Свернуть схему
              </button>
            </div>
          </div>
        </aside>

        {/* Центр */}
        <main
          className={cn(
            "h-full min-h-0 min-w-0 flex-col bg-scr-base lg:flex",
            mobileView === "query" || mobileView === "protocol" ? "flex" : "hidden"
          )}
        >
          {centerContent}
        </main>

        {/* Правая колонка «Дело» */}
        <aside
          className={cn(
            "h-full min-h-0 min-w-0 flex-col border-line bg-scr-side lg:flex lg:border-l",
            mobileView === "case" ? "flex" : "hidden"
          )}
        >
          <div className="flex h-8 shrink-0 items-stretch gap-3 border-b border-line px-3 max-lg:h-10">
            <TabBar
              items={sideTabs}
              value={sidePanel as Exclude<DeskPanelId, "protocol">}
              onChange={selectPanel}
              label="Дело"
              idPrefix="desk"
              className="h-full shrink-0 gap-3 [&>button]:h-full"
            />
            {hasProtocol && (
              <>
                <FieldDivider className="self-center max-xl:hidden" />
                <button
                  type="button"
                  aria-pressed={center === "protocol"}
                  onClick={() => setCenter(center === "protocol" ? "query" : "protocol")}
                  className={cn(
                    "-mb-px flex h-full items-center border-b-2 ui-13 font-medium whitespace-nowrap transition-colors duration-[80ms] ease-linear max-lg:hidden",
                    center === "protocol"
                      ? "border-ink-1 text-ink-1"
                      : "border-transparent text-ink-3 hover:text-ink-2"
                  )}
                >
                  Заключение
                </button>
              </>
            )}
          </div>
          {sidePanels}
          {wallLink}
        </aside>

      </div>

      {/* ---------- Строка состояния (десктоп) ---------- */}
      <StatusBar
        className="max-lg:hidden"
        login={login}
        mode={accessMode}
        sessions={sessions}
        sessionsAlarm={sessionsAlarm}
        message={statusMessage}
        dateTime={dateTime}
      />

      {/* ---------- Нижние вкладки (мобильный) ---------- */}
      <nav
        aria-label="Разделы стола"
        className="grid shrink-0 grid-cols-4 border-t border-line bg-scr-chrome pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {(
          [
            { id: "schema", label: "Схема" },
            { id: "query", label: "Запрос" },
            { id: "case", label: "Дело" },
            ...(hasProtocol ? [{ id: "protocol", label: "Заключ." }] : []),
          ] as Array<{ id: MobileView; label: string }>
        ).map((item) => {
          const selected = mobileView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              data-pin-target={item.id === "case" ? true : undefined}
              onClick={() => {
                setMobileView(item.id);
                if (item.id === "protocol") setCenter("protocol");
                else if (item.id === "query" && center === "protocol") setCenter("query");
              }}
              className={cn(
                "relative flex h-14 items-center justify-center border-t-2 ui-12 font-medium",
                selected ? "border-ink-1 text-ink-1" : "border-transparent text-ink-3"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {overlay}
    </div>
  );
}

