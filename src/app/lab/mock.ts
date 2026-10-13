/**
 * Сюжетные данные лаборатории компонентов (/lab): персонажи, сцены, улики, задания, бланк.
 * Мир у них один — ночь в ЦОД из world.ts. Имена, пропуска и время здесь совпадают с журналом,
 * а распечатки улик — это вывод их же sourceQuery (проверяет src/__tests__/lab/world.test.ts).
 */

import type { CharacterDef, Scene } from "@/types/story";
import type { HandbookEntry } from "@/types/case";
import type {
  EvidenceCardData,
  ObjectiveView,
  ProtocolQuestionView,
} from "@/types/ui";

/* ---------- Персонажи ---------- */

export const CHARACTERS: Record<string, CharacterDef> = {
  sokolova: {
    id: "sokolova",
    name: "Вера Соколова",
    shortName: "Соколова",
    role: "майор полиции, ваш куратор",
    age: 46,
    accent: "#7cc4ff",
    bio: "Двадцать лет в розыске. Не верит в совпадения и в кофе из автомата.",
    emotions: ["neutral", "tired", "thinking", "angry", "smug"],
    voice: "низкий, сухой, с усталой иронией",
    patronymic: "Андреевна",
    dossierNote: "Пьёт чай без сахара. Не любит, когда её жалеют.",
  },
  akhmetov: {
    id: "akhmetov",
    name: "Тимур Ахметов",
    shortName: "Ахметов",
    role: "дежурный инженер ЦОД «Северный узел»",
    age: 34,
    accent: "#ff9b71",
    bio: "Знает машинный зал наизусть. Говорит быстро, когда нервничает.",
    emotions: ["neutral", "scared", "angry", "surprised", "hurt"],
    voice: "быстрый, срывающийся",
    patronymic: "Рашидович",
    dossierNote: "Курит у шлюза.",
  },
  kravets: {
    id: "kravets",
    name: "Лидия Кравец",
    shortName: "Кравец",
    role: "журналистка «Полярного канала»",
    age: 29,
    accent: "#c3a6ff",
    bio: "Снимает пар над полыньёй третью зиму подряд. Ищет сюжет — и находит.",
    emotions: ["neutral", "smug", "happy", "thinking", "sad"],
    voice: "звонкий, насмешливый",
    patronymic: "Олеговна",
    shortNameAcc: "Кравец",
    dossierNote: "Снимает с моста. Задаёт правильные вопросы.",
  },
};

/* ---------- Сцены ---------- */

