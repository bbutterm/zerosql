"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, SQLite } from "@codemirror/lang-sql";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete";
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

/*
 * Тема «Зеркала» (раздел 7.6). Самые яркие в запросе — слова игрока (имена таблиц и столбцов),
 * ключевые слова тише, литералы — холодные «данные», каретка — единственное тёплое: человек.
 */
const mirrorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--scr-base)",
      color: "var(--ink-1)",
      height: "100%",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      fontSize: "var(--editor-size, 14px)",
      lineHeight: "var(--editor-leading, 22px)",
    },
    ".cm-content": { padding: "10px 0", caretColor: "var(--sodium)" },
    ".cm-line": { padding: "0 12px 0 0" },
    ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--sodium)", marginLeft: "-1px" },
    ".cm-gutters": {
      backgroundColor: "var(--scr-base)",
      color: "var(--ink-4)",
      border: "none",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "40px",
      padding: "0 12px 0 0",
      textAlign: "right",
      boxSizing: "border-box",
    },
    ".cm-activeLineGutter": { backgroundColor: "#171b1e", color: "var(--ink-3)" },
    ".cm-activeLine": { backgroundColor: "#171b1e" },
    ".cm-selectionBackground": { backgroundColor: "#22292c !important" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
      backgroundColor: "#2b3539 !important",
    },
    ".cm-content ::selection": { backgroundColor: "#2b3539" },
    ".cm-selectionMatch": { backgroundColor: "transparent" },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "transparent",
      color: "inherit",
      outline: "1px solid var(--ink-3)",
    },
    ".cm-nonmatchingBracket": { backgroundColor: "transparent", outline: "1px dashed var(--alarm)" },
    ".cm-searchMatch": { backgroundColor: "var(--sodium-wash)", outline: "none" },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      textDecoration: "underline dashed var(--alarm) 1px",
      textUnderlineOffset: "3px",
    },
    ".cm-placeholder": { color: "var(--ink-4)", fontStyle: "normal" },

    /* Автодополнение: окно «Зеркала», без иконок типов */
    ".cm-tooltip": {
      backgroundColor: "var(--scr-chrome)",
      border: "1px solid var(--line-strong)",
      borderRadius: "0",
      boxShadow: "var(--shadow-menu)",
      color: "var(--ink-1)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--font-mono)",
      fontSize: "13px",
      maxHeight: "calc(22px * 10)",
      minWidth: "220px",
      padding: "0",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
      display: "flex",
      alignItems: "center",
      height: "22px",
      lineHeight: "22px",
      padding: "0 10px",
      color: "var(--ink-1)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--scr-select)",
      color: "var(--ink-1)",
    },
    ".cm-completionLabel": { flex: "0 1 auto" },
    ".cm-completionMatchedText": { textDecoration: "none", color: "var(--ink-1)" },
    ".cm-completionDetail": {
      marginLeft: "auto",
      paddingLeft: "16px",
      fontFamily: "var(--font-sans)",
      fontSize: "12px",
      fontStyle: "normal",
      color: "var(--ink-3)",
    },
    ".cm-completionIcon": { display: "none" },
    ".cm-tooltip-hover, .cm-tooltip-lint": {
      fontFamily: "var(--font-sans)",
      fontSize: "12px",
      lineHeight: "16px",
      padding: "4px 8px",
    },
    ".cm-panels": { backgroundColor: "var(--scr-chrome)", color: "var(--ink-1)" },
  },
  { dark: true }
);

const mirrorHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword], color: "var(--ink-2)" },
  { tag: [t.string, t.special(t.string), t.number, t.bool, t.null, t.atom], color: "var(--cold)" },
  { tag: [t.lineComment, t.blockComment, t.comment], color: "var(--ink-3)", fontStyle: "normal" },
  {
    tag: [
      t.name,
      t.variableName,
      t.propertyName,
      t.typeName,
      t.special(t.name),
      t.standard(t.name),
      t.function(t.variableName),
      t.function(t.name),
    ],
    color: "var(--ink-1)",
  },
  {
    tag: [t.operator, t.compareOperator, t.arithmeticOperator, t.punctuation, t.paren, t.separator, t.bracket, t.squareBracket],
    color: "var(--ink-3)",
  },
]);

/**
 * Имена столбцов без префикса таблицы. Штатное дополнение lang-sql предлагает
 * столбцы только после «таблица.», а новичку нужно и просто «WHERE se…» → seconds.
 */
function columnCompletion(schema: TableInfo[]) {
  const byColumn = new Map<string, { tables: string[]; type: string }>();
  for (const table of schema) {
    for (const col of table.columns) {
      const prev = byColumn.get(col.name);
      byColumn.set(col.name, {
        tables: [...(prev?.tables ?? []), table.name],
        type: prev?.type ?? col.type.toLowerCase(),
      });
    }
  }
  const options: Completion[] = [...byColumn].map(([name, info]) => ({
    label: name,
    type: "property",
    detail: info.tables.length === 1 ? `${info.tables[0]}, ${info.type || "столбец"}` : info.tables.join(", "),
    boost: -1,
  }));
  return (ctx: CompletionContext) => {
    const word = ctx.matchBefore(/[\wЀ-ӿ]+/);
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
  autocompletion: false,
  drawSelection: false,
  foldGutter: false,
  searchKeymap: false,
  syntaxHighlighting: false,
  highlightSelectionMatches: false,
} as const;

/**
 * CodeMirror меряет высоты строк при создании; если в этот момент шрифт ещё запасной,
 * номера строк остаются со старыми высотами. Повторяем полный замер так же, как сам
 * CodeMirror делает по document.fonts.ready, — после первой отрисовки и после догрузки шрифтов.
 */
function remeasureAfterFonts(view: EditorView) {
  const refresh = () => {
    if (!view.dom.isConnected) {
      document.fonts?.removeEventListener("loadingdone", refresh);
      return;
    }
    const state = (view as unknown as { viewState?: { mustMeasureContent?: unknown } }).viewState;
    if (state && "mustMeasureContent" in state) state.mustMeasureContent = "refresh";
    view.requestMeasure();
  };
  requestAnimationFrame(() => requestAnimationFrame(refresh));
  document.fonts?.addEventListener("loadingdone", refresh);
}

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
      mirrorTheme,
      syntaxHighlighting(mirrorHighlight),
      // Каретка: 2 px натрия, мигание 530 мс включена / 530 мс выключена
      drawSelection({ cursorBlinkRate: 1060 }),
      autocompletion({ icons: false }),
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
    <div ref={wrapRef} className="zs-editor h-full">
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
          remeasureAfterFonts(view);
        }}
      />
    </div>
  );
}
