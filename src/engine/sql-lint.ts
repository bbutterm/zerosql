import type { Database } from "sql.js";
import type { TableInfo } from "@/types/database";
import { analyzeSql, isName, isPunct, isWord, skipParens, splitStatements, tokenize, type Token } from "./table-guard";
import { toIsoDateTime } from "./values";

/**
 * Семантический линтер (GAME_DESIGN, разд. 7.3): ловит то, что SQLite молча
 * пропускает. Каждое предупреждение — озвученная реплика с id bark.*.
 * Запрос линтер не блокирует.
 *
 * Правила (ровно по библии):
 *  1. null_compare — `= NULL` / `!= NULL` (и прочие сравнения с NULL);
 *  2. not_in_null — `NOT IN (SELECT col …)`, когда в col есть NULL;
 *  3. bare_column — столбец в SELECT не в GROUP BY и не в агрегате;
 *  4. missing_join — соединение без условия дало бы больше 100 000 строк;
 *  5. homoglyph — латиница в кириллическом литерале или наоборот;
 *  6. date_format — дата не в ISO ('02.12.2026');
 *  7. select_star — SELECT * по таблице больше 1 000 строк без LIMIT;
 *  8. audit_order — ORDER BY id по audit_log;
 *  9. time_seconds — дата-время без секунд в верхней границе;
 *     date_vs_datetime — литерал-дата против столбца даты-времени;
 * 10. no_delete — DELETE по statements, persons, evidence_registry, draft_statements.
 *
 * Схема (TableInfo[]) нужна, чтобы разрешать столбцы и алиасы. С options.db
 * линтер проверяет данные (есть ли NULL, сколько строк, формат столбца);
 * без неё — по схеме и метаданным. Линтовать стоит только запросы, которые
 * пропустил guard: иначе подсказка выдаст данные закрытой таблицы.
 */

export type LintRule =
  | "null_compare"
  | "not_in_null"
  | "bare_column"
  | "missing_join"
  | "homoglyph"
  | "date_format"
  | "select_star"
  | "audit_order"
  | "time_seconds"
  | "date_vs_datetime"
  | "no_delete";

export type LintSpeaker = "tokha" | "mira" | "nina";

export interface LintWarning {
  rule: LintRule;
  /** id озвученной реплики */
  lineId: string;
  speaker: LintSpeaker;
  /** Реплика (субтитр) */
  text: string;
  /** Подробность для панели: какой столбец, какой литерал */
  detail?: string;
  /** Позиция в тексте запроса — для подсветки */
  pos?: number;
}

export interface LintOptions {
  /** База для проверок по данным: NULL в столбце, число строк, формат дат */
  db?: Database;
  /** Число строк таблиц, если известно заранее (иначе считается по db) */
  rowCounts?: Readonly<Record<string, number>>;
}

/** Порог «JOIN без условия» */
export const JOIN_ROWS_LIMIT = 100_000;
/** Порог «SELECT * без LIMIT» */
export const SELECT_STAR_ROWS = 1_000;

const LINES: Record<LintRule, { lineId: string; speaker: LintSpeaker }> = {
  null_compare: { lineId: "bark.tokha_eqnull.001", speaker: "tokha" },
  not_in_null: { lineId: "bark.mira_not_in_null.001", speaker: "mira" },
  bare_column: { lineId: "bark.mira_bare_column.001", speaker: "mira" },
  missing_join: { lineId: "bark.mira_missing_join.001", speaker: "mira" },
  homoglyph: { lineId: "bark.tokha_homoglyph.001", speaker: "tokha" },
  date_format: { lineId: "bark.mira_date_format.001", speaker: "mira" },
  select_star: { lineId: "bark.tokha_limit.001", speaker: "tokha" },
  audit_order: { lineId: "bark.mira_audit_order.001", speaker: "mira" },
  time_seconds: { lineId: "bark.mira_time_seconds.001", speaker: "mira" },
  date_vs_datetime: { lineId: "bark.mira_date_vs_datetime.001", speaker: "mira" },
  no_delete: { lineId: "bark.nina_no_delete.001", speaker: "nina" },
};

const RULE_ORDER: LintRule[] = [
  "null_compare",
  "not_in_null",
  "bare_column",
  "missing_join",
  "homoglyph",
  "date_format",
  "select_star",
  "audit_order",
  "time_seconds",
  "date_vs_datetime",
  "no_delete",
];

/** Таблицы-улики: DELETE по ним — реплика Нины (М25) */
const EVIDENCE_TABLES = new Set(["statements", "persons", "evidence_registry", "draft_statements"]);

const AGGREGATES = new Set(["count", "sum", "avg", "min", "max", "total", "group_concat", "string_agg"]);

