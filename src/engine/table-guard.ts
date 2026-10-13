/**
 * Лёгкий анализатор SQL: токенизирует запрос (с учётом комментариев, строк и
 * кавычек), находит упомянутые таблицы и CTE, определяет тип и цель каждого
 * выражения. На этом строятся проверки запроса игрока (GAME_DESIGN, разд. 6.14):
 *  - доступ к таблицам по сюжету (закрытые таблицы блокируются);
 *  - белый список записи: INSERT/UPDATE/DELETE/REPLACE только в
 *    writableTables дела, BEGIN/COMMIT/ROLLBACK — только если он не пуст;
 *  - DDL: только CREATE VIEW / DROP VIEW своих представлений и только при allowViews;
 *  - всегда запрещены ATTACH/DETACH, PRAGMA (кроме table_info, table_xinfo,
 *    foreign_key_list) и квалификаторы main. / temp. у имён таблиц: временные
 *    представления горизонта перекрывают таблицы main, обходить их нельзя.
 */

export type TokenType = "word" | "ident" | "string" | "number" | "punct" | "param";

export interface Token {
  type: TokenType;
  /** Для word/ident — имя в нижнем регистре, для string — содержимое без кавычек */
  value: string;
  pos: number;
}

export type StatementKind = "read" | "write";

/**
 * Что делает выражение:
 *  select — SELECT / VALUES / WITH … SELECT; explain — EXPLAIN (не выполняется);
 *  insert / update / delete — DML (REPLACE — это insert);
 *  create_view / drop_view — DDL представлений; ddl — прочий DDL и обслуживание
 *  (CREATE TABLE, DROP TABLE, ALTER, VACUUM, REINDEX, ANALYZE);
 *  transaction — BEGIN / COMMIT / END / ROLLBACK / SAVEPOINT / RELEASE;
 *  pragma; attach — ATTACH / DETACH; other — неизвестное начало (ошибку вернёт SQLite).
 */
export type StatementAction =
  | "select"
  | "explain"
  | "insert"
  | "update"
  | "delete"
  | "create_view"
  | "drop_view"
  | "ddl"
  | "transaction"
  | "pragma"
  | "attach"
  | "other";

export interface StatementInfo {
  kind: StatementKind;
  /** Ключевое слово, определившее тип: SELECT, INSERT, DROP, ... */
  keyword: string;
  action: StatementAction;
  /** Цель: таблица DML, имя представления, таблица-аргумент PRAGMA (в нижнем регистре) */
  target?: string;
  /** CREATE TEMP … */
  temp?: boolean;
  /** Имя PRAGMA (table_info, foreign_keys, …) */
  pragma?: string;
  /** PRAGMA с присваиванием: PRAGMA x = y */
  assigns?: boolean;
}

/** Имя таблицы с квалификатором схемы: main.persons, temp.plate_reads */
export interface QualifiedName {
  schema: string;
  name: string;
}

export interface SqlAnalysis {
  tables: string[];
  ctes: string[];
  statements: StatementInfo[];
  /** Имена с квалификатором схемы в позициях таблиц (FROM, JOIN, INTO, UPDATE, цели DDL и PRAGMA) */
  qualified: QualifiedName[];
}

const ALWAYS_ALLOWED = new Set(["sqlite_master", "sqlite_schema", "sqlite_temp_master", "sqlite_temp_schema"]);

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

export const isName = (t: Token | undefined): t is Token => !!t && (t.type === "word" || t.type === "ident");
export const isWord = (t: Token | undefined, value: string) => !!t && t.type === "word" && t.value === value;
export const isPunct = (t: Token | undefined, value: string) => !!t && t.type === "punct" && t.value === value;

