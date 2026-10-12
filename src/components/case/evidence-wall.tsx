"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { EvidenceCardData } from "@/types/ui";
import { cn } from "@/lib/utils";
import { StickyNote, Tape } from "@/components/kit/paper";
import { fromId } from "@/components/kit/typo";
import { EVIDENCE_ITEM_WIDTH, EvidenceCard } from "./evidence-card";
import { nightMinutes } from "./evidence-board";

export interface EvidenceWallProps {
  cards: EvidenceCardData[];
  /** Начало и конец ленты ночи, «22:00» … «06:00» (из данных дела) */
  from?: string;
  to?: string;
  /** Предмет, подведённый к центру (управляемый режим) */
  focusId?: string | null;
  onFocusChange?: (id: string | null) => void;
  /** Стикер на пустой стене рукой предшественницы */
  emptyNote?: string;
  className?: string;
}

const HOUR = 160;
const TAPE = 40;
const PAD = 48;
const NO_TIME_GAP = 72;
const ZOOM_WIDTH = 560;
/** Видимая полоса листа, приколотого внахлёст: скотч и шапка */
const PEEK = 48;

/** Высота предмета по виду, px — для дорожек на стене (без измерения DOM) */
function itemHeight(c: EvidenceCardData): number {
  switch (c.kind) {
    case "record":
      return 46 + ((c.excerpt?.rows.length ?? 3) + 2) * 16 + (c.title ? 22 : 0);
    case "photo":
      return c.camera ? 248 : 190;
    case "audio":
      return 172;
    case "testimony":
      return 224;
    case "document":
      return 280;
    case "lead":
      return 120;
  }
}

function hoursBetween(from: string, to: string): number[] {
  const a = Number(from.slice(0, 2));
  const b = Number(to.slice(0, 2));
  const n = (b - a + 24) % 24 || 24;
  return Array.from({ length: n + 1 }, (_, i) => (a + i) % 24);
}

/**
 * Стена улик (раздел 7.12): стена подвала в масляной краске, на ней лента ночи — полоса
 * бумаги из принтера с отметками часов. Улики — предметы, приклеенные скотчем у своего времени.
 * Нитей нет: связь по времени даёт лента, связь по смыслу — заключение.
 */
