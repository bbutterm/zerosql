"use client";

import { useRef, useState } from "react";
import type {
  DeskCenterView,
  DeskPanelId,
  EvidenceCardData,
  ObjectiveView,
  ProtocolCheck,
  ProtocolMessage,
} from "@/types/ui";
import type { QueryResult } from "@/types/database";
import type { DialogueChoice } from "@/types/story";
import { SqlTerminal, type SqlEditorHandle } from "@/components/desk/sql-terminal";
import { ResultsGrid, type ResultObjectiveNote } from "@/components/desk/results-grid";
import { SchemaPanel } from "@/components/desk/schema-panel";
import { DeskLayout, type StatusMessage } from "@/components/desk/desk-layout";
import { markResultError } from "@/components/desk/sql-error-token";
import { ObjectiveList } from "@/components/case/objective-list";
import { EvidenceBoard } from "@/components/case/evidence-board";
import { EvidenceWall } from "@/components/case/evidence-wall";
import { HandbookPanel } from "@/components/case/handbook-panel";
import { ProtocolForm } from "@/components/case/protocol-form";
import { DialoguePlayer } from "@/components/story/dialogue-player";
import { MessengerNote } from "@/components/kit/messenger";
import { lowerFirst } from "@/components/kit/typo";
import { CHARACTERS, EVIDENCE, HANDBOOK, HANDBOOK_NOTES, IDLE_LINES, OBJECTIVES, PROTOCOL, PROTOCOL_ANSWERS, SCENES } from "./mock";
import { ANSWER_SQL, SAMPLE_SQL, TABLE_NOTES, UNLOCKED_TABLES, type LabWorld } from "./world";

export const CASE_DATE = "14.12.2026";

/* ---------- Задания: выполнение по настоящему результату ---------- */

export function useObjectives(initial: ObjectiveView[] = OBJECTIVES) {
  const [objectives, setObjectives] = useState<ObjectiveView[]>(initial);
  const reveal = (id: string) =>
    setObjectives((list) =>
      list.map((o) =>
        o.id === id ? { ...o, hintsRevealed: Math.min((o.hintsRevealed ?? 0) + 1, o.hints?.length ?? 0) } : o
      )
    );
  const completeCurrent = () =>
    setObjectives((list) => {
      const i = list.findIndex((o) => o.state === "active" && !o.optional);
      if (i < 0) return list;
      return list.map((o, j) =>
        j === i
          ? { ...o, state: "done" as const, feedback: undefined, outcome: "Вошёл Рябов, в 01:52. Его выхода в журнале нет." }
          : j === i + 1 && o.state === "locked"
            ? { ...o, state: "active" as const }
            : o
      );
    });
  const setFeedback = (feedback: string | undefined) =>
    setObjectives((list) => {
      const i = list.findIndex((o) => o.state === "active" && !o.optional);
      return i < 0 ? list : list.map((o, j) => (j === i ? { ...o, feedback } : o));
    });
  return { objectives, reveal, completeCurrent, setFeedback };
}

/** Номер текущего основного задания (с 1) */
function currentNumber(list: ObjectiveView[]): number | null {
  const main = list.filter((o) => !o.optional);
  const i = main.findIndex((o) => o.state === "active");
  return i < 0 ? null : i + 1;
}

/**
 * Проверка задания 3 по результату, а не по тексту запроса: в результате должен быть ровно
 * проход Рябова в 01:52 (эталон — ANSWER_SQL). Иначе — объяснение, почему не засчитано.
 */
function judge(world: LabWorld, sql: string, result: QueryResult): { done: true } | { done: false; feedback: string } | null {
  if (result.error || !/access_log/i.test(sql)) return null;
  const ref = world.run(ANSWER_SQL);
  const refIds = new Set(ref.rows.map((r) => r[ref.columns.indexOf("id")]));
  const idCol = result.columns.findIndex((c) => c === "id");
  if (idCol < 0) return { done: false, feedback: "В результате нет столбца `id`: по нему видно, какие это проходы." };
  const ids = new Set(result.rows.map((r) => r[idCol]));
  const hit = [...refIds].every((id) => ids.has(id));
  if (hit && ids.size === refIds.size) return { done: true };
  if (ids.has(1059)) return { done: false, feedback: "В результате есть вход самого Лапина. Нужны те, кто вошёл позже 01:47." };
  if (hit) return { done: false, feedback: `Лишние строки: ${ids.size - refIds.size}. Нужны только те, у кого нет выхода.` };
  return { done: false, feedback: "Нужного прохода в результате нет." };
}

