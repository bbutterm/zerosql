import type { Database } from "sql.js";
import type { QueryResult } from "@/types/database";
import type { ValidationRule, ValidationOutcome } from "@/types/mission";
import { executeQuery } from "./database";

function normalizeRows(rows: unknown[][]): string[][] {
  return rows
    .map((row) => row.map((cell) => String(cell ?? "").toLowerCase().trim()))
    .sort((a, b) => a.join("|").localeCompare(b.join("|")));
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

    case "custom": {
      return rule.check(result);
    }
  }
}
