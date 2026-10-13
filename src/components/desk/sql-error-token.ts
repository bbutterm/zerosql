import type { QueryResult } from "@/types/database";

/**
 * Где ошибка в тексте запроса: имя из объяснения («full_nam») или слово из near "FORM".
 * Нужна, чтобы подчеркнуть ошибку прямо в редакторе и написать «Ошибка в строке 2».
 */
export function errorToken(result: QueryResult | null | undefined): string | null {
  if (!result?.error || (result.errorKind && result.errorKind !== "sql")) return null;
  const near = result.error.match(/near "([^"]+)"/i)?.[1];
  if (near) return near;
  const quoted = result.errorHelp?.explanation.match(/«([^»]+)»/)?.[1];
  if (quoted) return quoted;
  const raw = result.error.match(/no such (?:column|table): (?:\w+\.)?(\S+)/i)?.[1];
  return raw ?? null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Первое вхождение слова в запросе (без учёта регистра, по границам слова): [from, to) */
export function findToken(sql: string, token: string): { from: number; to: number; line: number } | null {
  if (!token) return null;
  const word = /^\w/.test(token) ? "\\b" : "";
  const end = /\w$/.test(token) ? "\\b" : "";
  const re = new RegExp(`${word}${escapeRe(token)}${end}`, "i");
  // Комментарии и строки не считаются: ищем в тексте, где они заменены пробелами той же длины
  const masked = sql
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/'(?:[^']|'')*'/g, (m) => (token.startsWith("'") ? m : " ".repeat(m.length)));
  const m = re.exec(masked);
  if (!m) return null;
  const line = sql.slice(0, m.index).split("\n").length;
  return { from: m.index, to: m.index + m[0].length, line };
}

/** Минимум от редактора, который нужен для отметки ошибки */
interface ErrorMarkable {
  markError?: (token: string, message: string) => number | null;
  clearError?: () => void;
}

/**
 * Отметить ошибку результата прямо в запросе: пунктир --alarm под словом и подсказка при наведении.
 * Результат без ошибки (или отказ) снимает отметку.
 */
export function markResultError(editor: ErrorMarkable | null | undefined, result: QueryResult | null | undefined): void {
  if (!editor) return;
  const token = errorToken(result);
  if (!token || !result) {
    editor.clearError?.();
    return;
  }
  editor.markError?.(token, result.errorHelp?.explanation ?? result.error ?? "Ошибка");
}
