"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Mission } from "@/types/mission";
import type { QueryResult } from "@/types/database";
import type { HandbookEntry } from "@/types/case";
import type { CharacterDef, Scene } from "@/types/story";
import type { DeskCenterView, DeskPanelId, EvidenceCardData, ObjectiveView } from "@/types/ui";
import { useGameStore } from "@/stores/game-store";
import { missions } from "@/data/missions";
import { DeskLayout, type DeskMenuAction, type DeskMenuGroup, type StatusMessage } from "@/components/desk/desk-layout";
import { SchemaPanel } from "@/components/desk/schema-panel";
import { SqlTerminal, type SqlEditorHandle } from "@/components/desk/sql-terminal";
import { ResultsGrid, type ResultObjectiveNote } from "@/components/desk/results-grid";
import { markResultError } from "@/components/desk/sql-error-token";
import { ObjectiveList } from "@/components/case/objective-list";
import { EvidenceBoard } from "@/components/case/evidence-board";
import { EvidenceWall } from "@/components/case/evidence-wall";
import { HandbookPanel } from "@/components/case/handbook-panel";
import { DialoguePlayer } from "@/components/story/dialogue-player";
import { CaseJournal, type CaseJournalEntry } from "@/components/title/case-journal";
import { LockScreen } from "@/components/title/title-screen";

/**
 * Стол игры: АИС «Зеркало» поверх стора. Дела пока прежние (src/data/missions): ориентировка
 * и итог дела идут сценой с куратором, задания — блокнотом, строки результата приобщаются
 * к материалам этой смены. Компоненты стола ничего не знают о сторе — только показывают.
 */

const CURATOR: CharacterDef = {
  id: "morozov",
  name: "Морозов",
  shortName: "Морозов",
  shortNameAcc: "Морозова",
  role: "капитан полиции, куратор отдела",
  accent: "#000000",
  bio: "",
  emotions: ["neutral"],
  dossierNote: "Любит, когда отвечают цифрами.",
};
const CHARACTERS: Record<string, CharacterDef> = { [CURATOR.id]: CURATOR };

const TABLE_NOTES: Record<string, string> = {
  suspects: "Подозреваемые: имя, кличка, адрес, статус.",
  locations: "Места: тип, район, адрес, владелец.",
  crimes: "Преступления: тип, даты, место, статус, тяжесть.",
  evidence: "Вещественные доказательства по делам.",
  crime_suspects: "Кто проходит по какому делу и в какой роли.",
  communications: "Перехваченные переговоры.",
  transactions: "Финансовые операции.",
  org_members: "Состав группировки: ранг, отдел, с какого года.",
};

const HANDBOOK: HandbookEntry[] = [
  {
    id: "select",
    title: "Выборка: SELECT … FROM",
    summary: "`SELECT` перечисляет нужные столбцы, `FROM` называет таблицу. Звёздочка — все столбцы.",
    syntax: "SELECT столбцы FROM таблица;",
    example: "SELECT name, alias, status\nFROM suspects;",
  },
  {
    id: "where",
    title: "Отбор строк: WHERE",
    summary: "`WHERE` оставляет только строки, для которых условие истинно.",
    syntax: "SELECT столбцы FROM таблица\nWHERE условие;",
    example: "SELECT * FROM suspects\nWHERE status = 'в розыске';",
    pitfalls: ["Текст пишется в одинарных кавычках: `'в розыске'`. Двойные кавычки в SQLite — имена."],
  },
  {
    id: "like",
    title: "Часть строки: LIKE",
    summary: "`LIKE` сравнивает с образцом: `%` — любое число знаков, `_` — ровно один.",
    syntax: "WHERE столбец LIKE 'образец'",
    example: "SELECT name, address FROM suspects\nWHERE address LIKE '%Портов%';",
  },
  {
    id: "null",
    title: "Пустые значения: IS NULL",
    summary: "`NULL` — это «неизвестно». Он не равен ничему, даже самому себе, поэтому `= NULL` не находит ничего.",
    syntax: "WHERE столбец IS NULL",
    example: "SELECT name FROM suspects\nWHERE alias IS NULL;",
    pitfalls: ["Противоположное условие — `IS NOT NULL`."],
  },
  {
    id: "order",
    title: "Сортировка: ORDER BY",
    summary: "`ORDER BY` упорядочивает результат, `DESC` — по убыванию, `LIMIT` обрезает.",
    syntax: "ORDER BY столбец [DESC]\nLIMIT n",
    example: "SELECT type, severity FROM crimes\nORDER BY severity DESC\nLIMIT 5;",
  },
  {
    id: "group",
    title: "Подсчёт: COUNT и GROUP BY",
    summary: "`COUNT(*)` считает строки, `GROUP BY` — отдельно для каждого значения столбца.",
    syntax: "SELECT столбец, COUNT(*)\nFROM таблица\nGROUP BY столбец;",
    example: "SELECT status, COUNT(*)\nFROM crimes\nGROUP BY status;",
  },
  {
    id: "join",
    title: "Соединение таблиц: JOIN",
    summary: "`JOIN` склеивает строки двух таблиц по общему ключу.",
    syntax: "FROM a JOIN b ON b.ключ = a.ключ",
    example: "SELECT s.name, cs.role\nFROM crime_suspects cs\nJOIN suspects s ON s.id = cs.suspect_id;",
  },
];

