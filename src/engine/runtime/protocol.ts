/**
 * Сообщения между EngineClient и ядром (Web Worker или тот же поток).
 * Всё сериализуемо structured clone.
 */
import type { CaseDef, SecretDef } from "@/types/case";
import type { StoryPatchParams } from "../world/horizon";
import type { CaseSaveState, EngineProgress, RunContext } from "./types";

export type HostRequest =
  | { op: "init"; seed?: string | number; secrets?: readonly SecretDef[]; wasmUrl?: string }
  | { op: "open"; caseDef: CaseDef; state: CaseSaveState }
  | { op: "run"; sql: string; context: RunContext }
  | {
      op: "stopped";
      sql: string;
      context: RunContext;
      reason: "timeout" | "crash";
      elapsedMs: number;
      limitMs: number;
    }
  | { op: "patch"; id: string; params?: StoryPatchParams }
  | { op: "clock"; clock: string }
  | { op: "checksum" }
  | { op: "close" };

/** Сообщение воркеру: номер и запрос (у patch свой id — патча, поэтому запрос вложен) */
export interface WorkerInbound {
  id: number;
  request: HostRequest;
}

/** Сообщение от воркера: прогресс загрузки или ответ на запрос */
export type WorkerOutbound =
  | { type: "progress"; id: number; progress: EngineProgress }
  | { type: "result"; id: number; ok: true; value: unknown }
  | { type: "result"; id: number; ok: false; error: string; fatal: boolean };
