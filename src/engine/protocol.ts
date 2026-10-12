import type { QueryResult } from "@/types/database";
import type { ProtocolBlank, ProtocolDef } from "@/types/case";
import { plural } from "@/lib/plural";
import { normalizeCell } from "./validator";

/**
 * Протокол-дедукция в духе Return of the Obra Dinn.
 *
 * Игрок заполняет пропуски протокола вариантами из выпадающих списков.
 * Вариант можно выбрать, только если он встречался в результатах запросов
 * игрока (обвинять можно только тех, кого нашёл сам). Сверка подтверждает
 * верные пропуски пачкой — и никогда не говорит, какие именно неверны.
 */

export const DEFAULT_BATCH_SIZE = 3;

/** Части строки протокола: текст и пропуски {blankId} */
export type StatementPart = { kind: "text"; text: string } | { kind: "blank"; blankId: string };

const BLANK_RE = /\{([^{}]+)\}/g;

/** Разбирает строку протокола на текст и пропуски: "Груз увёз {driver}." */
export function statementParts(statement: string): StatementPart[] {
  const parts: StatementPart[] = [];
  let last = 0;
  for (const match of statement.matchAll(BLANK_RE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: statement.slice(last, start) });
    parts.push({ kind: "blank", blankId: match[1].trim() });
    last = start + match[0].length;
  }
  if (last < statement.length) parts.push({ kind: "text", text: statement.slice(last) });
  return parts;
}

/**
 * Какие варианты протокола (по всем пропускам) встречаются в ячейках результата.
 * Сравнение — как у валидатора (normalizeCell): без регистра и пробелов по краям,
 * ё = е, '47' = 47. Ячейка должна совпадать с вариантом целиком.
 * Возвращает варианты в порядке протокола, без повторов.
 */
export function scanSeenOptions(protocol: ProtocolDef, result: QueryResult): string[] {
  if (result.error || result.rows.length === 0) return [];

  // нормализованный вариант → исходные написания (одно значение может быть в нескольких пропусках)
  const wanted = new Map<string, string[]>();
  for (const blank of protocol.blanks) {
    for (const option of blank.options) {
      const key = normalizeCell(option);
      const list = wanted.get(key);
      if (!list) wanted.set(key, [option]);
      else if (!list.includes(option)) list.push(option);
    }
  }
  if (wanted.size === 0) return [];

  const hits = new Set<string>();
  // Одинаковые значения в ячейках встречаются часто — не нормализуем их повторно
  const checked = new Set<unknown>();
  scan: for (const row of result.rows) {
    for (const cell of row) {
      if (checked.has(cell)) continue;
      checked.add(cell);
      const key = normalizeCell(cell);
      if (wanted.has(key)) {
        hits.add(key);
        if (hits.size === wanted.size) break scan;
      }
    }
  }

  const seen: string[] = [];
  for (const key of hits) seen.push(...(wanted.get(key) ?? []));
  const order = new Map<string, number>();
  protocol.blanks.flatMap((b) => b.options).forEach((o, i) => {
    if (!order.has(o)) order.set(o, i);
  });
  return seen.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/**
 * Варианты, которые игрок может выбрать в пропуске. При requireSeen (по
 * умолчанию) — только встреченные в результатах; сравнение через normalizeCell.
 */
export function availableOptions(blank: ProtocolBlank, seen: ReadonlySet<string>): string[] {
  if (blank.requireSeen === false) return [...blank.options];
  const seenKeys = new Set<string>();
  for (const value of seen) seenKeys.add(normalizeCell(value));
  return blank.options.filter((o) => seenKeys.has(normalizeCell(o)));
}

export interface ProtocolCheck {
  /** Пропуски, подтверждённые этой сверкой */
  newlyConfirmed: string[];
  /** Все подтверждённые пропуски после сверки (в порядке протокола) */
  confirmed: string[];
  /**
   * Сколько верных ответов осталось неподтверждёнными (меньше пачки).
   * Только для статистики и тестов — показывать игроку нельзя.
   */
  correctUnconfirmed: number;
  /** Все пропуски подтверждены */
  solved: boolean;
  /** Сообщение игроку на русском: ни слова о том, какие пропуски неверны */
  message: string;
}

const GENITIVE_NUMERALS = [
  "нуля", "одного", "двух", "трёх", "четырёх", "пяти", "шести", "семи", "восьми", "девяти", "десяти",
];

/** «трёх», «пяти»; дальше десяти — цифрами */
function genitiveNumeral(n: number): string {
  return GENITIVE_NUMERALS[n] ?? String(n);
}

const ITEM_FORMS = ["пункт", "пункта", "пунктов"] as const;
const CONFIRMED_FORMS = ["Подтверждён", "Подтверждено", "Подтверждено"] as const;

/** «Подтверждён 1 пункт», «Подтверждено 3 пункта», «Подтверждено 5 пунктов» */
export function confirmedPhrase(n: number): string {
  return `${plural(n, CONFIRMED_FORMS)} ${n} ${plural(n, ITEM_FORMS)}`;
}

function isCorrect(blank: ProtocolBlank, answer: string | undefined): boolean {
  if (answer === undefined || answer.trim() === "") return false;
  return normalizeCell(answer) === normalizeCell(blank.answer);
}

/**
 * Сверка протокола. R — ещё не подтверждённые пропуски, C — верные среди R.
 * Если верны все оставшиеся (C = R) или верных не меньше batchSize — все C
 * подтверждаются. Иначе не подтверждается ничего.
 */
export function checkProtocol(
  protocol: ProtocolDef,
  answers: Readonly<Record<string, string | undefined>>,
  confirmed: ReadonlySet<string>
): ProtocolCheck {
  const batchSize = Math.max(1, Math.floor(protocol.batchSize ?? DEFAULT_BATCH_SIZE));
  const remaining = protocol.blanks.filter((b) => !confirmed.has(b.id));
  const correct = remaining.filter((b) => isCorrect(b, answers[b.id]));

  const accept = correct.length > 0 && (correct.length === remaining.length || correct.length >= batchSize);
  const newly = new Set(accept ? correct.map((b) => b.id) : []);
  const confirmedAfter = protocol.blanks.filter((b) => confirmed.has(b.id) || newly.has(b.id)).map((b) => b.id);
  const solved = confirmedAfter.length === protocol.blanks.length;

  let message: string;
  if (remaining.length === 0) {
    message = "Протокол уже подтверждён полностью.";
  } else if (solved) {
    message = `${confirmedPhrase(newly.size)}. Протокол сходится полностью.`;
  } else if (accept) {
    message = `${confirmedPhrase(newly.size)}. Остальное пока не сходится.`;
  } else if (batchSize === 1) {
    message = "Ни один пункт не сходится. Ничего не подтверждено.";
  } else {
    message = `Слишком мало уверенности: верных меньше ${genitiveNumeral(batchSize)}. Ничего не подтверждено.`;
  }

  return {
    newlyConfirmed: protocol.blanks.filter((b) => newly.has(b.id)).map((b) => b.id),
    confirmed: confirmedAfter,
    correctUnconfirmed: accept ? 0 : correct.length,
    solved,
    message,
  };
}

/** Реплика-реакция на неудачную сверку: failureLines по кругу (failedAttempts с 1) */
export function protocolFailureLine(protocol: ProtocolDef, failedAttempts: number): string | undefined {
  const lines = protocol.failureLines;
  if (!lines?.length) return undefined;
  const index = Math.max(0, Math.floor(failedAttempts) - 1) % lines.length;
  return lines[index];
}
