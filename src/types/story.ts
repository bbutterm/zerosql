/**
 * Сюжетный слой: персонажи, сцены и реплики.
 *
 * Каждая реплика имеет стабильный id — это одновременно имя аудиофайла
 * озвучки: public/voice/<id>.mp3. Каждый персонаж имеет набор эмоций — это
 * имена файлов портретов: public/portraits/<characterId>/<emotion>.webp.
 * Если файла нет, UI показывает стилизованную заглушку и текст без звука.
 */

export const EMOTIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "scared",
  "surprised",
  "smug",
  "thinking",
  "tired",
  "hurt",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

/** Служебные «говорящие»: рассказчик и сам игрок */
export const NARRATOR = "narrator";
export const PLAYER = "player";

export interface CharacterDef {
  /** snake_case латиницей, совпадает с папкой портретов */
  id: string;
  /** Полное имя */
  name: string;
  /** Подпись в диалоге */
  shortName: string;
  /** Кто это — одна строка для досье */
  role: string;
  age?: number;
  /** Акцентный цвет плашки и заглушки портрета (#rrggbb) */
  accent: string;
  /** Досье для UI — без спойлеров */
  bio: string;
  /** Нужные варианты портрета; первый — основной */
  emotions: Emotion[];
  /** Краткая характеристика голоса для манифеста озвучки */
  voice?: string;
  /** Отчество — для учётной карточки (заглушка портрета) */
  patronymic?: string;
  /** «Примечание» в учётной карточке рукой предшественницы, до 12 слов: «Курит у шлюза.» */
  dossierNote?: string;
  /** Короткое имя в винительном падеже, если склонение неочевидно: «Спросить Кравец» */
  shortNameAcc?: string;
}

export interface DialogueLine {
  /**
   * Стабильный id = имя файла озвучки, формат <caseShort>.<sceneId>.<nnn>:
   * caseShort — «c» + order дела в две цифры. Пример: c03.interrogation.007
   */
  id: string;
  /** id персонажа | "narrator" | "player" */
  speaker: string;
  emotion?: Emotion;
  text: string;
  /** Ремарка для актёра озвучки — в игре не показывается */
  direction?: string;
}

export interface DialogueChoice {
  id: string;
  text: string;
  /** id улик, без которых вариант недоступен */
  requires?: string[];
  /** Сцена, в которую ведёт выбор */
  goto?: string;
  /** Сюжетный флаг, который ставит выбор */
  flag?: string;
}

/** Предъявление улики: игрок выбирает карточку, опровергающую показания */
export interface EvidencePresent {
  prompt: string;
  /** id улик, которые засчитываются как верные */
  correct: string[];
  /** Сцена при верном выборе */
  success: string;
  /** Сцена при ошибке; после неё предъявление повторяется */
  failure: string;
}

export interface Scene {
  /** Уникален в пределах кейса */
  id: string;
  /** id фона/локации */
  location?: string;
  /** id музыкальной темы */
  music?: string;
  lines: DialogueLine[];
  choices?: DialogueChoice[];
  present?: EvidencePresent;
  /** Следующая сцена, если нет выбора/предъявления */
  next?: string;
}
