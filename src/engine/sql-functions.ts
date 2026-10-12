import type { Database, SqlValue } from "sql.js";

/**
 * Unicode-aware замены встроенных функций SQLite.
 *
 * Встроенные LIKE / lower() / upper() в SQLite регистронезависимы только для
 * ASCII: 'Груз' LIKE '%груз%' = 0, lower('ГРУЗ') = 'ГРУЗ'. Для русскоязычной
 * игры это ловушка, поэтому подменяем их на версии, работающие с кириллицей.
 * Оператор `X LIKE Y [ESCAPE Z]` SQLite вызывает как like(Y, X[, Z]).
 */

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;
const likeCache = new Map<string, RegExp>();

export function likePatternToRegExp(pattern: string, escape?: string): RegExp {
  const key = `${escape ?? ""}\u0000${pattern}`;
  const cached = likeCache.get(key);
  if (cached) return cached;

  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escape && ch === escape && i + 1 < pattern.length) {
      source += pattern[++i].replace(REGEX_SPECIAL, "\\$&");
    } else if (ch === "%") {
      source += "[\\s\\S]*";
    } else if (ch === "_") {
      source += "[\\s\\S]";
    } else {
      source += ch.replace(REGEX_SPECIAL, "\\$&");
    }
  }
  const re = new RegExp(source + "$", "iu");
  if (likeCache.size > 500) likeCache.clear();
  likeCache.set(key, re);
  return re;
}

function toText(value: SqlValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  return String(value);
}

export function unicodeLike(pattern: SqlValue, value: SqlValue, escape?: SqlValue): boolean | null {
  const p = toText(pattern);
  const v = toText(value);
  if (p === null || v === null) return null;
  const esc = escape === undefined ? undefined : toText(escape) ?? undefined;
  return likePatternToRegExp(p, esc).test(v);
}

export function registerUnicodeFunctions(db: Database): void {
  // Арность функции в sql.js определяется по func.length — регистрируем обе формы LIKE.
  db.create_function("like", (pattern: SqlValue, value: SqlValue) => unicodeLike(pattern, value));
  db.create_function("like", (pattern: SqlValue, value: SqlValue, escape: SqlValue) =>
    unicodeLike(pattern, value, escape)
  );
  db.create_function("lower", (value: SqlValue) => {
    const text = toText(value);
    return text === null ? null : text.toLowerCase();
  });
  db.create_function("upper", (value: SqlValue) => {
    const text = toText(value);
    return text === null ? null : text.toUpperCase();
  });
}