/** Слова, которые не бывают именем столбца или алиасом */
const KEYWORDS = new Set([
  "select", "from", "where", "and", "or", "not", "null", "is", "in", "like", "glob", "regexp", "match",
  "between", "case", "when", "then", "else", "end", "as", "distinct", "all", "on", "using", "join",
  "left", "right", "inner", "outer", "cross", "natural", "full", "group", "by", "order", "having",
  "limit", "offset", "asc", "desc", "nulls", "first", "last", "union", "intersect", "except", "exists",
  "cast", "collate", "escape", "true", "false", "current_date", "current_time", "current_timestamp",
  "over", "partition", "filter", "window", "rows", "range", "groups", "unbounded", "preceding",
  "following", "current", "row", "with", "recursive", "values", "set", "update", "delete", "insert",
  "into", "replace", "returning", "if", "do", "nothing", "conflict", "materialized", "isnull",
  "notnull", "indexed", "explain", "query", "plan",
]);

const JOIN_WORDS = new Set(["join", "left", "right", "inner", "outer", "cross", "natural", "full"]);
const CLAUSE_WORDS = new Set(["from", "where", "group", "having", "window", "order", "limit"]);

/**
 * Столбцы-даты без времени (разд. 8.1). Все остальные столбцы со временем —
 * дата-время. Нужен, когда нет базы, чтобы посмотреть формат.
 */
const DATE_ONLY_COLUMNS = new Set([
  "persons.birth_date", "persons.death_date", "sokol_stage_persons.birth_date", "sokol_stage_persons.death_date",
  "arch16_persons.birth_date", "arch16_persons.death_date", "staff.hired_at", "staff.fired_at", "cases.status_at",
  "registrations.from_date", "registrations.to_date", "employment.from_date", "employment.to_date",
  "vehicles.registered_at", "vehicles.sold_at", "vehicles.deregistered_at", "accounts.opened_at",
  "phones.registered_at", "companies.registered_at", "companies.liquidated_at", "company_owners.since",
  "company_owners.until", "share_deals.deal_date", "contracts.signed_at", "construction_docs.signed_at",
  "diver_reports.report_date", "properties.acquired_at", "gs_phonebook.from_date", "gs_phonebook.to_date",
  "publication.person_birth_date",
]);
const DATETIME_NAME_RE = /(^|_)ts$|_at$|time$/;

// --- Разбор ---

/** Глубина скобок для каждого токена; у пары скобок — глубина снаружи */
function depths(tokens: Token[]): number[] {
  const d: number[] = [];
  let cur = 0;
  for (const t of tokens) {
    if (isPunct(t, "(")) {
      d.push(cur);
      cur++;
    } else if (isPunct(t, ")")) {
      cur = Math.max(0, cur - 1);
      d.push(cur);
    } else d.push(cur);
  }
  return d;
}

const isKeyword = (t: Token | undefined) => !!t && t.type === "word" && KEYWORDS.has(t.value);
const isRefName = (t: Token | undefined): t is Token => isName(t) && !isKeyword(t);

type Range = [number, number];

interface FromItem {
  /** Имя таблицы (для kind table) */
  table?: string;
  alias: string;
  kind: "table" | "subquery" | "function";
  join: "first" | "comma" | "join" | "cross" | "natural";
  /** ON-условие */
  on?: Range;
  /** USING / NATURAL */
  linked?: boolean;
  pos: number;
}

interface Core {
  depth: number;
  start: number;
  end: number;
  select: Range;
  from?: Range;
  where?: Range;
  groupBy?: Range;
  having?: Range;
  orderBy?: Range;
  limit?: Range;
  items: FromItem[];
}

/** Ссылка на столбец: [алиас.]столбец */
interface ColumnRef {
  qual?: string;
  col: string;
  pos: number;
}

function findCores(tokens: Token[], d: number[]): Core[] {
  const cores: Core[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isWord(tokens[i], "select")) continue;
    const D = d[i];
    let end = tokens.length;
    for (let j = i + 1; j < tokens.length; j++) {
      if (d[j] < D) {
        end = j;
        break;
      }
      if (d[j] === D && tokens[j].type === "word" && ["union", "intersect", "except"].includes(tokens[j].value)) {
        end = j;
        break;
      }
    }

    // Границы клауз на глубине D
    const marks: { name: string; at: number; body: number }[] = [];
    for (let j = i + 1; j < end; j++) {
      const t = tokens[j];
      if (d[j] !== D || t.type !== "word" || !CLAUSE_WORDS.has(t.value)) continue;
      if (t.value === "from" && isWord(tokens[j - 1], "distinct")) continue; // IS [NOT] DISTINCT FROM
      if ((t.value === "group" || t.value === "order") && !isWord(tokens[j + 1], "by")) continue;
      marks.push({ name: t.value, at: j, body: t.value === "group" || t.value === "order" ? j + 2 : j + 1 });
    }
    const rangeOf = (name: string): Range | undefined => {
      const k = marks.findIndex((m) => m.name === name);
      if (k === -1) return undefined;
      return [marks[k].body, k + 1 < marks.length ? marks[k + 1].at : end];
    };
    let selStart = i + 1;
    if (isWord(tokens[selStart], "distinct") || isWord(tokens[selStart], "all")) selStart++;
    const core: Core = {
      depth: D,
      start: i,
      end,
      select: [selStart, marks.length ? marks[0].at : end],
      from: rangeOf("from"),
      where: rangeOf("where"),
      groupBy: rangeOf("group"),
      having: rangeOf("having"),
      orderBy: rangeOf("order"),
      limit: rangeOf("limit"),
      items: [],
    };
    if (core.from) core.items = parseFrom(tokens, d, core.from, D);
    cores.push(core);
  }
  return cores;
}

