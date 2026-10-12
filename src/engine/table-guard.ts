/**
 * Лёгкий анализатор SQL: токенизирует запрос (с учётом комментариев, строк и
 * кавычек), находит упомянутые таблицы и CTE, определяет тип каждого
 * выражения. На этом строятся две проверки:
 *  - доступ к таблицам по сюжету (закрытые таблицы блокируются);
 *  - режим «только чтение» (архив нельзя изменить, если дело этого не требует).
 */

export type TokenType = "word" | "ident" | "string" | "number" | "punct" | "param";

export interface Token {
  type: TokenType;
  /** Для word/ident — имя в нижнем регистре, для string — содержимое без кавычек */
  value: string;
  pos: number;
}

export type StatementKind = "read" | "write";

export interface StatementInfo {
  kind: StatementKind;
  /** Ключевое слово, определившее тип: SELECT, INSERT, DROP, ... */
  keyword: string;
}

export interface SqlAnalysis {
  tables: string[];
  ctes: string[];
  statements: StatementInfo[];
}

const ALWAYS_ALLOWED = new Set(["sqlite_master", "sqlite_schema", "sqlite_temp_master", "sqlite_temp_schema"]);

const WRITE_KEYWORDS = new Set([
  "insert", "update", "delete", "replace", "create", "drop", "alter", "attach", "detach",
  "vacuum", "reindex", "analyze", "begin", "commit", "end", "rollback", "savepoint", "release",
]);

/** Слова, которые могут стоять между FROM/INTO/UPDATE/TABLE и именем таблицы */
const SKIP_BEFORE_NAME = new Set(["if", "not", "exists", "or", "ignore", "replace", "abort", "fail", "rollback", "only"]);

/** Ключевые слова, которые никогда не являются именем таблицы */
const NOT_A_TABLE = new Set([
  "select", "set", "values", "default", "where", "with", "lateral", "on", "using", "as",
]);

/**
 * Ключевые слова, завершающие FROM-клаузу на её уровне вложенности.
 * ON/USING сюда не входят: после условия соединения через запятую может
 * идти ещё одна таблица — `FROM a JOIN b ON ..., c`.
 */
const FROM_END = new Set([
  "where", "group", "order", "limit", "having", "window", "union", "intersect", "except",
  "returning", "set", "values", "select", "do",
]);

const WORD_START = /[\p{L}_]/u;
const WORD_CHAR = /[\p{L}\p{N}_$]/u;
const NUMBER_RE = /^(?:0x[0-9a-f]+|\d+(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)/i;

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const n = sql.length;
  let i = 0;

  const readQuoted = (close: string, doubled: boolean): { value: string; end: number } => {
    let value = "";
    let j = i + 1;
    while (j < n) {
      if (sql[j] === close) {
        if (doubled && sql[j + 1] === close) {
          value += close;
          j += 2;
          continue;
        }
        break;
      }
      value += sql[j];
      j++;
    }
    return { value, end: Math.min(j + 1, n) };
  };

  while (i < n) {
    const ch = sql[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }
    if (ch === "'") {
      const { value, end } = readQuoted("'", true);
      tokens.push({ type: "string", value, pos: i });
      i = end;
      continue;
    }
    if (ch === '"' || ch === "`") {
      const { value, end } = readQuoted(ch, true);
      tokens.push({ type: "ident", value: value.toLowerCase(), pos: i });
      i = end;
      continue;
    }
    if (ch === "[") {
      const { value, end } = readQuoted("]", false);
      tokens.push({ type: "ident", value: value.toLowerCase(), pos: i });
      i = end;
      continue;
    }
    if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(sql[j])) j++;
      tokens.push({ type: "word", value: sql.slice(i, j).toLowerCase(), pos: i });
      i = j;
      continue;
    }
    if (/\d/.test(ch) || (ch === "." && /\d/.test(sql[i + 1] ?? ""))) {
      const m = NUMBER_RE.exec(sql.slice(i));
      const len = m ? m[0].length : 1;
      tokens.push({ type: "number", value: sql.slice(i, i + len), pos: i });
      i += len;
      continue;
    }
    if (ch === "?" || ch === ":" || ch === "@" || ch === "$") {
      let j = i + 1;
      while (j < n && WORD_CHAR.test(sql[j])) j++;
      tokens.push({ type: "param", value: sql.slice(i, j), pos: i });
      i = j;
      continue;
    }
    tokens.push({ type: "punct", value: ch, pos: i });
    i++;
  }

  return tokens;
}

const isName = (t: Token | undefined): t is Token => !!t && (t.type === "word" || t.type === "ident");
const isWord = (t: Token | undefined, value: string) => !!t && t.type === "word" && t.value === value;
const isPunct = (t: Token | undefined, value: string) => !!t && t.type === "punct" && t.value === value;