const MENUS: DeskMenuGroup[] = [
  {
    label: "Файл",
    items: [
      { action: "save", label: "Сохранить сеанс" },
      { action: "journal", label: "Журнал дел" },
      { action: "reset", label: "Начать дело заново" },
      { action: "lock", label: "Заблокировать", separated: true },
      { action: "exit", label: "Выйти" },
    ],
  },
  {
    label: "Запрос",
    items: [
      { action: "run", label: "Выполнить", keys: "Ctrl+Enter" },
      { action: "clear", label: "Очистить" },
    ],
  },
  {
    label: "Дело",
    items: [
      { action: "briefing", label: "Ориентировка" },
      { action: "tasks", label: "Задания", separated: true },
      { action: "evidence", label: "Материалы" },
      { action: "wall", label: "Стена" },
    ],
  },
  {
    label: "Справка",
    items: [
      { action: "reference", label: "Справочник SQL" },
      { action: "about", label: "О программе", separated: true },
    ],
  },
];

/* ---------- Вспомогательное ---------- */

const caseNo = (i: number) => String(i).padStart(2, "0");

/** Подсказка «SELECT … — пояснение» → код в обратных кавычках, чтобы он набирался PT Mono */
function codeHint(text: string): string {
  const m = text.match(/^((?:SELECT|WHERE|FROM|JOIN|ORDER|GROUP|COUNT|LIKE|HAVING|LIMIT|SUM|AVG|MIN|MAX|DISTINCT)\b[^—]*?)\s+—\s+(.+)$/);
  return m ? `\`${m[1]}\` — ${m[2]}` : text;
}

/** Ориентировка и итог дела — сцена с куратором: абзац — реплика */
function curatorScene(id: string, text: string): Scene {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  return {
    id,
    location: "Аналитический отдел",
    lines: paragraphs.map((p, i) => ({ id: `v1.${id}.${String(i + 1).padStart(3, "0")}`, speaker: CURATOR.id, text: p })),
  };
}

function nowStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Часы строки состояния: минутная точность, без анимации */
function subscribeMinute(cb: () => void) {
  const t = window.setInterval(cb, 15_000);
  return () => window.clearInterval(t);
}
function useClock(): string {
  return useSyncExternalStore(subscribeMinute, () => nowStamp(), () => "");
}

