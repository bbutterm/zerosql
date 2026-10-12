import type { CaseDef } from "@/types/case";
import { EMOTIONS, NARRATOR, PLAYER, type CharacterDef, type Scene } from "@/types/story";
import { normalizeCell } from "./validator";
import { DEFAULT_BATCH_SIZE, statementParts } from "./protocol";
import { parseClock } from "./clock";

/**
 * Сюжетный слой дела: поиск сцен и проверка контента.
 *
 * Правило id реплик: `<caseShort>.<sceneId>.<nnn>`, где caseShort — «c» и
 * порядковый номер дела в две цифры (c00, c01, …), sceneId — id сцены
 * (латиница в нижнем регистре, цифры, «_» и «-»), nnn — номер реплики в три
 * цифры. Пример: c03.interrogation.007. Это же имя аудиофайла озвучки.
 */

export const LINE_ID_RE = /^c\d{2}\.[a-z0-9_-]+\.\d{3}$/;
export const SCENE_ID_RE = /^[a-z0-9_-]+$/;
export const MIN_HINTS = 3;

/** «c00», «c07», «c12» — короткий префикс дела для id реплик */
export function caseShort(caseDef: Pick<CaseDef, "order">): string {
  return `c${String(caseDef.order).padStart(2, "0")}`;
}

export function getScene(caseDef: CaseDef, sceneId: string): Scene | undefined {
  return caseDef.scenes.find((s) => s.id === sceneId);
}

/**
 * Линейная цепочка сцен от startId по полю next — до сцены с выбором или
 * предъявлением улики (там решает игрок) либо до конца. Защищена от циклов.
 */
export function sceneChain(caseDef: CaseDef, startId: string): Scene[] {
  const chain: Scene[] = [];
  const visited = new Set<string>();
  let scene = getScene(caseDef, startId);
  while (scene && !visited.has(scene.id)) {
    chain.push(scene);
    visited.add(scene.id);
    if (scene.choices?.length || scene.present || !scene.next) break;
    scene = getScene(caseDef, scene.next);
  }
  return chain;
}

/** Сцены, на которые ссылается сцена: next, выборы, исходы предъявления */
export function sceneLinks(scene: Scene): string[] {
  const links: string[] = [];
  if (scene.next) links.push(scene.next);
  for (const choice of scene.choices ?? []) if (choice.goto) links.push(choice.goto);
  if (scene.present) links.push(scene.present.success, scene.present.failure);
  return links;
}

/** Точки входа в сюжет дела: интро, сцены после задач, финал протокола, аутро */
function sceneEntries(caseDef: CaseDef): string[] {
  const entries = [caseDef.introScene];
  for (const o of caseDef.objectives) if (o.sceneAfter) entries.push(o.sceneAfter);
  if (caseDef.protocol) entries.push(caseDef.protocol.successScene);
  if (caseDef.outroScene) entries.push(caseDef.outroScene);
  return entries;
}

/** id всех улик сезона (из задач всех дел) */
export function collectEvidenceIds(cases: readonly CaseDef[]): Set<string> {
  const ids = new Set<string>();
  for (const c of cases) for (const o of c.objectives) if (o.evidence) ids.add(o.evidence.id);
  return ids;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
}

/**
 * Проверяет дело на ошибки контента. Возвращает список проблем на русском;
 * пустой список — дело корректно. Предназначено для тестов контента.
 */
