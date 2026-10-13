"use client";

import { useEffect, useState, type CSSProperties } from "react";
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

interface View {
  /** Картина сверху; null — чистая комната */
  url: string | null;
  /** Прошлая картина: лежит под новой, пока та проявляется, или гаснет сама, если новой нет */
  under: string | null;
  fading: boolean;
}

export interface SceneBackdropProps {
  /** id локации (src/data/locations.json); null — чистая комната */
  location: string | null;
  /**
   * Сцена продолжает поток: что было на экране до неё (id локации или null — комната).
   * От этой картины идёт перекрёстное затухание. undefined — сцена открывается заново.
   */
  from?: string | null;
  /** Меньше движения: смена картины без затухания */
  reduced?: boolean;
  basePath?: string;
}

const fade = (out: boolean): CSSProperties => ({
  animation: `zs-fade-in ${BACKDROP_CROSSFADE_MS}ms var(--ease-in-out) ${out ? "reverse " : ""}both`,
});

/**
 * Фон сцены диалога (UI §7.14): картина локации на весь экран (`object-fit: cover`), поверх —
 * сплошная комната. Зона портрета (x < --zone, 640 при 1440) — `--room` 0.55, за колонкой лога —
 * 0.85: ink-3 держит 4,5:1 на любой картине по ТЗ (§13). Телефон: над портретом (верхние 42 %)
 * 0.72 — там же строка управления ink-3, под ним, за логом, 0.85. Градиентов, виньеток и пара нет.
 * Нет картины — ни одного слоя: чистая `--room` родителя.
 *
 * Новая сцена открывается проявлением комнаты (его ведёт родитель). Смена локации внутри потока —
 * перекрёстное затухание 320 мс: новая картина проявляется поверх прошлой; если новой нет, прошлая
 * гаснет в комнату. Пока новая картина грузится, на экране остаётся прошлая.
 */
export function SceneBackdrop({ location, from, reduced = false, basePath = "/backgrounds" }: SceneBackdropProps) {
  const target = useBackground(location, basePath);
  const origin = useBackground(from ?? null, basePath);
  const [view, setView] = useState<View>(() => ({
    url: from === undefined ? target.url : origin.url,
    under: null,
    fading: false,
  }));

  // Цель определилась (загрузилась или её нет совсем) и отличается от кадра — переход
  if (!target.pending && target.url !== view.url) {
    setView({ url: target.url, under: reduced ? null : view.url, fading: !reduced });
  }
  const settle = () => setView((v) => (v.fading ? { ...v, under: null, fading: false } : v));
  const painted = view.url !== null || view.under !== null;

  return (
    <div
      aria-hidden
      data-testid="scene-backdrop"
      data-background={view.url ?? ""}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {view.under && (
        // eslint-disable-next-line @next/next/no-img-element -- картина локации из public/
        <img
          key={view.under}
          src={view.under}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
          style={view.fading && view.url === null ? fade(true) : undefined}
          onAnimationEnd={settle}
        />
      )}
      {view.url && (
        // eslint-disable-next-line @next/next/no-img-element -- картина локации из public/
        <img
          key={view.url}
          src={view.url}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
          style={view.fading ? fade(false) : undefined}
          onAnimationEnd={settle}
        />
      )}
      {painted && (
        <>
          <div className="absolute inset-x-0 top-0 h-[42%] bg-room/72 @3xl:inset-y-0 @3xl:right-auto @3xl:h-auto @3xl:w-(--zone) @3xl:bg-room/55" />
          <div className="absolute inset-x-0 top-[42%] bottom-0 bg-room/85 @3xl:top-0 @3xl:left-(--zone)" />
        </>
      )}
    </div>
  );
}