export function EvidenceWall({
  cards,
  from = "22:00",
  to = "06:00",
  focusId,
  onFocusChange,
  emptyNote = "сначала факты, потом люди",
  className,
}: EvidenceWallProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [innerFocus, setInnerFocus] = useState<string | null>(null);
  const focused = focusId !== undefined ? focusId : innerFocus;
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  const setFocus = (id: string | null, from?: DOMRect | null) => {
    setOrigin(from ?? null);
    setInnerFocus(id);
    onFocusChange?.(id);
  };

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Колесо прокручивает ленту по горизонтали
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const vertical = size.w > 0 && size.w < 640;


  const hours = hoursBetween(from, to);
  const span = (hours.length - 1) * HOUR;
  const startMin = nightMinutes(from) ?? 240;
  const pos = (at?: string) => {
    const t = nightMinutes(at);
    if (t === null) return null;
    const x = ((t - startMin) / 60) * HOUR;
    return x < -1 || x > span + 1 ? null : x;
  };

  const timed = cards
    .map((c) => ({ c, x: pos(c.at) }))
    .filter((v): v is { c: EvidenceCardData; x: number } => v.x !== null)
    .sort((a, b) => a.x - b.x);
  const untimed = cards.filter((c) => pos(c.at) === null);
  const focusCard = cards.find((c) => c.id === focused) ?? null;

  /* ---------- Раскладка: над и под лентой; левый край — строго на своём времени ----------
   * Плотные события не уходят от ленты на целые высоты: следующий лист прикалывается
   * внахлёст так, что видна его верхняя полоса (скотч и шапка) — как на настоящей стене.
   * Над лентой дальний лист лежит под ближним, под лентой — поверх. */

  type Placed = { c: EvidenceCardData; x: number; w: number; h: number; side: "above" | "below"; lane: number; top: number };
  const placedAll: Placed[] = [];
  timed.forEach(({ c, x }, i) => {
    const w = EVIDENCE_ITEM_WIDTH[c.kind];
    const h = itemHeight(c);
    const overlapping = (side: "above" | "below") =>
      placedAll.filter((p) => p.side === side && x < p.x + p.w + 16 && p.x < x + w + 16);
    const laneOf = (side: "above" | "below") => {
      const o = overlapping(side);
      return o.length ? Math.max(...o.map((p) => p.lane)) + 1 : 0;
    };
    const la = laneOf("above");
    const lb = laneOf("below");
    const side: "above" | "below" = la === lb ? (i % 2 === 0 ? "above" : "below") : la < lb ? "above" : "below";
    const o = overlapping(side);
    const lane = side === "above" ? la : lb;
    // Координаты от верхнего края ленты (0): над лентой — отрицательные
    const top =
      side === "above"
        ? Math.min(...o.map((p) => p.top - PEEK), -20 - h)
        : o.length
          ? Math.max(...o.map((p) => p.top)) + PEEK
          : TAPE + 20;
    placedAll.push({ c, x, w, h, side, lane, top });
  });
  const minTop = Math.min(0, ...placedAll.map((p) => p.top));
  const maxBottom = Math.max(TAPE, ...placedAll.map((p) => p.top + p.h));
  // Лента — посередине стены, если места хватает; иначе стена прокручивается и по вертикали
  const tapeY = Math.max(24 - minTop, Math.round(size.h / 2) - TAPE / 2);
  const contentHeight = Math.max(size.h, tapeY + maxBottom + 24);
  const placed = placedAll.map((p) => ({
    ...p,
    z: p.side === "above" ? 100 - p.lane : 100 + p.lane,
  }));

  // Стена открывается у первого события ночи, лента — посередине видимой части
  const firstX = placed[0]?.x;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || vertical) return;
    if (firstX !== undefined) el.scrollLeft = Math.max(0, PAD + firstX - 96);
    el.scrollTop = Math.max(0, tapeY + TAPE / 2 - el.clientHeight / 2);
  }, [firstX, tapeY, vertical]);

  const contentWidth = PAD + span + PAD + (untimed.length ? NO_TIME_GAP + 300 : 0) + PAD;

  /* ---------- Перетаскивание фона ---------- */

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
    el.scrollLeft = d.left - (e.clientX - d.x);
    el.scrollTop = d.top - (e.clientY - d.y);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const open = (id: string, e: MouseEvent<HTMLElement>) => {
    // Клавиатура (detail === 0) — без анимации переезда
    const rect = e.detail === 0 ? null : (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFocus(id, rect);
  };

  const item = (c: EvidenceCardData, style: React.CSSProperties, z?: number) => {
    const rot = c.kind === "lead" ? fromId(c.id, -3, 3) : fromId(c.id, -1.2, 1.2);
    return (
      <div
        key={c.id}
        className="absolute"
        style={{ ...style, zIndex: z, transform: `rotate(${rot}deg)` }}
      >
        <EvidenceCard card={c} className="shadow-pinned" />
        <Tape id={c.id} className="top-[-8px] left-1/2 -ml-6" />
        {/* Прозрачная кнопка поверх предмета: клик подводит его к центру */}
        <button
          type="button"
          aria-label={`Открыть: ${c.title}`}
          onClick={(e) => open(c.id, e)}
          className="absolute inset-0 cursor-pointer focus-visible:outline-offset-[3px]"
        />
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative h-full min-h-[480px] w-full overflow-hidden wall", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && focused) {
          e.preventDefault();
          setFocus(null);
        }
      }}
    >
      {vertical ? (
        <VerticalWall hours={hours} placed={timed} untimed={untimed} item={item} emptyNote={emptyNote} />
      ) : (
        <div
          ref={scrollRef}
          className="absolute inset-0 isolate overflow-x-auto overflow-y-auto"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="relative" style={{ width: contentWidth, height: contentHeight }}>
            {/* Лента ночи */}
            <NightTape hours={hours} left={PAD - 24} top={tapeY} width={span + 48} />

            {placed.map(({ c, x, top, z }) => item(c, { left: PAD + x, top: tapeY + top }, z))}

            {untimed.length > 0 && (
              <div className="absolute" style={{ left: PAD + span + PAD + NO_TIME_GAP, top: 32 }}>
                <p className="mb-6 inline-block paper-2 px-2 py-0.5 font-mono text-[12px] leading-[18px] text-print shadow-pinned">
                  Без времени
                </p>
                <div className="relative" style={{ width: 300 }}>
                  {untimed.map((c, i) => item(c, { left: (i % 2) * 24, top: i * 150 }, i + 1))}
                </div>
              </div>
            )}


          </div>
        </div>
      )}

      {!vertical && cards.length === 0 && (
        <div className="pointer-events-none absolute left-1/2 -ml-[60px]" style={{ top: Math.max(24, tapeY - 168) }}>
          <StickyNote id="wall-empty">{emptyNote}</StickyNote>
        </div>
      )}

      {focusCard && (
        <FocusLayer
          card={focusCard}
          origin={origin}
          onClose={() => setFocus(null)}
          maxWidth={Math.max(240, size.w - 48)}
        />
      )}
    </div>
  );
}

/* ---------- Лента ночи: полоса бумаги с перфорацией и отметками часов ---------- */

const PERFORATION = {
  backgroundImage:
    "radial-gradient(circle at 8px 6px, var(--wall) 2px, transparent 2.5px), radial-gradient(circle at 8px 34px, var(--wall) 2px, transparent 2.5px)",
  backgroundSize: "16px 40px",
  backgroundRepeat: "repeat-x",
} as const;

