"use client";

import { useEffect, useState, type TransitionEvent } from "react";
import { cn } from "@/lib/utils";
import { backgroundChain, backgroundUrl } from "@/data/backgrounds";
import { isMediaMissing, markMediaMissing, useMediaCacheVersion } from "./media-cache";

/** Перекрёстное затухание при смене локации внутри потока сцен, мс (UI §7.14: 160–400) */
export const BACKDROP_CROSSFADE_MS = 320;

/** Картины, которые в этой вкладке уже загружены и раскодированы: повторный показ без ожидания */
const decoded = new Set<string>();

/**
 * Файлы цепочки картин локации (своя, затем запасные — src/data/backgrounds.ts) без тех, что уже
 * дали 404. Первый — тот, что сейчас грузится или показан; пусто — показывать нечего.
 */
export function backgroundCandidates(
  location: string | null | undefined,
  basePath = "/backgrounds",
  isMissing: (url: string) => boolean = isMediaMissing
): string[] {
  return backgroundChain(location)
    .map((id) => backgroundUrl(id, basePath))
    .filter((url) => !isMissing(url));
}

export interface BackgroundState {
  /** Загруженная картина (своя или запасная); null — картины нет или она ещё грузится */
  url: string | null;
  /** Кандидат ещё грузится: есть картина или нет, пока неизвестно */
  pending: boolean;
}

/**
 * Картина локации по цепочке запасных. Кандидат грузится отдельным Image, поэтому в кадр картина
 * попадает уже раскодированной: без полупустого кадра и без «битой» картинки. 404 уходит в
 * media-cache (файл больше не запрашивается), и хук переходит к следующему кандидату.
 */
export function useBackground(location: string | null | undefined, basePath = "/backgrounds"): BackgroundState {
  useMediaCacheVersion();
  const [, setVersion] = useState(0);
  const candidate = backgroundCandidates(location, basePath)[0] ?? null;
  const ready = candidate !== null && decoded.has(candidate);

  useEffect(() => {
    if (candidate === null || decoded.has(candidate)) return;
    let alive = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const done = () => {
        decoded.add(candidate);
        if (alive) setVersion((v) => v + 1);
      };
      img.decode().then(done, done);
    };
    img.onerror = () => markMediaMissing(candidate);
    img.src = candidate;
    return () => {
      alive = false;
    };
  }, [candidate]);

  return { url: ready ? candidate : null, pending: candidate !== null && !ready };
}

/**
 * Комната поверх картины там, где на ней стоит текст: за логом сцены и на всём кадре ночи между
 * делами. Текст ≥ 4,5:1 (UI §13, п. 7) и над самым светлым местом картины: на первой
 * (`basement_b0_03_evening`) в самой светлой точке кадра ink-3 держит 4,7:1, ink-2 — 6,1:1
 * (на 0.85 было 4,46:1 у лампы под потолком)
 */
export const ROOM_UNDER_TEXT = "bg-room/87";

/** Слой картины в кадре */
export interface BackdropLayer {
  url: string;
  /** Пришла после первого кадра — проявляется сама; первую вносит вход сцены */
  enter: boolean;
}

/** Стопка картин фона. Чистые переходы ниже — их проверяет src/__tests__/content/backgrounds.test.ts */
export interface BackdropStack {
  /** Картины снизу вверх в порядке прихода; порядок в DOM не меняется, слои только добавляются и уходят */
  layers: BackdropLayer[];
  /** Картина, которая должна стоять в кадре; null — чистая комната */
  top: string | null;
}

/** Слой виден: цель и всё под ней (до конца её проявления); выше цели и над чистой комнатой — гаснет */
export function backdropShown(stack: BackdropStack, i: number): boolean {
  return stack.top !== null && i <= stack.layers.findIndex((l) => l.url === stack.top);
}

/** Новая цель кадра: новая картина проявляется поверх, знакомая остаётся на месте, а то, что выше, гаснет */
export function backdropRetarget(stack: BackdropStack, url: string | null, reduced: boolean): BackdropStack {
  if (reduced) return { layers: url ? [{ url, enter: false }] : [], top: url };
  if (url === null || stack.layers.some((l) => l.url === url)) return { ...stack, top: url };
  return { layers: [...stack.layers, { url, enter: true }], top: url };
}