function parseFrom(tokens: Token[], d: number[], [start, end]: Range, D: number): FromItem[] {
  const items: FromItem[] = [];
  let k = start;
  let expectItem = true;
  let join: FromItem["join"] = "first";
  let cross = false;
  let natural = false;

  while (k < end) {
    const t = tokens[k];
    if (expectItem) {
      let item: FromItem | null = null;
      if (isPunct(t, "(")) {
        item = { alias: "", kind: "subquery", join, pos: t.pos };
        k = skipParens(tokens, k);
      } else if (isName(t)) {
        let name = t.value;
        let next = k + 1;
        if (isPunct(tokens[next], ".") && isName(tokens[next + 1])) {
          name = tokens[next + 1].value;
          next += 2;
        }
        if (isPunct(tokens[next], "(")) {
          item = { alias: name, kind: "function", join, pos: t.pos };
          k = skipParens(tokens, next);
        } else {
          item = { table: name, alias: name, kind: "table", join, pos: t.pos };
          k = next;
        }
      } else {
        k++;
        continue;
      }
      if (isWord(tokens[k], "as") && isName(tokens[k + 1])) {
        item.alias = tokens[k + 1].value;
        k += 2;
      } else if (isRefName(tokens[k]) && !JOIN_WORDS.has(tokens[k].value)) {
        item.alias = tokens[k].value;
        k++;
      }
      if (natural) item.linked = true;
      items.push(item);
      expectItem = false;
      cross = false;
      natural = false;
      continue;
    }
    if (d[k] !== D) {
      k++;
      continue;
    }
    if (isPunct(t, ",")) {
      join = "comma";
      expectItem = true;
    } else if (isWord(t, "cross")) cross = true;
    else if (isWord(t, "natural")) natural = true;
    else if (isWord(t, "join")) {
      join = cross ? "cross" : natural ? "natural" : "join";
      expectItem = true;
    } else if (isWord(t, "on")) {
      let e = k + 1;
      while (e < end && !(d[e] === D && (isPunct(tokens[e], ",") || (tokens[e].type === "word" && JOIN_WORDS.has(tokens[e].value))))) e++;
      items[items.length - 1].on = [k + 1, e];
      k = e;
      continue;
    } else if (isWord(t, "using")) {
      items[items.length - 1].linked = true;
    }
    k++;
  }
  return items;
}

/** Ссылки на столбцы в диапазоне; вложенные подзапросы и имена функций пропускаются */
function columnRefs(tokens: Token[], [start, end]: Range): ColumnRef[] {
  const refs: ColumnRef[] = [];
  for (let k = start; k < end; k++) {
    const t = tokens[k];
    if (isPunct(t, "(") && isWord(tokens[k + 1], "select")) {
      k = skipParens(tokens, k) - 1;
      continue;
    }
    if (!isRefName(t)) continue;
    if (isPunct(tokens[k + 1], "(")) continue; // функция
    const prev = tokens[k - 1];
    if (isWord(prev, "as") || isWord(prev, "collate")) continue;
    if (isPunct(prev, ".")) continue; // вторая половина уже учтена
    if (isPunct(tokens[k + 1], ".")) {
      if (isName(tokens[k + 2])) refs.push({ qual: t.value, col: tokens[k + 2].value, pos: t.pos });
      k += 2; // alias.col или alias.*
      continue;
    }
    refs.push({ col: t.value, pos: t.pos });
  }
  return refs;
}

/** Делит диапазон по запятым на глубине D */
function splitList(tokens: Token[], d: number[], [start, end]: Range, D: number): Range[] {
  const parts: Range[] = [];
  let s = start;
  for (let k = start; k < end; k++) {
    if (d[k] === D && isPunct(tokens[k], ",")) {
      parts.push([s, k]);
      s = k + 1;
    }
  }
  if (s < end) parts.push([s, end]);
  return parts;
}

/** Агрегатный вызов на глубине D в диапазоне (оконные OVER — не агрегаты группировки) */
function hasAggregate(tokens: Token[], d: number[], [start, end]: Range, D: number): boolean {
  for (let k = start; k < end; k++) {
    const t = tokens[k];
    if (d[k] !== D || t.type !== "word" || !AGGREGATES.has(t.value) || !isPunct(tokens[k + 1], "(")) continue;
    const after = skipParens(tokens, k + 1);
    let n = after;
    if (isWord(tokens[n], "filter") && isPunct(tokens[n + 1], "(")) n = skipParens(tokens, n + 1);
    if (!isWord(tokens[n], "over")) return true;
  }
  return false;
}