function NightTape({ hours, left, top, width }: { hours: number[]; left: number; top: number; width: number }) {
  const quarters = (hours.length - 1) * 4;
  return (
    <div className="absolute" style={{ left, top, width, height: TAPE }}>
      <div className="absolute inset-0 paper-2 shadow-pinned" />
      <div aria-hidden className="absolute inset-0" style={PERFORATION} />
      {/* Линии перфорации отделяют поля 12 px */}
      <span aria-hidden className="absolute inset-x-0 top-3 h-px bg-print-3/40" />
      <span aria-hidden className="absolute inset-x-0 bottom-3 h-px bg-print-3/40" />
      {Array.from({ length: quarters + 1 }, (_, q) => {
        const isHour = q % 4 === 0;
        return (
          <span
            key={q}
            aria-hidden
            className={cn("absolute w-px bg-print-3", isHour ? "top-3 h-[7px]" : "top-3 h-1")}
            style={{ left: 24 + q * (HOUR / 4) }}
          />
        );
      })}
      {hours.map((h, i) => (
        <span
          key={i}
          className="absolute top-[13px] -translate-x-1/2 font-mono text-[12px] leading-[18px] text-print toner"
          style={{ left: 24 + i * HOUR }}
        >
          {String(h).padStart(2, "0")}:00
        </span>
      ))}
      <Tape id="tape-start" className="top-3 -left-7" style={{ transform: "rotate(-84deg)" }} />
      <Tape id="tape-end" className="top-3 -right-7" style={{ transform: "rotate(92deg)" }} />
    </div>
  );
}

/* ---------- Мобильный: лента вертикальная слева, предметы справа в одну колонку ---------- */

function VerticalWall({
  hours,
  placed,
  untimed,
  item,
  emptyNote,
}: {
  hours: number[];
  placed: Array<{ c: EvidenceCardData; x: number }>;
  untimed: EvidenceCardData[];
  item: (c: EvidenceCardData, style: React.CSSProperties, z?: number) => React.ReactNode;
  emptyNote: string;
}) {
  const span = (hours.length - 1) * HOUR;
  // Предметы не налезают друг на друга: следующий — не выше нижнего края предыдущего
  let floor = 0;
  const rows: Array<{ c: EvidenceCardData; y: number }> = [];
  for (const { c, x } of placed) {
    const h = itemHeight(c);
    const y = Math.max(x, floor);
    floor = y + h + 24;
    rows.push({ c, y });
  }
  const height = Math.max(span + 48, floor + 24) + (untimed.length ? untimed.length * 220 + 80 : 0);
  const firstY = rows[0]?.y;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && firstY !== undefined) ref.current.scrollTop = Math.max(0, firstY - 24);
  }, [firstY]);
  return (
    <div ref={ref} className="absolute inset-0 isolate overflow-y-auto">
      <div className="relative" style={{ height }}>
        <div className="absolute top-6 left-3 w-8 paper-2 shadow-pinned" style={{ height: span + 8 }}>
          {hours.map((h, i) => (
            <span
              key={i}
              className="absolute left-0 w-full -translate-y-1/2 text-center font-mono text-[12px] leading-[18px] text-print"
              style={{ top: 4 + i * HOUR }}
            >
              {String(h).padStart(2, "0")}
            </span>
          ))}
        </div>
        {rows.map(({ c, y }, i) => item(c, { left: 56, top: 24 + y }, i + 1))}
        {untimed.length > 0 && (
          <div className="absolute left-14" style={{ top: Math.max(span + 48, floor) + 24 }}>
            <p className="mb-5 inline-block paper-2 px-2 font-mono text-[12px] leading-[18px] text-print">Без времени</p>
            <div className="relative">
              {untimed.map((c, i) => item(c, { left: 0, top: 32 + i * 220 }, i + 1))}
            </div>
          </div>
        )}
        {placed.length === 0 && untimed.length === 0 && (
          <div className="absolute top-40 left-16">
            <StickyNote id="wall-empty">{emptyNote}</StickyNote>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Предмет крупно: переезд в центр за 220 мс, стена под слоем --room 0.7 ---------- */

function FocusLayer({
  card,
  origin,
  onClose,
  maxWidth,
}: {
  card: EvidenceCardData;
  origin: DOMRect | null;
  onClose: () => void;
  maxWidth: number;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const base = EVIDENCE_ITEM_WIDTH[card.kind];
  const scale = Math.min(ZOOM_WIDTH, maxWidth) / base;

  useLayoutEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const el = itemRef.current;
    if (!el || !origin || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = el.getBoundingClientRect();
    const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
    const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
    const s = origin.width / target.width;
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
        { transform: "translate(0, 0) scale(1)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
    );
  }, [origin]);

  return (
    <div className="absolute inset-0 z-50" role="dialog" aria-label={card.title}>
      <button
        ref={closeRef}
        type="button"
        aria-label="Вернуть на стену"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-room/70 outline-none"
      />
      <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-auto p-6">
        {/* zoom, а не transform: раскладка знает настоящий размер и центрирует честно */}
        <div ref={itemRef} className="pointer-events-auto" style={{ zoom: scale }}>
          <EvidenceCard card={card} className="shadow-paper" />
        </div>
      </div>
    </div>
  );
}
