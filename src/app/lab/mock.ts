/**
 * Мок-данные для лаборатории компонентов (/lab).
 * Только для визуальной проверки: сюжет, имена и цифры — черновые.
 */

import type { CharacterDef, Scene } from "@/types/story";
import type { ForeignKey, QueryResult, TableInfo } from "@/types/database";
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
  },
};

/* ---------- Сцены ---------- */

export const SCENES: Record<string, Scene> = {
  interrogation: {
    id: "interrogation",
    location: "Подвал УВД · 14 декабря, 02:31",
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
    choices: [
      { id: "ask-shift", text: "Спросить Ахметова, кто ещё был на смене", goto: "present" },
      {
        id: "show-gate",
        text: "Показать журнал: его карта открывала шлюз в 02:10",
        requires: ["ev-akhmetov-gate"],
        goto: "present",
      },
      { id: "let-go", text: "Отпустить его. Сначала — данные", flag: "akhmetov_released" },
    ],
  },
  present: {
    id: "present",
    location: "Подвал УВД · 14 декабря, 02:40",
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
    location: "Подвал УВД · 14 декабря, 02:42",
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
    location: "Подвал УВД · 14 декабря, 02:42",
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
      "SELECT * FROM access_log\nWHERE badge_id = 'B-0417'\n  AND entered_at > '2026-12-14 00:00';",
    source: "журнал пропусков",
    foundAt: "02:31",
    isNew: true,
  },
  {
    id: "ev-cameras",
    kind: "lead",
    title: "Камеры «на профилактике»",
    text: "Камеры северного шлюза отключены с 01:30 до 03:00 по заявке. Подпись под заявкой неразборчива.",
    source: "реестр заявок ЦОД",
    foundAt: "02:18",
  },
  {
    id: "ev-heat",
    kind: "document",
    title: "Сводка теплосети",
    text: "В ночь исчезновения сброс тёплой воды в залив вырос с 41 до 86 МВт. Плановых работ в журнале нет.",
    sourceQuery: "SELECT measured_at, megawatts\nFROM heat_output\nORDER BY megawatts DESC LIMIT 3;",
    source: "отчёт ЦОД «Северный узел»",
    foundAt: "02:05",
  },
  {
    id: "ev-photo",
    kind: "photo",
    title: "Снимок с моста",
    text: "Кравец сфотографировала пар над полыньёй в 02:05. На льду у кромки виден луч фонаря.",
    source: "архив Л. Кравец",
    foundAt: "01:58",
  },
  {
    id: "ev-call",
    kind: "audio",
    title: "Звонок в 02:12",
    text: "Короткий звонок с телефона Лапина на номер, оформленный на ООО «Тепловой контур». 14 секунд, тишина и ветер.",
    sourceQuery: "SELECT * FROM calls\nWHERE caller = '+7 914 220-31-07'\n  AND started_at LIKE '2026-12-14 02:%';",
    source: "оператор связи",
    foundAt: "01:44",
  },
  {
    id: "ev-akhmetov",
    kind: "testimony",
    title: "Показания Ахметова",
    text: "«Всю смену был в машинном зале, Лапина не видел. Рябов ушёл в полночь».",
    source: "допрос 14.12, 02:35",
    foundAt: "02:36",
  },
];

export const EXTRA_EVIDENCE: EvidenceCardData = {
  id: "ev-valve",
  kind: "record",
  title: "Ручное открытие клапана",
  text: "В 01:58 клапан сброса №3 переведён в ручной режим с терминала машинного зала.",
  sourceQuery: "SELECT * FROM heat_output\nWHERE outlet = 'клапан-3'\n  AND measured_at BETWEEN '2026-12-14 01:50' AND '2026-12-14 02:10';",
  source: "телеметрия теплосети",
  foundAt: "02:50",
  isNew: true,
};

/* ---------- Схема ---------- */

const col = (name: string, type: string, pk = false, notnull = false) => ({ name, type, pk, notnull });

