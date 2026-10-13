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

/** Шкала внутри событий ночи, px на час; пустые часы до и после сжимаются в разрыв */
const HOUR = 320;
const GAP = 104;
const TAPE = 48;
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

/** Отрезок ленты: подробная шкала в часы событий или разрыв на пустые часы */
interface Segment {
  kind: "scale" | "gap";
  /** Минуты ночи (от 18:00) */
  from: number;
  to: number;
  x: number;
  width: number;
}

/**
 * Лента ночи: часы с событиями — 320 px на час (видно четверти часа), пустые часы до и после —
 * один разрыв 56 px со знаком «//». Плотная ночь 01:30–02:50 не теряется на восьмичасовой ленте.
 */
function timeline(startMin: number, endMin: number, events: number[]) {
  const inRange = events.filter((t) => t >= startMin && t <= endMin);
  const lo = inRange.length ? Math.max(startMin, Math.floor(Math.min(...inRange) / 60) * 60) : startMin;
  const hiRaw = inRange.length ? Math.ceil((Math.max(...inRange) + 1) / 60) * 60 : endMin;
  const hi = Math.min(endMin, Math.max(hiRaw, lo + 60));
  const segs: Segment[] = [];
  let x = 0;
  if (lo > startMin) {
    segs.push({ kind: "gap", from: startMin, to: lo, x, width: GAP });
    x += GAP;
  }
  const w = ((hi - lo) / 60) * HOUR;
  segs.push({ kind: "scale", from: lo, to: hi, x, width: w });
  x += w;
  if (hi < endMin) {
    segs.push({ kind: "gap", from: hi, to: endMin, x, width: GAP });
    x += GAP;
  }
  const at = (t: number): number | null => {
    if (t < startMin - 1 || t > endMin + 1) return null;
    const s = segs.find((g) => t >= g.from && t <= g.to) ?? segs[segs.length - 1];
    return s.x + ((t - s.from) / Math.max(1, s.to - s.from)) * s.width;
  };
  return { segs, span: x, at };
}

const hhmm = (nightMin: number) => `${String(Math.floor((nightMin / 60 + 18) % 24)).padStart(2, "0")}:00`;

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
  const startMin = nightMinutes(from) ?? 240;
  const endMin = startMin + (hours.length - 1) * 60;
  const line = timeline(
    startMin,
    endMin,
    cards.map((c) => nightMinutes(c.at)).filter((t): t is number => t !== null)
  );
  const span = line.span;
  const pos = (at?: string) => {
    const t = nightMinutes(at);
    return t === null ? null : line.at(t);
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

  // Стена открывается так, что середина событий ночи — посередине видимой части, лента — по центру высоты
  const medianX = placed.length ? [...placed].sort((a, b) => a.x - b.x)[Math.floor((placed.length - 1) / 2)].x : undefined;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || vertical) return;
    if (medianX !== undefined) el.scrollLeft = Math.max(0, PAD + medianX + 120 - el.clientWidth / 2);
    el.scrollTop = Math.max(0, tapeY + TAPE / 2 - el.clientHeight / 2);
  }, [medianX, tapeY, vertical, size.w]);

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
        // Наведение и фокус поднимают лист наверх стопки — без «подъёма» и тени
        className="absolute z-(--z) hover:z-[900] focus-within:z-[900]"
        style={{ ...style, "--z": z ?? 1, transform: `rotate(${rot}deg)` } as React.CSSProperties}
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
        <VerticalWall segments={line.segs} span={span} placed={timed} untimed={untimed} item={item} emptyNote={emptyNote} />
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
            <NightTape segments={line.segs} left={PAD - 24} top={tapeY} width={span + 48} />

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

/* ---------- Лента ночи: тракторная бумага принтера, часы и разрывы ---------- */

/** Поля перфорации 12 px: круглые отверстия ⌀4 с шагом 24, пунктир линии отрыва */
const FEED_HOLES = {
  backgroundImage:
    "radial-gradient(circle at 12px 6px, var(--wall) 2px, transparent 2.4px), radial-gradient(circle at 12px 42px, var(--wall) 2px, transparent 2.4px)",
  backgroundSize: "24px 48px",
  backgroundRepeat: "repeat-x",
} as const;
const DOTTED = {
  backgroundImage: "linear-gradient(90deg, var(--print-3) 50%, transparent 50%)",
  backgroundSize: "4px 1px",
} as const;