/** Строка результата → распечатка в материалы смены */
function cardFromRow(result: QueryResult, r: number, sql: string, queryNo: number): EvidenceCardData {
  const cols = result.columns;
  const row = result.rows[r];
  const idIdx = cols.indexOf("id");
  const nameIdx = ["name", "alias", "description", "content", "type"].map((c) => cols.indexOf(c)).find((i) => i >= 0) ?? -1;
  const pick = [idIdx, nameIdx, ...cols.map((_, i) => i)].filter((i, k, all) => i >= 0 && all.indexOf(i) === k).slice(0, 3);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? null : String(v);
    return s !== null && s.length > 18 ? `${s.slice(0, 17)}…` : s;
  };
  const name = nameIdx >= 0 ? row[nameIdx] : null;
  const table = sql.match(/\bfrom\s+([a-z_]+)/i)?.[1];
  return {
    id: `pin-${queryNo}-${r}`,
    kind: "record",
    title: name !== null && name !== undefined ? String(name) : idIdx >= 0 ? `Запись ${String(row[idIdx])}` : `Строка ${r + 1}`,
    text: `Строка ${r + 1} результата запроса № ${queryNo}.`,
    sourceQuery: sql,
    source: table ? `${table}, запрос № ${queryNo}` : `запрос № ${queryNo}`,
    queryNo,
    foundAt: nowStamp().slice(-5),
    excerpt: {
      columns: pick.map((i) => cols[i]),
      rows: [pick.map((i) => cell(row[i]))],
      mark: nameIdx >= 0 ? [0, pick.indexOf(nameIdx)] : undefined,
    },
    isNew: true,
  };
}

/* ---------- Ориентировки: какие уже показаны (удобство, только этот браузер) ---------- */

