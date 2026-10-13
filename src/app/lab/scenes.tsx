"use client";

import { useState } from "react";
import { AgeWarning, ColdOpen, LockScreen, TitleScreen } from "@/components/title/title-screen";
import { DeskDemo, CASE_DATE } from "./desk-demo";
import type { LabWorld } from "./world";

/**
 * Собранные сцены для приёмки (раздел 14): на весь экран, без рамок и подписей витрины.
 * /lab?scene=desk — стол; protocol и wall — тот же стол с бланком или стеной в центре;
 * dialogue — допрос поверх стола (&step=line | choices | present); title, coldopen, warning, lock.
 */
export const LAB_SCENES = [
  ["title", "вход"],
  ["coldopen", "открытие"],
  ["desk", "стол"],
  ["protocol", "заключение"],
  ["wall", "стена"],
  ["dialogue", "допрос"],
] as const;

export function SceneView({ scene, step, world }: { scene: string; step?: string; world: LabWorld | null }) {
  const [run, setRun] = useState(0);
  switch (scene) {
    case "title":
      return (
        <TitleScreen
          lastLogin={`${CASE_DATE} 02:44`}
          continueGame={{ onClick: () => undefined, meta: "Дело 01, «Тёплая вода»" }}
          newGame={{ onClick: () => undefined }}
          archive={{ onClick: () => undefined }}
          settings={{ onClick: () => undefined }}
        />
      );
    case "coldopen":
      return <ColdOpen key={run} onContinue={() => setRun((r) => r + 1)} />;
    case "warning":
      return <AgeWarning />;
    case "lock":
      return <LockScreen burnIn="аналитик-1@зеркало   только чтение   сеансов: 2   14.12.2026 01:47" />;
  }

  if (!world) return <Connecting />;
  switch (scene) {
    case "protocol":
      return <DeskDemo world={world} initialCenter="protocol" />;
    case "wall":
      return <DeskDemo world={world} initialCenter="wall" />;
    case "dialogue":
      return (
        <DeskDemo
          world={world}
          dialogue={
            step === "choices"
              ? { scene: "interrogation", startAt: "end" }
              : step === "present"
                ? { scene: "present", startAt: "end" }
                : { scene: "interrogation", startAt: 1 }
          }
        />
      );
    case "desk":
    default:
      return <DeskDemo world={world} withMessage={step === "message"} />;
  }
}

/** Загрузка — текстом, как в терминале */
export function Connecting() {
  return (
    <div className="flex h-dvh items-center justify-center bg-room">
      <p className="mono-12 text-ink-3">&gt; Зеркало подключается…</p>
    </div>
  );
}