export const SCENES: Record<string, Scene> = {
  interrogation: {
    id: "interrogation",
    location: "Подвал УВД. 14 декабря, 02:31",
    lines: [
      {
        id: "c01.interrogation.001",
        speaker: "narrator",
        text: "Подвал управления. Гудят вентиляторы. На мониторе — журнал пропусков дата-центра за ночь с 13 на 14 декабря.",
      },
      {
        id: "c01.interrogation.002",
        speaker: "sokolova",
        emotion: "tired",
        text: "Ноль, у нас пропавший. Сменный техник ЦОДа, Игорь Лапин. Последний раз его карта сработала в 01:47.",
      },
      {
        id: "c01.interrogation.003",
        speaker: "player",
        text: "Карта сработала на входе. А выход?",
      },
      {
        id: "c01.interrogation.004",
        speaker: "sokolova",
        emotion: "thinking",
        text: "Выхода нет. А камеры у шлюза в ту ночь были «на профилактике». Удобно, правда?",
      },
      {
        id: "c01.interrogation.005",
        speaker: "akhmetov",
        emotion: "scared",
        text: "Я уже говорил вашим: всю смену я был в машинном зале. Лапина не видел.",
      },
      {
        id: "c01.interrogation.006",
        speaker: "kravets",
        emotion: "smug",
        text: "А мне интересно, почему тёплый сброс в полынью той ночью вырос вдвое. Совпадение, Тимур?",
      },
      {
        id: "c01.interrogation.007",
        speaker: "akhmetov",
        emotion: "angry",
        text: "Это нагрузка! Южане арендовали стойки под майнинг. Всё есть в отчётах.",
      },
    ],
    // Варианты — это слова Ноль, а не команды меню
    choices: [
      { id: "ask-shift", text: "Кто ещё был на смене, Тимур?", goto: "present" },
      {
        id: "show-gate",
        text: "В 02:10 ваша карта открыла машинный зал. Где вы были до этого?",
        requires: ["ev-akhmetov-gate"],
        goto: "present",
      },
      {
        id: "let-go",
        text: "Идите. Сначала я посмотрю данные.",
        say: "Идите, Тимур. Сначала я посмотрю данные.",
        flag: "akhmetov_released",
      },
    ],
  },
  present: {
    id: "present",
    location: "Подвал УВД. 14 декабря, 02:40",
    lines: [
      {
        id: "c01.present.001",
        speaker: "akhmetov",
        emotion: "neutral",
        text: "На смене были трое: я, Лапин и охранник Рябов. Рябов ушёл в полночь — у него и спрашивайте.",
      },
      {
        id: "c01.present.002",
        speaker: "sokolova",
        emotion: "thinking",
        text: "Ноль, у тебя есть что-то, что с этим не сходится?",
      },
    ],
    present: {
      prompt: "Что опровергает слова Ахметова о том, что Рябов ушёл в полночь?",
      correct: ["ev-ryabov-badge"],
      success: "present-ok",
      failure: "present-fail",
    },
  },
  "present-ok": {
    id: "present-ok",
    location: "Подвал УВД. 14 декабря, 02:42",
    lines: [
      {
        id: "c01.present-ok.001",
        speaker: "player",
        text: "Карта Рябова открыла северный шлюз в 01:52. Через пять минут после Лапина.",
      },
      {
        id: "c01.present-ok.002",
        speaker: "akhmetov",
        emotion: "surprised",
        text: "Этого… не может быть. Рябов сдал карту на посту, я сам видел.",
      },
      {
        id: "c01.present-ok.003",
        speaker: "kravets",
        emotion: "happy",
        text: "Вот это уже материал.",
      },
      {
        id: "c01.present-ok.004",
        speaker: "sokolova",
        emotion: "neutral",
        text: "Не материал, Кравец. Улика. Ноль, поднимай всё по этой карте.",
      },
    ],
  },
  "present-fail": {
    id: "present-fail",
    location: "Подвал УВД. 14 декабря, 02:42",
    lines: [
      {
        id: "c01.present-fail.001",
        speaker: "akhmetov",
        emotion: "hurt",
        text: "И что это доказывает? Ровным счётом ничего.",
      },
      {
        id: "c01.present-fail.002",
        speaker: "sokolova",
        emotion: "tired",
        text: "Не то, Ноль. Подумай ещё.",
      },
    ],
    next: "present",
  },
};

/* ---------- Улики ---------- */

export const EVIDENCE: EvidenceCardData[] = [
  {
    id: "ev-ryabov-badge",
    kind: "record",
    title: "Пропуск Рябова, 01:52",
    text: "Карта охранника Д. Рябова открыла северный шлюз ЦОД через пять минут после Лапина. По словам Ахметова, Рябов ушёл в полночь.",
    sourceQuery:
      "SELECT id, badge_id, gate,\n       strftime('%H:%M', entered_at) AS entered\nFROM access_log\nWHERE entered_at BETWEEN '2026-12-14 01:45'\n                     AND '2026-12-14 02:15'\nORDER BY entered_at;",
    source: "access_log",
    queryNo: 14,
    foundAt: "02:36",
    at: "01:52",
    excerpt: {
      columns: ["id", "badge_id", "gate", "entered"],
      rows: [
        [1059, "B-0233", "северный шлюз", "01:47"],
        [1060, "B-0417", "северный шлюз", "01:52"],
        [1061, "B-0519", "машинный зал", "02:10"],
      ],
      mark: [1, 1],
    },
    isNew: true,
  },
  {
    id: "ev-cameras",
    kind: "lead",
    title: "Кто подписал заявку на камеры?",
    text: "Камеры северного шлюза отключены с 02:11 до 03:00 по заявке. Подпись под заявкой неразборчива.",
    source: "реестр заявок ЦОД",
    foundAt: "02:37",
    at: "02:11",
  },
  {
    id: "ev-heat",
    kind: "document",
    title: "Сводка теплосети",
    text: "В ночь исчезновения сброс тёплой воды через клапан № 3 вырос с 41 до 86 МВт. Плановых работ в журнале нет.",
    sourceQuery: "SELECT measured_at, megawatts\nFROM heat_output\nORDER BY megawatts DESC LIMIT 3;",
    source: "ЦОД «Северный узел»",
    queryNo: 9,
    foundAt: "02:33",
    at: "02:00",
  },
  {
    id: "ev-gate-cam",
    kind: "photo",
    title: "Кадр камеры 07, 02:10",
    text: "Человек в рабочей куртке у северного шлюза. Лицо закрыто капюшоном.",
    camera: "КАМ 07 СЕВ.ШЛЮЗ 14-12-2026 02:10:44",
    caption: "Северный шлюз, последний кадр перед отключением",
    source: "видеоархив ЦОД",
    foundAt: "02:38",
    at: "02:10",
  },
  {
    id: "ev-photo",
    kind: "photo",
    title: "Снимок с моста",
    text: "Кравец сфотографировала пар над полыньёй в 02:05. На льду у кромки виден луч фонаря.",
    caption: "пар над полыньёй, 02:05",
    source: "архив Л. Кравец",
    foundAt: "02:39",
    at: "02:05",
  },
  {
    id: "ev-call",
    kind: "audio",
    title: "Звонок в 02:12",
    text: "— Открывай третий. — Сейчас? — Сейчас. Потом ветер, четырнадцать секунд тишины.",
    duration: "00:41",
    sourceQuery: "SELECT * FROM calls\nWHERE caller = '+7 914 220-31-07'\n  AND started_at LIKE '2026-12-14 02:%';",
    source: "calls",
    queryNo: 17,
    foundAt: "02:41",
    at: "02:12",
  },
  {
    id: "ev-akhmetov",
    kind: "testimony",
    title: "Показания Ахметова",
    text: "«Всю смену был в машинном зале, Лапина не видел. Рябов ушёл в полночь, я сам видел, как он сдал карту на посту».",
    author: "Т. Р. Ахметов",
    source: "опрос 14.12, 02:35",
    foundAt: "02:36",
  },
];

