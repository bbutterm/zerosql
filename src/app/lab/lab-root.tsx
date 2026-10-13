"use client";

import { useEffect, useState } from "react";
import { Catalogue } from "./catalogue";
import { Connecting, SceneView, type NightParams } from "./scenes";
import { labWorld, type LabWorld } from "./world";

/** Лаборатория: витрина компонентов или собранная сцена (?scene=…) на одном зеркале */
export function LabRoot({ scene, step, night }: { scene?: string; step?: string; night?: NightParams }) {
  const [world, setWorld] = useState<LabWorld | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    labWorld()
      .then((w) => alive && setWorld(w))
      .catch((e: unknown) => alive && setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-dvh items-center justify-center bg-room px-4">
        <p className="max-w-[72ch] mono-12 text-ink-3">
          &gt; Зеркало не подключено. <span className="text-alarm">Ошибка:</span> {failed}
        </p>
      </div>
    );
  }
  if (scene) return <SceneView scene={scene} step={step} world={world} night={night} />;
  if (!world) return <Connecting />;
  return <Catalogue world={world} />;
}
