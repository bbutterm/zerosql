import type { CaseDef, CaseObjective, SecretDef } from "@/types/case";
import type { WorkerLike } from "@/engine";
import { EngineHost } from "@/engine/runtime/host";
import type { HostRequest, WorkerInbound, WorkerOutbound } from "@/engine/runtime/protocol";
import { memoryWorldCache } from "@/engine/runtime/world-cache";

/**
 * Дело-фикстура рантайма на настоящем мире «Полыньи»: чтение (persons, staff),
 * запись (statements — в белом списке), свои представления, query_log и
 * больничные госпитализации для сюжетного патча c07.admission.
 */

const objective = (o: Pick<CaseObjective, "id" | "order" | "validation" | "solution"> & Partial<CaseObjective>): CaseObjective => ({
  task: `Задача ${o.id}`,
  hints: [{ text: "Наводка" }, { text: "Понятие" }, { text: "Шаблон" }],
  success: `Готово: ${o.id}`,
  ...o,
});

export const RUNTIME_CASE: CaseDef = {
  id: "case-90-runtime",
  order: 90,
  act: 1,
  code: "Дело № 90",
  title: "Проверка ядра",
  subtitle: "Фикстура рантайма",
  date: "2026-12-24 09:00",
  minutesPerQuery: 1,
  clock: { cap: "2026-12-24 13:00" },
  difficulty: "medium",
  concepts: ["select"],
  tables: ["persons", "staff", "statements", "query_log", "hospital_admissions"],
  writableTables: ["statements"],
  allowViews: true,
  briefing: "Проверка рантайма ядра на настоящем мире.",
  introScene: "intro",
  objectives: [
    objective({
      id: "o1",
      order: 1,
      validation: { type: "column_values", columns: ["full_name"], values: ["Вальц Ирина Петровна"], mode: "superset" },
      solution: "SELECT id, full_name FROM persons WHERE last_name = 'Вальц'",
      evidence: { id: "ev.c90.valts", title: "Вальц", text: "Две Вальц в ПБД", kind: "record" },
    }),
    objective({
      id: "o2",
      order: 2,
      validation: {
        type: "table_state",
        query: "SELECT COUNT(*) FROM statements WHERE case_id = 'rt-01'",
        rule: { type: "cell_value", value: 1 },
      },
      solution:
        "INSERT INTO statements (case_id, person_id, person_text, taken_at, taken_by, typed_by, text, status) VALUES ('rt-01', 4127, 'Вальц И. П.', game_now(), 'nol', 'nol', 'Проверка ядра', 'черновик')",
    }),
    objective({
      id: "o3",
      order: 3,
      validation: {
        type: "view_match",
        view: "rt_valts",
        referenceQuery: "SELECT id, full_name FROM persons WHERE last_name = 'Вальц'",
      },
      solution: "CREATE VIEW rt_valts AS SELECT id, full_name FROM persons WHERE last_name = 'Вальц'",
    }),
    objective({
      id: "opt",
      order: 99,
      optional: true,
      validation: { type: "cell_value", value: 9000, columns: ["id"] },
      solution: "SELECT id, last_name FROM persons WHERE id = 9000",
    }),
  ],
  protocol: {
    statements: ["Под логином i.valts работала {who}."],
    blanks: [
      {
        id: "who",
        kind: "person",
        options: ["Вальц Ирина Петровна", "Вальц Валентина Сергеевна", "Лыков Антон Сергеевич"],
        answer: "Вальц Ирина Петровна",
      },
    ],
    successScene: "outro",
  },
  scenes: [],
};

export const RUNTIME_SECRETS: SecretDef[] = [
  {
    id: "secret.runtime",
    title: "Тот самый Сазонов",
    text: "Фикстура тайника.",
    trigger: { type: "cell_value", value: "Сазонов Пётр Ильич" },
    tables: ["persons"],
  },
];

/**
 * Поддельный воркер: настоящее ядро (EngineHost) в том же потоке за
 * интерфейсом Worker. Запрос с HANG никогда не отвечает (бесконечный запрос),
 * запрос с CRASH роняет «воркер» (onerror).
 */
export class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  terminated = false;
  readonly received: HostRequest[] = [];
  private readonly host = new EngineHost({ cache: memoryWorldCache });
  private queue: Promise<void> = Promise.resolve();

  postMessage(message: unknown): void {
    const { id, request } = structuredClone(message) as WorkerInbound;
    this.received.push(request);
    if (request.op === "run" && request.sql.includes("HANG")) return;
    if (request.op === "run" && request.sql.includes("CRASH")) {
      setTimeout(() => this.onerror?.({ message: "RuntimeError: memory access out of bounds" }), 5);
      return;
    }
    this.queue = this.queue.then(async () => {
      if (this.terminated) return;
      try {
        const value = await this.host.handle(request, (progress) => this.emit({ type: "progress", id, progress }));
        this.emit({ type: "result", id, ok: true, value: structuredClone(value) });
      } catch (e) {
        this.emit({ type: "result", id, ok: false, error: e instanceof Error ? e.message : String(e), fatal: false });
      }
    });
  }

  private emit(message: WorkerOutbound): void {
    setTimeout(() => {
      if (!this.terminated) this.onmessage?.({ data: message });
    }, 0);
  }

  terminate(): void {
    this.terminated = true;
    this.host.close();
  }
}