const exprKey = (tokens: Token[], [s, e]: Range) =>
  tokens
    .slice(s, e)
    .map((t) => t.value)
    .join(" ");

// --- Схема ---

interface SchemaIndex {
  columns: Map<string, Set<string>>;
  pks: Map<string, Set<string>>;
  notnull: Map<string, Set<string>>;
}

function indexSchema(schema: readonly TableInfo[]): SchemaIndex {
  const columns = new Map<string, Set<string>>();
  const pks = new Map<string, Set<string>>();
  const notnull = new Map<string, Set<string>>();
  for (const t of schema) {
    const name = t.name.toLowerCase();
    columns.set(name, new Set(t.columns.map((c) => c.name.toLowerCase())));
    pks.set(name, new Set(t.columns.filter((c) => c.pk).map((c) => c.name.toLowerCase())));
    notnull.set(name, new Set(t.columns.filter((c) => c.notnull || c.pk).map((c) => c.name.toLowerCase())));
  }
  return { columns, pks, notnull };
}

/** Таблица, к которой относится ссылка: по алиасу или (без алиаса) единственная таблица с таким столбцом */
function resolveTable(ref: ColumnRef, items: readonly FromItem[], schema: SchemaIndex): string | undefined {
  if (ref.qual) {
    const item = items.find((i) => i.alias === ref.qual || i.table === ref.qual);
    return item?.table;
  }
  const owners = items.filter((i) => i.kind === "table" && i.table && schema.columns.get(i.table)?.has(ref.col));
  if (owners.length === 1) return owners[0].table;
  const tables = items.filter((i) => i.kind === "table");
  if (owners.length === 0 && tables.length === 1 && items.length === 1) return tables[0].table;
  return undefined;
}

// --- Данные ---

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function probe(db: Database | undefined, sql: string): unknown[] | null {
  if (!db) return null;
  try {
    const res = db.exec(sql);
    return res[0]?.values[0] ?? [];
  } catch {
    return null;
  }
}

function rowCount(table: string, options: LintOptions): number | undefined {
  const known = options.rowCounts?.[table];
  if (known !== undefined) return known;
  const row = probe(options.db, `SELECT COUNT(*) FROM ${quote(table)}`);
  return row && typeof row[0] === "number" ? row[0] : undefined;
}

/** Столбец хранит дату-время (true), дату (false) или неизвестно (undefined) */
function isDatetimeColumn(table: string, col: string, options: LintOptions): boolean | undefined {
  const row = probe(options.db, `SELECT ${quote(col)} FROM ${quote(table)} WHERE ${quote(col)} IS NOT NULL LIMIT 1`);
  if (row && row.length) {
    const iso = toIsoDateTime(row[0]);
    if (iso) return iso.length > 10;
    return undefined;
  }
  if (DATE_ONLY_COLUMNS.has(`${table}.${col}`)) return false;
  if (DATETIME_NAME_RE.test(col)) return true;
  return undefined;
}

// --- Тексты ---

const THOUSANDS = ["", "тыща", "две тыщи", "три тыщи", "четыре тыщи", "пять тыщ", "шесть тыщ", "семь тыщ", "восемь тыщ", "девять тыщ"];

/** «Короч, четыре тыщи строк» — число строк словами Тохи */
function tokhaCount(n: number): string {
  if (n >= 10_000) return "десятки тыщ";
  const k = Math.floor(n / 1000);
  return k <= 1 ? "больше тыщи" : THOUSANDS[k];
}

function letters(list: string[], latin: boolean): string {
  const uniq = [...new Set(list)];
  const shown = uniq.map((c) => (latin ? c : `«${c}»`)).join(", ");
  if (latin) return `${uniq.length > 1 ? "латинские" : "латинская"} ${shown}`;
  return `${uniq.length > 1 ? "кириллические" : "кириллическая"} ${shown}`;
}

/** Номер машины латиницей: K404TO, B123AA77 */
const LATIN_PLATE_RE = /^[ABCEHKMOPTXY]\d{3}[ABCEHKMOPTXY]{2}\d{0,3}$/i;
/** Форма номера машины в любой раскладке: К404ТО, K404TO, К404TO77 */
const PLATE_SHAPE_RE = /^[a-zа-яё]\d{3}[a-zа-яё]{2}\d{0,3}$/i;
const CYR = /[а-яё]/i;
const LAT = /[a-z]/i;

// --- Линтер ---

/**
 * Проверяет запрос и возвращает предупреждения на русском (не больше одного
 * на правило, в порядке правил библии). Пустой список — замечаний нет.
 */
