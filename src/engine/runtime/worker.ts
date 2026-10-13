/**
 * Модульный Web Worker ядра (разд. 6.14, п. 1): sql.js, мир из IndexedDB
 * (или генерация), база дела и вся работа по запросу игрока. Главный поток
 * только отправляет SQL и получает Evaluation. Запрос дольше 3 с клиент
 * обрывает terminate(): у sql.js нет прерывания.
 *
 * Создаётся клиентом: new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }).
 */
import { EngineHost } from "./host";
import type { WorkerInbound, WorkerOutbound } from "./protocol";
import { isFatalError } from "./session";
import { idbWorldCache, indexedDbAvailable, memoryWorldCache } from "./world-cache";

interface WorkerScope {
  onmessage: ((event: { data: WorkerInbound }) => void) | null;
  postMessage(message: WorkerOutbound): void;
}

const scope = globalThis as unknown as WorkerScope;
const host = new EngineHost({ cache: indexedDbAvailable() ? idbWorldCache() : memoryWorldCache });

// Операции идут строго по одной: клиент и так не шлёт следующую раньше ответа
let queue: Promise<void> = Promise.resolve();

scope.onmessage = (event) => {
  const { id, request } = event.data;
  queue = queue.then(async () => {
    try {
      const value = await host.handle(request, (progress) => scope.postMessage({ type: "progress", id, progress }));
      scope.postMessage({ type: "result", id, ok: true, value });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      scope.postMessage({ type: "result", id, ok: false, error, fatal: isFatalError(e) });
    }
  });
};
