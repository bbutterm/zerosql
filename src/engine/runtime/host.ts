/**
 * Ядро рантайма: байты мира + открытое дело. Живёт в Web Worker
 * (runtime/worker.ts) или в том же потоке (внутрипроцессный EngineClient).
 * Все операции приходят как HostRequest и отвечают сериализуемым значением.
 */
import type { CaseDef, SecretDef } from "@/types/case";
import { loadSqlJs, setSqlWasmUrl } from "../database";
import { exportWorld, generateWorld } from "../world/generate";
import { WORLD_SEED } from "../world/facts";
import type { HostRequest } from "./protocol";
import { CaseSession } from "./session";
import type { CaseOpened, CaseSaveState, EngineProgress, EngineProgressStage, WorldInfo } from "./types";
import { worldCacheKey, type WorldCache } from "./world-cache";

/** Строки экрана загрузки — голос системы: статус сначала, точка в конце */
const PROGRESS_TEXT: Record<EngineProgressStage, string> = {
  engine: "Запуск ядра архива.",
  cache: "Поиск локальной копии архива.",
  generate: "Копии нет. Сборка архива.",
  store: "Сохранение копии архива.",
  ready: "Архив готов.",
};

export interface EngineHostOptions {
  cache: WorldCache;
}

export class EngineHost {
  private readonly cache: WorldCache;
  private bytes: Uint8Array | null = null;
  private secrets: readonly SecretDef[] = [];
  private session: CaseSession | null = null;

  constructor(options: EngineHostOptions) {
    this.cache = options.cache;
  }

  async init(
    seed: string | number = WORLD_SEED,
    secrets: readonly SecretDef[] = [],
    wasmUrl?: string,
    onProgress?: (progress: EngineProgress) => void
  ): Promise<WorldInfo> {
    const t0 = performance.now();
    const step = (stage: EngineProgressStage) => onProgress?.({ stage, text: PROGRESS_TEXT[stage] });
    this.secrets = secrets;
    if (wasmUrl) setSqlWasmUrl(wasmUrl);
    step("engine");
    await loadSqlJs();
    step("cache");
    const key = worldCacheKey(seed);
    let bytes = await this.cache.get(key);
    const fromCache = bytes !== null;
    if (!bytes) {
      step("generate");
      const db = await generateWorld(seed);
      try {
        bytes = exportWorld(db);
      } finally {
        db.close();
      }
      step("store");
      await this.cache.put(key, bytes);
    }
    this.bytes = bytes;
    step("ready");
    return { fromCache, key, bytes: bytes.length, ms: Math.round(performance.now() - t0) };
  }

  async open(caseDef: CaseDef, state: CaseSaveState): Promise<CaseOpened> {
    if (!this.bytes) throw new Error("Ядро не запущено: сначала init.");
    const t0 = performance.now();
    this.session?.close();
    this.session = null;
    const session = await CaseSession.open(this.bytes, caseDef, state, this.secrets);
    this.session = session;
    return {
      caseId: caseDef.id,
      clock: session.clock,
      schema: session.schema(),
      foreignKeys: session.foreignKeys(),
      playerViews: session.playerViews,
      replayed: session.replayed,
      ms: Math.round(performance.now() - t0),
    };
  }

  private requireSession(): CaseSession {
    if (!this.session) throw new Error("Дело не открыто: сначала openCase.");
    return this.session;
  }

  close(): void {
    this.session?.close();
    this.session = null;
  }

  /** Одна операция по сообщению клиента */
  async handle(request: HostRequest, onProgress?: (progress: EngineProgress) => void): Promise<unknown> {
    switch (request.op) {
      case "init":
        return this.init(request.seed, request.secrets, request.wasmUrl, onProgress);
      case "open":
        return this.open(request.caseDef, request.state);
      case "run":
        return this.requireSession().run(request.sql, request.context);
      case "stopped":
        return this.requireSession().recordStopped(request.sql, request.context, request.reason, request.elapsedMs, request.limitMs);
      case "patch":
        return this.requireSession().applyPatch(request.id, request.params);
      case "clock":
        return this.requireSession().setClock(request.clock);
      case "checksum":
        return this.requireSession().checksum();
      case "close":
        this.close();
        return null;
    }
  }
}