export function lintSql(sql: string, schema: readonly TableInfo[], options: LintOptions = {}): LintWarning[] {
  const found = new Map<LintRule, LintWarning>();
  const warn = (rule: LintRule, text: string, extra: { detail?: string; pos?: number } = {}) => {
    if (found.has(rule)) return;
    found.set(rule, { rule, ...LINES[rule], text, ...extra });
  };
  const index = indexSchema(schema);

  for (const st of analyzeSql(sql).statements) {
    if (st.action === "delete" && st.target && EVIDENCE_TABLES.has(st.target)) {
      warn("no_delete", "Улики не удаляют, голубчик.", { detail: `DELETE по ${st.target}: запрос не заблокирован.` });
    }
  }

  for (const tokens of splitStatements(tokenize(sql))) {
    const d = depths(tokens);
    const cores = findCores(tokens, d);
    const allItems = cores.flatMap((c) => c.items);

    lintNullCompare(tokens, d, warn);
    lintStrings(tokens, warn);

    for (const core of cores) {
      lintBareColumns(tokens, d, core, index, warn);
      lintMissingJoin(tokens, core, index, options, warn);
      lintAuditOrder(tokens, d, core, warn);
    }
    if (cores.length) lintSelectStar(tokens, d, cores[0], options, warn);
    lintNotIn(tokens, d, cores, index, options, warn);
    lintTimeBounds(tokens, d, allItems, index, options, warn);
  }

  return RULE_ORDER.filter((r) => found.has(r)).map((r) => found.get(r) as LintWarning);
}

type Warn = (rule: LintRule, text: string, extra?: { detail?: string; pos?: number }) => void;

const COMPARE_CHARS = new Set(["=", "<", ">", "!"]);

function lintNullCompare(tokens: Token[], d: number[], warn: Warn) {
  // Зона присваиваний UPDATE … SET a = NULL — это не сравнение
  let setDepth = -1;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (isWord(t, "set")) setDepth = d[k];
    else if (setDepth !== -1 && d[k] === setDepth && (isWord(t, "where") || isWord(t, "from") || isWord(t, "returning"))) {
      setDepth = -1;
    }
    if (!isWord(t, "null")) continue;
    const prev = tokens[k - 1];
    const next = tokens[k + 1];
    const before = prev?.type === "punct" && COMPARE_CHARS.has(prev.value);
    const after = next?.type === "punct" && COMPARE_CHARS.has(next.value);
    if (!before && !after) continue;
    if (before && setDepth !== -1 && d[k] === setDepth && isPunct(prev, "=") && !COMPARE_CHARS.has(tokens[k - 2]?.value ?? "")) {
      continue; // SET col = NULL
    }
    warn("null_compare", "С NULL так не сравнивают. Он даже сам себе не равен.", {
      detail: "Пишите IS NULL или IS NOT NULL.",
      pos: t.pos,
    });
    return;
  }
}

function lintStrings(tokens: Token[], warn: Warn) {
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== "string") continue;

    // 5. Гомоглифы
    for (const word of t.value.split(/[^\p{L}\p{N}]+/u)) {
      if (!word) continue;
      const chars = [...word];
      const cyr = chars.filter((c) => CYR.test(c));
      const lat = chars.filter((c) => LAT.test(c));
      if (cyr.length && lat.length) {
        // Номер машины (буква, три цифры, две буквы) хранится кириллицей — латиница в нём всегда лишняя
        if (cyr.length >= lat.length || PLATE_SHAPE_RE.test(word)) {
          warn("homoglyph", `Номера хранятся кириллицей. В литерале ${letters(lat, true)}.`, {
            detail: `«${word}»: латиница среди кириллицы.`,
            pos: t.pos,
          });
        } else {
          warn("homoglyph", `В латинском литерале ${letters(cyr, false)}.`, {
            detail: `«${word}»: кириллица среди латиницы.`,
            pos: t.pos,
          });
        }
      } else if (lat.length && !cyr.length && LATIN_PLATE_RE.test(word)) {
        warn("homoglyph", `Номера хранятся кириллицей. В литерале ${letters(lat, true)}.`, {
          detail: `«${word}» набран латиницей.`,
          pos: t.pos,
        });
      }
    }

    // 6. Дата не в ISO; arch16_registry.reg_date хранится 'ДД.ММ.ГГГГ' — его не трогаем
    const value = t.value.trim();
    const iso = nonIsoDate(value);
    if (iso) {
      const near = [tokens[k - 1], tokens[k - 2], tokens[k - 3], tokens[k + 1], tokens[k + 2], tokens[k + 3]];
      if (near.some((n) => isName(n) && n.value === "reg_date")) continue;
      warn("date_format", "Даты хранятся как ГГГГ-ММ-ДД.", { detail: `'${value}' → '${iso}'`, pos: t.pos });
    }
  }
}