export const SCHEMA: TableInfo[] = [
  {
    name: "residents",
    columns: [
      col("id", "INTEGER", true, true),
      col("full_name", "TEXT", false, true),
      col("born", "DATE"),
      col("address", "TEXT"),
      col("phone", "TEXT"),
      col("employer", "TEXT"),
    ],
  },
  {
    name: "staff",
    columns: [
      col("id", "INTEGER", true, true),
      col("resident_id", "INTEGER", false, true),
      col("badge_id", "TEXT", false, true),
      col("position", "TEXT"),
      col("shift", "TEXT"),
    ],
  },
  {
    name: "access_log",
    columns: [
      col("id", "INTEGER", true, true),
      col("badge_id", "TEXT", false, true),
      col("gate", "TEXT", false, true),
      col("entered_at", "TEXT", false, true),
      col("exited_at", "TEXT"),
    ],
  },
  {
    name: "heat_output",
    columns: [
      col("id", "INTEGER", true, true),
      col("measured_at", "TEXT", false, true),
      col("megawatts", "REAL", false, true),
      col("outlet", "TEXT"),
    ],
  },
  {
    name: "calls",
    columns: [
      col("id", "INTEGER", true, true),
      col("caller", "TEXT", false, true),
      col("callee", "TEXT", false, true),
      col("started_at", "TEXT", false, true),
      col("seconds", "INTEGER"),
    ],
  },
  {
    name: "vehicles",
    columns: [
      col("id", "INTEGER", true, true),
      col("plate", "TEXT", false, true),
      col("owner_id", "INTEGER"),
      col("model", "TEXT"),
    ],
  },
  {
    name: "bank_transfers",
    columns: [col("id", "INTEGER", true), col("from_account", "TEXT"), col("to_account", "TEXT"), col("amount", "REAL")],
  },
  {
    name: "sealed_cases",
    columns: [col("id", "INTEGER", true), col("title", "TEXT"), col("closed_at", "TEXT")],
  },
];

export const FOREIGN_KEYS: ForeignKey[] = [
  { from: "staff", fromColumn: "resident_id", to: "residents", toColumn: "id" },
  { from: "access_log", fromColumn: "badge_id", to: "staff", toColumn: "badge_id" },
  { from: "vehicles", fromColumn: "owner_id", to: "residents", toColumn: "id" },
  { from: "bank_transfers", fromColumn: "from_account", to: "residents", toColumn: "id" },
];

export const UNLOCKED_TABLES = ["residents", "staff", "access_log", "heat_output", "calls", "vehicles"];

export const TABLE_NOTES: Record<string, string> = {
  residents: "Жители города: ФИО, адрес, телефон, работодатель.",
  staff: "Сотрудники ЦОД и их пропуска.",
  access_log: "Журнал пропусков: кто, где и когда прошёл.",
  heat_output: "Телеметрия сброса тепла в залив.",
  calls: "Звонки по городу (метаданные, без записи).",
  vehicles: "Зарегистрированный транспорт.",
};

/* ---------- Результат запроса: ~40 строк с NULL и числами ---------- */

const NAMES = [
  "Игорь Лапин",
  "Дмитрий Рябов",
  "Тимур Ахметов",
  "Олег Смирнов",
  "Анна Ветрова",
  "Сергей Голубев",
  "Марина Ефимова",
  "Павел Норкин",
  "Ксения Белых",
  "Руслан Хайруллин",
  "Евгения Тарасова",
  "Николай Зуев",
];
const GATES = ["северный шлюз", "главный вход", "погрузочная", "машинный зал"];
const NOTES = [
  null,
  "плановый обход",
  null,
  "сопровождение подрядчика по замене теплообменника на линии №3, акт подписан задним числом",
  null,
  "без отметки поста",
  "ремонт освещения у причала",
];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function timeAt(minutesFromStart: number): string {
  // старт: 2026-12-13 22:00
  const total = 22 * 60 + minutesFromStart;
  const day = total >= 24 * 60 ? 14 : 13;
  const m = total % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `2026-12-${day} ${hh}:${mm}`;
}

export const RESULT_ROWS: QueryResult = (() => {
  const r = seeded(14);
  const rows: unknown[][] = [];
  let t = 0;
  for (let i = 0; i < 42; i++) {
    t += Math.floor(r() * 12) + 1;
    const name = NAMES[Math.floor(r() * NAMES.length)];
    const inside = Math.floor(r() * 140) + 3;
    const stillInside = r() < 0.17;
    const badge = `B-${String(200 + Math.floor(r() * 400)).padStart(4, "0")}`;
    rows.push([
      1040 + i,
      name,
      r() < 0.06 ? null : badge,
      GATES[Math.floor(r() * GATES.length)],
      timeAt(t),
      stillInside ? null : timeAt(t + inside),
      stillInside ? null : inside,
      Math.round((-31 - r() * 9) * 10) / 10,
      NOTES[Math.floor(r() * NOTES.length)],
    ]);
  }
  return {
    columns: ["id", "full_name", "badge_id", "gate", "entered_at", "exited_at", "minutes_inside", "temp_c", "note"],
    rows,
    rowCount: rows.length,
    executionTimeMs: 3.4,
    error: null,
  };
})();

