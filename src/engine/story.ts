import type { CaseDef, EventTrigger, FlagCondition } from "@/types/case";
import {
  EMOTIONS,
  NARRATOR,
  PLAYER,
  PORTRAIT_VARIANTS,
  type CharacterDef,
  type Emotion,
  type EvidencePresent,
  type Scene,
} from "@/types/story";
import { asNumber, normalizeCell, numbersMatch, toIsoDateTime, PRECISION_LENGTH, precisionOf } from "./values";
import { DEFAULT_BATCH_SIZE, statementParts } from "./protocol";
import { compareClock, parseClock } from "./clock";

/**
 * Сюжетный слой дела: поиск сцен и проверка контента.
 *
 * Правило id реплик (GAME_DESIGN, разд. 11.3; TECH_SPEC, разд. 2):
 * `<prefix>.<scene>.<nnn>` в нижнем регистре, это же имя аудиофайла
 * `public/voice/<id>.mp3`.
 *  - реплики дел: prefix — «c» и order дела в две цифры (c00 … c12;
 *    интерлюдия case-11-chernovik — c11, финал case-12-pervoe-solntse — c12),
 *    scene — id сцены: c03.interrogation.007;
 *  - служебные: note (записи Ирины, сцена n01…n10), ep (эпилог), bark
 *    (реплики на действия), hint (наводки, сцена cNN_<id задачи>:
 *    hint.c05_o5_1.002), sys (МИРА).
 */

export const LINE_ID_RE = /^(c\d{2}|note|ep|bark|hint|sys)\.[a-z0-9_-]+\.\d{3}$/;
/** Служебные префиксы реплик вне дел */
export const SERVICE_LINE_PREFIXES = ["note", "ep", "bark", "hint", "sys"] as const;
export const SCENE_ID_RE = /^[a-z0-9_-]+$/;
/** id дела: case-NN-<slug>, NN = order */
export const CASE_ID_RE = /^case-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** id задачи: p1, o5_1, o10_2b, i1 */
export const OBJECTIVE_ID_RE = /^[a-z0-9_-]+$/;
export const MIN_HINTS = 3;

export interface LineIdParts {
  /** c00…c99 | note | ep | bark | hint | sys */
  prefix: string;
  scene: string;
  /** Номер реплики 1…999 */
  n: number;
}

/** Разбирает id реплики; null — id не по правилу LINE_ID_RE */
export function parseLineId(id: string): LineIdParts | null {
  if (!LINE_ID_RE.test(id)) return null;
  const [prefix, scene, n] = id.split(".");
  return { prefix, scene, n: Number(n) };
}

/**
 * Проверка id реплики по правилам префикса: note — сцена n01…n99, hint —
 * сцена cNN_<id задачи>. Возвращает описание проблемы или null.
 */
export function lineIdProblem(id: string): string | null {
  const parts = parseLineId(id);
  if (!parts) return "id должен быть вида <префикс>.<сцена>.<nnn>: c03.intro.001, bark.tokha_eqnull.001";
  if (parts.prefix === "note" && !/^n\d{2}$/.test(parts.scene)) return "у записей Ирины сцена n01…n10: note.n02.001";
  if (parts.prefix === "hint" && !/^c\d{2}_[a-z0-9_-]+$/.test(parts.scene)) {
    return "у наводок сцена cNN_<id задачи>: hint.c05_o5_1.002";
  }
  return null;
}

/**
 * Имя файла портрета без расширения: эмоция или её вариант (разд. 11.1).
 * `<emotion>_outdoor`, если сцена на улице и вариант у персонажа есть; иначе
 * просто эмоция. Эмоция по умолчанию — основная эмоция персонажа.
 */
export function portraitKey(character: CharacterDef, emotion?: Emotion, outdoor = false): string {
  const mood = emotion ?? character.emotions[0] ?? "neutral";
  if (outdoor && character.variants?.outdoor?.includes(mood)) return `${mood}_outdoor`;
  return mood;
}

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

