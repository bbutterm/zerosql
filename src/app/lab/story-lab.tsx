"use client";

import { useState } from "react";
import Link from "next/link";
import { cases } from "@/data";
import { backgroundChain, locationById } from "@/data/backgrounds";
import type { CaseDef } from "@/types/case";
import type { DialogueChoice, Scene } from "@/types/story";
import { DialoguePlayer } from "@/components/story/dialogue-player";
import { CHARACTERS, evidenceCard, sceneTitle } from "@/app/play/views";

/** Параметры сцены сезона в лаборатории (строки из адреса) */
export interface StoryParams {
  caseId?: string;
  sceneId?: string;
  /** "0" — без картины: чистая комната */
  bg?: string;
}

const href = (caseId: string, sceneId?: string, bg?: string) =>
  `/lab?scene=story&case=${caseId}${sceneId ? `&id=${sceneId}` : ""}${bg === "0" ? "&bg=0" : ""}`;

/**
 * Сцена сезона с её картиной: /lab?scene=story&case=<id дела>&id=<id сцены>[&bg=0].
 * Без id — список сцен дела с локациями и тем, какая картина покажется сейчас (своя или
 * запасная). Плеер один на весь показ: «дальше», выбор и верное предъявление ведут по
 * сценарию дела, смена локации видна перекрёстным затуханием, сцена без location остаётся
 * на картине прошлой. Улики — все улики дел до этого включительно.
 */
export function StoryLab({ params }: { params: StoryParams }) {
  const def = cases.find((c) => c.id === params.caseId) ?? cases[0];
  const start = params.sceneId ? def.scenes.find((s) => s.id === params.sceneId) : undefined;
  if (!start) return <SceneIndex def={def} bg={params.bg} missing={params.sceneId} />;
  return <StoryPlayer key={`${def.id}:${start.id}:${params.bg ?? ""}`} def={def} start={start} bg={params.bg} />;
}

function StoryPlayer({ def, start, bg }: { def: CaseDef; start: Scene; bg?: string }) {
  const [scene, setScene] = useState<Scene | null>(start);
  const go = (id: string | undefined) => setScene((id && def.scenes.find((s) => s.id === id)) || null);
  const evidence = cases
    .filter((c) => c.order <= def.order)
    .flatMap((c) => c.objectives.flatMap((o) => (o.evidence ? [evidenceCard(o.evidence)] : [])));

  if (!scene) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-room">
        <p className="mono-12 text-ink-3">&gt; Сцена окончена.</p>
        <Link href={href(def.id, undefined, bg)} className="ui-13 text-ink-2 hover:text-ink-1">
          К списку сцен
        </Link>
      </div>
    );
  }
  return (
    <DialoguePlayer
      key="story"
      variant="overlay"
      scene={scene}
      characters={CHARACTERS}
      evidence={evidence}
      locationLabel={sceneTitle(def, def.date) ?? ""}
      background={bg === "0" ? null : undefined}
      defaultMuted
      onFinish={() => go(scene.next)}
      onChoice={(choice: DialogueChoice) => window.setTimeout(() => go(choice.goto ?? scene.next), 400)}
      onPresent={() => window.setTimeout(() => go(scene.present?.success), 400)}
    />
  );
}

function SceneIndex({ def, bg, missing }: { def: CaseDef; bg?: string; missing?: string }) {
  return (
    <div className="min-h-dvh bg-room px-4 py-10 lg:px-16">
      <h1 className="ui-15 font-normal text-ink-1">Сцены дела с картинами</h1>
      <p className="mt-2 max-w-[72ch] ui-13 text-ink-3">
        Сцена открывается поверх пустой комнаты с картиной своей локации; без своей картины — с картиной семьи
        (src/data/locations.json). «Без картины» — чистая комната. Ночные сцены играет экран ночи (?scene=night).
        {missing ? ` Сцены «${missing}» в деле нет.` : ""}
      </p>
      <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-1" aria-label="Дела">
        {cases.map((c) => (
          <Link
            key={c.id}
            href={href(c.id, undefined, bg)}
            className={c.id === def.id ? "mono-12 text-ink-1" : "mono-12 text-ink-3 hover:text-ink-1"}
          >
            {c.id}
          </Link>
        ))}
      </nav>
      <table className="mt-6 w-full max-w-[960px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line ui-12 text-ink-3">
            <th className="py-2 pr-4 font-normal">Сцена</th>
            <th className="py-2 pr-4 font-normal">location</th>
            <th className="py-2 pr-4 font-normal">Цепочка картин</th>
            <th className="py-2 font-normal" />
          </tr>
        </thead>
        <tbody>
          {def.scenes.map((s) => (
            <tr key={s.id} className="border-b border-line align-baseline">
              <td className="py-2 pr-4 mono-12 text-ink-1">{s.id}</td>
              <td className="py-2 pr-4 ui-13 text-ink-2">
                {s.location ? (locationById.get(s.location)?.name ?? s.location) : "—"}
              </td>
              <td className="py-2 pr-4 mono-11 text-ink-3">{backgroundChain(s.location).join(" → ") || "прошлая сцена"}</td>
              <td className="py-2 whitespace-nowrap">
                <Link href={href(def.id, s.id)} className="ui-13 text-ink-2 hover:text-ink-1">
                  С картиной
                </Link>
                <Link href={href(def.id, s.id, "0")} className="ml-4 ui-13 text-ink-3 hover:text-ink-1">
                  Без картины
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