/** Индекс токена после парной закрывающей скобки (tokens[start] должен быть "(") */
export function skipParens(tokens: Token[], start: number): number {
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

function collectTables(tokens: Token[], qualified: QualifiedName[] = []): Set<string> {
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
          qualified.push({ schema: t.value, name });
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

export function splitStatements(tokens: Token[]): Token[][] {
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

const TRANSACTION_KEYWORDS = new Set(["begin", "commit", "end", "rollback", "savepoint", "release"]);
const DDL_KEYWORDS = new Set(["create", "drop", "alter", "vacuum", "reindex", "analyze"]);
const DML_VERBS = new Set(["insert", "update", "delete", "replace"]);

/** Имя (возможно, с квалификатором схемы) начиная с tokens[j] */
function readName(tokens: Token[], j: number): { name?: string; schema?: string; next: number } {
  const t = tokens[j];
  if (!isName(t)) return { next: j };
  if (isPunct(tokens[j + 1], ".") && isName(tokens[j + 2])) {
    return { schema: t.value, name: tokens[j + 2].value, next: j + 3 };
  }
  return { name: t.value, next: j + 1 };
}

/** Пропускает IF [NOT] EXISTS */
function skipIfExists(tokens: Token[], j: number): number {
  if (!isWord(tokens[j], "if")) return j;
  let k = j + 1;
  if (isWord(tokens[k], "not")) k++;
  if (isWord(tokens[k], "exists")) k++;
  return k;
}

function parseStatement(tokens: Token[], qualified: QualifiedName[]): StatementInfo {
  const target = (r: { name?: string; schema?: string }) => {
    if (r.schema && r.name) qualified.push({ schema: r.schema, name: r.name });
    return r.name;
  };

  let i = 0;
  if (isWord(tokens[0], "with")) {
    // WITH ... может предварять INSERT/UPDATE/DELETE — ищем глагол на верхнем уровне
    let depth = 0;
    let verb = -1;
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      if (isPunct(t, "(")) depth++;
      else if (isPunct(t, ")")) depth--;
      else if (depth === 0 && t.type === "word" && (DML_VERBS.has(t.value) || t.value === "select" || t.value === "values")) {
        verb = k;
        break;
      }
    }
    if (verb === -1 || !DML_VERBS.has(tokens[verb].value)) return { kind: "read", keyword: "WITH", action: "select" };
    i = verb;
  }

  const first = tokens[i];
  const keyword = first.value;
  const KEYWORD = keyword.toUpperCase();

  if (keyword === "select" || keyword === "values") return { kind: "read", keyword: KEYWORD, action: "select" };
  if (keyword === "explain") return { kind: "read", keyword: KEYWORD, action: "explain" };

  if (keyword === "insert" || keyword === "replace") {
    let depth = 0;
    for (let k = i + 1; k < tokens.length; k++) {
      if (isPunct(tokens[k], "(")) depth++;
      else if (isPunct(tokens[k], ")")) depth--;
      else if (depth === 0 && isWord(tokens[k], "into")) {
        return { kind: "write", keyword: KEYWORD, action: "insert", target: target(readName(tokens, k + 1)) };
      }
    }
    return { kind: "write", keyword: KEYWORD, action: "insert" };
  }
  if (keyword === "update") {
    let j = i + 1;
    if (isWord(tokens[j], "or")) j += 2;
    return { kind: "write", keyword: KEYWORD, action: "update", target: target(readName(tokens, j)) };
  }
  if (keyword === "delete") {
    const j = isWord(tokens[i + 1], "from") ? i + 2 : i + 1;
    return { kind: "write", keyword: KEYWORD, action: "delete", target: target(readName(tokens, j)) };
  }

  if (keyword === "create") {
    let j = i + 1;
    const temp = isWord(tokens[j], "temp") || isWord(tokens[j], "temporary");
    if (temp) j++;
    if (isWord(tokens[j], "view")) {
      const name = target(readName(tokens, skipIfExists(tokens, j + 1)));
      return { kind: "write", keyword: KEYWORD, action: "create_view", target: name, ...(temp ? { temp } : {}) };
    }
    return { kind: "write", keyword: KEYWORD, action: "ddl", ...(temp ? { temp } : {}) };
  }
  if (keyword === "drop") {
    if (isWord(tokens[i + 1], "view")) {
      const name = target(readName(tokens, skipIfExists(tokens, i + 2)));
      return { kind: "write", keyword: KEYWORD, action: "drop_view", target: name };
    }
    return { kind: "write", keyword: KEYWORD, action: "ddl" };
  }
  if (DDL_KEYWORDS.has(keyword)) return { kind: "write", keyword: KEYWORD, action: "ddl" };
  if (TRANSACTION_KEYWORDS.has(keyword)) return { kind: "write", keyword: KEYWORD, action: "transaction" };
  if (keyword === "attach" || keyword === "detach") return { kind: "write", keyword: KEYWORD, action: "attach" };

  if (keyword === "pragma") {
    const name = readName(tokens, i + 1);
    target(name);
    const pragma = name.name;
    const assigns = isPunct(tokens[name.next], "=");
    let arg: string | undefined;
    if (isPunct(tokens[name.next], "(")) {
      const a = tokens[name.next + 1];
      if (a && (a.type === "word" || a.type === "ident" || a.type === "string")) arg = a.value.toLowerCase();
    }
    return {
      kind: assigns ? "write" : "read",
      keyword: "PRAGMA",
      action: "pragma",
      ...(pragma ? { pragma } : {}),
      ...(arg ? { target: arg } : {}),
      ...(assigns ? { assigns } : {}),
    };
  }

  // Неизвестное начало — пусть SQLite сам вернёт синтаксическую ошибку
  return { kind: "read", keyword: KEYWORD, action: "other" };
}

export function analyzeSql(sql: string): SqlAnalysis {
  const tokens = tokenize(sql);
  const qualified: QualifiedName[] = [];
  const ctes = collectCtes(tokens);
  const tables = collectTables(tokens, qualified);
  for (const cte of ctes) tables.delete(cte);
  const statements = splitStatements(tokens).map((st) => parseStatement(st, qualified));
  return {
    tables: Array.from(tables),
    ctes: Array.from(ctes),
    statements,
    qualified,
  };
}

export function extractReferencedTables(sql: string): string[] {
  return analyzeSql(sql).tables;
}

/** Какие представления запрос создаёт и удаляет — стор ведёт по ним список playerViews */
export function viewChanges(sql: string): { created: string[]; dropped: string[] } {
  const created: string[] = [];
  const dropped: string[] = [];
  for (const st of analyzeSql(sql).statements) {
    if (st.action === "create_view" && st.target) created.push(st.target);
    if (st.action === "drop_view" && st.target) dropped.push(st.target);
  }
  return { created, dropped };
}

// --- Политика доступа ---

export type AccessDenial = "locked_table" | "read_only" | "forbidden";

export interface AccessCheck {
  allowed: boolean;
  reason?: AccessDenial;
  /** Закрытая таблица или таблица/представление, куда нельзя писать */
  blockedTable?: string;
  /** Команда или конструкция, из-за которой запрос отклонён: DELETE, ATTACH, PRAGMA, main. */
  blockedKeyword?: string;
}

export function checkTableAccess(sql: string, unlockedTables: string[] | null): AccessCheck {
  return tableAccess(analyzeSql(sql).tables, unlockedTables, []);
}

function tableAccess(
  tables: readonly string[],
  unlockedTables: readonly string[] | null,
  playerViews: readonly string[]
): AccessCheck {
  if (unlockedTables === null) return { allowed: true };

  const allowed = new Set(unlockedTables.map((t) => t.toLowerCase()));
  for (const name of ALWAYS_ALLOWED) allowed.add(name);
  for (const v of playerViews) allowed.add(v.toLowerCase());

  for (const table of tables) {
    if (!allowed.has(table)) {
      return { allowed: false, reason: "locked_table", blockedTable: table };
    }
  }
  return { allowed: true };
}

/** PRAGMA, доступные игроку: только чтение структуры */
export const ALLOWED_PRAGMAS: ReadonlySet<string> = new Set(["table_info", "table_xinfo", "foreign_key_list"]);

/** Квалификаторы схемы, которые игроку запрещены: обход представлений горизонта */
const FORBIDDEN_SCHEMAS = new Set(["main", "temp", "temporary"]);

/** Политика запросов игрока в деле (v2) */
export interface SqlAccessPolicy {
  /** Открытые таблицы; null — все */
  unlockedTables: string[] | null;
  /** Белый список записи (CaseDef.writableTables); пуст — только чтение */
  writableTables?: readonly string[];
  /** CREATE VIEW / DROP VIEW своих представлений (CaseDef.allowViews) */
  allowViews?: boolean;
  /**
   * Представления, созданные игроком (стор ведёт список по viewChanges):
   * их можно читать и удалять. Чужие представления (горизонт, arch16_*) удалять нельзя.
   */
  playerViews?: readonly string[];
}

/**
 * Политика v1. allowWrites: true — прежний режим «можно всё»: любая запись,
 * DDL и транзакции. Запреты ATTACH, PRAGMA и main./temp. действуют всегда.
 * @deprecated v2 передаёт writableTables / allowViews.
 */
export interface SqlPolicy extends SqlAccessPolicy {
  allowWrites?: boolean;
}

/**
 * Полная проверка запроса игрока. Порядок: запрещённое всегда (forbidden) →
 * запись и DDL вне белого списка (read_only) → закрытые таблицы (locked_table).
 */
export function checkSqlAccess(sql: string, policy: SqlAccessPolicy, legacyWrites = false): AccessCheck {
  const analysis = analyzeSql(sql);
  const playerViews = (policy.playerViews ?? []).map((v) => v.toLowerCase());

  for (const q of analysis.qualified) {
    if (FORBIDDEN_SCHEMAS.has(q.schema)) {
      return { allowed: false, reason: "forbidden", blockedKeyword: `${q.schema}.`, blockedTable: q.name };
    }
  }

  const writable = new Set((policy.writableTables ?? []).map((t) => t.toLowerCase()));
  const canWrite = legacyWrites || writable.size > 0;
  const extraTables: string[] = [];

  for (const st of analysis.statements) {
    switch (st.action) {
      case "attach":
        return { allowed: false, reason: "forbidden", blockedKeyword: st.keyword };
      case "pragma":
        if (!st.pragma || !ALLOWED_PRAGMAS.has(st.pragma) || st.assigns) {
          return { allowed: false, reason: "forbidden", blockedKeyword: "PRAGMA" };
        }
        if (st.target) extraTables.push(st.target);
        break;
      case "transaction":
        if (!canWrite) return { allowed: false, reason: "read_only", blockedKeyword: st.keyword };
        break;
      case "insert":
      case "update":
      case "delete":
        if (!legacyWrites && !(st.target && writable.has(st.target))) {
          return {
            allowed: false,
            reason: "read_only",
            blockedKeyword: st.keyword,
            ...(st.target ? { blockedTable: st.target } : {}),
          };
        }
        break;
      case "create_view":
        if (st.temp) return { allowed: false, reason: "forbidden", blockedKeyword: "CREATE TEMP VIEW" };
        if (!legacyWrites && !policy.allowViews) return { allowed: false, reason: "read_only", blockedKeyword: st.keyword };
        break;
      case "drop_view":
        if (legacyWrites) break;
        if (!policy.allowViews) return { allowed: false, reason: "read_only", blockedKeyword: st.keyword };
        if (!st.target || !playerViews.includes(st.target)) {
          return {
            allowed: false,
            reason: "read_only",
            blockedKeyword: st.keyword,
            ...(st.target ? { blockedTable: st.target } : {}),
          };
        }
        break;
      case "ddl":
        if (!legacyWrites) return { allowed: false, reason: "read_only", blockedKeyword: st.keyword };
        if (st.temp) return { allowed: false, reason: "forbidden", blockedKeyword: `${st.keyword} TEMP` };
        break;
      default:
        break;
    }
  }

  return tableAccess([...analysis.tables, ...extraTables], policy.unlockedTables, playerViews);
}

/**
 * Совместимая обёртка для v1: { unlockedTables, allowWrites }. Без allowWrites —
 * та же политика v2 (writableTables / allowViews / playerViews, если переданы).
 */
export function checkSqlPolicy(sql: string, policy: SqlPolicy): AccessCheck {
  const legacy = policy.allowWrites === true && policy.writableTables === undefined;
  return checkSqlAccess(sql, policy, legacy);
}

export interface PolicyViolation {
  error: string;
  errorKind: AccessDenial;
  errorHelp: { title: string; explanation: string; suggestion?: string };
}

/** Текст отказа для игрока (разд. 7.2): что запрещено и что можно вместо этого */
export function describePolicyViolation(access: AccessCheck, policy: SqlAccessPolicy = { unlockedTables: null }): PolicyViolation {
  const keyword = access.blockedKeyword ?? "";
  const table = access.blockedTable;
  const writable = policy.writableTables ?? [];

  if (access.reason === "forbidden") {
    if (keyword.endsWith(".")) {
      return {
        error: `[ЗАПРЕЩЕНО] Квалификатор «${keyword}» у имени таблицы недоступен.`,
        errorKind: "forbidden",
        errorHelp: {
          title: "Без квалификаторов схемы",
          explanation: `Обращайтесь к таблице просто по имени: ${table ?? "persons"}, без «${keyword}».`,
          suggestion: "Архив показывает данные на текущий момент игры — так и задумано.",
        },
      };
    }
    if (keyword === "PRAGMA") {
      return {
        error: "[ЗАПРЕЩЕНО] Из PRAGMA доступны только table_info, table_xinfo и foreign_key_list.",
        errorKind: "forbidden",
        errorHelp: {
          title: "PRAGMA недоступна",
          explanation: "Настройки базы менять нельзя. Посмотреть структуру можно: PRAGMA table_info(persons).",
          suggestion: "Связи таблиц: PRAGMA foreign_key_list(имя_таблицы).",
        },
      };
    }
    if (keyword.includes("TEMP")) {
      return {
        error: "[ЗАПРЕЩЕНО] Временные (TEMP) объекты создавать нельзя.",
        errorKind: "forbidden",
        errorHelp: {
          title: "Без TEMP",
          explanation: "Временные объекты перекрывают таблицы архива. Создайте обычное представление: CREATE VIEW имя AS SELECT …",
        },
      };
    }
    return {
      error: `[ЗАПРЕЩЕНО] Команда ${keyword} недоступна.`,
      errorKind: "forbidden",
      errorHelp: {
        title: "Команда недоступна",
        explanation: `${keyword} подключает чужие базы. Работайте с архивом, который открыт.`,
      },
    };
  }

  if (access.reason === "read_only") {
    const where = writable.length ? `Запись разрешена в: ${writable.join(", ")}.` : "В этом деле архив только для чтения.";
    if (keyword === "DROP" && table && policy.allowViews) {
      return {
        error: `[ТОЛЬКО ЧТЕНИЕ] Представление «${table}» удалять нельзя.`,
        errorKind: "read_only",
        errorHelp: {
          title: "Чужое представление",
          explanation: "Удалять можно только свои представления — созданные через CREATE VIEW в этом деле.",
        },
      };
    }
    if (["INSERT", "REPLACE", "UPDATE", "DELETE"].includes(keyword) && table && writable.length) {
      return {
        error: `[ТОЛЬКО ЧТЕНИЕ] Таблица «${table}» только для чтения. ${where}`,
        errorKind: "read_only",
        errorHelp: {
          title: "Архив только для чтения",
          explanation: `${where} Остальное — улики, их не трогают.`,
          suggestion: `Запишите результат в одну из таблиц: ${writable.join(", ")}.`,
        },
      };
    }
    if (["BEGIN", "COMMIT", "END", "ROLLBACK", "SAVEPOINT", "RELEASE"].includes(keyword)) {
      return {
        error: `[ТОЛЬКО ЧТЕНИЕ] Команда ${keyword} не нужна: архив только для чтения.`,
        errorKind: "read_only",
        errorHelp: {
          title: "Транзакции не нужны",
          explanation: "Транзакции нужны, когда дело разрешает запись. Здесь хватит SELECT.",
        },
      };
    }
    const ddl = ["CREATE", "DROP", "ALTER", "VACUUM", "REINDEX", "ANALYZE"].includes(keyword);
    return {
      error: `[ТОЛЬКО ЧТЕНИЕ] Команда ${keyword} недоступна: архив нельзя изменять.`,
      errorKind: "read_only",
      errorHelp: {
        title: "Архив только для чтения",
        explanation: ddl
          ? policy.allowViews
            ? `Из команд, меняющих структуру, доступны только CREATE VIEW и DROP VIEW своих представлений.`
            : `Команды, меняющие структуру (${keyword}), в этом деле запрещены — улики нельзя трогать.`
          : `Команды, меняющие данные (${keyword}), в этом деле запрещены — улики нельзя трогать. ${where}`,
        suggestion: "Используйте SELECT, чтобы найти нужное. Если очень хочется — WITH … SELECT тоже можно.",
      },
    };
  }

  return {
    error: `[ДОСТУП ЗАПРЕЩЁН] Таблица «${table}» ещё не разблокирована.`,
    errorKind: "locked_table",
    errorHelp: {
      title: "Доступ закрыт",
      explanation: `Таблица «${table}» пока засекречена.`,
      suggestion: "Продолжайте расследование — доступ к новым данным откроется по ходу дела.",
    },
  };
}
