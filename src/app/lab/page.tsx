"use client";

import { useRef, useState, type ReactNode } from "react";
import type { DialogueChoice } from "@/types/story";
import type {
  DeskCenterView,
  DeskPanelId,
  EvidenceCardData,
  ObjectiveView,
  ProtocolCheck,
  ProtocolMessage,
} from "@/types/ui";
import type { QueryResult } from "@/types/database";
import { cn } from "@/lib/utils";
import { AgeWarning, ColdOpen, LockScreen, TitleScreen } from "@/components/title/title-screen";
import { DialoguePlayer } from "@/components/story/dialogue-player";
import { DossierCard, PortraitFrame } from "@/components/story/portrait";
import { SqlTerminal, type SqlEditorHandle } from "@/components/desk/sql-terminal";
import { ResultsGrid } from "@/components/desk/results-grid";
import { SchemaPanel } from "@/components/desk/schema-panel";
import { DeskLayout, type StatusMessage } from "@/components/desk/desk-layout";
import { MirrorMenuBar } from "@/components/desk/menu-bar";
import { StatusBar } from "@/components/desk/status-bar";
import { ObjectiveList } from "@/components/case/objective-list";
import { EvidenceBoard } from "@/components/case/evidence-board";
import { EvidenceCard } from "@/components/case/evidence-card";
import { EvidenceWall } from "@/components/case/evidence-wall";
import { HandbookPanel } from "@/components/case/handbook-panel";
import { ProtocolForm } from "@/components/case/protocol-form";
import { Glyph, type GlyphName } from "@/components/kit/glyphs";
import { HintTooltip } from "@/components/kit/hint-tooltip";
import { MessengerNote } from "@/components/kit/messenger";
import { DaterStamp, PencilCheck, RoundSeal, Signature, Stamp, StickyNote } from "@/components/kit/paper";
import { Counter, PanelHeader, Redaction, ScreenButton, ScreenField, TabBar } from "@/components/kit/screen";
import {
  CHARACTERS,
  EVIDENCE,
  EXTRA_EVIDENCE,
  FOREIGN_KEYS,
  HANDBOOK,
  HANDBOOK_NOTES,
  IDLE_LINES,
  OBJECTIVES,
  PROTOCOL,
  PROTOCOL_ANSWERS,
  RESULT_EMPTY,
  RESULT_LOCKED,
  RESULT_READ_ONLY,
  RESULT_ROWS,
  RESULT_SQL_ERROR,
  RESULT_TRUNCATED,
  SAMPLE_SQL,
  SCENES,
  SCHEMA,
  TABLE_NOTES,
  UNLOCKED_TABLES,
} from "./mock";

const SECTIONS = [
  ["desk", "Стол"],
  ["entry", "Вход"],
  ["dialogue", "Диалог"],
  ["dossier", "Учётная карточка"],
  ["schema", "Схема"],
  ["terminal", "Запрос"],
  ["results", "Результат"],
  ["errors", "Ошибки"],
  ["tasks", "Задания"],
  ["materials", "Материалы"],
  ["wall", "Стена"],
  ["protocol", "Заключение"],
  ["kit", "Элементы"],
] as const;

const OPEN_SCHEMA = SCHEMA.filter((t) => UNLOCKED_TABLES.includes(t.name));
const CASE_DATE = "14.12.2026";

/**
 * Витрина компонентов (только dev). Каждый компонент — внутри настоящего контейнера
 * на --room, стол — целым кадром 1440×900 (раздел 14).
 */
export default function LabPage() {
  return (
    <div className="min-h-dvh w-full bg-room">
      <header className="sticky top-0 z-40 border-b border-line bg-scr-chrome">
        <div className="flex h-8 items-center gap-6 overflow-x-auto px-4">
          <span className="shrink-0 ui-13 font-semibold text-ink-1">Лаборатория интерфейса</span>
          <nav aria-label="Разделы" className="flex shrink-0 gap-4">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="ui-13 text-ink-2 hover:text-ink-1">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex flex-col gap-16 pt-8 pb-24">
        <div className="max-w-[72ch] px-4 lg:px-8">
          <h1 className="ui-20 text-ink-1">ZeroSQL: фундамент интерфейса</h1>
          <p className="mt-2 ui-14 text-ink-2">
            Направление «Служебное»: экран «Зеркала», бумага и живопись. Портретов и озвучки пока нет, поэтому
            вместо портретов лежат учётные карточки, а реплики идут без звука.
          </p>
        </div>

        <DeskSection />
        <EntrySection />
        <DialogueSection />
        <DossierSection />
        <SchemaSection />
        <TerminalSection />
        <ResultsSection />
        <ErrorsSection />
        <TasksSection />
        <MaterialsSection />
        <WallSection />
        <ProtocolSection />
        <KitSection />
      </main>
    </div>
  );
}

