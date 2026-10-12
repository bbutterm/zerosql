"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, SQLite } from "@codemirror/lang-sql";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Completion, CompletionContext } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import type { TableInfo } from "@/types/database";

export interface SqlEditorHandle {
  /** Вставить текст в позицию курсора (с пробелом-разделителем при необходимости) */
  insert: (text: string) => void;
  focus: () => void;
}

export interface SqlCodeMirrorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  schema?: TableInfo[];
  readOnly?: boolean;
  placeholder?: string;
  handleRef?: Ref<SqlEditorHandle>;
  ariaLabel?: string;
}

const MONO = "var(--font-jetbrains), 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const polarTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "#e4eaf4",
      fontSize: "14px",
      height: "100%",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: MONO,
      lineHeight: "1.7",
      scrollbarWidth: "thin",
      scrollbarColor: "rgb(188 203 224 / 0.22) transparent",
    },
    ".cm-content": { caretColor: "#2ee6c5", padding: "12px 0" },
    ".cm-line": { padding: "0 14px 0 4px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#2ee6c5", borderLeftWidth: "2px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#56627e",
      border: "none",
      paddingLeft: "4px",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 6px", minWidth: "26px" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#ffb547" },
    ".cm-activeLine": { backgroundColor: "rgb(188 203 224 / 0.035)" },
    ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "rgb(46 230 197 / 0.24) !important" },
    ".cm-selectionMatch": { backgroundColor: "rgb(139 92 246 / 0.22)" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "rgb(255 181 71 / 0.16)",
      color: "#ffb547",
      outline: "none",
    },
    ".cm-placeholder": { color: "#56627e", fontStyle: "italic" },
    ".cm-tooltip": {
      backgroundColor: "#141c33",
      border: "1px solid rgb(188 203 224 / 0.18)",
      borderRadius: "8px",
      boxShadow: "0 18px 40px -16px rgb(0 0 0 / 0.8)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": { fontFamily: MONO, fontSize: "12.5px", maxHeight: "16em" },
    ".cm-tooltip-autocomplete > ul > li": { padding: "4px 10px !important", color: "#bccbe0", lineHeight: "1.5" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "rgb(46 230 197 / 0.16) !important",
      color: "#eef3fa !important",
    },
    ".cm-completionIcon": { opacity: "0.75", color: "#b9a0ff", width: "1.2em" },
    ".cm-completionDetail": { color: "#8593b0", fontStyle: "normal", marginLeft: "8px" },
    ".cm-completionMatchedText": { textDecoration: "none", color: "#2ee6c5", fontWeight: "600" },
    ".cm-panels": { backgroundColor: "#10172b", color: "#e4eaf4" },
  },
  { dark: true }
);

const polarHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "#2ee6c5", fontWeight: "600" },
  { tag: [t.operatorKeyword, t.modifier, t.controlKeyword], color: "#2ee6c5" },
  { tag: [t.string, t.special(t.string)], color: "#ffb547" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "#b9a0ff" },
  { tag: [t.lineComment, t.blockComment, t.comment], color: "#5f6c89", fontStyle: "italic" },
  { tag: [t.typeName, t.standard(t.name)], color: "#8fd3ff" },
  { tag: [t.function(t.variableName), t.function(t.name)], color: "#eef3fa", fontWeight: "500" },
  { tag: [t.operator, t.compareOperator, t.arithmeticOperator], color: "#bccbe0" },
  { tag: [t.punctuation, t.paren, t.separator, t.bracket, t.squareBracket], color: "#8593b0" },
  { tag: t.special(t.name), color: "#f3cf9a" },
  { tag: [t.name, t.variableName, t.propertyName], color: "#e4eaf4" },
]);

/**
 * Имена столбцов без префикса таблицы. Штатное дополнение lang-sql предлагает
 * столбцы только после «таблица.», а новичку нужно и просто «WHERE se…» → seconds.
 */
function columnCompletion(schema: TableInfo[]) {
  const byColumn = new Map<string, string[]>();
  for (const table of schema) {
    for (const col of table.columns) {
      byColumn.set(col.name, [...(byColumn.get(col.name) ?? []), table.name]);
    }
  }
  const options: Completion[] = [...byColumn].map(([name, tables]) => ({
    label: name,
    type: "property",
    detail: tables.join(", "),
    boost: -1,
  }));
  return (ctx: CompletionContext) => {
    const word = ctx.matchBefore(/[\w\u0400-\u04FF]+/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    if (ctx.state.sliceDoc(word.from - 1, word.from) === ".") return null;
    return { from: word.from, options, validFor: /^\w*$/ };
  };
}

/** Ctrl/⌘+Enter → всплывающее DOM-событие; компонент слушает его на обёртке */
const RUN_EVENT = "zerosql:run";
const runKeymap = Prec.highest(
  keymap.of(
    ["Mod-Enter", "Shift-Enter"].map((key) => ({
      key,
      run: (view: EditorView) => {
        view.dom.dispatchEvent(new CustomEvent(RUN_EVENT, { bubbles: true }));
        return true;
      },
    }))
  )
);

const BASIC_SETUP = {
  lineNumbers: true,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  foldGutter: false,
  searchKeymap: false,
  syntaxHighlighting: false,
} as const;

export default function SqlCodeMirror({
  value,
  onChange,
  onRun,
  schema,
  readOnly = false,
  placeholder,
  handleRef,
  ariaLabel = "SQL-запрос",
}: SqlCodeMirrorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = () => onRun();
    el.addEventListener(RUN_EVENT, handler);
    return () => el.removeEventListener(RUN_EVENT, handler);
  }, [onRun]);

  useImperativeHandle(
    handleRef,
    () => ({
      insert(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const before = from > 0 ? view.state.sliceDoc(from - 1, from) : "";
        const needsSpace = before !== "" && !/[\s(,.]/.test(before);
        const insert = (needsSpace ? " " : "") + text;
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
    }),
    []
  );

  const schemaKey = (schema ?? []).map((tb) => `${tb.name}:${tb.columns.map((c) => c.name).join(",")}`).join("|");

  const extensions = useMemo(() => {
    const schemaObj: Record<string, string[]> = {};
    for (const table of schema ?? []) schemaObj[table.name] = table.columns.map((c) => c.name);
    return [
      polarTheme,
      syntaxHighlighting(polarHighlight),
      sql({ dialect: SQLite, schema: schemaObj, upperCaseKeywords: true }),
      SQLite.language.data.of({ autocomplete: columnCompletion(schema ?? []) }),
      runKeymap,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
    ];
    // schemaKey стабилизирует пересоздание при той же схеме
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaKey, readOnly, ariaLabel]);

  return (
    <div ref={wrapRef} className="h-full">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="none"
        height="100%"
        className="h-full"
        placeholder={placeholder}
        basicSetup={BASIC_SETUP}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
      />
    </div>
  );
}
