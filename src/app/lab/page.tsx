"use client";

import { useRef, useState, type ReactNode } from "react";
import { FlaskConical, Maximize2, Plus, RotateCcw } from "lucide-react";
import type { DialogueChoice } from "@/types/story";
import type { DeskPanelId, EvidenceCardData, ObjectiveView, ProtocolMessage } from "@/types/ui";
import type { QueryResult } from "@/types/database";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/kit/atmosphere";
import { TitleScreen } from "@/components/title/title-screen";
import { DialoguePlayer } from "@/components/story/dialogue-player";
import { PortraitFrame } from "@/components/story/portrait";
import { SqlTerminal, type SqlEditorHandle } from "@/components/desk/sql-terminal";
import { ResultsGrid } from "@/components/desk/results-grid";
import { SchemaPanel } from "@/components/desk/schema-panel";
import { DeskLayout } from "@/components/desk/desk-layout";
import { ObjectiveList } from "@/components/case/objective-list";
import { EvidenceBoard } from "@/components/case/evidence-board";
import { ProtocolForm } from "@/components/case/protocol-form";
import { EMOTIONS } from "@/types/story";
import {
  CHARACTERS,
  CHEATSHEET,
  EVIDENCE,
  EXTRA_EVIDENCE,
  FOREIGN_KEYS,
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
  ["title", "Титул"],
  ["dialogue", "Диалог"],
  ["portraits", "Портреты"],
  ["terminal", "Терминал"],
  ["results", "Результаты"],
  ["errors", "Ошибки"],
  ["schema", "Схема"],
  ["objectives", "Задачи"],
  ["evidence", "Улики"],
  ["protocol", "Протокол"],
  ["desk", "Стол"],
] as const;

const OPEN_SCHEMA = SCHEMA.filter((t) => UNLOCKED_TABLES.includes(t.name));

export default function LabPage() {
  return (
    <div className="min-h-dvh w-full bg-ink">
      <nav className="sticky top-0 z-40 border-b border-frost-line bg-ink-deep/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 sm:px-6">
          <span className="flex shrink-0 items-center gap-2 py-3 font-display text-[13px] font-semibold text-steam">
            <FlaskConical className="size-4 text-aurora" />
            <span className="hidden sm:inline">Лаборатория</span>
          </span>
          <div className="scrollbar-ice -mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {SECTIONS.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="shrink-0 rounded-md px-2.5 py-3 text-xs text-frost-dim transition-colors hover:text-steam"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-20 px-4 py-10 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <SectionLabel>ZeroSQL v2 · UI-фундамент</SectionLabel>
          <h1 className="mt-2 font-display text-3xl font-bold text-steam sm:text-4xl">Лаборатория компонентов</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-frost">
            Все презентационные компоненты на моковых данных. Портретов и озвучки пока нет — видно, как
            интерфейс выглядит без них: стилизованные заглушки и текст без звука.
          </p>
        </header>

        <TitleSection />
        <DialogueSection />
        <PortraitSection />
        <TerminalSection />
        <ResultsSection />
        <ErrorsSection />
        <SchemaSection />
        <ObjectivesSection />
        <EvidenceSection />
        <ProtocolSection />
        <DeskSection />
      </main>
    </div>
  );
}

/* ---------- Обёртки ---------- */