/* ---------- Обёртки витрины ---------- */

function Section({
  id,
  title,
  note,
  actions,
  children,
  bleed = false,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** На всю ширину окна, без полей */
  bleed?: boolean;
}) {
  return (
    <section id={id} data-lab-section={id} className="flex scroll-mt-10 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 lg:px-8">
        <div className="max-w-[72ch]">
          <h2 className="ui-15 text-ink-1">{title}</h2>
          {note && <p className="mt-1 ui-13 text-ink-3">{note}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-4">{actions}</div>}
      </div>
      <div className={cn(!bleed && "px-4 lg:px-8")}>{children}</div>
    </section>
  );
}

function Frame({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && <span className="mono-12 text-ink-3">{label}</span>}
      <div className={cn("relative min-w-0 overflow-hidden border border-line", className)}>{children}</div>
    </div>
  );
}

function EventLog({ entries }: { entries: string[] }) {
  return (
    <div className="mt-3 border border-line bg-scr-base px-3 py-1.5 mono-12 text-ink-3">
      {entries.length === 0 ? (
        <p>&gt; событий нет</p>
      ) : (
        entries.slice(-4).map((e, i) => (
          <p key={i} className="truncate">
            &gt; {e}
          </p>
        ))
      )}
    </div>
  );
}

/* ---------- Логика витрины: задания и заключение ---------- */

function useObjectives() {
  const [objectives, setObjectives] = useState<ObjectiveView[]>(OBJECTIVES);
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
          ? { ...o, state: "done" as const, outcome: "Вошёл Рябов. Его выхода в журнале нет." }
          : j === i + 1 && o.state === "locked"
            ? { ...o, state: "active" as const }
            : o
      );
    });
  return { objectives, reveal, completeCurrent };
}

