"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/stores/game-store";
import { AgeWarning, ColdOpen, TitleScreen, type TitleMenuAction } from "./title-screen";

/**
 * Запуск игры (раздел 7.1–7.2): предупреждение 18+ (только первый раз), холодное открытие
 * (раз за сеанс вкладки, пропускается любой клавишей), затем окно входа «Зеркала».
 * Прогресс берётся из стора: есть сохранение — «Продолжить сеанс», и дата последнего запроса.
 */

const AGE_KEY = "zerosql-age-ok";
const COLD_KEY = "zerosql-cold-open";

type Phase = "boot" | "warning" | "cold" | "login";

function read(storage: () => Storage, key: string): boolean {
  try {
    return storage().getItem(key) === "1";
  } catch {
    return false;
  }
}
function mark(storage: () => Storage, key: string) {
  try {
    storage().setItem(key, "1");
  } catch {
    // приватный режим: экран просто покажется снова
  }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface TitleFlowCase {
  id: string;
  /** «Дело 03, «Тени порта — Деньги»» */
  label: string;
}

export function TitleFlow({
  cases,
  gameHref = "/game",
  journalHref = "/game?journal=1",
}: {
  /** Дела по порядку: подпись «Дело NN, «…»» под полями входа */
  cases: TitleFlowCase[];
  gameHref?: string;
  journalHref?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("boot");
  const currentId = useGameStore((s) => s.currentMissionId);
  const history = useGameStore((s) => s.queryHistory);
  const completed = useGameStore((s) => s.completedMissions);

  // Хранилище браузера читается только на клиенте — до этого экран пуст (комната)
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!read(local, AGE_KEY)) setPhase("warning");
      else if (!read(session, COLD_KEY)) setPhase("cold");
      else setPhase("login");
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const hasSession = Boolean(currentId) || history.length > 0 || completed.length > 0;
  const last = history[history.length - 1];
  const current = cases.find((c) => c.id === currentId);

  const continueGame: TitleMenuAction | undefined = hasSession
    ? { href: gameHref, meta: current?.label }
    : undefined;
  const newGame: TitleMenuAction = {
    onClick: () => {
      useGameStore.persist.clearStorage();
      useGameStore.setState({
        currentMissionId: null,
        completedMissions: [],
        objectiveStatus: {},
        hintsRevealed: {},
        queryHistory: [],
        feedbackMessages: [],
        missionCompleteNarrative: null,
        _lastResult: null,
      });
      try {
        window.localStorage.removeItem("zerosql-briefed");
      } catch {
        // нечего чистить
      }
      router.push(gameHref);
    },
  };

  if (phase === "boot") return <div className="h-dvh w-full bg-room" />;
  if (phase === "warning") {
    return (
      <AgeWarning
        onAccept={() => {
          mark(local, AGE_KEY);
          setPhase("cold");
        }}
      />
    );
  }
  if (phase === "cold") {
    return (
      <ColdOpen
        onContinue={() => {
          mark(session, COLD_KEY);
          setPhase("login");
        }}
      />
    );
  }
  return (
    <TitleScreen
      continueGame={continueGame}
      newGame={newGame}
      archive={{ href: journalHref }}
      lastLogin={last ? stamp(last.timestamp) : undefined}
    />
  );
}