/** 'ДД.ММ.ГГГГ', 'Д/М/ГГГГ', 'ГГГГ.ММ.ДД', 'ГГГГ/ММ/ДД' (в начале литерала) → ISO-дата; иначе null */
function nonIsoDate(value: string): string | null {
  const dotted = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?=\s|$)/.exec(value);
  if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  const reversed = /^(\d{4})[./](\d{2})[./](\d{2})(?=\s|$)/.exec(value);
  if (reversed) return `${reversed[1]}-${reversed[2]}-${reversed[3]}`;
  return null;
}

function lintBareColumns(tokens: Token[], d: number[], core: Core, schema: SchemaIndex, warn: Warn) {
  const D = core.depth;
  const grouped =
    core.groupBy !== undefined ||
    hasAggregate(tokens, d, core.select, D) ||
    (core.having !== undefined && hasAggregate(tokens, d, core.having, D));
  if (!grouped) return;

  const groupParts = core.groupBy ? splitList(tokens, d, core.groupBy, D) : [];
  const positions = new Set<number>();
  const groupKeys = new Set<string>();
  const groupCols: ColumnRef[] = [];
  for (const part of groupParts) {
    const slice = tokens.slice(part[0], part[1]);
    if (slice.length === 1 && slice[0].type === "number") positions.add(Number(slice[0].value));
    groupKeys.add(exprKey(tokens, part));
    const refs = columnRefs(tokens, part);
    if (refs.length === 1 && (slice.length === 1 || slice.length === 3)) groupCols.push(refs[0]);
  }
  const groupNames = new Set(groupCols.map((r) => r.col));
  // Таблицы, сгруппированные по первичному ключу: остальные их столбцы зависимы
  const keyed = new Set<string>();
  for (const ref of groupCols) {
    const table = resolveTable(ref, core.items, schema);
    if (table && schema.pks.get(table)?.has(ref.col)) keyed.add(table);
  }

  splitList(tokens, d, core.select, D).forEach((item, i) => {
    const s = item[0];
    let e = item[1];
    let alias: string | undefined;
    for (let k = s; k < e; k++) {
      if (d[k] === D && isWord(tokens[k], "as") && isName(tokens[k + 1])) {
        alias = tokens[k + 1].value;
        e = k;
        break;
      }
    }
    if (!alias && e - s >= 2 && isRefName(tokens[e - 1]) && !isPunct(tokens[e - 2], ".")) {
      const prev = tokens[e - 2];
      if (prev.type === "word" || prev.type === "ident" || isPunct(prev, ")") || prev.type === "string" || prev.type === "number") {
        alias = tokens[e - 1].value;
        e = e - 1;
      }
    }
    const isStar = (e - s === 1 && isPunct(tokens[s], "*")) || (e - s === 3 && isPunct(tokens[s + 2], "*"));
    if (isStar) {
      warn("bare_column", "SQLite возьмёт случайную строку группы.", {
        detail: "SELECT * с группировкой: столбцов нет ни в GROUP BY, ни в агрегате.",
        pos: tokens[s].pos,
      });
      return;
    }
    if (hasAggregate(tokens, d, [s, e], D)) return;
    if (positions.has(i + 1) || (alias && groupNames.has(alias)) || groupKeys.has(exprKey(tokens, [s, e]))) return;
    for (const ref of columnRefs(tokens, [s, e])) {
      if (groupNames.has(ref.col)) continue;
      const table = resolveTable(ref, core.items, schema);
      if (table && keyed.has(table)) continue;
      // Ссылка на внешний запрос (коррелированный подзапрос) или на алиас — не наш случай
      if (ref.qual && !core.items.some((it) => it.alias === ref.qual || it.table === ref.qual)) continue;
      if (!ref.qual && !table && ownsNoColumn(ref.col, core.items, schema)) continue;
      warn("bare_column", "SQLite возьмёт случайную строку группы.", {
        detail: `Столбца «${ref.qual ? `${ref.qual}.` : ""}${ref.col}» нет ни в GROUP BY, ни в агрегате.`,
        pos: ref.pos,
      });
      return;
    }
  });
}

/** Все таблицы ядра известны схеме, и ни в одной нет такого столбца */
function ownsNoColumn(col: string, items: readonly FromItem[], schema: SchemaIndex): boolean {
  if (!items.length || items.some((i) => i.kind !== "table" || !i.table || !schema.columns.has(i.table))) return false;
  return items.every((i) => !schema.columns.get(i.table as string)?.has(col));
}