export const EXTRA_EVIDENCE: EvidenceCardData = {
  id: "ev-valve",
  kind: "record",
  title: "Ручное открытие клапана 3",
  text: "В 01:58 клапан сброса № 3 переведён в ручной режим с терминала машинного зала.",
  sourceQuery:
    "SELECT strftime('%H:%M', measured_at) AS measured,\n       outlet, megawatts\nFROM heat_output\nWHERE outlet = 'клапан-3'\n  AND measured_at BETWEEN '2026-12-14 01:55'\n                      AND '2026-12-14 01:58'\nORDER BY measured_at;",
  source: "heat_output",
  queryNo: 21,
  foundAt: "02:46",
  at: "01:58",
  excerpt: {
    columns: ["measured", "outlet", "megawatts"],
    rows: [
      ["01:55", "клапан-3", 41.2],
      ["01:56", "клапан-3", 41.1],
      ["01:57", "клапан-3", 41.2],
      ["01:58", "клапан-3", 86.4],
    ],
    mark: [3, 2],
  },
  isNew: true,
};

/* ---------- Задачи ---------- */

export const OBJECTIVES: ObjectiveView[] = [
  {
    id: "o1",
    text: "Найдите в `access_log` все проходы через северный шлюз в ночь на 14 декабря",
    state: "done",
    outcome: "Северный шлюз открывали девять раз — больше, чем за всю прошлую неделю.",
  },
  {
    id: "o2",
    text: "Узнайте, чей пропуск `B-0233`",
    state: "done",
    outcome: "Это Игорь Лапин, сменный техник.",
  },
  {
    id: "o3",
    text: "Выясните, кто вошёл после Лапина и ещё не вышел",
    detail: "Лапин вошёл в 01:47. Пустое время выхода в таблице — это NULL.",
    state: "active",
    hints: [
      {
        speaker: "sokolova",
        at: "02:39",
        cost: 0,
        text: "Нам нужны входы позже 01:47. Даты здесь — строки одного формата, их можно сравнивать напрямую.",
      },
      {
        speaker: "sokolova",
        at: "02:42",
        cost: 40,
        text: "Если человек не вышел, в `exited_at` пусто. Это проверяется не через `= NULL`, а через `IS NULL`.",
      },
      {
        speaker: "sokolova",
        cost: 40,
        text: "Соедини оба условия через AND: `entered_at > '2026-12-14 01:47'` и `exited_at IS NULL`.",
      },
      {
        speaker: "sokolova",
        cost: 40,
        text: "Ладно, пиши: `SELECT * FROM access_log WHERE entered_at > '2026-12-14 01:47' AND exited_at IS NULL;`",
      },
    ],
    hintsRevealed: 2,
  },
  { id: "o4", text: "Сопоставьте пропуск с сотрудником", state: "locked" },
  { id: "o5", text: "Найдите, кто открыл клапан", state: "locked" },
  {
    id: "b1",
    text: "Найдите час, когда сброс тепла в залив был максимальным",
    state: "active",
    optional: true,
    hints: [
      { speaker: "kravets", cost: 0, text: "Я снимала пар около двух ночи. Посмотрите, что было в `heat_output` тогда." },
      { speaker: "kravets", cost: 20, text: "Отсортируйте по `megawatts` по убыванию и возьмите первую строку." },
    ],
    hintsRevealed: 0,
  },
  {
    id: "b2",
    text: "Проверьте, есть ли у Ахметова машина",
    state: "done",
    optional: true,
    outcome: "Нет. Ездит служебным автобусом.",
  },
];

