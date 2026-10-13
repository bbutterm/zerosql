/**
 * Презентационные типы UI v2 (стол расследования, улики, протокол).
 *
 * Это «вид» для компонентов: стор собирает их из данных кейса и прогресса
 * игрока. Компоненты сами ничего не вычисляют о сюжете — только показывают.
 */

/* ---------- Улики ---------- */

export const EVIDENCE_KINDS = [
  "document",
  "record",
  "photo",
  "audio",
  "testimony",
  "lead",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface EvidenceCardData {
  id: string;
  kind: EvidenceKind;
  title: string;
  /** Короткое описание — 1–3 предложения */
  text: string;
  /** SQL, которым улика была найдена (если найдена запросом) */
  sourceQuery?: string;
  /** Откуда улика: «журнал пропусков», «показания Ахметова», … */
  source?: string;
  /** Внутриигровое время находки, уже отформатированное */
  foundAt?: string;
  /** Только что получена — подсветить и проиграть появление */
  isNew?: boolean;
  /** Время события в ночи дела «01:52» — место на ленте ночи и в реестре. Без него — «Без времени» */
  at?: string;
  /** Номер запроса, которым найдена запись: «> запрос № 14» на распечатке */
  queryNo?: number;
  /** Отрывок результата для распечатки (вид record) */
  excerpt?: EvidenceExcerpt;
  /** Изображение (вид photo): кадр камеры или личное фото */
  image?: string;
  /** Строка камеры поверх кадра: «КАМ 07 СЕВ.ШЛЮЗ 14-12-2026 02:10:44» — фото станет распечаткой кадра */
  camera?: string;
  /** Длительность записи (вид audio): «00:47» */
  duration?: string;
  /** Огибающая волны 0..1 (вид audio), рисуется из данных */
  waveform?: number[];
  /** Чьи слова (вид testimony): «Т. Р. Ахметов» */
  author?: string;
  /** Подпись под предметом на стене: у личного фото — ручкой на поле, у кадра — печатью */
  caption?: string;
}

export interface EvidenceExcerpt {
  columns: string[];
  rows: Array<Array<string | number | null>>;
  /** Ключевое значение под маркером: [строка, столбец] */
  mark?: [number, number];
}

/* ---------- Задачи ---------- */

export type ObjectiveState = "done" | "active" | "locked";

export interface ObjectiveHint {
  /** Текст подсказки; `код` в обратных кавычках набирается PT Mono */
  text: string;
  /** id персонажа, от лица которого подсказка (необязательно) */
  speaker?: string;
  /** Игровое время, когда подсказка получена: «02:47» */
  at?: string;
  /** Цена уровня в очках оценки: 0 — бесплатно, 40 — «−40 к оценке». Не задана — не показывается */
  cost?: number;
}

export interface ObjectiveView {
  id: string;
  text: string;
  state: ObjectiveState;
  /** Бонусная задача: показывается отдельным блоком */
  optional?: boolean;
  /** Уточнение под текстом задачи */
  detail?: string;
  /** Подсказки по уровням: от намёка до почти готового запроса */
  hints?: ObjectiveHint[];
  /** Сколько уровней уже открыто */
  hintsRevealed?: number;
  /** Сюжетный итог, показывается у выполненной задачи */
  outcome?: string;
  /**
   * Почему последний корректный запрос не засчитан (сообщение валидатора). Показывается под
   * текущим заданием как «Не засчитано: …», заменяется на каждом запросе, при успехе пропадает
   */
  feedback?: string;
}

/* ---------- Протокол ---------- */

export interface ProtocolOption {
  value: string;
  label: string;
  /** Короткая пометка справа: «житель», «сотрудник ЦОД», … */
  note?: string;
}

export interface ProtocolBlank {
  /** Уникален в пределах протокола */
  id: string;
  /** Что вписывается: «кто», «когда», … — для подписи и aria */
  label: string;
  options: ProtocolOption[];
}

export interface ProtocolQuestionView {
  id: string;
  /**
   * Текст утверждения с пропусками в фигурных скобках по id пропуска:
   * «{who} вошёл в машинный зал в {when}».
   */
  text: string;
  blanks: ProtocolBlank[];
}

export type ProtocolTone = "success" | "partial" | "fail" | "info";

export interface ProtocolMessage {
  tone: ProtocolTone;
  text: string;
}

/** Отметка о сверке: оттиск датера на бланке заключения */
export interface ProtocolCheck {
  /** Номер попытки, с 1 */
  attempt: number;
  /** Сколько пунктов пачки совпало */
  matched: number;
  /** Сколько пунктов было в пачке */
  total: number;
  /** Игровое время сверки «02:44» */
  at?: string;
}

/* ---------- Стол ---------- */

export type DeskPanelId = "tasks" | "evidence" | "protocol" | "reference";

/** Вид центральной зоны стола: запрос, бланк заключения или стена улик */
export type DeskCenterView = "query" | "protocol" | "wall";

export interface QueryBudget {
  /** Сколько запросов осталось */
  left: number;
  /** Сколько было всего (для шкалы) */
  total?: number;
}
