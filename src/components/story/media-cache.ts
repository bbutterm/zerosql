"use client";

import { useSyncExternalStore } from "react";

/**
 * Общая память об отсутствующих медиафайлах (портреты, озвучка).
 *
 * Файлы портретов и голоса появляются постепенно; пока их нет, UI должен
 * тихо показывать заглушку и не повторять запрос. Кеш живёт в памяти
 * вкладки: один 404 — и этот URL больше не запрашивается до перезагрузки.
 * Реализован как внешний стор, чтобы все экземпляры компонентов узнавали
 * о пропаже файла одновременно.
 */

const missing = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

export function isMediaMissing(url: string): boolean {
  return missing.has(url);
}

export function markMediaMissing(url: string): void {
  if (missing.has(url)) return;
  missing.add(url);
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => version;
const getServerSnapshot = () => 0;

/** Версия кеша: компонент перерисуется, когда какой-то файл окажется пропавшим */
export function useMediaCacheVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const portraitUrl = (characterId: string, emotion: string, base = "/portraits") =>
  `${base}/${characterId}/${emotion}.webp`;

export const voiceUrl = (lineId: string, base = "/voice") => `${base}/${lineId}.mp3`;
