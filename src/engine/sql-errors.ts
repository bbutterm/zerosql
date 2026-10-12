/**
 * Человекочитаемые объяснения ошибок SQLite на русском языке.
 * Сырые сообщения SQLite лаконичны и по-английски — новичку они ничего не
 * говорят. Здесь мы распознаём типичные ошибки и подсказываем, как их
 * исправить, включая «возможно, вы имели в виду …» для опечаток.
 */

import type { SqlErrorHelp } from "@/types/database";

export type { SqlErrorHelp };

export interface ErrorContext {
  /** Таблицы, доступные игроку (закрытые сюда не передаются, чтобы не раскрыть их имена) */
  tables?: string[];
  /** Столбцы доступных таблиц */
  columns?: string[];
}

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "ON",
  "GROUP", "BY", "HAVING", "ORDER", "LIMIT", "OFFSET", "DISTINCT", "AS", "AND", "OR", "NOT",
  "IN", "IS", "NULL", "LIKE", "BETWEEN", "CASE", "WHEN", "THEN", "ELSE", "END", "UNION",
  "ALL", "EXCEPT", "INTERSECT", "WITH", "EXISTS", "ASC", "DESC", "OVER", "PARTITION",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "USING", "VALUES", "CAST",
];

const CLAUSE_ORDER = "SELECT → FROM → JOIN … ON → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT";

/** Функции из других СУБД, которых нет в SQLite, и их замены */
const FOREIGN_FUNCTIONS: Record<string, string> = {
  now: "В SQLite нет NOW(). Текущее время — datetime('now'), но в архиве важны даты событий дела — сравнивайте с конкретной датой-строкой, например '2025-11-03'.",
  getdate: "В SQLite нет GETDATE(). Используйте datetime('now') или конкретную дату-строку.",
  curdate: "В SQLite нет CURDATE(). Используйте date('now') или конкретную дату-строку.",
  date_format: "В SQLite нет DATE_FORMAT(). Форматирование дат — strftime('%Y-%m-%d', столбец).",
  to_char: "В SQLite нет TO_CHAR(). Форматирование дат — strftime('%H:%M', столбец).",
  to_date: "В SQLite нет TO_DATE(). Даты хранятся строками в формате 'ГГГГ-ММ-ДД ЧЧ:ММ' — сравнивайте строки напрямую.",
  year: "В SQLite нет YEAR(). Год из даты — strftime('%Y', столбец).",
  month: "В SQLite нет MONTH(). Месяц из даты — strftime('%m', столбец).",
  day: "В SQLite нет DAY(). День из даты — strftime('%d', столбец).",
  hour: "В SQLite нет HOUR(). Час из даты — strftime('%H', столбец), результат — строка вроде '02'.",
  datediff: "В SQLite нет DATEDIFF(). Разница в днях — julianday(конец) - julianday(начало).",
  dateadd: "В SQLite нет DATEADD(). Сдвиг даты — date(столбец, '+3 days') или datetime(столбец, '-2 hours').",
  isnull: "В SQLite нет ISNULL(x, y). Замена NULL — IFNULL(x, y) или COALESCE(x, y). Проверка — x IS NULL.",
  nvl: "В SQLite нет NVL(). Используйте IFNULL(x, y) или COALESCE(x, y).",
  len: "В SQLite функция длины называется LENGTH().",
  charindex: "В SQLite нет CHARINDEX(). Позиция подстроки — instr(строка, подстрока).",
  locate: "В SQLite нет LOCATE(). Позиция подстроки — instr(строка, подстрока).",
  position: "В SQLite нет POSITION(). Позиция подстроки — instr(строка, подстрока).",
  left: "В SQLite нет LEFT(s, n). Используйте substr(s, 1, n).",
  right: "В SQLite нет RIGHT(s, n). Используйте substr(s, -n).",
  top: "В SQLite нет TOP. Ограничение числа строк — LIMIT в конце запроса.",
  ilike: "В SQLite нет ILIKE. В этом архиве обычный LIKE уже не различает регистр (в том числе для кириллицы).",
  regexp: "Регулярные выражения в архиве недоступны. Используйте LIKE с шаблонами % и _.",
};

/** Расстояние Дамерау–Левенштейна (OSA): перестановка соседних букв — одна правка */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