/** Сцены, на которые ссылается сцена: next, выборы, исходы предъявления, ветки допроса */
export function sceneLinks(scene: Scene): string[] {
  const links: string[] = [];
  if (scene.next) links.push(scene.next);
  for (const choice of scene.choices ?? []) if (choice.goto) links.push(choice.goto);
  if (scene.present) links.push(scene.present.success, scene.present.failure);
  const int = scene.interrogation;
  if (int) {
    for (const point of int.points) {
      if (point.press) links.push(point.press);
      if (point.present) links.push(point.present.success, point.present.failure);
    }
    if (int.closedScene) links.push(int.closedScene);
    if (int.doneScene) links.push(int.doneScene);
  }
  return links;
}

/** Точки входа в сюжет дела: интро, сцены после задач, финал протокола, обвинения, события, аутро */
function sceneEntries(caseDef: CaseDef): string[] {
  const entries = [caseDef.introScene];
  for (const o of caseDef.objectives) if (o.sceneAfter) entries.push(o.sceneAfter);
  if (caseDef.protocol) entries.push(caseDef.protocol.successScene);
  for (const a of caseDef.accusations ?? []) {
    entries.push(a.successScene, a.wrongScene, ...(a.wrong ?? []).map((w) => w.scene));
  }
  for (const e of caseDef.events ?? []) if (e.scene) entries.push(e.scene);
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
  const characterById = new Map(characters.map((c) => [c.id, c]));
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
  const idMatch = CASE_ID_RE.exec(caseDef.id);
  if (!idMatch) add(`id дела должен быть вида case-NN-<slug> (a-z, 0-9, «-»)`);
  else if (Number(idMatch[1]) !== caseDef.order) add(`номер в id (${idMatch[1]}) не равен order (${caseDef.order})`);
  if (!parseClock(caseDef.date)) add(`date «${caseDef.date}» не в формате 'YYYY-MM-DD HH:MM[:SS]'`);
  for (const t of caseDef.newTables ?? []) {
    if (!caseDef.tables.includes(t)) add(`newTables: таблица «${t}» не входит в tables`);
  }
  if ("allowWrites" in caseDef) add("allowWrites упразднён: используйте writableTables и allowViews");
  for (const t of caseDef.writableTables ?? []) {
    if (!caseDef.tables.includes(t)) add(`writableTables: таблица «${t}» не входит в tables`);
  }
  for (const id of duplicates(caseDef.writableTables ?? [])) add(`writableTables: «${id}» указана дважды`);
  const mpq = caseDef.minutesPerQuery;
  if (mpq !== undefined && !(Number.isFinite(mpq) && mpq >= 0)) add(`minutesPerQuery должен быть числом ≥ 0, а не ${mpq}`);
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
      } else if (line.emotion !== undefined) {
        // Портреты — ровно набор персонажа (разд. 11.1): чужая эмоция — портрета нет
        const speaker = characterById.get(line.speaker);
        if (speaker && !speaker.emotions.includes(line.emotion)) {
          add(`${at}: у «${speaker.id}» нет портрета «${line.emotion}»`);
        }
      }
      if (line.text.trim() === "") add(`${at}: пустой текст`);
    }

    hasScene(`${where}, next`, scene.next);
    for (const id of duplicates((scene.choices ?? []).map((c) => c.id))) add(`${where}: выбор «${id}» объявлен дважды`);
    for (const choice of scene.choices ?? []) {
      hasScene(`${where}, выбор «${choice.id}»`, choice.goto);
      for (const ev of choice.requires ?? []) hasEvidence(`${where}, выбор «${choice.id}»`, ev);
    }
    if (scene.present) checkPresent(`${where}, предъявление`, scene.present);

    const int = scene.interrogation;
    if (int) {
      const at = `${where}, допрос`;
      const suspect = characterById.get(int.suspect);
      if (!suspect) add(`${at}: неизвестный подозреваемый «${int.suspect}»`);
      if (int.interrogator !== undefined && !characterIds.has(int.interrogator)) {
        add(`${at}: неизвестный допрашивающий «${int.interrogator}»`);
      }
      if (int.breakSteps.length < 2) add(`${at}: в breakSteps нужен исход и хотя бы один шаг пробоя`);
      for (const emotion of int.breakSteps) {
        if (!emotions.has(emotion)) add(`${at}: эмоции «${emotion}» нет в EMOTIONS`);
        else if (suspect && !suspect.emotions.includes(emotion)) add(`${at}: у «${suspect.id}» нет портрета «${emotion}»`);
      }
      const mode = int.mode ?? "standard";
      if (int.patience !== undefined) {
        if (mode === "ally" || mode === "talk") add(`${at}: у режима «${mode}» нет шкалы терпения`);
        else if (!Number.isInteger(int.patience) || int.patience < 1) add(`${at}: patience должен быть целым ≥ 1`);
      }
      if (int.points.length === 0) add(`${at}: нет ни одного утверждения`);
      const lineIds = new Set(scene.lines.map((l) => l.id));
      const pointLines = int.points.map((p) => p.line);
      for (const id of duplicates(pointLines)) add(`${at}: утверждение «${id}» указано дважды`);
      for (const point of int.points) {
        const pat = `${at}, утверждение «${point.line}»`;
        const line = scene.lines.find((l) => l.id === point.line);
        if (!lineIds.has(point.line)) add(`${pat}: реплики нет в сцене`);
        else if (line && line.speaker !== int.suspect) add(`${pat}: утверждение говорит не подозреваемый`);
        hasScene(`${pat}, press`, point.press);
        if (point.present) checkPresent(`${pat}, предъявление`, point.present);
        if (point.revealedBy !== undefined && !pointLines.includes(point.revealedBy)) {
          add(`${pat}: revealedBy «${point.revealedBy}» — нет такого утверждения`);
        }
        if (!point.press && !point.present) add(`${pat}: нет ни «Надавить», ни «Предъявить»`);
      }
      if (!int.points.some((p) => p.present)) add(`${at}: нечего предъявлять — ни у одного утверждения нет present`);
      hasScene(`${at}, closedScene`, int.closedScene);
      hasScene(`${at}, doneScene`, int.doneScene);
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
  const objectiveIds = new Set(caseDef.objectives.map((o) => o.id));
  for (const objective of caseDef.objectives) {
    const where = `задача «${objective.id}»`;
    if (!OBJECTIVE_ID_RE.test(objective.id)) add(`${where}: id задачи — только a-z, 0-9, «_», «-»`);
    if (objective.hints.length < MIN_HINTS) {
      add(`${where}: подсказок ${objective.hints.length}, нужно не меньше ${MIN_HINTS}`);
    }
    objective.hints.forEach((hint, i) => {
      if (hint.by !== undefined && !characterIds.has(hint.by)) {
        add(`${where}, подсказка ${i + 1}: неизвестный персонаж «${hint.by}»`);
      }
      if (hint.line !== undefined) {
        const problem = lineIdProblem(hint.line);
        const wanted = `hint.${prefix}_${objective.id}.`;
        if (problem) add(`${where}, подсказка ${i + 1}: «${hint.line}»: ${problem}`);
        else if (!hint.line.startsWith(wanted)) add(`${where}, подсказка ${i + 1}: id реплики должен начинаться с «${wanted}»`);
      }
    });
    hasScene(`${where}, sceneAfter`, objective.sceneAfter);
    checkFlags(`${where}, when`, objective.when);
    if (objective.evidence) evidenceIds.push(objective.evidence.id);

    const p = objective.prediction;
    if (p) {
      const pat = `${where}, предсказание`;
      if (p.options.length !== 3) add(`${pat}: вариантов должно быть ровно три, а не ${p.options.length}`);
      if (p.options.some((o) => !Number.isInteger(o) || o < 0)) add(`${pat}: варианты — целые числа строк ≥ 0`);
      for (const o of duplicates(p.options.map(String))) add(`${pat}: вариант ${o} повторяется`);
      if (!p.options.includes(p.answer)) add(`${pat}: ответ ${p.answer} не входит в варианты`);
      if (p.question.trim() === "") add(`${pat}: пустой вопрос`);
    }
  }
  for (const id of duplicates(evidenceIds)) add(`улика «${id}» объявлена дважды`);
  for (const id of evidenceIds) {
    if (!new RegExp(`^ev\\.${prefix}\\.[a-z0-9_-]+$`).test(id)) add(`улика «${id}»: id должен быть вида ev.${prefix}.<slug>`);
  }

  // --- Обвинения ---
  for (const id of duplicates((caseDef.accusations ?? []).map((a) => a.id))) add(`обвинение «${id}» объявлено дважды`);
  for (const a of caseDef.accusations ?? []) {
    const where = `обвинение «${a.id}»`;
    if (a.keys.length === 0) add(`${where}: нет ключей обвиняемого (id, логин, пропуск, номер машины)`);
    if (a.minCards !== undefined && (!Number.isInteger(a.minCards) || a.minCards < 1)) add(`${where}: minCards должен быть целым ≥ 1`);
    hasScene(`${where}, successScene`, a.successScene);
    hasScene(`${where}, wrongScene`, a.wrongScene);
    for (const w of a.wrong ?? []) {
      hasScene(`${where}, реакция на «${w.person}»`, w.scene);
      if (normalizeCell(w.person) === normalizeCell(a.answer)) add(`${where}: «${w.person}» — это верный ответ, а не ложное обвинение`);
    }
    if (a.objective !== undefined && !objectiveIds.has(a.objective)) add(`${where}: задача «${a.objective}» не найдена`);
  }

  // --- Часы и живые события ---
  const clock = caseDef.clock;
  const startAt = clock?.start ?? caseDef.date;
  const validTime = (at: string, value: string | undefined): boolean => {
    if (value === undefined) return false;
    if (!parseClock(value)) {
      add(`${at}: «${value}» не в формате 'YYYY-MM-DD HH:MM[:SS]'`);
      return false;
    }
    return true;
  };
  if (clock) {
    const startOk = validTime("clock.start", clock.start) || (clock.start === undefined && !!parseClock(caseDef.date));
    const capOk = validTime("clock.cap", clock.cap);
    if (startOk && capOk && compareClock(clock.cap as string, startAt) <= 0) add("clock.cap должен быть позже старта");
    (clock.holds ?? []).forEach((hold, i) => {
      const at = `clock.holds[${i}]`;
      validTime(`${at}.at`, hold.at);
      if (hold.resumeAt !== undefined && validTime(`${at}.resumeAt`, hold.resumeAt) && parseClock(hold.at)) {
        if (compareClock(hold.resumeAt, hold.at) < 0) add(`${at}: resumeAt раньше остановки`);
      }
      checkTrigger(`${at}.until`, hold.until);
    });
  }
  for (const id of duplicates((caseDef.events ?? []).map((e) => e.id))) add(`событие «${id}» объявлено дважды`);
  for (const e of caseDef.events ?? []) {
    const where = `событие «${e.id}»`;
    const triggers = [e.atQuery !== undefined, e.atTime !== undefined, e.after !== undefined].filter(Boolean).length;
    if (triggers !== 1) add(`${where}: нужен ровно один триггер — atQuery, atTime или after`);
    if (e.atQuery !== undefined && (!Number.isInteger(e.atQuery) || e.atQuery < 1)) add(`${where}: atQuery должен быть целым ≥ 1`);
    if (e.atTime !== undefined) validTime(`${where}, atTime`, e.atTime);
    if (e.after) checkTrigger(`${where}, after`, e.after);
    checkFlags(`${where}, when`, e.when);
    hasScene(`${where}, scene`, e.scene);
    if (e.line !== undefined) {
      const problem = lineIdProblem(e.line);
      if (problem) add(`${where}, line «${e.line}»: ${problem}`);
    }
    if (e.clockTo !== undefined) validTime(`${where}, clockTo`, e.clockTo);
    if (!e.scene && !e.patch && !e.line && !e.clockTo) add(`${where}: нет эффекта — scene, patch, line или clockTo`);
  }

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
      if (!BLANK_KINDS.has(blank.kind)) add(`${where}: kind должен быть person, number, datetime или text`);
      if (!blank.options.includes(blank.answer)) add(`${where}: ответ «${blank.answer}» не входит в options`);
      const keys = blank.options.map((o) => normalizeCell(o));
      for (const key of duplicates(keys)) {
        const same = blank.options.filter((o) => normalizeCell(o) === key);
        add(`${where}: варианты неразличимы (${same.map((o) => `«${o}»`).join(", ")})`);
      }
      for (const option of Object.keys(blank.aliases ?? {})) {
        if (!blank.options.includes(option)) add(`${where}: aliases для «${option}», которого нет в options`);
      }
      if (blank.tolerance !== undefined) {
        if (blank.kind !== "number") add(`${where}: tolerance бывает только у number`);
        else if (!(blank.tolerance >= 0)) add(`${where}: tolerance должен быть ≥ 0`);
      }
      if (blank.precision !== undefined && blank.kind !== "datetime") add(`${where}: precision бывает только у datetime`);
      if (blank.kind === "number") {
        for (const o of blank.options) if (asNumber(o) === null) add(`${where}: вариант «${o}» — не число`);
        // По модулю с допуском варианты не должны сливаться: 38000 и −38000 неразличимы
        blank.options.forEach((a, i) =>
          blank.options.slice(i + 1).forEach((b) => {
            if (asNumber(a) !== null && asNumber(b) !== null && normalizeCell(a) !== normalizeCell(b) && numbersMatch(a, b, blank.tolerance)) {
              add(`${where}: варианты «${a}» и «${b}» совпадают с допуском`);
            }
          })
        );
      }
      if (blank.kind === "datetime") {
        for (const o of blank.options) if (!toIsoDateTime(o)) add(`${where}: вариант «${o}» — не дата`);
        const p = blank.precision;
        const answerPrecision = precisionOf(blank.answer);
        if (p && answerPrecision && PRECISION_LENGTH[answerPrecision] < PRECISION_LENGTH[p]) {
          add(`${where}: ответ «${blank.answer}» записан грубее точности ${p}`);
        }
      }
    }
  }

  return problems;

  function checkPresent(at: string, present: EvidencePresent) {
    hasScene(`${at} success`, present.success);
    hasScene(`${at} failure`, present.failure);
    if (present.correct.length === 0 && !(present.cards ?? []).length) add(`${at}: у предъявления нет верных улик`);
    for (const ev of present.correct) hasEvidence(at, ev);
  }

  function checkTrigger(at: string, trigger: EventTrigger) {
    const fields = [trigger.objective, trigger.scene, trigger.interrogation, trigger.flag].filter((f) => f !== undefined);
    if (fields.length === 0) add(`${at}: пустой триггер`);
    if (trigger.objective !== undefined && !objectiveIds.has(trigger.objective)) add(`${at}: задача «${trigger.objective}» не найдена`);
    hasScene(at, trigger.scene);
    if (trigger.interrogation !== undefined) {
      const scene = getScene(caseDef, trigger.interrogation);
      if (!scene) add(`${at}: сцена «${trigger.interrogation}» не найдена`);
      else if (!scene.interrogation) add(`${at}: в сцене «${trigger.interrogation}» нет допроса`);
    }
    if (trigger.breaks !== undefined && (!Number.isInteger(trigger.breaks) || trigger.breaks < 1)) add(`${at}: breaks должен быть целым ≥ 1`);
  }

  function checkFlags(at: string, condition: FlagCondition | undefined) {
    if (condition && Object.keys(condition).length === 0) add(`${at}: пустое условие на флаги`);
  }
}

const BLANK_KINDS = new Set(["person", "number", "datetime", "text"]);

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
  const emotions = new Set<string>(EMOTIONS);
  const variants = new Set<string>(PORTRAIT_VARIANTS);
  for (const c of characters) {
    for (const e of c.emotions) if (!emotions.has(e)) problems.push(`персонажи: у «${c.id}» эмоции «${e}» нет в EMOTIONS`);
    for (const [variant, list] of Object.entries(c.variants ?? {})) {
      if (!variants.has(variant)) problems.push(`персонажи: у «${c.id}» неизвестный вариант портрета «${variant}»`);
      for (const e of list ?? []) {
        if (!c.emotions.includes(e)) problems.push(`персонажи: у «${c.id}» вариант ${variant} для «${e}», которой нет в emotions`);
      }
    }
  }

  const allEvidence = collectEvidenceIds(cases);
  for (const c of cases) problems.push(...validateCaseContent(c, characters, allEvidence));
  return problems;
}