function lintMissingJoin(tokens: Token[], core: Core, schema: SchemaIndex, options: LintOptions, warn: Warn) {
  const items = core.items.filter((i) => i.kind !== "function");
  if (items.length < 2) return;

  const parent = items.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const itemOf = (ref: ColumnRef): number => {
    if (ref.qual) return items.findIndex((i) => i.alias === ref.qual || i.table === ref.qual);
    const owners = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => it.kind === "table" && it.table && schema.columns.get(it.table)?.has(ref.col));
    return owners.length === 1 ? owners[0].idx : -1;
  };

  items.forEach((item, idx) => {
    if (item.linked && idx > 0) union(idx, idx - 1);
    if (item.on) {
      for (const ref of columnRefs(tokens, item.on)) {
        const other = itemOf(ref);
        if (other !== -1) union(idx, other);
      }
    }
  });
  if (core.where) {
    // Равенства вида a.x = b.y в WHERE связывают таблицы
    const [s, e] = core.where;
    for (let k = s + 1; k < e - 1; k++) {
      if (!isPunct(tokens[k], "=") || COMPARE_CHARS.has(tokens[k - 1]?.value ?? "") || isPunct(tokens[k + 1], "=")) continue;
      const left = refEndingAt(tokens, k - 1);
      const right = refStartingAt(tokens, k + 1);
      if (!left || !right) continue;
      const a = itemOf(left);
      const b = itemOf(right);
      if (a !== -1 && b !== -1) union(a, b);
    }
  }

  const roots = new Set(items.map((_, i) => find(i)));
  if (roots.size < 2) return;

  const tables = items.filter((i) => i.kind === "table" && i.table).map((i) => i.table as string);
  const counts = tables.map((t) => rowCount(t, options));
  const known = counts.every((c) => c !== undefined) && tables.length === items.length;
  if (known) {
    const estimate = (counts as number[]).reduce((a, b) => a * Math.max(1, b), 1);
    if (estimate <= JOIN_ROWS_LIMIT) return;
    warn("missing_join", "Похоже, забыто условие соединения.", {
      detail: `Без условия соединения выйдет около ${estimate.toLocaleString("ru-RU")} строк.`,
      pos: items[1].pos,
    });
    return;
  }
  // Размер неизвестен: явный CROSS JOIN считаем намеренным
  if (items.some((i) => i.join === "cross")) return;
  warn("missing_join", "Похоже, забыто условие соединения.", { detail: "Таблицы не связаны ни ON, ни условием в WHERE.", pos: items[1].pos });
}

function refEndingAt(tokens: Token[], k: number): ColumnRef | null {
  const t = tokens[k];
  if (!isRefName(t)) return null;
  if (isPunct(tokens[k - 1], ".") && isName(tokens[k - 2])) return { qual: tokens[k - 2].value, col: t.value, pos: tokens[k - 2].pos };
  if (isPunct(tokens[k - 1], ".")) return null;
  return { col: t.value, pos: t.pos };
}

function refStartingAt(tokens: Token[], k: number): ColumnRef | null {
  const t = tokens[k];
  if (!isRefName(t) || isPunct(tokens[k + 1], "(")) return null;
  if (isPunct(tokens[k + 1], ".") && isName(tokens[k + 2])) return { qual: t.value, col: tokens[k + 2].value, pos: t.pos };
  return { col: t.value, pos: t.pos };
}

function lintAuditOrder(tokens: Token[], d: number[], core: Core, warn: Warn) {
  if (!core.orderBy) return;
  const audit = core.items.filter((i) => i.table === "audit_log");
  if (!audit.length) return;
  // Только ведущий ключ: ORDER BY ts, id — нормальная развязка равных моментов
  for (const part of splitList(tokens, d, core.orderBy, core.depth).slice(0, 1)) {
    const ref = refStartingAt(tokens, part[0]);
    if (!ref || ref.col !== "id") continue;
    const len = ref.qual ? 3 : 1;
    const rest = tokens.slice(part[0] + len, part[1]);
    if (rest.some((t) => !(t.type === "word" && ["asc", "desc", "nulls", "first", "last", "collate"].includes(t.value)))) continue;
    const onAudit = ref.qual ? audit.some((i) => i.alias === ref.qual || i.table === ref.qual) : core.items.length === 1;
    if (!onAudit) continue;
    warn("audit_order", "id — порядок репликации, а не время.", { detail: "Сортируйте журнал по ts.", pos: ref.pos });
    return;
  }
}

function lintSelectStar(tokens: Token[], d: number[], core: Core, options: LintOptions, warn: Warn) {
  if (core.depth !== 0 || core.where || core.limit || core.groupBy || core.having) return;
  const [s, e] = core.select;
  if (!(e - s === 1 && isPunct(tokens[s], "*"))) return;
  if (!core.items.length || core.items.some((i) => i.kind !== "table")) return;
  // LIMIT мог стоять после UNION — тогда это не наш случай
  if (tokens.some((t, k) => d[k] === 0 && isWord(t, "limit"))) return;
  let max = 0;
  for (const item of core.items) {
    const n = rowCount(item.table as string, options);
    if (n === undefined) return;
    max = Math.max(max, n);
  }
  if (max <= SELECT_STAR_ROWS) return;
  warn("select_star", `Короч, ${tokhaCount(max)} строк. Давай с LIMIT.`, {
    detail: `В таблице ${max.toLocaleString("ru-RU")} строк.`,
    pos: tokens[s].pos,
  });
}