/* ---------- Протокол ---------- */

const PEOPLE = [
  { value: "lapin", label: "Игорь Лапин", note: "техник" },
  { value: "ryabov", label: "Дмитрий Рябов", note: "охранник" },
  { value: "akhmetov", label: "Тимур Ахметов", note: "инженер" },
  { value: "kravets", label: "Лидия Кравец", note: "журналистка" },
  { value: "smirnov", label: "Олег Смирнов", note: "подрядчик" },
];

export const PROTOCOL: ProtocolQuestionView[] = [
  {
    id: "q1",
    text: "Последним через северный шлюз вошёл {p-who} — в {p-when}.",
    blanks: [
      { id: "p-who", label: "фамилия, имя", options: PEOPLE },
      {
        id: "p-when",
        label: "время",
        options: [
          { value: "0147", label: "01:47" },
          { value: "0152", label: "01:52" },
          { value: "0210", label: "02:10" },
          { value: "0212", label: "02:12" },
        ],
      },
    ],
  },
  {
    id: "q2",
    text: "Камеры шлюза отключили по заявке, которую подписал {p-signer}.",
    blanks: [{ id: "p-signer", label: "фамилия, имя", options: PEOPLE }],
  },
  {
    id: "q3",
    text: "Тёплый сброс в полынью вырос из-за {p-cause}.",
    blanks: [
      {
        id: "p-cause",
        label: "причина",
        options: [
          { value: "mining", label: "аренды стоек под майнинг" },
          { value: "pump", label: "аварии насоса" },
          { value: "valve", label: "ручного открытия клапана" },
          { value: "planned", label: "плановых работ" },
        ],
      },
    ],
  },
];

export const PROTOCOL_ANSWERS: Record<string, string> = {
  "p-who": "ryabov",
  "p-when": "0152",
  "p-signer": "akhmetov",
  "p-cause": "valve",
};

/* ---------- Справка ---------- */

export const HANDBOOK: HandbookEntry[] = [
  {
    id: "where",
    title: "Отбор строк: WHERE",
    summary: "`WHERE` оставляет только строки, для которых условие истинно.",
    syntax: "SELECT столбцы FROM таблица\nWHERE условие;",
    example: "SELECT * FROM staff\nWHERE shift = 'ночь';",
    pitfalls: ["Текст пишется в одинарных кавычках: `'ночь'`. Двойные кавычки в SQLite — имена."],
  },
  {
    id: "null",
    title: "Пустые значения: IS NULL",
    summary: "`NULL` — это «неизвестно». Он не равен ничему, даже самому себе, поэтому `= NULL` не находит ничего.",
    syntax: "WHERE столбец IS NULL",
    example: "SELECT * FROM access_log\nWHERE exited_at IS NULL;",
    pitfalls: ["`exited_at = NULL` вернёт 0 строк без ошибки.", "Противоположное условие — `IS NOT NULL`."],
  },
  {
    id: "join",
    title: "Соединение таблиц: JOIN",
    summary: "`JOIN` склеивает строки двух таблиц по общему ключу.",
    syntax: "FROM a JOIN b ON b.ключ = a.ключ",
    example: "SELECT r.full_name, a.entered_at\nFROM access_log a\nJOIN staff s ON s.badge_id = a.badge_id\nJOIN residents r ON r.id = s.resident_id;",
  },
  {
    id: "order",
    title: "Сортировка: ORDER BY",
    summary: "`ORDER BY` упорядочивает результат, `DESC` — по убыванию.",
    syntax: "ORDER BY столбец [DESC]",
    example: "SELECT measured_at, megawatts\nFROM heat_output\nORDER BY megawatts DESC\nLIMIT 3;",
  },
];

export const HANDBOOK_NOTES: Record<string, string> = {
  null: "Сто раз на этом попадалась. Пустой выход — не «вышел», а «никто не отметил».",
};

export const IDLE_LINES = [
  "Зеркало подключено. Доступно таблиц: 6 из 8.",
  "Последняя синхронизация зеркала: 14.12.2026 02:30.",
];