/** Индекс токена после парной закрывающей скобки (tokens[start] должен быть "(") */
function skipParens(tokens: Token[], start: number): number {
  let depth = 0;
  for (let k = start; k < tokens.length; k++) {
    if (isPunct(tokens[k], "(")) depth++;
    else if (isPunct(tokens[k], ")")) {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return tokens.length;
}

function collectCtes(tokens: Token[]): Set<string> {
  const ctes = new Set<string>();
  for (let k = 0; k < tokens.length; k++) {
    if (!isWord(tokens[k], "with")) continue;
    let j = k + 1;
    if (isWord(tokens[j], "recursive")) j++;
    while (isName(tokens[j])) {
      ctes.add(tokens[j].value);
      j++;
      if (isPunct(tokens[j], "(")) j = skipParens(tokens, j);
      if (!isWord(tokens[j], "as")) break;
      j++;
      if (isWord(tokens[j], "not")) j++;
      if (isWord(tokens[j], "materialized")) j++;
      if (!isPunct(tokens[j], "(")) break;
      j = skipParens(tokens, j);
      if (!isPunct(tokens[j], ",")) break;
      j++;
    }
  }
  return ctes;
}

function collectTables(tokens: Token[]): Set<string> {
  const tables = new Set<string>();
  const fromDepths = new Set<number>();
  let depth = 0;
  let expect: null | "from" | "join" | "comma" | "into" | "update" | "table" = null;

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];

    if (isPunct(t, "(")) {
      depth++;
      expect = null; // подзапрос или аргументы — не имя таблицы
      continue;
    }
    if (isPunct(t, ")")) {
      fromDepths.delete(depth);
      depth = Math.max(0, depth - 1);
      expect = null;
      continue;
    }
    if (isPunct(t, ";")) {
      fromDepths.clear();
      depth = 0;
      expect = null;
      continue;
    }

    if (expect) {
      if (t.type === "word" && SKIP_BEFORE_NAME.has(t.value)) continue;
      if (isName(t) && !(t.type === "word" && NOT_A_TABLE.has(t.value))) {
        let name = t.value;
        if (isPunct(tokens[k + 1], ".") && isName(tokens[k + 2])) {
          name = tokens[k + 2].value;
          k += 2;
        }
        const isTableFunction =
          (expect === "from" || expect === "join" || expect === "comma") && isPunct(tokens[k + 1], "(");
        if (!isTableFunction) tables.add(name);
        expect = null;
        continue;
      }
      expect = null;
    }

    if (t.type === "word") {
      const prev = tokens[k - 1];
      if (t.value === "from") {
        // IS [NOT] DISTINCT FROM — оператор сравнения, а не FROM-клауза
        if (isWord(prev, "distinct") && (isWord(tokens[k - 2], "is") || isWord(tokens[k - 2], "not"))) continue;
        fromDepths.add(depth);
        expect = "from";
      } else if (t.value === "join") {
        expect = "join";
      } else if (t.value === "into") {
        expect = "into";
      } else if (t.value === "update") {
        expect = "update";
      } else if (t.value === "table") {
        expect = "table";
      } else if (fromDepths.has(depth) && FROM_END.has(t.value)) {
        fromDepths.delete(depth);
      }
      continue;
    }

    if (isPunct(t, ",") && fromDepths.has(depth)) {
      expect = "comma";
    }
  }

  return tables;
}

function splitStatements(tokens: Token[]): Token[][] {
  const statements: Token[][] = [];
  let current: Token[] = [];
  for (const t of tokens) {
    if (isPunct(t, ";")) {
      if (current.length) statements.push(current);
      current = [];
    } else {
      current.push(t);
    }
  }
  if (current.length) statements.push(current);
  return statements;
}

function classifyStatement(tokens: Token[]): StatementInfo {
  const first = tokens[0];
  const keyword = first.type === "word" ? first.value : first.value;

  if (keyword === "with") {
    // WITH ... может предварять INSERT/UPDATE/DELETE — ищем глагол на верхнем уровне
    let depth = 0;
    for (const t of tokens) {
      if (isPunct(t, "(")) depth++;
      else if (isPunct(t, ")")) depth--;
      else if (depth === 0 && t.type === "word" && ["insert", "update", "delete", "replace"].includes(t.value)) {
        return { kind: "write", keyword: t.value.toUpperCase() };
      }
    }
    return { kind: "read", keyword: "WITH" };
  }
  if (keyword === "pragma") {
    const assigns = tokens.some((t) => isPunct(t, "="));
    return { kind: assigns ? "write" : "read", keyword: "PRAGMA" };
  }
  if (keyword === "explain" || keyword === "select" || keyword === "values") {
    return { kind: "read", keyword: keyword.toUpperCase() };
  }
  if (WRITE_KEYWORDS.has(keyword)) {
    return { kind: "write", keyword: keyword.toUpperCase() };
  }
  // Неизвестное начало — пусть SQLite сам вернёт синтаксическую ошибку
  return { kind: "read", keyword: keyword.toUpperCase() };
}

export function analyzeSql(sql: string): SqlAnalysis {
  const tokens = tokenize(sql);
  const ctes = collectCtes(tokens);
  const tables = collectTables(tokens);
  for (const cte of ctes) tables.delete(cte);
  return {
    tables: Array.from(tables),
    ctes: Array.from(ctes),
    statements: splitStatements(tokens).map(classifyStatement),
  };
}

export function extractReferencedTables(sql: string): string[] {
  return analyzeSql(sql).tables;
}

export interface AccessCheck {
  allowed: boolean;
  reason?: "locked_table" | "read_only";
  blockedTable?: string;
  blockedKeyword?: string;
}

export function checkTableAccess(sql: string, unlockedTables: string[] | null): AccessCheck {
  if (unlockedTables === null) return { allowed: true };

  const allowed = new Set(unlockedTables.map((t) => t.toLowerCase()));
  for (const name of ALWAYS_ALLOWED) allowed.add(name);

  for (const table of extractReferencedTables(sql)) {
    if (!allowed.has(table)) {
      return { allowed: false, reason: "locked_table", blockedTable: table };
    }
  }
  return { allowed: true };
}

export interface SqlPolicy {
  unlockedTables: string[] | null;
  allowWrites?: boolean;
}

/** Полная проверка запроса: режим «только чтение» + доступ к таблицам */
export function checkSqlPolicy(sql: string, policy: SqlPolicy): AccessCheck {
  if (!policy.allowWrites) {
    const write = analyzeSql(sql).statements.find((s) => s.kind === "write");
    if (write) return { allowed: false, reason: "read_only", blockedKeyword: write.keyword };
  }
  return checkTableAccess(sql, policy.unlockedTables);
}