export function validateCaseContent(
  caseDef: CaseDef,
  characters: readonly CharacterDef[],
  allEvidenceIds: ReadonlySet<string>
): string[] {
  const problems: string[] = [];
  const add = (text: string) => problems.push(`${caseDef.id}: ${text}`);

  const characterIds = new Set(characters.map((c) => c.id));
  const speakers = new Set([...characterIds, NARRATOR, PLAYER]);
  const emotions = new Set<string>(EMOTIONS);
  const sceneIds = new Set(caseDef.scenes.map((s) => s.id));
  const prefix = caseShort(caseDef);
  const hasScene = (where: string, id: string | undefined) => {
    if (id !== undefined && !sceneIds.has(id)) add(`${where}: сцена «${id}» не найдена`);
  };
  const hasEvidence = (where: string, id: string) => {
    if (!allEvidenceIds.has(id)) add(`${where}: улика «${id}» не существует в сезоне`);
  };

  // --- Карточка дела ---
  if (!Number.isInteger(caseDef.order) || caseDef.order < 0 || caseDef.order > 99) {
    add(`order должен быть целым от 0 до 99, а не ${caseDef.order}`);
  }
  if (!parseClock(caseDef.date)) add(`date «${caseDef.date}» не в формате 'YYYY-MM-DD HH:MM'`);
  for (const t of caseDef.newTables ?? []) {
    if (!caseDef.tables.includes(t)) add(`newTables: таблица «${t}» не входит в tables`);
  }
  if (!caseDef.protocol && !caseDef.outroScene) add("нет ни протокола, ни outroScene — дело нечем завершить");

  // --- Сцены и реплики ---
  for (const id of duplicates(caseDef.scenes.map((s) => s.id))) add(`сцена «${id}» объявлена дважды`);
  for (const id of duplicates(caseDef.scenes.flatMap((s) => s.lines.map((l) => l.id)))) {
    add(`реплика «${id}» объявлена дважды`);
  }

  for (const scene of caseDef.scenes) {
    const where = `сцена «${scene.id}»`;
    if (!SCENE_ID_RE.test(scene.id)) add(`${where}: id сцены должен состоять из a-z, 0-9, «_», «-»`);
    if (scene.lines.length === 0) add(`${where}: нет ни одной реплики`);

    for (const line of scene.lines) {
      const at = `реплика «${line.id}»`;
      if (!LINE_ID_RE.test(line.id)) {
        add(`${at}: id должен быть вида ${prefix}.${scene.id}.001`);
      } else if (!line.id.startsWith(`${prefix}.${scene.id}.`)) {
        add(`${at}: id должен начинаться с «${prefix}.${scene.id}.»`);
      }
      if (!speakers.has(line.speaker)) add(`${at}: неизвестный говорящий «${line.speaker}»`);
      if (line.emotion !== undefined && !emotions.has(line.emotion)) {
        add(`${at}: эмоции «${line.emotion}» нет в EMOTIONS`);
      }
      if (line.text.trim() === "") add(`${at}: пустой текст`);
    }

    hasScene(`${where}, next`, scene.next);
    for (const id of duplicates((scene.choices ?? []).map((c) => c.id))) add(`${where}: выбор «${id}» объявлен дважды`);
    for (const choice of scene.choices ?? []) {
      hasScene(`${where}, выбор «${choice.id}»`, choice.goto);
      for (const ev of choice.requires ?? []) hasEvidence(`${where}, выбор «${choice.id}»`, ev);
    }
    if (scene.present) {
      hasScene(`${where}, предъявление success`, scene.present.success);
      hasScene(`${where}, предъявление failure`, scene.present.failure);
      if (scene.present.correct.length === 0) add(`${where}: у предъявления нет верных улик`);
      for (const ev of scene.present.correct) hasEvidence(`${where}, предъявление`, ev);
    }
  }

  hasScene("introScene", caseDef.introScene);
  hasScene("outroScene", caseDef.outroScene);

  // Недостижимые сцены — лишняя озвучка, которую никто не услышит
  const reachable = new Set<string>();
  const queue = sceneEntries(caseDef).filter((id) => sceneIds.has(id));
  while (queue.length) {
    const id = queue.pop() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const scene = getScene(caseDef, id);
    if (scene) for (const link of sceneLinks(scene)) if (sceneIds.has(link)) queue.push(link);
  }
  for (const id of sceneIds) if (!reachable.has(id)) add(`сцена «${id}» недостижима`);

  // --- Задачи ---
  for (const id of duplicates(caseDef.objectives.map((o) => o.id))) add(`задача «${id}» объявлена дважды`);
  const mainOrders = caseDef.objectives.filter((o) => !o.optional).map((o) => String(o.order));
  for (const order of duplicates(mainOrders)) add(`order ${order} повторяется у основных задач`);
  if (mainOrders.length === 0) add("нет ни одной основной задачи");

  const evidenceIds: string[] = [];
  for (const objective of caseDef.objectives) {
    const where = `задача «${objective.id}»`;
    if (objective.hints.length < MIN_HINTS) {
      add(`${where}: подсказок ${objective.hints.length}, нужно не меньше ${MIN_HINTS}`);
    }
    objective.hints.forEach((hint, i) => {
      if (hint.by !== undefined && !characterIds.has(hint.by)) {
        add(`${where}, подсказка ${i + 1}: неизвестный персонаж «${hint.by}»`);
      }
    });
    hasScene(`${where}, sceneAfter`, objective.sceneAfter);
    if (objective.evidence) evidenceIds.push(objective.evidence.id);
  }
  for (const id of duplicates(evidenceIds)) add(`улика «${id}» объявлена дважды`);
  for (const id of evidenceIds) if (!id.startsWith("ev.")) add(`улика «${id}»: id должен начинаться с «ev.»`);

  // --- Протокол ---
  const protocol = caseDef.protocol;
  if (protocol) {
    hasScene("protocol.successScene", protocol.successScene);
    const batch = protocol.batchSize ?? DEFAULT_BATCH_SIZE;
    if (!Number.isInteger(batch) || batch < 1) add(`protocol.batchSize должен быть целым ≥ 1, а не ${batch}`);
    if (protocol.blanks.length === 0) add("в протоколе нет пропусков");

    const blankIds = new Set(protocol.blanks.map((b) => b.id));
    for (const id of duplicates(protocol.blanks.map((b) => b.id))) add(`пропуск «${id}» объявлен дважды`);
    const used = new Set<string>();
    for (const statement of protocol.statements) {
      for (const part of statementParts(statement)) {
        if (part.kind !== "blank") continue;
        used.add(part.blankId);
        if (!blankIds.has(part.blankId)) add(`протокол: пропуск {${part.blankId}} не объявлен в blanks`);
      }
    }
    for (const blank of protocol.blanks) {
      const where = `пропуск «${blank.id}»`;
      if (!used.has(blank.id)) add(`${where} не используется ни в одной строке протокола`);
      if (!blank.options.includes(blank.answer)) add(`${where}: ответ «${blank.answer}» не входит в options`);
      const keys = blank.options.map((o) => normalizeCell(o));
      for (const key of duplicates(keys)) {
        const same = blank.options.filter((o) => normalizeCell(o) === key);
        add(`${where}: варианты неразличимы (${same.map((o) => `«${o}»`).join(", ")})`);
      }
    }
  }

  return problems;
}

