"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { isMediaMissing, markMediaMissing, voiceUrl } from "./media-cache";

/**
 * Озвучка одной реплики: public/voice/<lineId>.mp3 (общий кеш пропавших файлов,
 * media-cache.ts). Общий хук диалога и ночи между делами: один элемент audio
 * на компонент, смена реплики останавливает прошлую, громкость — из настроек
 * (settings.voiceVolume). Нет файла — состояние none, текст идёт без звука.
 */

/** idle — ещё не играла; playing — звучит; done — доиграла; none — файла нет или автоплей запрещён */
export type VoiceState = "idle" | "playing" | "done" | "none";

export interface LineAudioOptions {
  /** false — не играть (выключен звук, конец сцены) */
  enabled?: boolean;
  basePath?: string;
  /** Громкость 0…1 (settings.voiceVolume) */
  volume?: number;
  /** Реплика доиграла до конца */
  onEnded?: (lineId: string) => void;
}

export interface LineAudio {
  /** Состояние озвучки и реплика, к которой оно относится */
  voice: { lineId: string; state: VoiceState };
  /** Остановить голос: сразу или с гашением за fadeMs */
  stop: (fadeMs?: number) => void;
  /** Скрытая вкладка: пауза и продолжение с того же места */
  pause: () => void;
  resume: () => void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));

export function useLineAudio(lineId: string | undefined, { enabled = true, basePath = "/voice", volume = 1, onEnded }: LineAudioOptions = {}): LineAudio {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  /** Голос остановлен вручную: resume() его не возвращает */
  const stoppedRef = useRef(false);
  const [voice, setVoice] = useState<{ lineId: string; state: VoiceState }>({ lineId: "", state: "idle" });
  const level = clamp01(volume);

  const ended = useEffectEvent((id: string) => {
    setVoice({ lineId: id, state: "done" });
    onEnded?.(id);
  });
  const currentLevel = useEffectEvent(() => level);

  const clearFade = () => {
    if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
    fadeRef.current = null;
  };

  useEffect(() => {
    if (!lineId || !enabled) return;
    const url = voiceUrl(lineId, basePath);
    if (isMediaMissing(url)) return;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    let cancelled = false;
    if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
    fadeRef.current = null;
    stoppedRef.current = false;

    audio.preload = "auto";
    audio.src = url;
    audio.volume = currentLevel();
    audio.onplaying = () => !cancelled && setVoice({ lineId, state: "playing" });
    audio.onended = () => !cancelled && ended(lineId);
    audio.onerror = () => {
      markMediaMissing(url);
      if (!cancelled) setVoice({ lineId, state: "none" });
    };
    audio.play().catch((err: unknown) => {
      // NotAllowedError — автоплей заблокирован до первого клика; файл при этом есть
      if (!cancelled && err instanceof DOMException && err.name === "NotAllowedError") {
        setVoice({ lineId, state: "none" });
      }
    });

    return () => {
      cancelled = true;
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    };
  }, [lineId, enabled, basePath]);

  // Громкость из настроек меняется на лету
  useEffect(() => {
    if (audioRef.current && fadeRef.current === null) audioRef.current.volume = level;
  }, [level]);

  useEffect(
    () => () => {
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
      audioRef.current?.pause();
    },
    []
  );

  const stop = (fadeMs = 0) => {
    const audio = audioRef.current;
    if (!audio) return;
    stoppedRef.current = true;
    clearFade();
    if (fadeMs <= 0 || audio.paused) {
      audio.pause();
      return;
    }
    const from = audio.volume;
    const t0 = Date.now();
    fadeRef.current = window.setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / fadeMs);
      audio.volume = clamp01(from * (1 - k));
      if (k >= 1) {
        clearFade();
        audio.pause();
      }
    }, 16);
  };

  const pause = () => audioRef.current?.pause();
  const resume = () => {
    const audio = audioRef.current;
    if (audio && audio.paused && !audio.ended && !stoppedRef.current && fadeRef.current === null && audio.currentTime > 0) {
      void audio.play().catch(() => {});
    }
  };

  return { voice, stop, pause, resume };
}
