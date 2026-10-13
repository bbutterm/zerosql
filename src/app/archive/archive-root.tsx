"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QueryResult } from "@/types/database";
import { useArchive } from "@/stores/archive";
import { handbook } from "@/data";
import { DeskLayout, type DeskMenuAction, type DeskMenuGroup, type StatusMessage } from "@/components/desk/desk-layout";
import { SchemaPanel } from "@/components/desk/schema-panel";
import { SqlTerminal, type SqlEditorHandle } from "@/components/desk/sql-terminal";
import { ResultsGrid } from "@/components/desk/results-grid";
import { markResultError } from "@/components/desk/sql-error-token";
import { HandbookPanel } from "@/components/case/handbook-panel";
import { LoadingScreen } from "@/components/play/screens";
import { MirrorWindow } from "@/components/play/mirror-window";
import { ScreenButton } from "@/components/kit/screen";

const MENUS: DeskMenuGroup[] = [
  { label: "Файл", items: [{ action: "journal", label: "Журнал дел" }, { action: "exit", label: "Выйти", separated: true }] },
  {
    label: "Запрос",
    items: [
      { action: "run", label: "Выполнить", keys: "Ctrl+Enter" },
      { action: "clear", label: "Очистить" },
      { action: "save", label: "Выгрузить результат в CSV" },
    ],
  },
  { label: "Справка", items: [{ action: "reference", label: "Справочник SQL" }] },
];

function csv(result: QueryResult): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [result.columns.map(esc).join(","), ...result.rows.map((r) => r.map(esc).join(","))].join("\n");
}

/** /archive: свободная игра после сезона (библия 10.4) — вся база, ни задач, ни квоты */
export function ArchiveRoot() {
  const router = useRouter();
  const a = useArchive();
  const editor = useRef<SqlEditorHandle>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    void useArchive.getState().open();
  }, []);

  if (a.status === "denied") {
    return (
      <MirrorWindow
        section="Архив"
        footer={
          <ScreenButton variant="primary" onClick={() => router.push("/play?journal=1")}>
            Журнал дел
          </ScreenButton>
        }
      >
        <div className="mx-auto max-w-[560px] px-4 py-10">
          <p className="ui-15 text-ink-1">
            <span className="font-semibold text-alarm">ОТКАЗАНО.</span> Архив открывается после дела 06. Допуск не выдан.
          </p>
        </div>
      </MirrorWindow>
    );
  }
  if (a.status !== "ready") {
    return <LoadingScreen lines={a.progress} error={a.status === "failed" ? a.error : null} onRetry={() => void a.open()} />;
  }

  const run = async () => {
    await a.run();
    markResultError(editor.current, useArchive.getState().result);
  };

  const exportCsv = () => {
    if (!a.result || a.result.error) return;
    const blob = new Blob([`﻿${csv(a.result)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "zerkalo-vygruzka.csv";
    link.click();
    URL.revokeObjectURL(url);
    setStatus({ id: ++seq.current, text: `Выгружено строк: ${a.result.rows.length}.` });
  };

  const onMenuAction = (action: DeskMenuAction) => {
    if (action === "run") void run();
    else if (action === "clear") a.setDraft("");
    else if (action === "save") exportCsv();
    else if (action === "journal") router.push("/play?journal=1");
    else if (action === "exit") router.push("/");
  };

  const open = a.schema.filter((t) => a.tables.includes(t.name));

  return (
    <DeskLayout
      caseCode="Архив"
      caseTitle={a.access === "full" ? "Свободный архив" : "Архив, частичный допуск"}
      dateTime="11.01.2027 13:00"
      menus={MENUS}
      onMenuAction={onMenuAction}
      statusMessage={status}
      defaultPanel="reference"
      schema={
        <SchemaPanel className="h-full" tables={a.schema} foreignKeys={a.foreignKeys} unlockedTables={a.tables} onInsert={(t) => editor.current?.insert(t)} />
      }
      terminal={
        <SqlTerminal
          className="h-full"
          handleRef={editor}
          value={a.draft}
          onChange={a.setDraft}
          onRun={() => void run()}
          running={a.busy}
          schema={open}
          toolbar={
            a.result && !a.result.error ? (
              <button type="button" className="ui-12 text-ink-3 hover:text-ink-1" onClick={exportCsv}>
                CSV
              </button>
            ) : undefined
          }
        />
      }
      results={
        <ResultsGrid
          className="h-full"
          result={a.result}
          sql={a.sql ?? undefined}
          running={a.busy}
          idleLines={[`Архив подключён. Доступно таблиц: ${a.tables.length}.`, "Задач нет. Часы стоят на 11.01.2027 13:00."]}
          onInsertValue={(v) => editor.current?.insert(v)}
          onSuggest={(name, wrong) => wrong && a.setDraft(a.draft.replace(new RegExp(`\\b${wrong}\\b`, "g"), name))}
        />
      }
      panels={{
        tasks: (
          <div className="px-3 pt-3 pb-6">
            <p className="ui-14 text-ink-2">Задач нет. Это архив: вся база для чтения, без квоты и оценки.</p>
            {a.history.length > 0 && (
              <>
                <p className="mt-4 mb-1 ui-12 text-ink-3">Последние запросы</p>
                <ol className="flex flex-col gap-2">
                  {a.history.slice(0, 12).map((sql) => (
                    <li key={sql}>
                      <button type="button" onClick={() => a.setDraft(sql)} className="w-full text-left mono-12 whitespace-pre-wrap text-ink-2 hover:text-ink-1">
                        {sql}
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        ),
        reference: <HandbookPanel entries={handbook} onInsert={(s) => editor.current?.insert(s)} />,
      }}
    />
  );
}