/**
 * Переход слоя закончился (opacity — вычисленная непрозрачность картины): погасший слой уходит,
 * а под проявившейся целью убирается то, чего уже не видно. Слой посреди перехода (цель сменилась,
 * пока событие шло) не трогается.
 */
export function backdropSettled(stack: BackdropStack, url: string, opacity: string): BackdropStack {
  const i = stack.layers.findIndex((l) => l.url === url);
  if (i < 0) return stack;
  if (!backdropShown(stack, i)) return opacity === "0" ? { ...stack, layers: stack.layers.filter((_, j) => j !== i) } : stack;
  return url === stack.top && opacity === "1" && i > 0 ? { ...stack, layers: stack.layers.slice(i) } : stack;
}

export interface SceneBackdropProps {
  /** id локации (src/data/locations.json); null — чистая комната */
  location: string | null;
  /** Меньше движения: смена картины без затухания */
  reduced?: boolean;
  basePath?: string;
}

/**
 * Фон сцены диалога (UI §7.14): картина локации на весь экран (`object-fit: cover`), поверх —
 * сплошная комната. Зона портрета (x < --zone, 640 при 1440) — `--room` 0.55, за колонкой лога —
 * ROOM_UNDER_TEXT (0.87). Телефон: над портретом (верхние 42 %) 0.72 — там же строка управления
 * ink-3, под ним, за логом, ROOM_UNDER_TEXT. Градиентов, виньеток и пара нет. Нет картины — ни
 * одного слоя: чистая `--room` родителя.
 *
 * Фон живёт весь поток сцен (плеер не пересоздаётся, пока сцены сменяют друг друга): первую
 * картину вносит вход сцены, смену локации ведёт сам — перекрёстное затухание 320 мс: новая
 * картина проявляется поверх прошлой, а если новой нет, прошлая гаснет в комнату. Непрозрачность
 * слоя — CSS-переход, поэтому смена посреди затухания продолжает его с того же места, а не
 * начинает с полной картины. Пока новая картина грузится, на экране остаётся прошлая.
 */
export function SceneBackdrop({ location, reduced = false, basePath = "/backgrounds" }: SceneBackdropProps) {
  const target = useBackground(location, basePath);
  const [stack, setStack] = useState<BackdropStack>(() => ({
    layers: target.url ? [{ url: target.url, enter: false }] : [],
    top: target.url,
  }));

  // Цель определилась (загрузилась или её нет совсем) и отличается от кадра — переход
  if (!target.pending && target.url !== stack.top) setStack(backdropRetarget(stack, target.url, reduced));

  const settle = (url: string) => (e: TransitionEvent<HTMLImageElement>) => {
    if (e.propertyName !== "opacity") return;
    const opacity = getComputedStyle(e.currentTarget).opacity;
    setStack((s) => backdropSettled(s, url, opacity));
  };

  return (
    <div
      aria-hidden
      data-testid="scene-backdrop"
      data-background={stack.top ?? ""}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {stack.layers.map((layer, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- картина локации из public/
        <img
          key={layer.url}
          src={layer.url}
          alt=""
          draggable={false}
          className={cn(
            "absolute inset-0 size-full object-cover",
            backdropShown(stack, i) ? "opacity-100" : "opacity-0",
            layer.enter && !reduced && "starting:opacity-0"
          )}
          style={reduced ? undefined : { transition: `opacity ${BACKDROP_CROSSFADE_MS}ms var(--ease-in-out)` }}
          onTransitionEnd={settle(layer.url)}
        />
      ))}
      {stack.layers.length > 0 && (
        <>
          <div className="absolute inset-x-0 top-0 h-[42%] bg-room/72 @3xl:inset-y-0 @3xl:right-auto @3xl:h-auto @3xl:w-(--zone) @3xl:bg-room/55" />
          <div className={cn("absolute inset-x-0 top-[42%] bottom-0 @3xl:top-0 @3xl:left-(--zone)", ROOM_UNDER_TEXT)} />
        </>
      )}
    </div>
  );
}
