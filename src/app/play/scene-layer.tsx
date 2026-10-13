"use client";

import { useState, type ReactNode } from "react";
import type { EvidenceCardData } from "@/types/ui";
import { gameStore, interrogationView, stageView, useGame, useGameView } from "@/stores/game";
import { DialoguePlayer } from "@/components/story/dialogue-player";
import { InterrogationPanel } from "@/components/play/interrogation";
import { CHARACTERS } from "./views";

const SPEED: Record<string, number> = { slow: 22, normal: 38, fast: 70, instant: 2000 };

/** Полоса в строке окна: отложенная сцена или допрос */
function Resume({ label, onClick, testId }: { label: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="ui-13 text-sodium hover:underline hover:underline-offset-3">
      {label}
    </button>
  );
}

/** Экземпляр сцены на экране: плеер пересоздаётся на каждую сцену */
interface SceneInstance {
  id: string | null;
  n: number;
  /** Картина сцены: её location или картина прошлой сцены потока */
  place: string | null;
  /** Сцена сменила сцену без паузы: комната уже на экране с этой картиной */
  from?: { background: string | null };
}

/**
 * Сюжетный слой над столом: сцена (диалог с выбором и предъявлением) и допрос «Наушник».
 * Сцена играет сама; стор узнаёт о конце сцены, выборе и предъявлении. Предъявление и
 * допрос можно отложить — тогда в строке окна остаётся «вернуться».
 *
 * Поток сцен: если новая сцена сменяет прошлую сразу (выбор, «дальше», предъявление), комната
 * не гаснет и не проявляется заново, а картина меняется перекрёстным затуханием; сцена без
 * location остаётся на картине прошлой. Сцена после стола или допроса открывается заново.
 */
export function useSceneLayer(items: EvidenceCardData[], locationLabel?: string): { overlay: ReactNode; resume: ReactNode } {
  const stage = useGameView(stageView);
  const interro = useGameView(interrogationView);
  const settings = useGame((s) => s.settings);
  const profile = useGame((s) => s.profile);
  const busy = useGame((s) => s.busy);
  const pins = useGame((s) => s.session?.pins);

  // Экземпляр сцены: новый каждый раз, когда на сцену выходит другая сцена
  const sceneId = stage?.scene.id ?? null;
  const [inst, setInst] = useState<SceneInstance>({ id: null, n: 0, place: null });
  const [deferred, setDeferred] = useState<number | null>(null);
  if (sceneId !== inst.id) {
    const continuing = sceneId !== null && inst.id !== null && deferred !== inst.n;
    setInst({
      id: sceneId,
      n: inst.n + 1,
      place: stage?.scene.location ?? (continuing ? inst.place : null),
      from: continuing ? { background: inst.place } : undefined,
    });
  }
  const [away, setAway] = useState<string | null>(null);

  const st = () => gameStore.getState();
  const ensureEnd = async () => {
    if (!st().session?.stage?.awaiting) await st().skipScene();
  };

  let overlay: ReactNode = null;
  let resume: ReactNode = null;

  if (stage && deferred === inst.n) {
    resume = (
      <Resume
        label="Сцена ждёт: вернуться"
        onClick={() => {
          // Возврат к отложенной сцене — снова вход: стол гаснет, комната проявляется
          setDeferred(null);
          setInst((i) => ({ ...i, from: undefined }));
        }}
        testId="resume-scene"
      />
    );
  } else if (stage) {
    overlay = (
      <DialoguePlayer
        key={`${stage.scene.id}:${inst.n}`}
        variant="overlay"
        scene={stage.scene}
        characters={CHARACTERS}
        evidence={items}
        playerName={profile.playerName || undefined}
        locationLabel={locationLabel ?? ""}
        continueFrom={inst.from}
        reducedMotion={settings.reducedMotion}
        startAt={stage.awaiting ? "end" : stage.lineIndex}
        defaultMuted={settings.voiceVolume === 0}
        defaultAutoAdvance={settings.autoAdvance}
        voiceVolume={settings.voiceVolume}
        charsPerSecond={settings.typewriter ? SPEED[settings.textSpeed] : SPEED.instant}
        onFinish={() => void st().skipScene()}
        onChoice={(choice) => void ensureEnd().then(() => st().choose(choice.id))}
        onPresent={(id) =>
          void ensureEnd().then(() =>
            st().presentInScene(pins?.some((p) => p.id === id) ? { cardIds: [id] } : { evidenceIds: [id] })
          )
        }
        onCancelPresent={() => setDeferred(inst.n)}
      />
    );
  } else if (interro && away === interro.sceneId) {
    resume = <Resume label="Допрос: вернуться" onClick={() => setAway(null)} testId="resume-interrogation" />;
  } else if (interro) {
    const idef = interro.def;
    const mode = idef.mode ?? "standard";
    const total = mode === "standard" || mode === "unwinnable" ? (idef.patience ?? 3) : null;
    overlay = (
      <InterrogationPanel
        suspect={CHARACTERS[idef.suspect]}
        interrogator={CHARACTERS[idef.interrogator ?? "dasha"]}
        emotion={interro.emotion}
        patience={total !== null && interro.patience !== null ? { left: interro.patience, total } : null}
        modeNote={mode === "talk" ? "беседа: одно предъявление" : mode === "ally" ? "без шкалы терпения" : undefined}
        points={interro.points.map((p) => ({
          line: p.line,
          text: p.text,
          broken: p.broken,
          pressed: p.pressed,
          lie: p.lie,
          canPress: Boolean(p.press),
          canPresent: Boolean(p.present),
          ...(p.present?.requireAll ? { needsAll: p.present.correct.length + (p.present.cards?.length ?? 0) } : {}),
        }))}
        items={items}
        lieHighlight={settings.lieHighlight || profile.mode === "novice"}
        busy={busy}
        liveQuery={interro.liveQuery}
        onPress={(line) => void st().pressStatement(line)}
        onPresent={(line, ids) => {
          const isPin = (id: string) => Boolean(pins?.some((p) => p.id === id));
          void st().presentToSuspect(line, { cardIds: ids.filter(isPin), evidenceIds: ids.filter((id) => !isPin(id)) });
        }}
        onLeave={() => setAway(interro.sceneId)}
      />
    );
  }

  return { overlay, resume };
}