function Section({
  id,
  title,
  note,
  actions,
  children,
}: {
  id: string;
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-16 flex-col gap-5" data-lab-section={id}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="font-display text-xl font-semibold text-steam sm:text-2xl">{title}</h2>
          {note && <p className="mt-1.5 text-sm leading-relaxed text-frost-dim">{note}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Frame({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label && <span className="font-mono text-[11px] text-frost-dim">{label}</span>}
      <div className={cn("relative min-w-0 overflow-hidden rounded-xl border border-frost-line bg-ink", className)}>
        {children}
      </div>
    </div>
  );
}

function LabButton({
  onClick,
  children,
  icon,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-frost-line-strong bg-ink-raised px-3 text-xs text-frost transition-colors hover:border-aurora/50 hover:text-steam [&_svg]:size-3.5"
    >
      {icon}
      {children}
    </button>
  );
}

function EventLog({ entries }: { entries: string[] }) {
  return (
    <div className="rounded-lg border border-frost-line bg-ink-deep px-3 py-2 font-mono text-[11px] leading-relaxed text-frost-dim">
      {entries.length === 0 ? (
        <span>события компонента появятся здесь</span>
      ) : (
        entries.slice(-4).map((e, i) => (
          <div key={i} className="truncate">
            <span className="text-aurora/70">›</span> {e}
          </div>
        ))
      )}
    </div>
  );
}

/* ---------- Титул ---------- */

function TitleSection() {
  const [log, setLog] = useState<string[]>([]);
  const push = (s: string) => setLog((l) => [...l, s]);
  return (
    <Section id="title" title="Титульный экран" note="Сцена целиком на CSS/SVG: сияние, город с дата-центром, лёд с трещинами и пар над полыньёй.">
      <Frame className="h-[min(780px,88vh)] min-h-[620px]">
        <TitleScreen
          className="h-full min-h-0"
          newGame={{ onClick: () => push("Новое расследование") }}
          continueGame={{ onClick: () => push("Продолжить"), meta: "Дело № 01 · «Тёплая вода» · 3/5 задач" }}
          archive={{ onClick: () => push("Архив") }}
        />
      </Frame>
      <EventLog entries={log} />
    </Section>
  );
}

/* ---------- Диалог ---------- */

function DeskGhost() {
  // Призрак стола за затемнением
  return (
    <div aria-hidden className="absolute inset-0 grid grid-cols-[22%_1fr_28%] gap-3 p-3 opacity-70">
      <div className="rounded-lg border border-frost-line bg-ink-raised/60" />
      <div className="flex flex-col gap-3">
        <div className="h-[38%] rounded-lg border border-frost-line bg-ink-deep" />
        <div className="flex-1 rounded-lg border border-frost-line bg-ink-deep bg-[repeating-linear-gradient(180deg,transparent_0,transparent_31px,rgb(188_203_224/0.08)_31px,rgb(188_203_224/0.08)_32px)]" />
      </div>
      <div className="rounded-lg border border-frost-line bg-ink-raised/60" />
    </div>
  );
}

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
    push(`onChoice(${choice.id})${choice.goto ? ` → ${choice.goto}` : ""}${choice.flag ? ` · флаг ${choice.flag}` : ""}`);
    if (choice.goto) restart(choice.goto);
    else setFinished(true);
  };
  const handlePresent = (id: string) => {
    const ok = scene.present?.correct.includes(id);
    push(`onPresent(${id}) → ${ok ? "верно" : "мимо"}`);
    const next = ok ? scene.present?.success : scene.present?.failure;
    if (next) restart(next);
  };
  const handleFinish = () => {
    push(`onFinish(${sceneId})`);
    if (scene.next) restart(scene.next);
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
      onChoice={(c) => {
        if (variant === "overlay") setOverlay(false);
        handleChoice(c);
      }}
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
      note="Печатная машинка: клик, Пробел или Enter дописывают реплику, следующее нажатие — дальше. Esc — пропуск сцены, 1–9 — варианты, M — звук, A — автопрокрутка. Озвучка /voice/<id>.mp3 пока отсутствует — плеер это запоминает и не повторяет запросы."
      actions={
        <>
          <LabButton icon={<RotateCcw />} onClick={() => restart("interrogation")}>
            Допрос с начала
          </LabButton>
          <LabButton onClick={() => restart("interrogation", "end")}>К выбору</LabButton>
          <LabButton onClick={() => restart("present", "end")}>К предъявлению</LabButton>
          <LabButton icon={<Maximize2 />} onClick={() => setOverlay(true)}>
            Поверх экрана
          </LabButton>
        </>
      }
    >
      <Frame className="h-[640px] sm:h-[680px]" label={`сцена: ${sceneId}`}>
        <DeskGhost />
        {finished ? (
          <div className="absolute inset-0 grid place-items-center bg-ink/80 backdrop-blur">
            <div className="text-center">
              <p className="font-display text-lg text-steam">Сцена окончена</p>
              <div className="mt-4">
                <LabButton icon={<RotateCcw />} onClick={() => restart("interrogation")}>
                  Сначала
                </LabButton>
              </div>
            </div>
          </div>
        ) : (
          player("inline")
        )}
      </Frame>
      <EventLog entries={log} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Frame className="h-[600px]" label="состояние: выбор (один вариант заперт — нет улики)">
          <DeskGhost />
          <DialoguePlayer
            variant="inline"
            scene={SCENES.interrogation}
            characters={CHARACTERS}
            evidence={EVIDENCE}
            startAt="end"
            defaultMuted
          />
        </Frame>
        <Frame className="h-[600px]" label="состояние: предъявление улики">
          <DeskGhost />
          <DialoguePlayer
            variant="inline"
            scene={SCENES.present}
            characters={CHARACTERS}
            evidence={EVIDENCE}
            startAt="end"
            defaultMuted
          />
        </Frame>
      </div>

      {overlay && player("overlay")}
    </Section>
  );
}