function lintNotIn(tokens: Token[], d: number[], cores: Core[], schema: SchemaIndex, options: LintOptions, warn: Warn) {
  for (let k = 0; k + 3 < tokens.length; k++) {
    if (!(isWord(tokens[k], "not") && isWord(tokens[k + 1], "in") && isPunct(tokens[k + 2], "(") && isWord(tokens[k + 3], "select"))) {
      continue;
    }
    const sub = cores.find((c) => c.start === k + 3);
    if (!sub || !sub.items.length) continue;
    const parts = splitList(tokens, d, sub.select, sub.depth);
    if (parts.length !== 1) continue;
    const e = parts[0][1];
    let s = parts[0][0];
    if (isWord(tokens[s], "distinct")) s++;
    const ref = refStartingAt(tokens, s);
    if (!ref || e - s !== (ref.qual ? 3 : 1)) continue;
    const table = resolveTable(ref, sub.items, schema) ?? (sub.items.length === 1 ? sub.items[0].table : undefined);
    if (!table) continue;

    // Игрок уже отсёк NULL: … WHERE col IS NOT NULL
    if (sub.where) {
      const w = tokens.slice(sub.where[0], sub.where[1]);
      const guarded = w.some(
        (t, i) => isName(t) && t.value === ref.col && isWord(w[i + 1], "is") && isWord(w[i + 2], "not") && isWord(w[i + 3], "null")
      );
      if (guarded) continue;
    }

    let hasNull: boolean;
    const row = probe(options.db, `SELECT 1 FROM ${quote(table)} WHERE ${quote(ref.col)} IS NULL LIMIT 1`);
    if (row !== null) hasNull = row.length > 0;
    else {
      const cols = schema.columns.get(table);
      if (!cols?.has(ref.col)) continue;
      hasNull = !schema.notnull.get(table)?.has(ref.col);
    }
    if (!hasNull) continue;
    warn("not_in_null", "NOT IN споткнётся о NULL. Попробуй NOT EXISTS.", {
      detail: `В ${table}.${ref.col} есть NULL: NOT IN вернёт ноль строк.`,
      pos: tokens[k].pos,
    });
    return;
  }
}

const MINUTE_LITERAL = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/;
const DATE_LITERAL = /^\d{4}-\d{2}-\d{2}$/;

function lintTimeBounds(
  tokens: Token[],
  d: number[],
  items: readonly FromItem[],
  schema: SchemaIndex,
  options: LintOptions,
  warn: Warn
) {
  // BETWEEN: столбец-субъект запоминается до парного AND; токен после него — верхняя граница
  const between = new Map<number, ColumnRef | null>();
  let upperAt = -1;
  let upperSubject: ColumnRef | null = null;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (isWord(t, "between")) {
      between.set(d[k], refEndingAt(tokens, k - 1));
      continue;
    }
    if (isWord(t, "and") && between.has(d[k])) {
      upperAt = k + 1;
      upperSubject = between.get(d[k]) ?? null;
      between.delete(d[k]);
      continue;
    }
    if (t.type !== "string") continue;

    let subject: ColumnRef | null = null;
    let upper = false;
    let equality = false;
    const prev = tokens[k - 1];
    if (k === upperAt) {
      subject = upperSubject;
      upper = true;
    } else if (isPunct(prev, "=") && isPunct(tokens[k - 2], "<")) {
      subject = refEndingAt(tokens, k - 3);
      upper = true;
    } else if (isPunct(tokens[k + 1], ">") && isPunct(tokens[k + 2], "=")) {
      subject = refStartingAt(tokens, k + 3);
      upper = true;
    } else if (isPunct(prev, "=") && !COMPARE_CHARS.has(tokens[k - 2]?.value ?? "")) {
      subject = refEndingAt(tokens, k - 2);
      equality = true;
    } else if (isPunct(tokens[k + 1], "=") && !COMPARE_CHARS.has(tokens[k + 2]?.value ?? "") && !isPunct(prev, "<") && !isPunct(prev, ">")) {
      subject = refStartingAt(tokens, k + 2);
      equality = true;
    }
    if (!upper && !equality) continue;

    const value = t.value.trim();
    if (upper && MINUTE_LITERAL.test(value)) {
      warn("time_seconds", `Время хранится с секундами: '${value}:00' больше, чем '${value}', и в границу не попадёт.`, {
        detail: `Пишите '${value}:59' или берите строгое «<» со следующей минутой.`,
        pos: t.pos,
      });
      continue;
    }
    if (DATE_LITERAL.test(value) && subject) {
      const table = resolveTable(subject, items, schema);
      if (!table) continue;
      if (isDatetimeColumn(table, subject.col, options) !== true) continue;
      warn("date_vs_datetime", `Сравни date(${subject.col}) с датой.`, {
        detail: equality
          ? `${subject.col} хранит дату и время: '${value}' совпадёт только с полуночью.`
          : `${subject.col} хранит дату и время: граница '${value}' не захватит сам этот день.`,
        pos: t.pos,
      });
    }
  }
}
