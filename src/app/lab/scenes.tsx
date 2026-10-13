"use client";

import { useEffect, useState } from "react";
import { cases } from "@/data";
import { buildNightView, DEFAULT_SETTINGS, type Flags, type Season } from "@/stores/game";
import { AgeWarning, ColdOpen, LockScreen, TitleScreen } from "@/components/title/title-screen";
import { NightScreen } from "@/components/play/night-screen";
import { DeskDemo, CASE_DATE } from "./desk-demo";
import type { LabWorld } from "./world";

/**
 * Собранные сцены для приёмки (раздел 14): на весь экран, без рамок и подписей витрины.
 * /lab?scene=desk — стол; protocol и wall — тот же стол с бланком или стеной в центре;
 * dialogue — допрос поверх стола (&step=line | choices | present); title, coldopen, warning, lock.
 * night — ночь между делами: &case=<id дела> (по умолчанию первое дело с ночью), &flags=имя,имя=значение
 * (флаги ранних дел), &cron=2,3 (задания zero, сработавшие ночью после прошлого дела), &bg=0 — без фона.
 */
export const LAB_SCENES = [
  ["title", "вход"],
  ["coldopen", "открытие"],
  ["desk", "стол"],
  ["protocol", "заключение"],
  ["wall", "стена"],
  ["dialogue", "допрос"],
  ["night", "ночь"],
] as const;

/** Параметры ночи в лаборатории (строки из адреса) */
export interface NightParams {
  caseId?: string;
  flags?: string;
  cron?: string;
  bg?: string;
}

/** «ratnikov_full,melnik=blackmail,ratnikov_trust=-1» → флаги */
function parseFlags(raw?: string): Flags {
  const out: Flags = {};
  for (const item of (raw ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const eq = item.indexOf("=");
    if (eq < 0) {
      out[item] = true;
      continue;
    }
    const v = item.slice(eq + 1);
    out[item.slice(0, eq)] = v === "true" ? true : v === "false" ? false : /^-?\d+$/.test(v) ? Number(v) : v;
  }
  return out;
}

/** Ночь перед делом на сезоне «как по порядку»: ранние дела раскрыты */
function NightLab({ params }: { params: NightParams }) {
  const def = cases.find((c) => c.id === params.caseId) ?? cases.find((c) => c.night);
  const [run, setRun] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(t);
  }, [run]);
  if (!def?.night) {
    return (
      <div className="flex h-dvh items-center justify-center bg-room">
        <p className="mono-12 text-ink-3">&gt; У дела нет ночи.</p>
      </div>
    );
  }
  const earlier = cases.filter((c) => c.order < def.order);
  const prev = earlier.sort((a, b) => b.order - a.order)[0];
  const jobs = (params.cron ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const at = def.night.beats.find((b) => "click" in b && b.cron)?.at ?? `${def.date.slice(0, 10)} 03:12:00`;
  const season: Pick<Season, "solved" | "caseFlags" | "casePatches"> = {
    solved: Object.fromEntries(earlier.map((c) => [c.id, {} as Season["solved"][string]])),
    caseFlags: {},
    casePatches: prev ? { [prev.id]: jobs.map((jobId) => ({ id: "cron.fire", params: { jobId, at } })) } : {},
  };
  const view = buildNightView(def, { season, flags: parseFlags(params.flags) });
  if (!view) return null;
  return (
    <NightScreen
      key={run}
      night={view}
      ready={ready}
      settings={DEFAULT_SETTINGS}
      background={params.bg === "0" ? null : undefined}
      onStart={() => {
        setReady(false);
        setRun((r) => r + 1);
      }}
    />
  );
}

export function SceneView({ scene, step, world, night }: { scene: string; step?: string; world: LabWorld | null; night?: NightParams }) {
  const [run, setRun] = useState(0);
  switch (scene) {
    case "night":
      return <NightLab params={night ?? {}} />;
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