export const RESULT_EMPTY: QueryResult = {
  columns: ["id", "full_name", "badge_id", "entered_at"],
  rows: [],
  rowCount: 0,
  executionTimeMs: 0.8,
  error: null,
};

export const RESULT_TRUNCATED: QueryResult = {
  ...RESULT_ROWS,
  rows: RESULT_ROWS.rows.slice(0, 12),
  rowCount: 12480,
  truncated: true,
  executionTimeMs: 41.7,
};

export const RESULT_SQL_ERROR: QueryResult = {
  columns: [],
  rows: [],
  rowCount: 0,
  executionTimeMs: 0.3,
  error: "no such column: full_nam",
  errorKind: "sql",
  errorHelp: {
    title: "Нет такого столбца",
    explanation: "Столбца «full_nam» нет ни в одной таблице запроса.",
    suggestion: "Возможно, вы имели в виду «full_name»?",
  },
};

export const RESULT_LOCKED: QueryResult = {
  columns: [],
  rows: [],
  rowCount: 0,
  executionTimeMs: 0,
  error: "[ДОСТУП ЗАПРЕЩЁН] Таблица «bank_transfers» ещё не разблокирована.",
  errorKind: "locked_table",
  errorHelp: {
    title: "Доступ закрыт",
    explanation: "Таблица «bank_transfers» пока засекречена.",
    suggestion: "Продолжайте расследование — доступ к новым данным откроется по ходу дела.",
  },
};

export const RESULT_READ_ONLY: QueryResult = {
  columns: [],
  rows: [],
  rowCount: 0,
  executionTimeMs: 0,
  error: "[ТОЛЬКО ЧТЕНИЕ] Команда DELETE недоступна: архив нельзя изменять.",
  errorKind: "read_only",
  errorHelp: {
    title: "Архив только для чтения",
    explanation: "Команды, меняющие данные или структуру (DELETE), в этом деле запрещены — улики нельзя трогать.",
    suggestion: "Используйте SELECT, чтобы найти нужное. Если очень хочется — WITH … SELECT тоже можно.",
  },
};

export const SAMPLE_SQL = `SELECT a.id, r.full_name, a.badge_id, a.gate,
       a.entered_at, a.exited_at
FROM access_log AS a
JOIN staff s ON s.badge_id = a.badge_id
JOIN residents r ON r.id = s.resident_id
WHERE a.entered_at > '2026-12-14 01:47'
  AND a.exited_at IS NULL -- кто не вышел?
ORDER BY a.entered_at;`;

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
    text: "Выясните, кто вошёл после Лапина и не вышел до утра",
    detail: "Лапин вошёл в 01:47. Пустое время выхода в таблице — это NULL.",
    state: "active",
    hints: [
      {
        speaker: "sokolova",
        text: "Нам нужны входы позже 01:47. Даты здесь — строки одного формата, их можно сравнивать напрямую.",
      },
      {
        speaker: "akhmetov",
        text: "Если человек не вышел, в `exited_at` пусто. Это проверяется не через `= NULL`, а через `IS NULL`.",
      },
      { text: "Соедините условия: `entered_at > '2026-12-14 01:47'` и `exited_at IS NULL`." },
      {
        text: "`SELECT * FROM access_log WHERE entered_at > '2026-12-14 01:47' AND exited_at IS NULL;`",
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
      { speaker: "kravets", text: "Я снимала пар около двух ночи. Посмотрите, что было в `heat_output` тогда." },
      { text: "Отсортируйте по `megawatts` по убыванию и возьмите первую строку." },
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
    text: "Последним в ЦОД вошёл {p-who} — в {p-when}, через северный шлюз.",
    blanks: [
      { id: "p-who", label: "кто", options: PEOPLE },
      {
        id: "p-when",
        label: "когда",
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
    blanks: [{ id: "p-signer", label: "кто подписал", options: PEOPLE }],
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

/* ---------- Справочник ---------- */

export const CHEATSHEET: Array<{ title: string; code: string; note: string }> = [
  { title: "Отбор строк", code: "SELECT * FROM staff\nWHERE shift = 'ночь';", note: "WHERE оставляет только подходящие строки." },
  { title: "Пустые значения", code: "WHERE exited_at IS NULL", note: "NULL не равен ничему, даже самому себе — только IS NULL." },
  { title: "Соединение", code: "JOIN staff s\n  ON s.badge_id = a.badge_id", note: "JOIN склеивает строки двух таблиц по общему ключу." },
];