export function closestMatch(word: string, candidates: string[]): string | null {
  const w = word.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(w, c.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  const limit = Math.max(1, Math.floor(w.length / 3));
  return best !== null && bestDist > 0 && bestDist <= limit ? best : null;
}

const CYRILLIC = /[Ѐ-ӿ]/;

function unique(values: string[] | undefined): string[] {
  return Array.from(new Set(values ?? []));
}

export function explainSqlError(raw: string, ctx: ErrorContext = {}): SqlErrorHelp {
  const message = raw.trim();
  const tables = unique(ctx.tables);
  const columns = unique(ctx.columns);
  let m: RegExpMatchArray | null;

  if ((m = message.match(/^no such table: (?:\w+\.)?(.+)$/i))) {
    const name = m[1];
    const guess = closestMatch(name, tables);
    return {
      title: "Нет такой таблицы",
      explanation: `В архиве нет таблицы «${name}».`,
      suggestion: guess
        ? `Возможно, вы имели в виду «${guess}»?`
        : "Список доступных таблиц — на панели схемы. Имена таблиц пишутся латиницей.",
    };
  }

  if ((m = message.match(/^no such column: (.+)$/i))) {
    const full = m[1];
    const name = full.includes(".") ? full.split(".").pop()! : full;
    if (CYRILLIC.test(name) || /\s/.test(name)) {
      return {
        title: "Текст без кавычек",
        explanation: `SQLite принял «${full}» за имя столбца.`,
        suggestion: `Текстовые значения пишутся в одинарных кавычках: '${name}'.`,
      };
    }
    const guess = closestMatch(name, columns);
    const alias = full.includes(".") ? full.split(".")[0] : null;
    return {
      title: "Нет такого столбца",
      explanation: `Столбца «${full}» нет ни в одной таблице запроса.`,
      suggestion: guess
        ? `Возможно, вы имели в виду «${alias ? `${alias}.` : ""}${guess}»?`
        : alias
          ? `Проверьте, что псевдоним «${alias}» объявлен в FROM/JOIN и что в этой таблице есть такой столбец.`
          : "Проверьте имя на панели схемы. Если это текст — возьмите его в одинарные кавычки.",
    };
  }

  if ((m = message.match(/^ambiguous column name: (.+)$/i))) {
    return {
      title: "Неоднозначный столбец",
      explanation: `Столбец «${m[1]}» есть сразу в нескольких таблицах запроса — SQLite не знает, какой взять.`,
      suggestion: `Уточните таблицу или псевдоним: например, s.${m[1]} вместо ${m[1]}.`,
    };
  }

  if (/^incomplete input$/i.test(message)) {
    return {
      title: "Запрос оборван",
      explanation: "Запрос закончился раньше, чем SQLite ожидал.",
      suggestion: "Проверьте закрывающие скобки и кавычки, а также что после WHERE, JOIN … ON и AND есть условие.",
    };
  }

  if ((m = message.match(/^unrecognized token: "(.+)"$/i))) {
    const token = m[1];
    return {
      title: "Непонятный символ",
      explanation: `SQLite не смог разобрать «${token}».`,
      suggestion: token.startsWith("'")
        ? "Похоже, не закрыта одинарная кавычка у строки."
        : "Проверьте кавычки и спецсимволы. Строки — в одинарных кавычках: 'текст'.",
    };
  }

  if ((m = message.match(/^near "(.+?)": syntax error$/i))) {
    const near = m[1];
    const upper = near.toUpperCase();
    const foreign = FOREIGN_FUNCTIONS[near.toLowerCase()];
    if (foreign) return { title: "Чужой диалект SQL", explanation: foreign };
    const keyword = closestMatch(upper, SQL_KEYWORDS);
    if (keyword && /^[A-Z]+$/i.test(near)) {
      return {
        title: "Опечатка в ключевом слове",
        explanation: `SQLite не знает слова «${near}».`,
        suggestion: `Возможно, вы имели в виду ${keyword}?`,
      };
    }
    if (upper === "FROM") {
      return {
        title: "Ошибка перед FROM",
        explanation: "Что-то не так в списке столбцов перед FROM.",
        suggestion: "Частая причина — лишняя запятая после последнего столбца: SELECT name, age FROM …",
      };
    }
    if (["WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "JOIN", "ON"].includes(upper)) {
      return {
        title: "Нарушен порядок частей запроса",
        explanation: `«${near}» стоит не на своём месте.`,
        suggestion: `Порядок частей SELECT-запроса: ${CLAUSE_ORDER}. Также проверьте лишнюю запятую перед ${upper}.`,
      };
    }
    if (near === ",") {
      return {
        title: "Лишняя запятая",
        explanation: "Запятая стоит там, где SQLite её не ожидал.",
        suggestion: "Проверьте, нет ли двух запятых подряд или запятой перед ключевым словом.",
      };
    }
    if (near === ")" || near === "(") {
      return {
        title: "Проблема со скобками",
        explanation: `Неожиданная скобка «${near}».`,
        suggestion: "Посчитайте открывающие и закрывающие скобки — их должно быть поровну.",
      };
    }
    return {
      title: "Синтаксическая ошибка",
      explanation: `SQLite споткнулся рядом с «${near}».`,
      suggestion: `Частые причины: пропущенная запятая между столбцами, текст без кавычек, неверный порядок частей (${CLAUSE_ORDER}).`,
    };
  }

  if ((m = message.match(/^misuse of aggregate(?: function)?:? (\w+)\(\)$/i))) {
    return {
      title: "Агрегат не на своём месте",
      explanation: `Функцию ${m[1].toUpperCase()}() нельзя использовать в WHERE — WHERE фильтрует строки до группировки.`,
      suggestion: "Фильтр по результату агрегата пишется в HAVING после GROUP BY: … GROUP BY x HAVING COUNT(*) > 3.",
    };
  }

  if (/aggregate functions are not allowed in the GROUP BY clause/i.test(message)) {
    return {
      title: "Агрегат в GROUP BY",
      explanation: "В GROUP BY перечисляются столбцы, по которым группируем, а не агрегаты.",
      suggestion: "Уберите COUNT/SUM/… из GROUP BY и оставьте их в SELECT или HAVING.",
    };
  }

  if (/a GROUP BY clause is required before HAVING/i.test(message)) {
    return {
      title: "HAVING без GROUP BY",
      explanation: "HAVING фильтрует группы, но групп нет.",
      suggestion: "Добавьте GROUP BY перед HAVING или перенесите условие в WHERE.",
    };
  }

  if ((m = message.match(/^misuse of window function (\w+)\(\)$/i))) {
    return {
      title: "Оконная функция не на своём месте",
      explanation: `${m[1].toUpperCase()}() нельзя использовать в WHERE, GROUP BY или HAVING — окна считаются после фильтрации.`,
      suggestion: "Посчитайте окно в подзапросе или CTE, а фильтруйте снаружи: WITH r AS (SELECT …, ROW_NUMBER() OVER (…) AS rn FROM …) SELECT * FROM r WHERE rn = 1.",
    };
  }

  if ((m = message.match(/^(\d+)\w* ORDER BY term out of range - should be between 1 and (\d+)$/i))) {
    return {
      title: "Номер столбца вне диапазона",
      explanation: `ORDER BY ${m[1]} ссылается на ${m[1]}-й столбец результата, а их всего ${m[2]}.`,
      suggestion: "Сортируйте по имени столбца: ORDER BY amount DESC.",
    };
  }

  if ((m = message.match(/^sub-select returns (\d+) columns - expected 1$/i))) {
    return {
      title: "Подзапрос вернул несколько столбцов",
      explanation: `Подзапрос внутри выражения или IN (…) должен возвращать ровно один столбец, а вернул ${m[1]}.`,
      suggestion: "Оставьте в SELECT подзапроса только нужный столбец: WHERE id IN (SELECT suspect_id FROM …).",
    };
  }

  if ((m = message.match(/^SELECTs to the left and right of (UNION ALL|UNION|INTERSECT|EXCEPT) do not have the same number of result columns$/i))) {
    return {
      title: `Разное число столбцов в ${m[1].toUpperCase()}`,
      explanation: `Обе части ${m[1].toUpperCase()} должны возвращать одинаковое количество столбцов.`,
      suggestion: "Выровняйте списки SELECT — при необходимости добавьте NULL AS имя в ту часть, где столбца не хватает.",
    };
  }

  if ((m = message.match(/^no such function: (\w+)$/i))) {
    const fn = m[1];
    const foreign = FOREIGN_FUNCTIONS[fn.toLowerCase()];
    return {
      title: "Нет такой функции",
      explanation: foreign ?? `В SQLite нет функции ${fn.toUpperCase()}().`,
      suggestion: foreign ? undefined : "Список функций SQLite — в справочнике детектива.",
    };
  }

  if ((m = message.match(/^wrong number of arguments to function (\w+)\(\)$/i))) {
    return {
      title: "Неверное число аргументов",
      explanation: `Функции ${m[1].toUpperCase()}() передано не то количество аргументов.`,
      suggestion: "Проверьте синтаксис в справочнике: например, substr(строка, начало, длина).",
    };
  }

  if (/^datatype mismatch$/i.test(message)) {
    return {
      title: "Несовпадение типов",
      explanation: "Значение не того типа там, где SQLite ждёт число (например, в LIMIT).",
      suggestion: "Числа пишутся без кавычек: LIMIT 10, а не LIMIT '10'.",
    };
  }

  if (/^(?:circular reference|recursive reference in a subquery)/i.test(message)) {
    return {
      title: "CTE ссылается сам на себя",
      explanation: "Обычный CTE не может ссылаться на собственное имя.",
      suggestion: "Дайте CTE имя, отличное от имён таблиц, или используйте WITH RECURSIVE с UNION ALL.",
    };
  }

  return {
    title: "Ошибка выполнения",
    explanation: "SQLite не смог выполнить запрос.",
    suggestion: "Прочитайте исходное сообщение ниже и сверьтесь со справочником.",
  };
}