function NightTape({ segments, left, top, width }: { segments: Segment[]; left: number; top: number; width: number }) {
  const marks: Array<{ x: number; hour: boolean; label?: string; end?: boolean }> = [];
  for (const s of segments) {
    if (s.kind === "gap") {
      marks.push({ x: s.x, hour: true, label: hhmm(s.from) });
      continue;
    }
    for (let t = s.from; t <= s.to; t += 15) {
      const x = s.x + ((t - s.from) / 60) * HOUR;
      const hour = t % 60 === 0;
      marks.push({ x, hour, label: hour ? hhmm(t) : undefined });
    }
  }
  // Конец ленты подписан: «06:00»
  const last = segments[segments.length - 1];
  if (last) marks.push({ x: last.x + last.width, hour: true, label: hhmm(last.to), end: true });
  // Повторы на стыках отрезков убираются
  const seen = new Set<number>();
  const unique = marks.filter((m) => (seen.has(Math.round(m.x)) ? false : (seen.add(Math.round(m.x)), true)));
  return (
    <div className="absolute" style={{ left, top, width, height: TAPE }}>
      <div className="absolute inset-0 paper-2 shadow-pinned" />
      <div aria-hidden className="absolute inset-0" style={FEED_HOLES} />
      <span aria-hidden className="absolute inset-x-0 top-3 h-px" style={DOTTED} />
      <span aria-hidden className="absolute inset-x-0 bottom-3 h-px" style={DOTTED} />
      {unique.map((m) => (
        <span
          key={m.x}
          aria-hidden
          className={cn("absolute top-3 w-px bg-print-3", m.hour ? "h-[7px]" : "h-1")}
          style={{ left: 24 + m.x }}
        />
      ))}
      {unique
        .filter((m) => m.label)
        .map((m) => (
          <span
            key={`l${m.x}`}
            className="absolute top-[20px] font-mono text-[12px] leading-[14px] text-print toner"
            // Подпись справа от деления; у конца ленты — слева, чтобы не уйти за край бумаги
            style={m.end ? { left: 24 + m.x - 4, transform: "translateX(-100%)" } : { left: 24 + m.x + 4 }}
          >
            {m.label}
          </span>
        ))}
      {segments
        .filter((s) => s.kind === "gap")
        .map((s) => (
          // Разрыв шкалы: пустые часы сжаты
          <svg
            key={`g${s.x}`}
            aria-hidden
            viewBox="0 0 12 24"
            className="absolute top-3 h-6 w-3 text-print-2"
            style={{ left: 24 + s.x + s.width / 2 - 6 }}
          >
            <path d="M2 22 L6 2 M6 22 L10 2" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        ))}
      <Tape id="tape-start" className="top-4 -left-7" style={{ transform: "rotate(-84deg)" }} />
      <Tape id="tape-end" className="top-4 -right-7" style={{ transform: "rotate(92deg)" }} />
    </div>
  );
}

/* ---------- Мобильный: лента вертикальная слева, предметы справа в одну колонку ---------- */

function VerticalWall({
  segments,
  span,
  placed,
  untimed,
  item,
  emptyNote,
}: {
  segments: Segment[];
  span: number;
  placed: Array<{ c: EvidenceCardData; x: number }>;
  untimed: EvidenceCardData[];
  item: (c: EvidenceCardData, style: React.CSSProperties, z?: number) => React.ReactNode;
  emptyNote: string;
}) {
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
  const labels: Array<{ y: number; text: string }> = [];
  for (const s of segments) {
    if (s.kind === "gap") labels.push({ y: s.x, text: hhmm(s.from).slice(0, 2) });
    else for (let t = s.from; t <= s.to; t += 60) labels.push({ y: s.x + ((t - s.from) / 60) * HOUR, text: hhmm(t).slice(0, 2) });
  }
  const firstY = rows[0]?.y;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && firstY !== undefined) ref.current.scrollTop = Math.max(0, firstY - 24);
  }, [firstY]);
  return (
    <div ref={ref} className="absolute inset-0 isolate overflow-y-auto">
      <div className="relative" style={{ height }}>
        <div className="absolute top-6 left-3 w-8 paper-2 shadow-pinned" style={{ height: span + 8 }}>
          {labels.map((l, i) => (
            <span
              key={i}
              className="absolute left-0 w-full text-center font-mono text-[12px] leading-[14px] text-print"
              style={{ top: 4 + l.y + 3 }}
            >
              {l.text}
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