function useProtocol(
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
            ? "Заключение принято."
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

/* ---------- Стол целиком ---------- */

function DeskSection() {
  const editor = useRef<SqlEditorHandle>(null);
  const [sql, setSql] = useState(SAMPLE_SQL);
  const [result, setResult] = useState<QueryResult | null>(RESULT_ROWS);
  const [left, setLeft] = useState(6);
  const [pinned, setPinned] = useState<number[]>([]);
  const [cards, setCards] = useState<EvidenceCardData[]>(EVIDENCE.map((e) => ({ ...e, isNew: false })));
  const [panel, setPanel] = useState<DeskPanelId>("tasks");
  const [center, setCenter] = useState<DeskCenterView>("query");
  const [unseen, setUnseen] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [wallFocus, setWallFocus] = useState<string | null>(null);
  const { objectives, reveal, completeCurrent } = useObjectives();
  const protocol = useProtocol(
    { "p-who": "ryabov", "p-when": "0152", "p-signer": null, "p-cause": "mining" },
    ["p-who", "p-when"],
    [{ attempt: 1, matched: 2, total: 2, at: "02:41" }]
  );
  const counter = useRef(0);
  const say = (text: string) => setStatus({ id: ++counter.current, text });

  const run = () => {
    const text = sql.toLowerCase();
    setPinned([]);
    if (/\b(delete|update|insert|drop)\b/.test(text)) setResult(RESULT_READ_ONLY);
    else if (text.includes("bank_transfers")) setResult(RESULT_LOCKED);
    else if (/full_nam\b/.test(text)) {
      setLeft((n) => Math.max(0, n - 1));
      setResult(RESULT_SQL_ERROR);
    } else {
      setLeft((n) => Math.max(0, n - 1));
      setResult({ ...RESULT_ROWS, executionTimeMs: 2 + (text.length % 7) + 0.4 });
      if (text.includes("is null")) {
        completeCurrent();
        say("Задание 3 выполнено.");
      }
    }
  };

  const pin = (row: number) => {
    if (!result || pinned.includes(row)) return;
    const r = result.rows[row];
    setPinned((p) => [...p, row]);
    const at = String(r[4]).slice(-5);
    window.setTimeout(() => {
      setCards((c) => [
        ...c,
        {
          id: `pin-${row}-${c.length}`,
          kind: "record",
          title: `${String(r[1])}, ${String(r[3])}`,
          text: `Вход ${String(r[4])}, выход ${r[5] === null ? "не отмечен" : String(r[5])}.`,
          source: "access_log",
          queryNo: 22,
          foundAt: "02:44",
          at,
          excerpt: {
            columns: ["id", "full_name", "entered_at"],
            rows: [[r[0] as number, String(r[1]), at]],
            mark: [0, 1],
          },
          isNew: true,
        },
      ]);
      setUnseen(true);
      say(`Материалы: приобщено «${String(r[1])}, ${String(r[3])}».`);
    }, 420);
  };

  return (
    <Section
      id="desk"
      title="Стол, 1440×900"
      note="Строка окна с меню, схема, запрос над результатом (граница двигается мышью и стрелками), справа задания, материалы и справка, внизу строка состояния. «Приобщить» на строке результата отправляет её в материалы. DELETE, bank_transfers или full_nam в запросе покажут ошибки, IS NULL выполнит задание."
      bleed
    >
      <div className="h-[900px] border-y border-line max-lg:h-[844px]">
        <DeskLayout
          className="h-full"
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
          onMenuAction={(a) => {
            if (a === "save") say("Сеанс сохранён.");
            if (a === "clear") setSql("");
            if (a === "run") run();
          }}
          schema={
            <SchemaPanel
              className="h-full"
              tables={SCHEMA}
              foreignKeys={FOREIGN_KEYS}
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
              schema={OPEN_SCHEMA}
              budget={{ left, total: 8 }}
            />
          }
          results={
            <ResultsGrid
              className="h-full"
              result={result}
              onPinRow={pin}
              pinnedRows={pinned}
              idleLines={IDLE_LINES}
              onInsertValue={(v) => editor.current?.insert(v)}
              onSuggest={(name, wrong) => {
                if (wrong) setSql((s) => s.replace(new RegExp(`\\b${wrong}\\b`, "g"), name));
              }}
            />
          }
          wall={
            <EvidenceWall cards={cards} focusId={wallFocus} onFocusChange={setWallFocus} />
          }
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
              <HandbookPanel
                entries={HANDBOOK}
                marginNotes={HANDBOOK_NOTES}
                onInsert={(s) => editor.current?.insert(s)}
              />
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
              />
            ),
          }}
        />
      </div>
    </Section>
  );
}

/* ---------- Вход ---------- */

function EntrySection() {
  const [log, setLog] = useState<string[]>([]);
  const push = (s: string) => setLog((l) => [...l, s]);
  const [run, setRun] = useState(0);
  return (
    <Section
      id="entry"
      title="Предупреждение, холодное открытие, вход, блокировка"
      note="Холодное открытие показано в запасном варианте кодом: горизонт, нитка натриевых огней ЦОДа, пар над водой. Ключевая картина заменит его целиком."
      actions={
        <ScreenButton variant="text" onClick={() => setRun((r) => r + 1)}>
          Повторить открытие
        </ScreenButton>
      }
    >
      <Frame label="холодное открытие, 16:9" className="aspect-video max-h-[810px] w-full max-lg:aspect-auto max-lg:h-[640px]">
        <ColdOpen key={run} className="h-full min-h-0" onContinue={() => push("ColdOpen: дальше")} />
      </Frame>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Frame label="экран входа" className="h-[600px]">
          <TitleScreen
            className="h-full min-h-0"
            lastLogin={`${CASE_DATE} 02:44`}
            continueGame={{ onClick: () => push("Войти"), meta: "Дело 01, «Тёплая вода»" }}
            newGame={{ onClick: () => push("Новый сеанс") }}
            archive={{ onClick: () => push("Журнал дел") }}
            settings={{ onClick: () => push("Параметры") }}
          />
        </Frame>
        <div className="flex flex-col gap-6">
          <Frame label="предупреждение, первый запуск" className="h-[262px]">
            <AgeWarning className="h-full min-h-0" onAccept={() => push("Понятно")} />
          </Frame>
          <Frame label="блокировка станции, с выгоранием" className="h-[262px]">
            <LockScreen
              className="h-full"
              burnIn="аналитик-1@зеркало   только чтение   сеансов: 2   14.12.2026 01:47"
              onUnlock={() => push("Разблокировать")}
            />
          </Frame>
        </div>
      </div>
      <EventLog entries={log} />
    </Section>
  );
}