/* ---------- Портреты ---------- */

function PortraitSection() {
  const list = Object.values(CHARACTERS);
  return (
    <Section
      id="portraits"
      title="Портреты"
      note="Файлов public/portraits/<id>/<emotion>.webp пока нет — показывается заглушка в стиле: сплит-свет (холодный контровой слева, тёплый ключ справа), живописный силуэт, инициалы, акцент персонажа. Эмоция меняет свет и наклон головы."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,220px))_1fr]">
        {list.map((c, i) => (
          <div key={c.id} className="flex flex-col gap-2">
            <PortraitFrame character={c} emotion={c.emotions[i % c.emotions.length]} size="dialogue" speaking={i === 0} />
            <span className="font-mono text-[11px] text-frost-dim">dialogue{i === 0 ? " · говорит" : ""}</span>
          </div>
        ))}
        <div className="col-span-2 flex flex-col gap-3 sm:col-span-3 lg:col-span-1">
          <span className="font-mono text-[11px] text-frost-dim">card</span>
          <div className="grid grid-cols-3 gap-3 lg:max-w-md">
            {list.map((c) => (
              <PortraitFrame key={c.id} character={c} size="card" />
            ))}
          </div>
          <span className="mt-2 font-mono text-[11px] text-frost-dim">avatar</span>
          <div className="flex flex-wrap items-end gap-3">
            {list.map((c) => (
              <PortraitFrame key={c.id} character={c} size="avatar" className="size-14" />
            ))}
            {list.map((c) => (
              <PortraitFrame key={`${c.id}-s`} character={c} size="avatar" className="size-8" />
            ))}
            <PortraitFrame size="avatar" className="size-14" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] text-frost-dim">эмоции: Ахметов</span>
        <div className="grid grid-cols-5 gap-2 sm:gap-3 lg:grid-cols-10">
          {EMOTIONS.map((e) => (
            <PortraitFrame key={e} character={CHARACTERS.akhmetov} emotion={e} size="dialogue" />
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------- Терминал ---------- */

function TerminalSection() {
  const [sql, setSql] = useState(SAMPLE_SQL);
  const [left, setLeft] = useState(5);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const run = () => {
    setRunning(true);
    setLog((l) => [...l, `onRun · ${sql.split("\n")[0].slice(0, 60)}…`]);
    window.setTimeout(() => {
      setRunning(false);
      setLeft((n) => Math.max(0, n - 1));
    }, 600);
  };

  return (
    <Section
      id="terminal"
      title="SQL-терминал"
      note="CodeMirror в палитре «Полярная ночь»: диалект SQLite, автодополнение по открытым таблицам, Ctrl/⌘+Enter. Бюджет запросов — необязательный."
      actions={
        <LabButton icon={<RotateCcw />} onClick={() => setLeft(5)}>
          Вернуть бюджет
        </LabButton>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Frame label="активный, бюджет 8">
          <SqlTerminal
            className="h-[300px] rounded-none border-0"
            value={sql}
            onChange={setSql}
            onRun={run}
            running={running}
            schema={OPEN_SCHEMA}
            budget={{ left, total: 8 }}
          />
        </Frame>
        <Frame label="заблокирован во время сцены">
          <SqlTerminal
            className="h-[300px] rounded-none border-0"
            value={"SELECT *\nFROM calls\nWHERE seconds < 20;"}
            onChange={() => {}}
            onRun={() => {}}
            disabled
            disabledReason="Идёт допрос — терминал недоступен"
            budget={{ left: 2, total: 8 }}
          />
        </Frame>
      </div>
      <EventLog entries={log} />
    </Section>
  );
}

/* ---------- Результаты ---------- */

function ResultsSection() {
  const [pinned, setPinned] = useState<number[]>([3, 11]);
  return (
    <Section
      id="results"
      title="Таблица результатов"
      note="Номера строк, NULL отдельной плашкой, числа вправо и моноширинно, длинный текст обрезан (полностью — в подсказке), липкая шапка. Наведите на строку — булавка «в улики»."
    >
      <Frame className="h-[520px]" label="42 строки · закрепление строк">
        <ResultsGrid
          className="h-full rounded-none border-0"
          result={RESULT_ROWS}
          pinnedRows={pinned}
          onPinRow={(r) => setPinned((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]))}
        />
      </Frame>
      <div className="grid gap-6 lg:grid-cols-3">
        <Frame className="h-[260px]" label="до первого запроса">
          <ResultsGrid className="h-full rounded-none border-0" result={null} />
        </Frame>
        <Frame className="h-[260px]" label="пустой результат">
          <ResultsGrid className="h-full rounded-none border-0" result={RESULT_EMPTY} />
        </Frame>
        <Frame className="h-[260px]" label="обрезан движком + лимит показа 8">
          <ResultsGrid className="h-full rounded-none border-0" result={RESULT_TRUNCATED} maxRows={8} running />
        </Frame>
      </div>
    </Section>
  );
}

function ErrorsSection() {
  return (
    <Section
      id="errors"
      title="Ошибки"
      note="Объяснение по-русски крупно, сырое сообщение SQLite мелко под ним. Сюжетные запреты — другим цветом: закрытая таблица (иней, фиолет) и запрет записи (натрий)."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Frame className="h-[340px]" label="errorKind: sql">
          <ResultsGrid className="h-full rounded-none border-0" result={RESULT_SQL_ERROR} />
        </Frame>
        <Frame className="h-[340px]" label="errorKind: locked_table">
          <ResultsGrid className="h-full rounded-none border-0" result={RESULT_LOCKED} />
        </Frame>
        <Frame className="h-[340px]" label="errorKind: read_only">
          <ResultsGrid className="h-full rounded-none border-0" result={RESULT_READ_ONLY} />
        </Frame>
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
      note="Клик по имени таблицы или столбца вставляет его в редактор, шеврон сворачивает. Закрытые таблицы — под инеем, без столбцов; по умолчанию даже имя скрыто, чтобы не спойлерить."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-[300px_300px_1fr]">
        <Frame className="h-[600px] bg-ink-raised/50" label="по умолчанию">
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
        <Frame className="h-[600px] bg-ink-raised/50" label="revealLockedNames">
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
        <div className="sm:col-span-2 lg:col-span-1">
          <EventLog entries={log} />
        </div>
      </div>
    </Section>
  );
}

/* ---------- Задачи ---------- */

function useObjectives() {
  const [objectives, setObjectives] = useState<ObjectiveView[]>(OBJECTIVES);
  const reveal = (id: string) =>
    setObjectives((list) =>
      list.map((o) =>
        o.id === id ? { ...o, hintsRevealed: Math.min((o.hintsRevealed ?? 0) + 1, o.hints?.length ?? 0) } : o
      )
    );
  return [objectives, reveal] as const;
}

function ObjectivesSection() {
  const [objectives, reveal] = useObjectives();
  return (
    <Section
      id="objectives"
      title="Задачи"
      note="Выполненные, текущая и закрытые; подсказки по уровням — от намёка до готового запроса, с подписью персонажа. Бонусные — отдельно."
    >
      <Frame className="max-w-md p-4">
        <ObjectiveList objectives={objectives} characters={CHARACTERS} onRevealHint={reveal} />
      </Frame>
    </Section>
  );
}

/* ---------- Улики ---------- */

function EvidenceSection() {
  const [cards, setCards] = useState<EvidenceCardData[]>(EVIDENCE);
  const [selected, setSelected] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  return (
    <Section
      id="evidence"
      title="Доска улик"
      note="Шесть типов: документ, запись БД, фото, аудио, показания, зацепка. Новые карточки появляются с подсветкой."
      actions={
        <>
          <LabButton
            icon={<Plus />}
            onClick={() => {
              setCards((c) => [{ ...EXTRA_EVIDENCE, id: `${EXTRA_EVIDENCE.id}-${added}` }, ...c.map((x) => ({ ...x, isNew: false }))]);
              setAdded((n) => n + 1);
            }}
          >
            Добавить улику
          </LabButton>
          <LabButton icon={<RotateCcw />} onClick={() => setCards(EVIDENCE)}>
            Сбросить
          </LabButton>
        </>
      }
    >
      <EvidenceBoard cards={cards} selectedId={selected} onCardClick={(id) => setSelected((s) => (s === id ? null : id))} />
      <Frame className="max-w-md">
        <div className="p-4">
          <EvidenceBoard cards={[]} />
        </div>
      </Frame>
    </Section>
  );
}

/* ---------- Протокол ---------- */

function useProtocol(initial: Record<string, string | null>, initialConfirmed: string[]) {
  const [values, setValues] = useState(initial);
  const [confirmed, setConfirmed] = useState<string[]>(initialConfirmed);
  const [message, setMessage] = useState<ProtocolMessage | null>(null);

  const submit = () => {
    const pending = Object.keys(PROTOCOL_ANSWERS).filter((id) => !confirmed.includes(id) && values[id]);
    const right = pending.filter((id) => values[id] === PROTOCOL_ANSWERS[id]);
    const all = Object.keys(PROTOCOL_ANSWERS).length;
    const next = [...confirmed, ...right];
    setConfirmed(next);
    if (next.length === all) setMessage({ tone: "success", text: "Всё сходится. Протокол подписан." });
    else if (right.length > 0)
      setMessage({
        tone: "partial",
        text: `Подтверждено ещё ${right.length}. ${pending.length - right.length > 0 ? "Остальное не сходится с данными." : "Заполните оставшиеся пункты."}`,
      });
    else setMessage({ tone: "fail", text: "Ничего из нового не сходится с данными. Проверьте запросами." });
  };

  return {
    values,
    confirmed,
    message,
    submit,
    onChange: (id: string, v: string | null) => setValues((s) => ({ ...s, [id]: v })),
  };
}

function ProtocolSection() {
  const live = useProtocol({ "p-who": "ryabov", "p-when": "0152", "p-signer": null, "p-cause": "mining" }, ["p-who"]);
  return (
    <Section
      id="protocol"
      title="Протокол"
      note="Дедукция в духе Obra Dinn: пропуски заполняются тем, что игрок уже видел; подтверждённые фиксируются штампом. Справа — состояние «дело закрыто»."
    >
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ProtocolForm
          questions={PROTOCOL}
          values={live.values}
          onChange={live.onChange}
          onSubmit={live.submit}
          confirmedIds={live.confirmed}
          message={live.message}
          caseLabel="Дело № 01 · «Тёплая вода»"
          docNumber="№ 01/14-12"
          footnote="Сверка сообщает, сколько пунктов верны, но не какие именно — пока пункт не подтверждён."
        />
        <ProtocolForm
          questions={PROTOCOL}
          values={PROTOCOL_ANSWERS}
          onChange={() => {}}
          onSubmit={() => {}}
          confirmedIds={Object.keys(PROTOCOL_ANSWERS)}
          message={{ tone: "success", text: "Всё сходится. Протокол подписан." }}
          caseLabel="Дело № 01 · «Тёплая вода»"
          docNumber="№ 01/14-12"
        />
      </div>
    </Section>
  );
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
  const [objectives, reveal] = useObjectives();
  const protocol = useProtocol({ "p-who": "ryabov", "p-when": null, "p-signer": null, "p-cause": null }, ["p-who"]);
  const [newEvidence, setNewEvidence] = useState(0);

  const run = () => {
    const text = sql.toLowerCase();
    setLeft((n) => Math.max(0, n - 1));
    setPinned([]);
    if (/\b(delete|update|insert|drop)\b/.test(text)) setResult(RESULT_READ_ONLY);
    else if (text.includes("bank_transfers")) setResult(RESULT_LOCKED);
    else if (text.includes("full_nam ") || text.includes("full_nam,")) setResult(RESULT_SQL_ERROR);
    else setResult({ ...RESULT_ROWS, executionTimeMs: 2 + (text.length % 7) });
  };

  const pin = (row: number) => {
    if (!result || pinned.includes(row)) return;
    const r = result.rows[row];
    setPinned((p) => [...p, row]);
    setCards((c) => [
      {
        id: `pin-${row}-${Date.now()}`,
        kind: "record",
        title: `${String(r[1])} · ${String(r[3])}`,
        text: `Вход ${String(r[4])}, выход ${r[5] === null ? "не отмечен" : String(r[5])}.`,
        sourceQuery: sql.split("\n").slice(0, 3).join("\n"),
        source: "закреплено из результата",
        foundAt: "02:44",
        isNew: true,
      },
      ...c,
    ]);
    setNewEvidence((n) => n + 1);
  };

  return (
    <Section
      id="desk"
      title="Стол расследования"
      note="Сборка: шапка, схема слева, терминал над результатом (граница перетаскивается и двигается стрелками), справа вкладки. На узком экране колонки превращаются в нижние вкладки. DELETE, bank_transfers или «full_nam» в запросе покажут ошибки."
    >
      <Frame className="h-[820px] lg:h-[880px]">
        <DeskLayout
          className="h-full"
          caseCode="Дело № 01"
          caseTitle="Тёплая вода"
          dateTime="пн, 14 декабря · 02:44"
          rank="стажёр-аналитик"
          onMenu={() => {}}
          panel={panel}
          onPanelChange={(p) => {
            setPanel(p);
            if (p === "evidence") setNewEvidence(0);
          }}
          badges={{
            tasks: objectives.filter((o) => o.state === "active" && !o.optional).length,
            evidence: newEvidence || undefined,
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
            <ResultsGrid className="h-full" result={result} onPinRow={pin} pinnedRows={pinned} />
          }
          panels={{
            tasks: <ObjectiveList objectives={objectives} characters={CHARACTERS} onRevealHint={reveal} />,
            evidence: <EvidenceBoard cards={cards} />,
            protocol: (
              <ProtocolForm
                questions={PROTOCOL}
                values={protocol.values}
                onChange={protocol.onChange}
                onSubmit={protocol.submit}
                confirmedIds={protocol.confirmed}
                message={protocol.message}
                caseLabel="Дело № 01 · «Тёплая вода»"
              />
            ),
            reference: <ReferencePanel />,
          }}
        />
      </Frame>
    </Section>
  );
}

function ReferencePanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <SectionLabel>Шпаргалка SQL</SectionLabel>
        {CHEATSHEET.map((item) => (
          <div key={item.title} className="rounded-lg border border-frost-line bg-ink-deep/60 p-3">
            <div className="text-[13px] font-semibold text-steam">{item.title}</div>
            <pre className="mt-1.5 overflow-x-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-aurora">
              {item.code}
            </pre>
            <p className="mt-1.5 text-xs leading-relaxed text-frost-dim">{item.note}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <SectionLabel>Досье</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(CHARACTERS).map((c) => (
            <PortraitFrame key={c.id} character={c} size="card" />
          ))}
        </div>
      </div>
    </div>
  );
}
