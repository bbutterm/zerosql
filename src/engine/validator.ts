import type { Database } from "sql.js";
import type { QueryResult } from "@/types/database";
import type { ValidationRule, ValidationOutcome } from "@/types/mission";
import { executeQuery } from "./database";

function normalizeRows(rows: unknown[][]): string[][] {
  return rows
    .map((row) => row.map(normalizeCell))
    .sort((a, b) => a.join("|").localeCompare(b.join("|")));
}

const NUMERIC_TEXT = /^-?\d+(?:\.\d+)?$/;
const NULL_MARK = "\u2205";

function canonicalNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Приводит ячейку к строке для сравнения: числа — с точностью до сотых
 * (и '47' == 47), строки — без регистра, пробелов по краям и различия е/ё.
 */
export function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return NULL_MARK;
  if (typeof value === "number") return canonicalNumber(value);
  if (value instanceof Uint8Array) return `blob:${value.length}`;
  const text = String(value).trim();
  if (NUMERIC_TEXT.test(text)) return canonicalNumber(Number(text));
  return text.toLowerCase().replace(/ё/g, "е");
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && NUMERIC_TEXT.test(value.trim())) return Number(value.trim());
  return null;
}

export function cellsEqual(a: unknown, b: unknown, tolerance = 0.01): boolean {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) <= tolerance + 1e-9;
  return normalizeCell(a) === normalizeCell(b);
}

function findColumns(result: QueryResult, names: string[] | undefined): number[] {
  if (!names?.length) return [];
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const found: number[] = [];
  result.columns.forEach((c, i) => {
    if (wanted.has(c.toLowerCase())) found.push(i);
  });
  return found;
}

function sortedNormalized(values: unknown[]): string[] {
  return values.map(normalizeCell).sort();
}

