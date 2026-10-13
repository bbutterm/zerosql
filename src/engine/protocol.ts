import type { QueryResult } from "@/types/database";
import type { ProtocolBlank, ProtocolDef } from "@/types/case";
import { plural } from "@/lib/plural";
import { asNumber, normalizeCell, valuesMatch, type MatchOptions } from "./values";

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

// --- Реестр увиденного (разд. 6.4) ---

/** Результаты до стольких строк включительно сканируются целиком */
export const SEEN_FULL_SCAN_ROWS = 200;

/** Столбцы-сущности из метаданных схемы (разд. 6.4): в больших результатах видны только они */
export const ENTITY_COLUMNS: ReadonlySet<string> = new Set([
  "id", "full_name", "last_name", "full_name_text", "owner_name", "holder_name", "key_owner",
  "guest_name", "courier_name", "counterparty", "person_text", "plate", "login", "badge_id",
  "kusp_no", "doc_no", "reg_no", "doc_reg_no", "case_id", "account_id", "deal_no", "contract_no",
  "address_text", "door", "msisdn",
]);

/**
 * Имена-сущности под алиасами: латиница (…_id, name, plate, phone, login,
 * badge, company, owner, holder, person, …) и русские алиасы (фио, имя,
 * фамилия, номер, телефон, логин, пропуск, компания, владелец, адрес, кто).
 */
const ENTITY_NAME_RE =
  /(^|_)id$|name|plate|phone|msisdn|login|badge|company|owner|holder|person|guest|courier|counterparty|door|address|kusp|(^|_)(doc|reg|deal|contract)_no$|account|фио|имя|фамил|номер|телефон|логин|пропуск|компан|владел|адрес|^кто$/;

/** Похоже на ФИО: «Вальц Ирина Петровна», «Ким Д. С.», «Ратников Л.Б.» */
const PERSON_LIKE_RE = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?: [А-ЯЁ](?:[а-яё]+|\.)(?: ?[А-ЯЁ](?:[а-яё]+|\.))?)$/;

/** Столбец-сущность по имени (с учётом алиасов) */
export function isEntityColumn(name: string): boolean {
  const n = name.trim().toLowerCase();
  return ENTITY_COLUMNS.has(n) || ENTITY_NAME_RE.test(n);
}

/** Столбец с ФИО под любым алиасом: большинство из первых 20 непустых значений похожи на ФИО */
function looksLikePersonColumn(rows: readonly unknown[][], col: number): boolean {
  let checked = 0;
  let hits = 0;
  for (const row of rows) {
    const v = row[col];
    if (v === null || v === undefined) continue;
    checked++;
    if (typeof v === "string" && PERSON_LIKE_RE.test(v.trim())) hits++;
    if (checked >= 20) break;
  }
  return checked > 0 && hits * 2 > checked;
}

/** Индексы столбцов, ячейки которых попадают в реестр (все — для результатов до 200 строк) */
function seenColumns(result: QueryResult): number[] {
  const all = result.columns.map((_, i) => i);
  if (result.rows.length <= SEEN_FULL_SCAN_ROWS) return all;
  return all.filter((i) => isEntityColumn(result.columns[i]) || looksLikePersonColumn(result.rows, i));
}

/**
 * Реестр увиденного одного результата (разд. 6.4): значения ячеек строками
 * (каждая ячейка для результатов до 200 строк; в больших — только столбцы-
 * сущности) и число строк результата как число. NULL не попадает. Значения
 * без повторов (по normalizeCell), в порядке появления. Ошибка — пусто.
 */
export function scanSeen(result: QueryResult): string[] {
  if (result.error || result.columns.length === 0) return [];
  const out: string[] = [];
  const keys = new Set<string>();
  const push = (value: unknown) => {
    if (value === null || value === undefined || value instanceof Uint8Array) return;
    const key = normalizeCell(value);
    if (keys.has(key)) return;
    keys.add(key);
    out.push(String(value));
  };
  const cols = seenColumns(result);
  const checked = new Set<unknown>();
  for (const row of result.rows) {
    for (const i of cols) {
      const cell = row[i];
      if (checked.has(cell)) continue;
      checked.add(cell);
      push(cell);
    }
  }
  push(result.rowCount);
  return out;
}

/** Параметры сравнения пропуска */
function blankMatchOptions(blank: ProtocolBlank): MatchOptions {
  return {
    ...(blank.tolerance !== undefined ? { tolerance: blank.tolerance } : {}),
    ...(blank.precision !== undefined ? { precision: blank.precision } : {}),
  };
}

/**
 * Какие варианты протокола встречаются в результате (разд. 6.4).
 *  - person / text — ячейка совпадает с вариантом (или его alias) целиком
 *    после нормализации: регистр, пробелы по краям, ё = е, '47' = 47;
 *  - number — числовая ячейка или число строк результата, по модулю с допуском;
 *  - datetime — ячейка-дата по префиксу точности ('ДД.ММ.ГГГГ' приводится к ISO).
 * В результатах больше 200 строк сканируются только столбцы-сущности и
 * столбцы, где встречается вариант пропуска person (ФИО под любым алиасом).
 * O(строки × столбцы), выход, как только найдены все варианты.
 * Возвращает варианты в порядке протокола, без повторов.
 */