/* ---------- Заключение: сверка пачкой ---------- */

export function useProtocol(
  initial: Record<string, string | null>,
  initialConfirmed: string[],
  initialChecks: ProtocolCheck[] = []
) {
  const [values, setValues] = useState(initial);
  const [confirmed, setConfirmed] = useState<string[]>(initialConfirmed);
  const [checks, setChecks] = useState<ProtocolCheck[]>(initialChecks);
  const last = initialChecks[initialChecks.length - 1];
  const [message, setMessage] = useState<ProtocolMessage | null>(
    last
      ? {
          tone: last.matched === last.total ? "success" : "partial",
          text:
            last.matched === last.total
              ? `Совпало ${last.matched} из ${last.total}. Пачка подтверждена.`
              : `Совпало ${last.matched} из ${last.total}. Какие — не сообщается.`,
        }
      : null
  );

  const submit = () => {
    const pending = Object.keys(PROTOCOL_ANSWERS).filter((id) => !confirmed.includes(id) && values[id]);
    const right = pending.filter((id) => values[id] === PROTOCOL_ANSWERS[id]);
    const check = { attempt: checks.length + 1, matched: right.length, total: pending.length, at: `02:${44 + checks.length}` };
    setChecks((c) => [...c, check]);
    // Пачка подтверждается только целиком
    if (right.length === pending.length) {
      const next = [...confirmed, ...right];
      setConfirmed(next);
      setMessage({
        tone: "success",
        text:
          next.length === Object.keys(PROTOCOL_ANSWERS).length
            ? `Заключение принято. ${check.at}`
            : `Совпало ${right.length} из ${pending.length}. Пачка подтверждена.`,
      });
    } else {
      setMessage({ tone: "partial", text: `Совпало ${right.length} из ${pending.length}. Какие — не сообщается.` });
    }
  };

  return {
    values,
    confirmed,
    checks,
    message,
    submit,
    onChange: (id: string, v: string | null) => setValues((s) => ({ ...s, [id]: v })),
  };
}

/* ---------- Приобщение: строка результата становится распечаткой ---------- */

const hhmm = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? v.slice(11, 16) : undefined);

function cardFromRow(result: QueryResult, r: number, sql: string, queryNo: number): EvidenceCardData {
  const cols = result.columns;
  const row = result.rows[r];
  const get = (name: string) => {
    const i = cols.indexOf(name);
    return i < 0 ? undefined : row[i];
  };
  const who = get("full_name") ?? get("badge_id");
  const whoCol = get("full_name") !== undefined ? "full_name" : "badge_id";
  const gate = get("gate");
  const time = hhmm(get("entered_at")) ?? hhmm(get("started_at")) ?? hhmm(get("measured_at"));
  const exit = get("exited_at");
  const id = get("id");

  if (who !== undefined) {
    const columns = ["id", whoCol, "gate"].filter((c) => cols.includes(c));
    const values = columns.map((c) => get(c) as string | number | null);
    if (time) {
      columns.push("entered");
      values.push(time);
    }
    return {
      id: `pin-${queryNo}-${r}`,
      kind: "record",
      title: `${String(who)}${gate ? `, ${String(gate)}` : ""}`,
      text: `Вход ${time ?? "—"}, выход ${exit === null ? "не отмечен" : (hhmm(exit) ?? "—")}.`,
      sourceQuery: sql,
      source: "access_log",
      queryNo,
      foundAt: "02:44",
      at: time,
      excerpt: { columns, rows: [values], mark: [0, columns.indexOf(whoCol)] },
      isNew: true,
    };
  }
  const take = cols.slice(0, 3);
  return {
    id: `pin-${queryNo}-${r}`,
    kind: "record",
    title: id !== undefined ? `Запись ${String(id)}` : `Строка ${r + 1}`,
    text: `Строка ${r + 1} результата запроса № ${queryNo}.`,
    sourceQuery: sql,
    queryNo,
    foundAt: "02:44",
    at: time,
    excerpt: { columns: take, rows: [take.map((c) => get(c) as string | number | null)] },
    isNew: true,
  };
}

