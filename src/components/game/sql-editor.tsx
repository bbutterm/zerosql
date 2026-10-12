"use client";

import { useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, SQLite } from "@codemirror/lang-sql";
import { keymap } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import type { TableInfo } from "@/types/database";

const noirTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "oklch(0.1 0.005 280)",
      color: "oklch(0.75 0.12 85)",
      fontFamily: "var(--font-mono), 'Geist Mono', monospace",
      fontSize: "14px",
    },
    ".cm-content": {
      caretColor: "oklch(0.75 0.12 85)",
    },
    ".cm-cursor": {
      borderLeftColor: "oklch(0.75 0.12 85)",
      borderLeftWidth: "2px",
    },
    ".cm-gutters": {
      backgroundColor: "oklch(0.08 0.005 280)",
      color: "oklch(0.4 0.01 270)",
      border: "none",
      borderRight: "1px solid oklch(0.2 0.008 280)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "oklch(0.15 0.005 280)",
      color: "oklch(0.75 0.12 85)",
    },
    ".cm-activeLine": {
      backgroundColor: "oklch(0.13 0.005 280)",
    },
    ".cm-matchingBracket": {
      backgroundColor: "oklch(0.25 0.05 85)",
      outline: "none",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "oklch(0.4 0.1 85 / 0.7) !important",
    },
    ".cm-selectionMatch": {
      backgroundColor: "oklch(0.35 0.06 85 / 0.4)",
    },
    /* Native selection fallback */
    ".cm-content ::selection": {
      backgroundColor: "oklch(0.4 0.1 85 / 0.7)",
    },
    ".cm-content ::-moz-selection": {
      backgroundColor: "oklch(0.4 0.1 85 / 0.7)",
    },
    /* Ensure selection layer is above line backgrounds */
    ".cm-selectionLayer": {
      zIndex: "2 !important",
    },
    ".cm-line": {
      position: "relative",
    },
  },
  { dark: true }
);

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  schema?: TableInfo[];
}

export function SqlEditor({
  value,
  onChange,
  onExecute,
  schema,
}: SqlEditorProps) {
  const schemaObj: Record<string, string[]> = {};
  if (schema) {
    for (const table of schema) {
      schemaObj[table.name] = table.columns.map((c) => c.name);
    }
  }

  const executeKeymap = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          {
            key: "Ctrl-Enter",
            run: () => {
              onExecute();
              return true;
            },
          },
          {
            key: "Cmd-Enter",
            run: () => {
              onExecute();
              return true;
            },
          },
        ])
      ),
    [onExecute]
  );

  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card">
        <span className="text-xs font-mono text-muted-foreground uppercase">
          SQL Terminal
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3">Ctrl+Enter — выполнить</span>
          <button
            onClick={onExecute}
            className="px-3 py-1 text-xs font-mono bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
          >
            Выполнить
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={value}
          onChange={handleChange}
          extensions={[
            noirTheme,
            sql({ dialect: SQLite, schema: schemaObj }),
            executeKeymap,
            EditorView.lineWrapping,
          ]}
          theme="none"
          height="100%"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            bracketMatching: true,
            autocompletion: true,
            foldGutter: false,
            drawSelection: false,
          }}
        />
      </div>
    </div>
  );
}
