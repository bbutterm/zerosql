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
  }
}
