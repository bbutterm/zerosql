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

/** Сцена на экране: номер нужен, чтобы отложенное предъявление относилось к своей сцене */
interface SceneInstance {
  id: string | null;
  n: number;
}

/**
 * Сюжетный слой над столом: сцена (диалог с выбором и предъявлением) и допрос «Наушник».
 * Сцена играет сама; стор узнаёт о конце сцены, выборе и предъявлении. Предъявление и
 * допрос можно отложить — тогда в строке окна остаётся «вернуться».
 *
 * Поток сцен: пока новая сцена сменяет прошлую сразу (выбор, «дальше», предъявление), на экране
 * тот же плеер — комната не гаснет и не проявляется заново, начатый вход доигрывает, картина
 * меняется перекрёстным затуханием с того места, где она была; сцена без location остаётся на
 * картине прошлой. Лог и стол каждая сцена начинает заново (logScope="scene"). Сцена после стола,
 * допроса или отложенного предъявления — новый плеер: она открывается заново.
 */
export function useSceneLayer(items: EvidenceCardData[], locationLabel?: string): { overlay: ReactNode; resume: ReactNode } {
  const stage = useGameView(stageView);
  const interro = useGameView(interrogationView);
  const settings = useGame((s) => s.settings);
  const profile = useGame((s) => s.profile);
  const busy = useGame((s) => s.busy);
  const pins = useGame((s) => s.session?.pins);

  // Номер сцены: новый каждый раз, когда на сцену выходит другая сцена
  const sceneId = stage?.scene.id ?? null;
  const [inst, setInst] = useState<SceneInstance>({ id: null, n: 0 });
  const [deferred, setDeferred] = useState<number | null>(null);
  if (sceneId !== inst.id) setInst({ id: sceneId, n: inst.n + 1 });
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
        // Возврат к отложенной сцене — новый плеер, снова вход: стол гаснет, комната проявляется
        onClick={() => setDeferred(null)}
        testId="resume-scene"
      />
    );
  } else if (stage) {
    // Без ключа сцены: плеер живёт весь поток и сам переходит к следующей сцене
    overlay = (
      <DialoguePlayer
        variant="overlay"
        scene={stage.scene}
        characters={CHARACTERS}
        evidence={items}
        playerName={profile.playerName || undefined}
        locationLabel={locationLabel ?? ""}
        logScope="scene"
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