/* ---------- Диалог ---------- */

function DialogueSection() {
  const [sceneId, setSceneId] = useState("interrogation");
  const [run, setRun] = useState(0);
  const [startAt, setStartAt] = useState<number | "end">(0);
  const [finished, setFinished] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const push = (s: string) => setLog((l) => [...l, s]);

  const restart = (id: string, at: number | "end" = 0) => {
    setSceneId(id);
    setStartAt(at);
    setFinished(false);
    setRun((r) => r + 1);
  };

  const scene = SCENES[sceneId];

  const handleChoice = (choice: DialogueChoice) => {
    push(`onChoice(${choice.id})${choice.goto ? ` → ${choice.goto}` : ""}${choice.flag ? `, флаг ${choice.flag}` : ""}`);
    if (choice.goto) window.setTimeout(() => setSceneId(choice.goto!), 500);
    else window.setTimeout(() => setFinished(true), 900);
  };
  const handlePresent = (id: string) => {
    const ok = scene.present?.correct.includes(id);
    push(`onPresent(${id}) → ${ok ? "верно" : "мимо"}`);
    const next = ok ? scene.present?.success : scene.present?.failure;
    if (next) window.setTimeout(() => setSceneId(next), 500);
  };
  const handleFinish = () => {
    push(`onFinish(${sceneId})`);
    if (scene.next) setSceneId(scene.next);
    else setFinished(true);
  };

  const player = (variant: "inline" | "overlay") => (
    <DialoguePlayer
      key={`${variant}-${run}`}
      variant={variant}
      scene={scene}
      characters={CHARACTERS}
      evidence={EVIDENCE}
      startAt={startAt}
      autoFocus={variant === "overlay" || run > 0}
      onChoice={handleChoice}
      onPresent={handlePresent}
      onFinish={() => {
        if (variant === "overlay") setOverlay(false);
        handleFinish();
      }}
    />
  );

  return (
    <Section
      id="dialogue"
      title="Диалог"
      note="Лог сцены растёт снизу вверх, старые реплики гаснут. Клик, Пробел или Enter допечатывают реплику, следующее нажатие листает. Esc пропускает сцену, 1–9 выбирают вариант, M — звук, A — автопрокрутка."
      actions={
        <>
          <ScreenButton variant="text" onClick={() => restart("interrogation")}>
            Допрос с начала
          </ScreenButton>
          <ScreenButton variant="text" onClick={() => restart("interrogation", "end")}>
            К выбору
          </ScreenButton>
          <ScreenButton variant="text" onClick={() => restart("present", "end")}>
            К предъявлению
          </ScreenButton>
          <ScreenButton
            variant="secondary"
            onClick={() => {
              restart("interrogation", 1);
              setOverlay(true);
            }}
          >
            Поверх экрана
          </ScreenButton>
        </>
      }
    >
      <Frame className="h-[760px]" label={`сцена: ${sceneId}`}>
        {finished ? (
          <div className="absolute inset-0 grid place-items-center bg-room">
            <div className="text-center">
              <p className="ui-15 font-normal text-ink-2">Сцена окончена.</p>
              <ScreenButton variant="text" className="mt-3" onClick={() => restart("interrogation")}>
                Сначала
              </ScreenButton>
            </div>
          </div>
        ) : (
          player("inline")
        )}
      </Frame>
      <EventLog entries={log} />

      <div className="mt-6 grid gap-6 2xl:grid-cols-2">
        <Frame className="h-[640px]" label="выбор: один вариант без улики">
          <DialoguePlayer
            variant="inline"
            scene={SCENES.interrogation}
            characters={CHARACTERS}
            evidence={EVIDENCE}
            startAt="end"
            defaultMuted
          />
        </Frame>
        <Frame className="h-[640px]" label="предъявление: улика лежит на столе перед персонажем">
          <PresentDemo />
        </Frame>
      </div>

      {overlay && player("overlay")}
    </Section>
  );
}