const BRIEFED_KEY = "zerosql-briefed";
function readBriefed(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(BRIEFED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeBriefed(ids: string[]) {
  try {
    window.localStorage.setItem(BRIEFED_KEY, JSON.stringify(ids));
  } catch {
    // приватный режим: ориентировка просто покажется снова
  }
}

/* ---------- Стол ---------- */

export function GameDesk({ journal = false }: { journal?: boolean }) {
  const router = useRouter();
  const dbReady = useGameStore((s) => s.dbReady);
  const currentMissionId = useGameStore((s) => s.currentMissionId);
  const completedMissions = useGameStore((s) => s.completedMissions);
  const objectiveStatus = useGameStore((s) => s.objectiveStatus);
  const hintsRevealed = useGameStore((s) => s.hintsRevealed);
  const narrative = useGameStore((s) => s.missionCompleteNarrative);
  const schema = useGameStore((s) => s._schema);
  const foreignKeys = useGameStore((s) => s._foreignKeys);
  const result = useGameStore((s) => s._lastResult);
  const sql = useGameStore((s) => s._sqlValue);
  const queryCount = useGameStore((s) => s.queryHistory.length);
  const { initDatabase, executeSQL, setSqlValue, startMission, revealHint, dismissNarrative, resetCurrentMission } =
    useGameStore.getState();

  const editor = useRef<SqlEditorHandle>(null);
  const [lastSql, setLastSql] = useState<string | undefined>(undefined);
  const [note, setNote] = useState<ResultObjectiveNote | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [pinned, setPinned] = useState<number[]>([]);
  const [cards, setCards] = useState<EvidenceCardData[]>([]);
  const [unseen, setUnseen] = useState(false);
  const [panel, setPanel] = useState<DeskPanelId>("tasks");
  const [center, setCenter] = useState<DeskCenterView>("query");
  const [wallFocus, setWallFocus] = useState<string | null>(null);
  const [showJournal, setShowJournal] = useState(journal);
  const [locked, setLocked] = useState(false);
  const [briefed, setBriefed] = useState<string[] | null>(null);
  const [replay, setReplay] = useState<string | null>(null);
  const counter = useRef(0);
  const say = (text: string) => setStatus({ id: ++counter.current, text });
  const clock = useClock();

  useEffect(() => {
    if (!useGameStore.getState().dbReady) initDatabase();
    const t = window.setTimeout(() => setBriefed(readBriefed()), 0);
    return () => window.clearTimeout(t);
  }, [initDatabase]);

  // Первое невыполненное дело — если игрок ещё ничего не выбрал
  useEffect(() => {
    if (!dbReady || currentMissionId) return;
    const first = missions.find((m) => !completedMissions.includes(m.id)) ?? missions[0];
    if (first) startMission(first.id);
  }, [dbReady, currentMissionId, completedMissions, startMission]);

  const index = missions.findIndex((m) => m.id === currentMissionId);
  const mission: Mission | null = index >= 0 ? missions[index] : null;
  const completed = useMemo(
    () => (currentMissionId ? (objectiveStatus[currentMissionId] ?? new Set<string>()) : new Set<string>()),
    [currentMissionId, objectiveStatus]
  );

  /* ----- Задания ----- */
  const sorted = useMemo(() => (mission ? [...mission.objectives].sort((a, b) => a.order - b.order) : []), [mission]);
  const firstOpen = sorted.findIndex((o) => !completed.has(o.id));
  const objectives: ObjectiveView[] = sorted.map((o, i) => {
    const current = i === firstOpen;
    const hints = current
      ? [...(o.hint ? [o.hint] : []), ...(mission?.hints ?? [])].map((text) => ({ speaker: CURATOR.id, text: codeHint(text) }))
      : undefined;
    return {
      id: o.id,
      text: o.description,
      state: completed.has(o.id) ? "done" : "active",
      outcome: o.storyReward,
      hints,
      hintsRevealed: current && mission ? Math.min(hintsRevealed[mission.id] ?? 0, hints?.length ?? 0) : 0,
    };
  });
  const currentNo = firstOpen >= 0 ? firstOpen + 1 : null;

  /* ----- Схема: открытые таблицы дела, новые — подсвечены ----- */
  const unlocked = mission?.unlockedTables ?? null;
  const previous = index > 0 ? (missions[index - 1].unlockedTables ?? []) : [];
  // В первом деле подсвечивать нечего: всё открытое — открыто с начала
  const newTables = unlocked && index > 0 ? unlocked.filter((t) => !previous.includes(t)) : [];
  const openSchema = unlocked ? schema.filter((t) => unlocked.includes(t.name)) : schema;

  /* ----- Сцены: ориентировка в начале дела, итог в конце ----- */
  const scene: Scene | null = useMemo(() => {
    if (!mission) return null;
    if (narrative) return curatorScene(`${mission.id}.outro`, narrative);
    if (replay === mission.id) return curatorScene(`${mission.id}.brief`, mission.briefing);
    if (briefed && !briefed.includes(mission.id) && !showJournal) return curatorScene(`${mission.id}.brief`, mission.briefing);
    return null;
  }, [mission, narrative, briefed, replay, showJournal]);

  const finishScene = () => {
    if (!mission) return;
    if (narrative) {
      dismissNarrative();
      const next = missions.find((m) => !completedMissions.includes(m.id) && m.id !== mission.id);
      if (next) {
        startMission(next.id);
        resetShift();
      } else {
        say("Все дела закрыты.");
      }
      return;
    }
    setReplay(null);
    const list = Array.from(new Set([...(briefed ?? []), mission.id]));
    setBriefed(list);
    writeBriefed(list);
  };

  const resetShift = () => {
    setPinned([]);
    setNote(null);
    setLastSql(undefined);
    setCenter("query");
  };

  /* ----- Запрос ----- */
  const run = () => {
    const text = sql.trim();
    if (!text || !mission) return;
    const before = currentNo;
    executeSQL(text);
    const state = useGameStore.getState();
    const res = state._lastResult;
    setLastSql(text);
    setPinned([]);
    markResultError(editor.current, res);
    if (!res || res.error) {
      setNote(null);
      return;
    }
    const done = state.feedbackMessages[0];
    if (done) {
      const n = sorted.findIndex((o) => o.id === done.objectiveId) + 1;
      setNote({ text: `задание ${n} выполнено`, tone: "done" });
      say(`Задание ${n} выполнено.`);
    } else if (before) {
      setNote({ text: `задание ${before} не засчитано`, tone: "miss" });
    } else {
      setNote(null);
    }
  };

  const pin = (row: number) => {
    if (!result || result.error || pinned.includes(row)) return;
    const card = cardFromRow(result, row, lastSql ?? sql, queryCount);
    setPinned((p) => [...p, row]);
    window.setTimeout(() => {
      setCards((c) => [...c.map((x) => ({ ...x, isNew: false })), card]);
      setUnseen(true);
      say(`Материалы: приобщено «${card.title}».`);
    }, 420);
  };

  const onMenuAction = (a: DeskMenuAction) => {
    switch (a) {
      case "save":
        say("Сеанс сохранён.");
        break;
      case "journal":
        setShowJournal(true);
        break;
      case "reset":
        resetCurrentMission();
        resetShift();
        say("Дело начато заново.");
        break;
      case "lock":
        setLocked(true);
        break;
      case "exit":
        router.push("/");
        break;
      case "run":
        run();
        break;
      case "clear":
        setSqlValue("");
        break;
      case "briefing":
        if (mission) setReplay(mission.id);
        break;
      case "about":
        say("АИС «Зеркало» 4.2.17. Только чтение.");
        break;
    }
  };

  if (!dbReady || !mission) {
    return (
      <div className="flex h-dvh items-center justify-center bg-room">
        <p className="mono-12 text-ink-3">&gt; Зеркало подключается…</p>
      </div>
    );
  }

  const journalCases: CaseJournalEntry[] = missions.map((m, i) => ({
    id: m.id,
    no: caseNo(i),
    title: m.title,
    note: m.subtitle,
    state: completedMissions.includes(m.id) ? "done" : m.id === currentMissionId ? "active" : "new",
  }));

  return (
    <DeskLayout
      caseCode={`Дело ${caseNo(index)}`}
      caseTitle={mission.title}
      dateTime={clock}
      menus={MENUS}
      onMenuAction={onMenuAction}
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
      currentObjective={currentNo ? { number: currentNo, text: objectives[firstOpen].text } : null}
      schema={
        <SchemaPanel
          key={mission.id}
          className="h-full"
          tables={schema}
          foreignKeys={foreignKeys}
          unlockedTables={unlocked}
          tableNotes={TABLE_NOTES}
          newTables={newTables}
          onInsert={(t) => editor.current?.insert(t)}
        />
      }
      terminal={
        <SqlTerminal
          className="h-full"
          handleRef={editor}
          value={sql}
          onChange={setSqlValue}
          onRun={run}
          schema={openSchema}
        />
      }
      results={
        <ResultsGrid
          className="h-full"
          result={result}
          sql={lastSql}
          onPinRow={pin}
          pinnedRows={pinned}
          objectiveNote={note}
          idleLines={[
            `Зеркало подключено. Доступно таблиц: ${openSchema.length} из ${schema.length}.`,
            `Дело ${caseNo(index)}: ${mission.subtitle}`,
          ]}
          onInsertValue={(v) => editor.current?.insert(v)}
          onSuggest={(name, wrong) => {
            if (wrong) setSqlValue(sql.replace(new RegExp(`\\b${wrong}\\b`, "g"), name));
          }}
        />
      }
      wall={<EvidenceWall cards={cards} focusId={wallFocus} onFocusChange={setWallFocus} />}
      panels={{
        tasks: (
          <ObjectiveList
            objectives={objectives}
            characters={CHARACTERS}
            onRevealHint={() => revealHint()}
          />
        ),
        evidence: (
          <EvidenceBoard
            cards={cards}
            onCardClick={(id) => {
              setWallFocus(id);
              setCenter("wall");
            }}
          />
        ),
        reference: <HandbookPanel entries={HANDBOOK} onInsert={(s) => editor.current?.insert(s)} />,
      }}
      overlay={
        <>
          {scene && !showJournal && (
            <DialoguePlayer
              key={scene.id}
              variant="overlay"
              scene={scene}
              characters={CHARACTERS}
              evidence={cards}
              defaultMuted
              onFinish={finishScene}
            />
          )}
          {showJournal && (
            <div className="fixed inset-0 z-50">
              <CaseJournal
                cases={journalCases}
                defaultSelected={currentMissionId ?? undefined}
                onOpen={(id) => {
                  if (id !== currentMissionId) {
                    startMission(id);
                    resetShift();
                  }
                  setShowJournal(false);
                  if (journal) router.replace("/game");
                }}
                onClose={() => {
                  setShowJournal(false);
                  if (journal) router.replace("/game");
                }}
              />
            </div>
          )}
          {locked && (
            <div className="fixed inset-0 z-50">
              <LockScreen onUnlock={() => setLocked(false)} />
            </div>
          )}
        </>
      }
    />
  );
}