/**
 * Проверка всего сезона: каждое дело плюс сквозные правила — уникальные id
 * и order дел, уникальные id улик между делами.
 */
export function validateSeasonContent(cases: readonly CaseDef[], characters: readonly CharacterDef[]): string[] {
  const problems: string[] = [];
  for (const id of duplicates(cases.map((c) => c.id))) problems.push(`сезон: дело «${id}» объявлено дважды`);
  for (const order of duplicates(cases.map((c) => String(c.order)))) {
    problems.push(`сезон: order ${order} повторяется — id реплик дел совпадут`);
  }
  // Повторы внутри одного дела ловит validateCaseContent — здесь только между делами
  const evidence = cases.flatMap((c) => [...collectEvidenceIds([c])]);
  for (const id of duplicates(evidence)) problems.push(`сезон: улика «${id}» объявлена в нескольких делах`);

  const characterIds = characters.map((c) => c.id);
  for (const id of duplicates(characterIds)) problems.push(`персонажи: «${id}» объявлен дважды`);
  for (const id of characterIds) {
    if (id === NARRATOR || id === PLAYER) problems.push(`персонажи: id «${id}» зарезервирован`);
  }

  const allEvidence = collectEvidenceIds(cases);
  for (const c of cases) problems.push(...validateCaseContent(c, characters, allEvidence));
  return problems;
}