function PresentDemo() {
  return (
    <DialoguePlayer
      variant="inline"
      scene={SCENES.present}
      characters={CHARACTERS}
      evidence={EVIDENCE}
      startAt="end"
      defaultMuted
      onCancelPresent={() => undefined}
    />
  );
}

/* ---------- Учётная карточка ---------- */

function DossierSection() {
  const list = Object.values(CHARACTERS);
  return (
    <Section
      id="dossier"
      title="Портрет и учётная карточка"
      note="Файлов public/portraits/<id>/<emotion>.webp пока нет. Вместо силуэта в зоне портрета лежит бумажная учётная карточка; говорит или слушает — меняется только яркость."
    >
      <div className="grid gap-8 lg:grid-cols-[repeat(3,minmax(0,360px))]">
        {list.map((c, i) => (
          <div key={c.id} className="flex flex-col gap-1.5">
            <span className="mono-12 text-ink-3">{i === 1 ? `${c.id}: слушает` : `${c.id}: говорит`}</span>
            <div className="relative h-[560px] border border-line bg-room">
              <PortraitFrame character={c} size="dialogue" speaking={i !== 1} dimmed={i === 1} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-start gap-6">
        <div className="w-[280px] -rotate-[0.8deg] shadow-paper">
          <DossierCard character={CHARACTERS.akhmetov} />
        </div>
        <div className="w-[200px]">
          <PortraitFrame character={CHARACTERS.kravets} size="card" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="mono-12 text-ink-3">малый размер: только имя</span>
          <PortraitFrame character={CHARACTERS.sokolova} size="avatar" />
        </div>
      </div>
    </Section>
  );
}

/* ---------- Схема ---------- */

function SchemaSection() {
  const [log, setLog] = useState<string[]>([]);
  return (
    <Section
      id="schema"
      title="Схема"
      note="Строки 22 px, ключи текстом (pk, → staff), закрытые таблицы вымараны плашкой по длине имени. Только что открытая таблица подсвечена натрием, пока на неё не наведут."
    >
      <div className="flex flex-wrap gap-6">
        <Frame className="h-[600px] w-[248px]" label="по умолчанию">
          <SchemaPanel
            className="h-full"
            tables={SCHEMA}
            foreignKeys={FOREIGN_KEYS}
            unlockedTables={UNLOCKED_TABLES}
            tableNotes={TABLE_NOTES}
            newTables={["calls"]}
            defaultExpanded={["access_log", "staff"]}
            onInsert={(t) => setLog((l) => [...l, `onInsert("${t}")`])}
          />
        </Frame>
        <Frame className="h-[600px] w-[248px]" label="revealLockedNames">
          <SchemaPanel
            className="h-full"
            tables={SCHEMA}
            foreignKeys={FOREIGN_KEYS}
            unlockedTables={UNLOCKED_TABLES}
            defaultExpanded={["residents"]}
            revealLockedNames
            onInsert={(t) => setLog((l) => [...l, `onInsert("${t}")`])}
          />
        </Frame>
        <div className="min-w-[260px] flex-1">
          <EventLog entries={log} />
        </div>
      </div>
    </Section>
  );
}

/* ---------- Запрос ---------- */

function TerminalSection() {
  const [sql, setSql] = useState(SAMPLE_SQL);
  const [left, setLeft] = useState(6);
  const [log, setLog] = useState<string[]>([]);
  return (
    <Section
      id="terminal"
      title="Запрос"
      note="CodeMirror в теме «Зеркала»: имена игрока ярче всего, ключевые слова тише, литералы холодные, каретка натриевая. Ctrl+Enter выполняет."
      actions={
        <ScreenButton variant="text" onClick={() => setLeft(6)}>
          Вернуть квоту
        </ScreenButton>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[808px_1fr]">
        <Frame label="активный, квота" className="h-[224px]">
          <SqlTerminal
            className="h-full"
            value={sql}
            onChange={setSql}
            onRun={() => {
              setLeft((n) => Math.max(0, n - 1));
              setLog((l) => [...l, `onRun: ${sql.split("\n")[0].slice(0, 48)}…`]);
            }}
            schema={OPEN_SCHEMA}
            budget={{ left, total: 8 }}
          />
        </Frame>
        <div className="flex flex-col gap-6">
          <Frame label="идёт допрос" className="h-[160px]">
            <SqlTerminal
              className="h-full"
              value={"SELECT *\nFROM calls\nWHERE seconds < 20;"}
              onChange={() => {}}
              onRun={() => {}}
              disabled
              disabledReason="Сеанс приостановлен: идёт опрос."
              budget={{ left: 2, total: 8 }}
            />
          </Frame>
          <Frame label="квота исчерпана, пустой редактор" className="h-[160px]">
            <SqlTerminal className="h-full" value="" onChange={() => {}} onRun={() => {}} budget={{ left: 0, total: 8 }} />
          </Frame>
        </div>
      </div>
      <EventLog entries={log} />
    </Section>
  );
}

/* ---------- Результат ---------- */

function ResultsSection() {
  const [pinned, setPinned] = useState<number[]>([3, 11]);
  return (
    <Section
      id="results"
      title="Результат"
      note="Строка 24 px, линейки, без зебры и цвета. Числа вправо, NULL текстом. Клик выделяет ячейку, стрелки двигают выделение, Ctrl+Shift+Enter приобщает строку, Alt+клик вставляет значение литералом."
    >
      <Frame className="h-[420px] max-w-[808px]" label="42 строки, две приобщены">
        <ResultsGrid
          className="h-full"
          result={RESULT_ROWS}
          pinnedRows={pinned}
          onPinRow={(r) => setPinned((p) => (p.includes(r) ? p : [...p, r]))}
        />
      </Frame>
      <div className="mt-6 grid max-w-[1640px] gap-6 lg:grid-cols-3">
        <Frame className="h-[180px]" label="до первого запроса">
          <ResultsGrid className="h-full" result={null} idleLines={IDLE_LINES} />
        </Frame>
        <Frame className="h-[180px]" label="пустой результат">
          <ResultsGrid className="h-full" result={RESULT_EMPTY} />
        </Frame>
        <Frame className="h-[180px]" label="обрезан, лимит показа 8">
          <ResultsGrid className="h-full" result={RESULT_TRUNCATED} maxRows={8} />
        </Frame>
      </div>
    </Section>
  );
}

function ErrorsSection() {
  return (
    <Section
      id="errors"
      title="Ошибки и отказы"
      note="Вывод терминала: без карточек, иконок и цветных плашек. Цвет ошибки один, тип определяется текстом. Предложенное имя кликабельно."
    >
      <div className="grid max-w-[1640px] gap-6 lg:grid-cols-3">
        <Frame className="h-[180px]" label="errorKind: sql">
          <ResultsGrid className="h-full" result={RESULT_SQL_ERROR} onSuggest={() => {}} />
        </Frame>
        <Frame className="h-[180px]" label="errorKind: locked_table">
          <ResultsGrid className="h-full" result={RESULT_LOCKED} />
        </Frame>
        <Frame className="h-[180px]" label="errorKind: read_only">
          <ResultsGrid className="h-full" result={RESULT_READ_ONLY} />
        </Frame>
      </div>
    </Section>
  );
}

/* ---------- Задания ---------- */

function TasksSection() {
  const { objectives, reveal, completeCurrent } = useObjectives();
  return (
    <Section
      id="tasks"
      title="Задания"
      note="Блокнот следователя: выполненное с галочкой и следствием, текущее с натриевым маркером, закрытое вымарано. Подсказки звучат голосами персонажей."
      actions={
        <ScreenButton variant="text" onClick={completeCurrent}>
          Выполнить текущее
        </ScreenButton>
      }
    >
      <Frame className="w-[384px] max-w-full bg-scr-side">
        <ObjectiveList objectives={objectives} characters={CHARACTERS} onRevealHint={reveal} />
      </Frame>
    </Section>
  );
}

/* ---------- Материалы ---------- */

function MaterialsSection() {
  const [cards, setCards] = useState<EvidenceCardData[]>(EVIDENCE);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Section
      id="materials"
      title="Материалы и справка"
      note="Реестр улик — экранная таблица в две строки, по времени ночи. Новая запись подсвечена натрием и гаснет. Справка — список статей, пример вставляется в запрос."
      actions={
        <>
          <ScreenButton
            variant="text"
            onClick={() =>
              setCards((c) => [
                ...c.map((x) => ({ ...x, isNew: false })),
                { ...EXTRA_EVIDENCE, id: `${EXTRA_EVIDENCE.id}-${c.length}` },
              ])
            }
          >
            Добавить запись
          </ScreenButton>
          <ScreenButton variant="text" onClick={() => setCards(EVIDENCE)}>
            Сбросить
          </ScreenButton>
        </>
      }
    >
      <div className="flex flex-wrap gap-6">
        <Frame className="h-[480px] w-[384px] max-w-full bg-scr-side" label="Материалы">
          <EvidenceBoard cards={cards} selectedId={selected} onCardClick={(id) => setSelected(id)} onOpenWall={() => {}} />
        </Frame>
        <Frame className="h-[200px] w-[384px] max-w-full bg-scr-side" label="пусто">
          <EvidenceBoard cards={[]} />
        </Frame>
        <Frame className="h-[480px] w-[384px] max-w-full bg-scr-side" label="Справка">
          <HandbookPanel entries={HANDBOOK} marginNotes={HANDBOOK_NOTES} openId={undefined} />
        </Frame>
        <Frame className="h-[480px] w-[384px] max-w-full bg-scr-side" label="Справка: статья">
          <HandbookPanel entries={HANDBOOK} marginNotes={HANDBOOK_NOTES} openId="null" onInsert={() => {}} />
        </Frame>
      </div>
    </Section>
  );
}

/* ---------- Стена ---------- */

function WallSection() {
  return (
    <Section
      id="wall"
      title="Стена"
      note="Лента ночи 22:00–06:00, 160 px на час, прокручивается колесом и перетаскиванием. Предметы приклеены скотчем у своего времени, над и под лентой. Клик подводит предмет к центру, Esc возвращает."
    >
      <Frame className="h-[640px] max-w-[1180px]" label="центральная зона «Стена»">
        <EvidenceWall cards={[...EVIDENCE, EXTRA_EVIDENCE]} />
      </Frame>
      <div className="mt-6 flex flex-wrap gap-6">
        <Frame className="h-[480px] w-[720px] max-w-full" label="пусто">
          <EvidenceWall cards={[]} />
        </Frame>
        <Frame className="h-[640px] w-[390px] max-w-full" label="мобильный: лента вертикальная">
          <EvidenceWall cards={EVIDENCE.slice(0, 4)} />
        </Frame>
      </div>
      <div className="mt-6 flex flex-wrap items-start gap-8 bg-room">
        {[...EVIDENCE, EXTRA_EVIDENCE].map((c) => (
          <EvidenceCard key={c.id} card={c} className="shadow-pinned" />
        ))}
      </div>
    </Section>
  );
}

/* ---------- Заключение ---------- */

function ProtocolSection() {
  const live = useProtocol(
    { "p-who": "ryabov", "p-when": "0152", "p-signer": null, "p-cause": "mining" },
    ["p-who", "p-when"],
    [{ attempt: 1, matched: 2, total: 2, at: "02:41" }]
  );
  return (
    <Section
      id="protocol"
      title="Заключение"
      note="Лист на столе: пропуски карандашом, подтверждённое — синей ручкой с галочкой красным карандашом. Сверка пачкой: оттиск датера говорит, сколько совпало, но не какие. Справа — заключение принято."
    >
      <div className="grid items-start gap-6 2xl:grid-cols-2">
        <Frame className="bg-room" label="в работе: одна пачка подтверждена">
          <ProtocolForm
            questions={PROTOCOL}
            values={live.values}
            onChange={live.onChange}
            onSubmit={live.submit}
            confirmedIds={live.confirmed}
            checks={live.checks}
            message={live.message}
            caseLabel="Дело: «Тёплая вода»"
            docNumber="№ 01/14-12"
            date={CASE_DATE}
            caseNo="01"
          />
        </Frame>
        <Frame className="bg-room" label="заключение принято">
          <ProtocolForm
            questions={PROTOCOL}
            values={PROTOCOL_ANSWERS}
            onChange={() => {}}
            onSubmit={() => {}}
            confirmedIds={Object.keys(PROTOCOL_ANSWERS)}
            checks={[
              { attempt: 1, matched: 2, total: 2, at: "02:41" },
              { attempt: 2, matched: 1, total: 2, at: "02:52" },
              { attempt: 3, matched: 2, total: 2, at: "03:05" },
            ]}
            message={{ tone: "success", text: "Заключение принято. 03:05" }}
            caseLabel="Дело: «Тёплая вода»"
            docNumber="№ 01/14-12"
            date={CASE_DATE}
            caseNo="01"
          />
        </Frame>
      </div>
    </Section>
  );
}

/* ---------- Базовые элементы ---------- */

const GLYPHS: GlyphName[] = [
  "disclosure",
  "disclosure-open",
  "marker",
  "check",
  "next",
  "close",
  "speaker",
  "speaker-off",
  "play",
  "pause",
  "zero-mark",
];

function KitSection() {
  const [tab, setTab] = useState("a");
  const [msg, setMsg] = useState<StatusMessage | null>({ id: 0, text: "Сеанс сохранён." });
  const n = useRef(0);
  return (
    <Section
      id="kit"
      title="Базовые элементы"
      note="Глифы вместо иконок, кнопки трёх видов, вкладки, поле, подсказка, меню, строка состояния, окно мессенджера и бумажные предметы."
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-end gap-6">
          {GLYPHS.map((g) => (
            <div key={g} className="flex flex-col items-center gap-2">
              <span className="flex gap-3 text-ink-1">
                <Glyph name={g} size={10} />
                <Glyph name={g} size={12} />
                <Glyph name={g} size={16} className={g === "zero-mark" ? "text-cold" : undefined} />
              </span>
              <span className="mono-11 text-ink-3">{g}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Frame className="bg-scr-base">
            <PanelHeader title="Кнопки и поле">
              <Counter value={7} />
              <Counter value={3} alert />
            </PanelHeader>
            <div className="flex flex-wrap items-center gap-4 p-4">
              <ScreenButton variant="primary" keys="Ctrl+Enter">
                Выполнить
              </ScreenButton>
              <ScreenButton variant="secondary">Понятно</ScreenButton>
              <ScreenButton variant="primary" disabled>
                Сверить
              </ScreenButton>
              <ScreenButton variant="text">Вернуться к запросу</ScreenButton>
              <HintTooltip content="Засекречено">
                <button type="button" className="mono-13">
                  <Redaction chars={14} />
                </button>
              </HintTooltip>
              <ScreenField defaultValue="B-0233" className="w-40" />
            </div>
            <div className="border-t border-line px-4">
              <TabBar
                items={[
                  { id: "a", label: "Задания" },
                  { id: "b", label: "Материалы", count: 7, alert: true },
                  { id: "c", label: "Справка" },
                ]}
                value={tab}
                onChange={setTab}
                label="Пример вкладок"
              />
            </div>
          </Frame>

          <Frame className="flex flex-col bg-scr-base">
            <MirrorMenuBar onAction={() => {}} right={<span className="ui-13 text-ink-2">Дело 01. Тёплая вода</span>} />
            <div className="flex flex-1 items-end justify-end p-4">
              <MessengerNote
                sender="Соколова В. А."
                time="02:47"
                more={2}
                text="Ноль, Рябов не сдавал карту. Я подняла журнал поста — там пусто с 23:40. Посмотри, кто ещё был у шлюза."
                onClose={() => {}}
                onOpen={() => {}}
              />
            </div>
            <StatusBar
              message={msg}
              dateTime={`${CASE_DATE} 02:44`}
              sessions={2}
              className="cursor-pointer"
            />
            <div className="border-t border-line px-3 py-2">
              <ScreenButton variant="text" onClick={() => setMsg({ id: ++n.current, text: `Задание ${n.current + 1} выполнено.` })}>
                Сообщение в строку состояния
              </ScreenButton>
            </div>
          </Frame>
        </div>

        <div className="relative flex flex-wrap items-center gap-10 bg-room p-8">
          <div className="relative w-[520px] max-w-full paper p-8 shadow-paper">
            <div className="flex items-center gap-6">
              <PencilCheck id="a" />
              <PencilCheck id="b" />
              <PencilCheck id="c" />
              <Signature />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-6">
              <DaterStamp id="d1" attempt={2} date="14.12.26" time="02:44" matched={2} total={3} />
              <Stamp id="accepted" rotate={-3} className="px-5 py-2">
                <span className="text-[28px] leading-8">Принято</span>
                <span className="mt-0.5 text-[10px] leading-3">заключение по делу №&nbsp;01 14.12.2026</span>
              </Stamp>
              <RoundSeal id="seal" />
            </div>
          </div>
          <StickyNote id="kit-sticky">сначала факты, потом люди</StickyNote>
        </div>
      </div>
    </Section>
  );
}