/* ---------- Стол целиком: настоящее зеркало, настоящие запросы ---------- */

export interface DeskDemoProps {
  world: LabWorld;
  initialCenter?: DeskCenterView;
  initialPanel?: DeskPanelId;
  /** Сообщение Соколовой в окне мессенджера */
  withMessage?: boolean;
  /** Сцена допроса поверх стола (для ?scene=dialogue) */
  dialogue?: { scene: keyof typeof SCENES; startAt: number | "end" } | null;
  className?: string;
}

export function DeskDemo({
  world,
  initialCenter = "query",
  initialPanel = "tasks",
  withMessage = false,
  dialogue = null,
  className,
}: DeskDemoProps) {
  const editor = useRef<SqlEditorHandle>(null);
  const [sql, setSql] = useState(SAMPLE_SQL);
  const [lastSql, setLastSql] = useState(SAMPLE_SQL);
  const [result, setResult] = useState<QueryResult | null>(() => world.run(SAMPLE_SQL));
  const [left, setLeft] = useState(6);
  const [pinned, setPinned] = useState<number[]>([]);
  const [cards, setCards] = useState<EvidenceCardData[]>(EVIDENCE.map((e) => ({ ...e, isNew: false })));
  const [panel, setPanel] = useState<DeskPanelId>(initialPanel);
  const [center, setCenter] = useState<DeskCenterView>(initialCenter);
  const [unseen, setUnseen] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [wallFocus, setWallFocus] = useState<string | null>(null);
  const [note, setNote] = useState<ResultObjectiveNote | null>(null);
  const [queryNo, setQueryNo] = useState(18);
  const [message, setMessage] = useState(withMessage);
  const [scene, setScene] = useState(dialogue);
  const { objectives, reveal, completeCurrent, setFeedback } = useObjectives();
  const protocol = useProtocol(
    { "p-who": "ryabov", "p-when": "0152", "p-signer": null, "p-cause": "mining" },
    ["p-who", "p-when"],
    [{ attempt: 1, matched: 2, total: 2, at: "02:41" }]
  );
  const counter = useRef(0);
  const say = (text: string) => setStatus({ id: ++counter.current, text });
  const current = currentNumber(objectives);
  const currentObjective = objectives.filter((o) => !o.optional).find((o) => o.state === "active");

  const run = () => {
    const text = sql.trim();
    if (!text) return;
    const res = world.run(text);
    setResult(res);
    setLastSql(text);
    setPinned([]);
    markResultError(editor.current, res);
    // Квоту тратит только выполненный запрос: ошибка и отказ её не списывают
    if (!res.error) {
      setLeft((n) => Math.max(0, n - 1));
      setQueryNo((n) => n + 1);
    }
    const verdict = current ? judge(world, text, res) : null;
    if (!verdict || !current) {
      setNote(null);
      return;
    }
    if (verdict.done) {
      completeCurrent();
      setNote({ text: `задание ${current} выполнено`, tone: "done" });
      say(`Задание ${current} выполнено.`);
    } else {
      setFeedback(verdict.feedback);
      setNote({ text: `задание ${current} не засчитано`, tone: "miss" });
    }
  };

  const pin = (row: number) => {
    if (!result || pinned.includes(row)) return;
    const card = cardFromRow(result, row, lastSql, queryNo);
    setPinned((p) => [...p, row]);
    window.setTimeout(() => {
      setCards((c) => [...c.map((x) => ({ ...x, isNew: false })), card]);
      setUnseen(true);
      say(`Материалы: приобщено «${card.title}».`);
    }, 420);
  };

  return (
    <DeskLayout
      className={className}
      caseCode="Дело 01"
      caseTitle="Тёплая вода"
      dateTime={`${CASE_DATE} 02:44`}
      panel={panel}
      onPanelChange={(p) => {
        setPanel(p);
        if (p === "evidence") setUnseen(false);
      }}
      centerView={center}
      onCenterViewChange={setCenter}
      badges={{ evidence: cards.length }}
      badgeAlerts={unseen ? ["evidence"] : []}
      statusMessage={status}
      currentObjective={
        currentObjective && current
          ? {
              number: current,
              text: currentObjective.text.replace(/`/g, ""),
              note: currentObjective.feedback ? `Не засчитано: ${lowerFirst(currentObjective.feedback.replace(/`/g, ""))}` : undefined,
            }
          : null
      }
      onMenuAction={(a) => {
        if (a === "save") say("Сеанс сохранён.");
        if (a === "clear") setSql("");
        if (a === "run") run();
      }}
      schema={
        <SchemaPanel
          className="h-full"
          tables={world.schema}
          foreignKeys={world.foreignKeys}
          unlockedTables={UNLOCKED_TABLES}
          tableNotes={TABLE_NOTES}
          newTables={["calls"]}
          defaultExpanded={["access_log"]}
          onInsert={(t) => editor.current?.insert(t)}
        />
      }
      terminal={
        <SqlTerminal
          className="h-full"
          handleRef={editor}
          value={sql}
          onChange={setSql}
          onRun={run}
          schema={world.schema.filter((t) => UNLOCKED_TABLES.includes(t.name))}
          budget={{ left, total: 8 }}
        />
      }
      results={
        <ResultsGrid
          className="h-full"
          result={result}
          sql={lastSql}
          budgeted
          onPinRow={pin}
          pinnedRows={pinned}
          idleLines={IDLE_LINES}
          objectiveNote={note}
          onInsertValue={(v) => editor.current?.insert(v)}
          onSuggest={(name, wrong) => {
            if (wrong) setSql((s) => s.replace(new RegExp(`\\b${wrong}\\b`, "g"), name));
          }}
        />
      }
      wall={<EvidenceWall cards={cards} focusId={wallFocus} onFocusChange={setWallFocus} />}
      panels={{
        tasks: <ObjectiveList objectives={objectives} characters={CHARACTERS} onRevealHint={reveal} />,
        evidence: (
          <EvidenceBoard
            cards={cards}
            onCardClick={(id) => {
              setWallFocus(id);
              setCenter("wall");
            }}
          />
        ),
        reference: (
          <HandbookPanel entries={HANDBOOK} marginNotes={HANDBOOK_NOTES} onInsert={(s) => editor.current?.insert(s)} />
        ),
        protocol: (
          <ProtocolForm
            questions={PROTOCOL}
            values={protocol.values}
            onChange={protocol.onChange}
            onSubmit={() => {
              protocol.submit();
              say("Сверка выполнена.");
            }}
            confirmedIds={protocol.confirmed}
            checks={protocol.checks}
            message={protocol.message}
            caseLabel="Дело: «Тёплая вода»"
            docNumber="№ 01/14-12"
            date={CASE_DATE}
            caseNo="01"
            batchSize={2}
            onFinish={() => say("Дело 01 закрыто.")}
          />
        ),
      }}
      overlay={
        <>
          {message && (
            <div className="absolute right-4 bottom-10 z-30 max-lg:hidden">
              <MessengerNote
                sender="Соколова В. А."
                time="02:43"
                more={1}
                text="Ноль, Рябов не сдавал карту. Я подняла журнал поста — там пусто с 23:58. Посмотри, кто ещё был у шлюза."
                onClose={() => setMessage(false)}
                onOpen={() => setMessage(false)}
              />
            </div>
          )}
          {scene && (
            <DialoguePlayer
              key="dialogue"
              variant="overlay"
              scene={SCENES[scene.scene]}
              characters={CHARACTERS}
              evidence={cards}
              startAt={scene.startAt}
              onChoice={(choice: DialogueChoice) => {
                if (choice.goto) window.setTimeout(() => setScene({ scene: choice.goto as keyof typeof SCENES, startAt: 0 }), 500);
                else window.setTimeout(() => setScene(null), 900);
              }}
              onPresent={(id) => {
                const s = SCENES[scene.scene];
                const next = s.present?.correct.includes(id) ? s.present.success : s.present?.failure;
                if (next) window.setTimeout(() => setScene({ scene: next as keyof typeof SCENES, startAt: 0 }), 500);
              }}
              onFinish={() => {
                const next = SCENES[scene.scene].next;
                setScene(next ? { scene: next as keyof typeof SCENES, startAt: 0 } : null);
              }}
            />
          )}
        </>
      }
    />
  );
}
