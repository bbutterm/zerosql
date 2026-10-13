import type { AccusationDef, CardCondition, CardPredicate, CardStamp, PinnedCard } from "@/types/case";
import { asNumber, cellsEqual, normalizeCell } from "./values";

/**
 * Доска улик (GAME_DESIGN, разд. 6.5) и обвинение (разд. 6.8).
 *
 * Карточка засчитывается по содержимому, а не по id строки или запросу:
 * узел доски — это предикат над значениями карточки. Призраки (расхождение
 * с источником), расхождения и подлоги источником не считаются.
 */

/** Штампы, с которыми карточка не считается источником */
export const NOT_A_SOURCE: ReadonlySet<CardStamp> = new Set<CardStamp>(["mismatch", "ghost", "forgery"]);

/** Карточка считается источником: без штампов РАСХОЖДЕНИЕ / ПРИЗРАК / ПОДЛОГ */
export function isSourceCard(card: PinnedCard): boolean {
  return !card.stamp || !NOT_A_SOURCE.has(card.stamp);
}

const asList = <T>(value: T | T[] | undefined): T[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

function columnIndexes(card: PinnedCard, column: string | string[] | undefined): number[] {
  const names = asList(column).map((c) => c.toLowerCase());
  if (names.length === 0) return card.values.map((_, i) => i);
  const found: number[] = [];
  card.columns.forEach((c, i) => {
    if (names.includes(c.toLowerCase())) found.push(i);
  });
  return found;
}

const text = (value: unknown) => normalizeCell(value);

function compareOrdered(a: unknown, b: unknown): number | null {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na - nb;
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const sa = String(a).trim();
  const sb = String(b).trim();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function cellSatisfies(cell: unknown, c: CardCondition): boolean {
  const tolerance = c.tolerance ?? 0.01;
  if (c.eq !== undefined && !cellsEqual(cell, c.eq, tolerance)) return false;
  if (c.in !== undefined && !c.in.some((v) => cellsEqual(cell, v, tolerance))) return false;
  if (c.prefix !== undefined) {
    if (cell === null || cell === undefined || !text(cell).startsWith(text(c.prefix))) return false;
  }
  if (c.contains !== undefined) {
    if (cell === null || cell === undefined || !text(cell).includes(text(c.contains))) return false;
  }
  if (c.between !== undefined) {
    const low = compareOrdered(cell, c.between[0]);
    const high = compareOrdered(cell, c.between[1]);
    if (low === null || high === null || low < 0 || high > 0) return false;
  }
  return true;
}

/** Условие выполняется хотя бы на одной ячейке подходящих столбцов */
export function conditionHolds(card: PinnedCard, condition: CardCondition): boolean {
  return columnIndexes(card, condition.column).some((i) => cellSatisfies(card.values[i], condition));
}

/** Подходит ли карточка под предикат узла доски */
export function cardMatches(card: PinnedCard, predicate: CardPredicate): boolean {
  const tables = asList(predicate.table).map((t) => t.toLowerCase());
  if (tables.length && !tables.includes((card.table ?? "").toLowerCase())) return false;
  const classes = asList(predicate.sourceClass);
  if (classes.length && (!card.sourceClass || !classes.includes(card.sourceClass))) return false;
  if (predicate.node !== undefined && card.node !== predicate.node) return false;
  if (predicate.all && !predicate.all.every((c) => conditionHolds(card, c))) return false;
  if (predicate.any && predicate.any.length > 0 && !predicate.any.some((c) => conditionHolds(card, c))) return false;
  return true;
}

/** Есть ли в карточке хотя бы один из ключей (id, логин, пропуск, номер машины) */
export function cardHasKey(card: PinnedCard, keys: ReadonlyArray<string | number>): boolean {
  if (keys.length === 0) return false;
  const wanted = new Set(keys.map((k) => normalizeCell(k)));
  return card.values.some((v) => v !== null && wanted.has(normalizeCell(v)));
}

export type AccusationOutcome = "accepted" | "wrong_person" | "weak_evidence";

export interface AccusationCheck {
  outcome: AccusationOutcome;
  /** Карточки-источники, в содержимом которых есть ключ обвиняемого */
  cards: string[];
  /**
   * Сцена-реакция: при верном обвинении — successScene, при ложном — реакция
   * на конкретного человека или wrongScene. При слабых доказательствах сцены
   * нет: обвинение не принимается, но и не наказывается.
   */
  scene?: string;
  /** Флаг доверия, который нужно уменьшить на 1 (только при ложном обвинении) */
  trustFlag?: string;
  /** Сообщение игроку */
  message: string;
}

/**
 * Обвинение (разд. 6.8): игрок выбирает человека поиском по увиденным и
 * прикладывает карточки. Верно, если это тот самый человек и среди
 * приложенных карточек-источников не меньше minCards (по умолчанию 2)
 * содержат его ключи. Ложное обвинение не заканчивает игру: сюжетная
 * реакция, −1 к доверию, обвинение сбрасывается.
 */
export function checkAccusation(
  accusation: AccusationDef,
  accused: string | number,
  attached: readonly PinnedCard[]
): AccusationCheck {
  const key = normalizeCell(accused);
  const isAnswer = key === normalizeCell(accusation.answer) || accusation.keys.some((k) => normalizeCell(k) === key);

  if (!isAnswer) {
    const reaction = accusation.wrong?.find((w) => normalizeCell(w.person) === key);
    return {
      outcome: "wrong_person",
      cards: [],
      scene: reaction?.scene ?? accusation.wrongScene,
      ...(accusation.trustFlag ? { trustFlag: accusation.trustFlag } : {}),
      message: "Обвинение не подтвердилось.",
    };
  }

  const cards = attached.filter((c) => isSourceCard(c) && cardHasKey(c, accusation.keys)).map((c) => c.id);
  const need = Math.max(1, Math.floor(accusation.minCards ?? 2));
  if (cards.length < need) {
    return {
      outcome: "weak_evidence",
      cards,
      message: `Карточек, где есть его id, логин, пропуск или номер машины: ${cards.length} из ${need}.`,
    };
  }
  return { outcome: "accepted", cards, scene: accusation.successScene, message: "Обвинение принято." };
}
