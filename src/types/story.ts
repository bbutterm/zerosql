/**
 * Сюжетный слой: персонажи, сцены и реплики.
 *
 * Каждая реплика имеет стабильный id — это одновременно имя аудиофайла
 * озвучки: public/voice/<id>.mp3. Каждый персонаж имеет набор эмоций — это
 * имена файлов портретов: public/portraits/<characterId>/<emotion>.webp.
 * Если файла нет, UI показывает стилизованную заглушку и текст без звука.
 */
import type { CardPredicate } from "./case";

/**
 * Эмоции портретов (GAME_DESIGN, разд. 11.1): прежние 10 и ещё 7 —
 * uneasy, ashamed, broken, cold, shaken, determined, lie.
 * `lie` — портрет-вспышка лжи на допросе (есть только у ratnikov и tokha).
 * Эмоции «frost» нет и не будет: иней — это вариант файла, см. PORTRAIT_VARIANTS.
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
  "uneasy",
  "ashamed",
  "broken",
  "cold",
  "shaken",
  "determined",
  "lie",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

/**
 * Варианты файла портрета — не эмоции, а другая живопись той же эмоции
 * (разд. 11.1): `public/portraits/<id>/<emotion>_<variant>.webp`.
 * `outdoor` — уличный вариант с инеем на ресницах и воротнике; сцена просит
 * его флагом `Scene.outdoor`, у персонажа он перечислен в `CharacterDef.variants`.
 * Вариант не входит в EMOTIONS: эмоция реплики остаётся `neutral`, `hurt` и т. д.
 */
export const PORTRAIT_VARIANTS = ["outdoor"] as const;

export type PortraitVariant = (typeof PORTRAIT_VARIANTS)[number];

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
  /**
   * Эмоции, у которых есть вариант файла: `{ outdoor: ["neutral", "determined"] }`
   * → `neutral_outdoor.webp`, `determined_outdoor.webp`. Каждая эмоция должна
   * входить в `emotions`. Нет варианта — берётся основной файл эмоции.
   */
  variants?: Partial<Record<PortraitVariant, Emotion[]>>;
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
   * Стабильный id = имя файла озвучки `public/voice/<id>.mp3`, формат
   * `<prefix>.<scene>.<nnn>` (разд. 11.3, LINE_ID_RE в engine/story.ts).
   * В сценах дела prefix — «c» + order дела в две цифры, scene — id сцены:
   * c03.interrogation.007. Служебные префиксы вне дел: note (записи Ирины,
   * сцена n01…n10), ep (эпилог), bark (реплики на действия), hint (наводки,
   * сцена cNN_<id задачи>), sys (МИРА).
   */
  id: string;
  /** id персонажа | "narrator" | "player" */
  speaker: string;
  emotion?: Emotion;
  text: string;
  /** Ремарка для актёра озвучки — в игре не показывается */
  direction?: string;
  /**
   * Утверждение — ложь (допрос, разд. 6.9). У лжеца звуковая примета в
   * ремарке; если у персонажа есть портрет `lie`, UI может мигнуть им на
   * 300 мс (подсветка лжи включается в настройках доступности).
   */
  lie?: boolean;
}

export interface DialogueChoice {
  id: string;
  /**
   * Строка в списке вариантов — то, что скажет Ноль, её словами: «Кто ещё был на смене, Тимур?»,
   * а не команда меню («Спросить Ахметова…»)
   */
  text: string;
  /** Реплика в лог, если она отличается от строки в списке (длиннее, с обращением) */
  say?: string;
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
  /** id улик, которые засчитываются как верные (может быть пустым, если задан cards) */
  correct: string[];
  /**
   * Карточки доски, которые засчитываются по содержимому (разд. 6.5): предикат
   * над приколотой строкой. Так засчитывается и карточка из живого запроса
   * прямо в допросе.
   */
  cards?: CardPredicate[];
  /**
   * Нужны все позиции вместе (correct и cards): «пробой требует двух
   * карточек». По умолчанию хватает любой одной.
   */
  requireAll?: boolean;
  /** Сцена при верном выборе (на допросе — ветка после пробоя) */
  success: string;
  /** Сцена при ошибке; после неё предъявление повторяется */
  failure: string;
}

/**
 * Вариант допроса (разд. 6.9):
 *  - standard — терпение Даши (patience делений), «закрылся» при нуле;
 *  - unwinnable — пробои есть, признания нет (Бурцев, Д3); терпение как у standard;
 *  - ally — союзник: терпения нет, неверная карточка — реплика-боль и −1 к trustFlag;
 *  - talk — беседа: одно предъявление.
 */
export type InterrogationMode = "standard" | "unwinnable" | "ally" | "talk";

/** Утверждение ленты показаний: реплика сцены + «Надавить» и «Предъявить» */
export interface TestimonyPoint {
  /** id реплики-утверждения из lines этой сцены (говорит подозреваемый) */
  line: string;
  /** «Надавить»: сцена-уточнение; может открыть новое утверждение (revealedBy) */
  press?: string;
  /** «Предъявить»: какие карточки пробивают утверждение и куда ведёт пробой */
  present?: EvidencePresent;
  /** Утверждение появляется в ленте только после «Надавить» на пункте с этой репликой */
  revealedBy?: string;
}

/**
 * Допрос «Наушник» (разд. 6.9). Сцена с этим блоком — лента показаний:
 * её lines — утверждения (3–5) и связки, points — что с ними можно делать.
 * Эмоция подозреваемого меняется по breakSteps: исход → 1-й пробой → … → итог.
 */
export interface InterrogationDef {
  /** id персонажа-подозреваемого */
  suspect: string;
  /** Кто ведёт допрос (по умолчанию dasha) */
  interrogator?: string;
  /** По умолчанию standard */
  mode?: InterrogationMode;
  /** Деления терпения для standard / unwinnable (по умолчанию 3) */
  patience?: number;
  /** Шаги эмоций: только из набора подозреваемого (разд. 11.1); первый — исход */
  breakSteps: Emotion[];
  points: TestimonyPoint[];
  /** Сцена «закрылся»: терпение кончилось. Дело продолжается обходной задачей */
  closedScene?: string;
  /** Сцена после последнего пробоя (или после единственного предъявления беседы) */
  doneScene?: string;
  /** ally: сюжетный флаг доверия, который уменьшается на 1 за неверную карточку */
  trustFlag?: string;
  /** Звуковая примета лжи — ремарка для озвучки («понимаешь» перед ложью у Гранина) */
  lieTell?: string;
  /** Редактор доступен прямо в допросе; новый результат сразу становится карточкой */
  liveQuery?: boolean;
}

export interface Scene {
  /** Уникален в пределах кейса */
  id: string;
  /**
   * id локации из src/data/locations.json: картина public/backgrounds/<id>.webp (или запасная
   * картина её семьи). Без location сцена продолжает картину прошлой сцены потока
   */
  location?: string;
  /** id музыкальной темы */
  music?: string;
  lines: DialogueLine[];
  choices?: DialogueChoice[];
  present?: EvidencePresent;
  /** Допрос «Наушник»: lines сцены — лента утверждений (разд. 6.9) */
  interrogation?: InterrogationDef;
  /** Сцена на улице: портреты берут вариант `<emotion>_outdoor`, если он есть у персонажа */
  outdoor?: boolean;
  /** Следующая сцена, если нет выбора/предъявления */
  next?: string;
}