function sameSequence(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function compareColumn(
  actual: unknown[],
  expected: unknown[],
  mode: "equal" | "superset" | "subset",
  ordered: boolean
): boolean {
  if (ordered) {
    return sameSequence(actual.map(normalizeCell), expected.map(normalizeCell));
  }
  const a = new Set(actual.map(normalizeCell));
  const e = new Set(expected.map(normalizeCell));
  if (mode === "superset") return [...e].every((v) => a.has(v));
  if (mode === "subset") return a.size > 0 && [...a].every((v) => e.has(v));
  return a.size === e.size && [...e].every((v) => a.has(v));
}

function referenceError(): ValidationOutcome {
  return { passed: false, message: "Ошибка в эталонном запросе. Сообщите разработчику." };
}

export function validate(
  rule: ValidationRule,
  result: QueryResult,
  db: Database
): ValidationOutcome {
  if (result.error) {
    return { passed: false, message: "Запрос вернул ошибку. Проверьте синтаксис." };
  }

  switch (rule.type) {
    case "row_count": {
      const { expected, comparison } = rule;
      const actual = result.rowCount;
      const passed =
        comparison === "eq"
          ? actual === expected
          : comparison === "gte"
            ? actual >= expected
            : actual <= expected;
      return {
        passed,
        message: passed
          ? "Количество записей совпадает. Отличная работа, детектив."
          : `Ожидалось ${comparison === "eq" ? "" : comparison === "gte" ? "не менее " : "не более "}${expected} записей, получено ${actual}.`,
      };
    }

    case "contains_columns": {
      const resultCols = result.columns.map((c) => c.toLowerCase());
      const missing = rule.columns.filter(
        (c) => !resultCols.includes(c.toLowerCase())
      );
      return {
        passed: missing.length === 0,
        message:
          missing.length === 0
            ? "Все нужные столбцы на месте."
            : `Не хватает столбцов: ${missing.join(", ")}`,
      };
    }

    case "contains_value": {
      const colIdx = result.columns.findIndex(
        (c) => c.toLowerCase() === rule.column.toLowerCase()
      );
      if (colIdx === -1) {
        return {
          passed: false,
          message: `Столбец «${rule.column}» не найден в результатах.`,
        };
      }
      const found = result.rows.some(
        (row) =>
          String(row[colIdx]).toLowerCase() ===
          String(rule.value).toLowerCase()
      );
      return {
        passed: found,
        message: found
          ? "Нужное значение найдено. Вы на верном пути."
          : `Значение «${rule.value}» не найдено в столбце «${rule.column}».`,
      };
    }

    case "exact_match": {
      const ref = executeQuery(db, rule.referenceQuery);
      if (ref.error) {
        return { passed: false, message: "Ошибка в эталонном запросе. Сообщите разработчику." };
      }
      const refNorm = normalizeRows(ref.rows);
      const resNorm = normalizeRows(result.rows);
      const passed =
        JSON.stringify(refNorm) === JSON.stringify(resNorm) &&
        ref.columns.length === result.columns.length;
      return {
        passed,
        message: passed
          ? "Результат совпадает с эталоном. Блестящая работа."
          : "Результат не совпадает. Попробуйте другой подход.",
      };
    }

    case "requires_column": {
      const found = result.columns.some(
        (c) => c.toLowerCase() === rule.column.toLowerCase()
      );
      if (!found) {
        return {
          passed: false,
          message: `Столбец «${rule.column}» не найден в результатах.`,
        };
      }
      if (rule.minRows !== undefined && result.rowCount < rule.minRows) {
        return {
          passed: false,
          message: `Ожидалось не менее ${rule.minRows} записей, получено ${result.rowCount}.`,
        };
      }
      return {
        passed: true,
        message: `Столбец «${rule.column}» найден.`,
      };
    }

    case "contains_substring": {
      const colIdx = result.columns.findIndex(
        (c) => c.toLowerCase() === rule.column.toLowerCase()
      );
      if (colIdx === -1) {
        return {
          passed: false,
          message: `Столбец «${rule.column}» не найден в результатах.`,
        };
      }
      const found = result.rows.some((row) =>
        String(row[colIdx]).toLowerCase().includes(rule.substring.toLowerCase())
      );
      return {
        passed: found,
        message: found
          ? `Подстрока «${rule.substring}» найдена в столбце «${rule.column}».`
          : `Значение «${rule.substring}» не найдено в столбце «${rule.column}».`,
      };
    }

    case "value_check": {
      if (rule.row >= result.rowCount) {
        return { passed: false, message: "Недостаточно строк в результате." };
      }
      const val = Number(result.rows[rule.row]?.[rule.col]);
      if (isNaN(val)) {
        return { passed: false, message: "Значение не является числом." };
      }
      const passed =
        rule.comparison === "eq" ? val === rule.expected
        : rule.comparison === "gt" ? val > rule.expected
        : rule.comparison === "gte" ? val >= rule.expected
        : rule.comparison === "lt" ? val < rule.expected
        : val <= rule.expected;
      return {
        passed,
        message: passed
          ? "Числовое значение совпадает."
          : `Ожидалось ${rule.comparison === "eq" ? "" : rule.comparison === "gt" ? "> " : rule.comparison === "gte" ? ">= " : rule.comparison === "lt" ? "< " : "<= "}${rule.expected}, получено ${val}.`,
      };
    }

    case "compound": {
      for (const subRule of rule.rules) {
        const sub = validate(subRule, result, db);
        if (!sub.passed) {
          return sub;
        }
      }
      return { passed: true, message: rule.successMessage };
    }

    case "any_of": {
      let lastFailMessage = "";
      for (const subRule of rule.rules) {
        const sub = validate(subRule, result, db);
        if (sub.passed) {
          return { passed: true, message: rule.successMessage };
        }
        lastFailMessage = sub.message;
      }
      return { passed: false, message: lastFailMessage };
    }

    case "custom": {
      return rule.check(result);
    }

    case "cell_value": {
      const named = findColumns(result, rule.columns);
      if (rule.columns?.length && named.length === 0) {
        return {
          passed: false,
          message: `Нужен столбец ${rule.columns.map((c) => `«${c}»`).join(" или ")}.`,
        };
      }
      const indexes = named.length ? named : result.columns.map((_, i) => i);
      const found = result.rows.some((row) =>
        indexes.some((i) => cellsEqual(row[i], rule.value, rule.tolerance))
      );
      return {
        passed: found,
        message: found ? "Нужное значение найдено." : "Нужного значения в результате нет.",
      };
    }

    case "column_values": {
      let expected: unknown[];
      if (rule.values) {
        expected = rule.values;
      } else if (rule.referenceQuery) {
        const ref = executeQuery(db, rule.referenceQuery);
        if (ref.error) return referenceError();
        expected = ref.rows.map((r) => r[0]);
      } else {
        return referenceError();
      }

      const mode = rule.mode ?? "equal";
      const ordered = rule.ordered ?? false;
      const named = findColumns(result, rule.columns);
      const candidates = named.length ? named : result.columns.map((_, i) => i);

      for (const idx of candidates) {
        const actual = result.rows.map((r) => r[idx]);
        if (compareColumn(actual, expected, mode, ordered)) {
          return { passed: true, message: "Значения совпадают." };
        }
      }

      if (result.rowCount === 0) {
        return { passed: false, message: "Запрос не вернул ни одной строки." };
      }
      const probe = named[0];
      if (probe !== undefined) {
        const actual = result.rows.map((r) => r[probe]);
        if (ordered && compareColumn(actual, expected, "equal", false)) {
          return { passed: false, message: "Значения верные, но порядок строк не тот." };
        }
        const a = new Set(actual.map(normalizeCell));
        const e = new Set(expected.map(normalizeCell));
        const missing = [...e].filter((v) => !a.has(v)).length;
        const extra = [...a].filter((v) => !e.has(v)).length;
        const parts: string[] = [];
        if (missing && mode !== "subset") parts.push(`не хватает значений: ${missing}`);
        if (extra && mode !== "superset") parts.push(`лишних значений: ${extra}`);
        if (parts.length) {
          return { passed: false, message: `Не совпадает: ${parts.join(", ")}.` };
        }
      }
      return { passed: false, message: "Значения в результате не те, что нужны." };
    }

    case "rows_match": {
      const ref = executeQuery(db, rule.referenceQuery);
      if (ref.error) return referenceError();
      if (result.rowCount !== ref.rowCount) {
        return {
          passed: false,
          message:
            result.rowCount > ref.rowCount
              ? "Строк больше, чем нужно. Возможно, не хватает фильтра или DISTINCT."
              : "Строк меньше, чем нужно. Возможно, фильтр слишком строгий.",
        };
      }

      const used = new Set<number>();
      const mapping: number[] = [];
      for (let j = 0; j < ref.columns.length; j++) {
        const name = ref.columns[j].toLowerCase();
        const names = [name, ...(rule.aliases?.[name] ?? []).map((a) => a.toLowerCase())];
        let idx = result.columns.findIndex((c, i) => !used.has(i) && names.includes(c.toLowerCase()));
        if (idx === -1) {
          const refValues = sortedNormalized(ref.rows.map((r) => r[j]));
          idx = result.columns.findIndex(
            (_, i) => !used.has(i) && sameSequence(sortedNormalized(result.rows.map((r) => r[i])), refValues)
          );
        }
        if (idx === -1) {
          return {
            passed: false,
            message: /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)
              ? `Не хватает столбца «${ref.columns[j]}» (или его значения не совпадают).`
              : "Не хватает столбца с нужными значениями.",
          };
        }
        used.add(idx);
        mapping.push(idx);
      }

      const project = (rows: unknown[][], cols: number[]) =>
        rows.map((r) => cols.map((c) => normalizeCell(r[c])).join("\u241F"));
      const mine = project(result.rows, mapping);
      const theirs = project(ref.rows, ref.columns.map((_, j) => j));
      const passed = rule.ordered
        ? sameSequence(mine, theirs)
        : sameSequence([...mine].sort(), [...theirs].sort());
      if (passed) return { passed: true, message: "Результат совпадает с ожидаемым." };
      if (rule.ordered && sameSequence([...mine].sort(), [...theirs].sort())) {
        return { passed: false, message: "Строки верные, но порядок не тот. Проверьте ORDER BY." };
      }
      return { passed: false, message: "Строки не совпадают с ожидаемыми." };
    }

    case "not": {
      const sub = validate(rule.rule, result, db);
      return sub.passed
        ? { passed: false, message: rule.message }
        : { passed: true, message: "Проверка пройдена." };
    }
  }
}