export function scanSeenOptions(protocol: ProtocolDef, result: QueryResult): string[] {
  if (result.error || result.columns.length === 0) return [];

  // нормализованное значение → варианты (одно значение может открывать варианты нескольких пропусков)
  const exact = new Map<string, Set<string>>();
  // те же ключи, но только для пропусков person: их ищем в любых столбцах
  const personKeys = new Set<string>();
  const numbers: { option: string; value: string; blank: ProtocolBlank }[] = [];
  const dates: { option: string; blank: ProtocolBlank }[] = [];
  const all = new Set<string>();

  const addExact = (value: unknown, option: string, person: boolean) => {
    const key = normalizeCell(value);
    let set = exact.get(key);
    if (!set) exact.set(key, (set = new Set()));
    set.add(option);
    // ФИО ищем в любом столбце; числовые alias (persons.id) — только в столбцах-сущностях
    if (person && asNumber(value) === null) personKeys.add(key);
  };

  for (const blank of protocol.blanks) {
    for (const option of blank.options) {
      all.add(option);
      if (blank.kind === "number") numbers.push({ option, value: option, blank });
      else if (blank.kind === "datetime") dates.push({ option, blank });
      else addExact(option, option, blank.kind === "person");
      for (const alias of blank.aliases?.[option] ?? []) addExact(alias, option, blank.kind === "person");
    }
  }
  if (all.size === 0) return [];

  const hits = new Set<string>();
  const hit = (option: string) => hits.add(option);

  const probeNumber = (cell: unknown) => {
    for (const n of numbers) if (!hits.has(n.option) && valuesMatch("number", n.value, cell, blankMatchOptions(n.blank))) hit(n.option);
  };
  const probeDate = (cell: unknown) => {
    for (const d of dates) if (!hits.has(d.option) && valuesMatch("datetime", d.option, cell, blankMatchOptions(d.blank))) hit(d.option);
  };

  // число строк — увиденное число
  if (numbers.length) probeNumber(result.rowCount);

  const big = result.rows.length > SEEN_FULL_SCAN_ROWS;
  const entity = new Set(big ? seenColumns(result) : result.columns.map((_, i) => i));
  const width = result.columns.length;
  // Одинаковые значения в ячейках встречаются часто — не проверяем их повторно
  const checkedFull = new Set<unknown>();
  const checkedPerson = new Set<unknown>();

  scan: for (const row of result.rows) {
    for (let i = 0; i < width; i++) {
      const cell = row[i];
      if (cell === null || cell === undefined) continue;
      if (entity.has(i)) {
        if (checkedFull.has(cell)) continue;
        checkedFull.add(cell);
        const options = exact.get(normalizeCell(cell));
        if (options) for (const o of options) hit(o);
        if (numbers.length && asNumber(cell) !== null) probeNumber(cell);
        if (dates.length && typeof cell === "string") probeDate(cell);
      } else if (personKeys.size) {
        // ФИО под неизвестным алиасом в большом результате: столбец «попал» в варианты person
        if (checkedPerson.has(cell)) continue;
        checkedPerson.add(cell);
        const key = normalizeCell(cell);
        if (personKeys.has(key)) for (const o of exact.get(key) ?? []) hit(o);
      } else {
        continue;
      }
      if (hits.size === all.size) break scan;
    }
  }

  const order = new Map<string, number>();
  protocol.blanks.flatMap((b) => b.options).forEach((o, i) => {
    if (!order.has(o)) order.set(o, i);
  });
  return [...hits].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/**
 * Увидел ли игрок вариант пропуска: seen — реестр (варианты из scanSeenOptions
 * или значения из scanSeen). Сравнение — по правилам типа пропуска, с aliases.
 */
export function optionSeen(blank: ProtocolBlank, option: string, seen: ReadonlySet<string>): boolean {
  return seenIndex(seen).has(blank, option);
}

interface SeenIndex {
  has(blank: ProtocolBlank, option: string): boolean;
}

function seenIndex(seen: ReadonlySet<string>): SeenIndex {
  const keys = new Set<string>();
  for (const v of seen) keys.add(normalizeCell(v));
  return {
    has(blank, option) {
      if (keys.has(normalizeCell(option))) return true;
      if ((blank.aliases?.[option] ?? []).some((a) => keys.has(normalizeCell(a)))) return true;
      if (blank.kind === "number" || blank.kind === "datetime") {
        const opts = blankMatchOptions(blank);
        for (const v of seen) if (valuesMatch(blank.kind, option, v, opts)) return true;
      }
      return false;
    },
  };
}

/**
 * Варианты, которые игрок может выбрать в пропуске. При requireSeen (по
 * умолчанию) — только увиденные (optionSeen); порядок — как в протоколе.
 */
export function availableOptions(blank: ProtocolBlank, seen: ReadonlySet<string>): string[] {
  if (blank.requireSeen === false) return [...blank.options];
  const index = seenIndex(seen);
  return blank.options.filter((o) => index.has(blank, o));
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

/**
 * Верен ли ответ пропуска по правилам его типа: person / text — после
 * нормализации, number — по модулю с допуском, datetime — по префиксу точности.
 */
export function isBlankCorrect(blank: ProtocolBlank, answer: string | undefined): boolean {
  if (answer === undefined || answer.trim() === "") return false;
  return valuesMatch(blank.kind, blank.answer, answer, blankMatchOptions(blank));
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
  const correct = remaining.filter((b) => isBlankCorrect(b, answers[b.id]));

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
