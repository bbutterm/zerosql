/**
 * «Ночь 03:12» в сторе (docs/design/NIGHTS.md): селектор nightView (варианты
 * по флагам, очереди клавиш по заданиям zero, маски, карточка), фаза night в
 * openCase и finishNight, отметка night_seen, настройка «Ночь между делами»,
 * «Продолжить» на ночи и перепроверка cron по всему сезону.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createEngineClient, cronFiresAfterCase, cronSeenKeys, nightCronJobs, type CaseDef, type EngineClient, type NightDef } from "@/engine";
import { cases, getCase } from "@/data";
import { createGameStore } from "@/stores/game/store";
import { memoryStorage, migrateSave, SAVE_KEY, SAVE_VERSION } from "@/stores/game/persist";
import { DEFAULT_SETTINGS, emptySeason, nightResumes, nightSeenEvent, nightWanted } from "@/stores/game/rules";
import {
  buildNightView,
  clickSchedule,
  daysToSunrise,
  maskNightText,
  nightCardDate,
  nightView,
  NIGHT_TIMING,
  type NightStep,
} from "@/stores/game/selectors";
import type { Season, SolvedCase } from "@/stores/game/types";

const C00 = getCase("case-00-nulevoy-etazh")!;
const C04 = getCase("case-04-mertvaya-dusha")!;
const C05 = getCase("case-05-nomer-3312")!;
const C09 = getCase("case-09-matryoshka")!;
const NOW = () => new Date("2026-10-13T12:00:00");

const STATS = { queries: 5, errors: 0, hintsUsed: 1, protocolAttempts: 1, optionalDone: 0, optionalTotal: 1, durationMs: 60_000 };
const solvedUpTo = (order: number): Record<string, SolvedCase> =>
  Object.fromEntries(
    cases
      .filter((c) => c.order <= order)
      .map((c) => [
        c.id,
        {
          caseId: c.id,
          stats: STATS,
          score: { points: 100, stars: 2, lines: [] },
          stars: 2,
          weather: "overcast",
          bestPoints: 100,
          bestStars: 2,
          runs: 1,
          solvedAt: "2026-10-13T12:00:00.000Z",
        } as unknown as SolvedCase,
      ])
  );

const season = (patch: Partial<Season> = {}): Season => ({ ...emptySeason(), ...patch });

/**
 * Ночь дела с другим набором тактов: селектор проверяется на своих тактах, а не на
 * контенте. Сцены ночи теста идут первыми — getScene находит их раньше настоящих.
 */
const withNight = (def: CaseDef, night: NightDef, scenes = def.scenes): CaseDef => ({ ...def, night, scenes });

const NARRATOR_SCENES = [
  { id: "night", lines: [{ id: "c05.night.001", speaker: "narrator", text: "Журнал аудита открыт на экране." }] },
  { id: "night_soft", lines: [{ id: "c05.night_soft.001", speaker: "narrator", text: "Записка: «Коллега… Спасибо». Подпись: «Л. Б.»" }] },
  { id: "night_hard", lines: [{ id: "c05.night_hard.001", speaker: "narrator", text: "Записка казённым тоном. Подпись: «Ратников»." }] },
];

const C05_NIGHT: NightDef = {
  from: "2026-12-11 22:30",
  stamp: "Б0-03, WS-03. 11–15 декабря 2026 года.",
  beats: [
    { scene: "night" },
    { scene: "night_soft", when: { ratnikov_trust: 1 } },
    { scene: "night_hard", when: { ratnikov_trust: [-1, null] } },
    { at: "2026-12-14 03:12:00", click: "full", login: true, cron: true },
  ],
};

const lineIds = (steps: NightStep[]) => steps.flatMap((s) => (s.kind === "line" ? [s.lineId] : []));

describe("nightView: таймлайн ночи", () => {
  it("ночь перед Д4: штамп, две реплики, сообщение, полный такт со строкой входа под маской, хлебовоз, карточка", () => {
    const view = buildNightView(C04, { season: season({ solved: solvedUpTo(3) }) })!;
    expect(view.stamp).toBe("Б0-03, WS-03. 9–11 декабря 2026 года.");
    expect(view.from).toBe("2026-12-09 18:00:00");
    expect(view.steps.map((s) => s.kind)).toEqual(["line", "line", "status", "click", "row"]);
    expect(lineIds(view.steps)).toEqual(["c04.night.001", "c04.night.002"]);
    const click = view.steps.find((s) => s.kind === "click")!;
    expect(click).toMatchObject({ full: true, bursts: 0, cronRows: [] });
    // zero до раскрытия Д4 — маска фиксированной длины
    expect(click.kind === "click" && click.login?.parts).toEqual([{ mask: "*****" }, { text: "  вход" }]);
    expect(click.kind === "click" && click.login?.time).toBe("03:12:00");
    expect(view.card).toEqual({
      part: null,
      code: "Дело № 04",
      title: "Мёртвая душа",
      subtitle: "Проверка миграции: сироты и рассинхроны",
      date: "11 декабря 2026 года, пятница, 10:00. До солнца 31 день.",
    });
    expect(view.totalMs).toBeGreaterThan(15_000);
    expect(view.totalMs).toBeLessThan(45_000);
  });

  it("варианты по флагам ранних дел: отсутствующий флаг — false и null", () => {
    const def = withNight(C05, C05_NIGHT, [...NARRATOR_SCENES, ...C05.scenes]);
    const soft = buildNightView(def, { season: season({ solved: solvedUpTo(4), caseFlags: { [C04.id]: { ratnikov_trust: 1 } } }) })!;
    expect(lineIds(soft.steps)).toEqual(["c05.night.001", "c05.night_soft.001"]);
    const hard = buildNightView(def, { season: season({ solved: solvedUpTo(4), caseFlags: { [C04.id]: { ratnikov_trust: -1 } } }) })!;
    expect(lineIds(hard.steps)).toEqual(["c05.night.001", "c05.night_hard.001"]);
    const none = buildNightView(def, { season: season({ solved: solvedUpTo(4) }) })!;
    expect(lineIds(none.steps)).toEqual(["c05.night.001", "c05.night_hard.001"]);
    // Лаборатория подмешивает флаги поверх сезона
    expect(lineIds(buildNightView(def, { season: season(), flags: { ratnikov_trust: 1 } })!.steps)).toContain("c05.night_soft.001");
  });

  it("смена акта — строка части на карточке; zero после Д4 без маски", () => {
    const def = withNight(C05, C05_NIGHT, [...NARRATOR_SCENES, ...C05.scenes]);
    const view = buildNightView(def, { season: season({ solved: solvedUpTo(4) }) })!;
    expect(view.card.part).toBe("Часть вторая. Дыры во льду");
    expect(view.card.date).toBe("15 декабря 2026 года, вторник, 02:40. До солнца 27 дней.");
    const click = view.steps.find((s) => s.kind === "click")!;
    expect(click.kind === "click" && click.login?.parts).toEqual([{ text: "zero  вход" }]);
  });

  it("очереди клавиш — по заданиям zero, сработавшим ночью после прошлого дела; живое задание не считается", () => {
    const def = withNight(C05, C05_NIGHT, [...NARRATOR_SCENES, ...C05.scenes]);
    const patches = {
      [C04.id]: [
        { id: "cron.fire", params: { jobId: 1, flags: {}, variant: "a" as const, clock: "2026-12-15 03:00:00" } },
        { id: "cron.fire", params: { jobId: 2, at: "2026-12-14 03:12:00" } },
        { id: "cron.fire", params: { jobId: 3, at: "2026-12-14 03:12:00" } },
        { id: "c04.other", params: {} },
      ],
    };
    const view = buildNightView(def, { season: season({ solved: solvedUpTo(4), casePatches: patches }) })!;
    const click = view.steps.find((s) => s.kind === "click")!;
    expect(click.kind === "click" && click.bursts).toBe(2);
    // До коды Д8 — только звук: строк с текстом заданий нет
    expect(click.kind === "click" && click.cronRows).toEqual([]);
    expect(nightCronJobs(patches[C04.id]).map((j) => j.jobId)).toEqual([2, 3]);

    // Автор забыл cron: очереди всё равно у щелчка в ночь срабатывания
    const noFlag: NightDef = {
      ...C05_NIGHT,
      beats: [
        { at: "2026-12-12 03:12:00", click: "short" },
        { at: "2026-12-14 03:12:00", click: "full", login: true },
      ],
    };
    const view2 = buildNightView(withNight(C05, noFlag), { season: season({ solved: solvedUpTo(4), casePatches: { [C04.id]: [patches[C04.id][1]] } }) })!;
    expect(view2.steps.map((s) => (s.kind === "click" ? s.bursts : -1))).toEqual([0, 1]);
  });

  it("после коды Д8 (order ≥ 9) — очередь клавиш и строка с текстом задания, перенос до трёх строк", () => {
    const night: NightDef = {
      from: "2026-12-24 13:00",
      stamp: "Б0-03, WS-03. 24–28 декабря 2026 года.",
      beats: [{ at: "2026-12-25 03:12:00", click: "full", cron: true }],
    };
    const prev = cases.find((c) => c.order === 8)!;
    const view = buildNightView(withNight(C09, night), {
      season: season({ solved: solvedUpTo(8), casePatches: { [prev.id]: [{ id: "cron.fire", params: { jobId: 7, at: "2026-12-25 03:12:00" } }] } }),
    })!;
    const click = view.steps[0];
    expect(click.kind).toBe("click");
    if (click.kind !== "click") return;
    expect(click.bursts).toBe(1);
    expect(click.cronRows).toHaveLength(1);
    expect(click.cronRows[0]).toMatchObject({ table: "query_log", wrap: true, time: "03:12:00" });
    expect(click.cronRows[0].parts).toEqual([{ text: "zero  CRON-01  SELECT * FROM share_deals WHERE deal_date = '2015-12-07'; -- седьмое декабря пятнадцатого." }]);
    expect(view.card.part).toBe("Часть третья. Первое солнце");
  });

  it("задание после Д10 срабатывает 01.01 — после интерлюдии: его очередь в ночи перед Д11, а не в ночи интерлюдии", () => {
    const C10 = getCase("case-10-kopirka")!;
    const C11 = getCase("case-11-chernovik")!;
    const C12 = getCase("case-12-pervoe-solntse")!;
    const casePatches = { [C10.id]: [{ id: "cron.fire", params: { jobId: 2, at: "2027-01-01 03:12:00" } }] };
    const interlude = buildNightView(C11, { season: season({ solved: solvedUpTo(10), casePatches }) })!;
    expect(interlude.steps.some((s) => s.kind === "click")).toBe(false);
    // Под последнюю реплику интерлюдии — далёкий салют
    expect(interlude.steps.filter((s) => s.sfx).map((s) => [s.kind, s.sfx])).toEqual([["line", "amb.newyear"]]);
    const final = buildNightView(C12, { season: season({ solved: solvedUpTo(11), casePatches }) })!;
    const clicks = final.steps.filter((s): s is Extract<NightStep, { kind: "click" }> => s.kind === "click");
    const jan1 = clicks.find((s) => s.at === "2027-01-01 03:12:00")!;
    expect(jan1.bursts).toBe(1);
    expect(jan1.cronRows).toHaveLength(1);
    expect(clicks.filter((s) => s !== jan1).every((s) => s.bursts === 0 && s.cronRows.length === 0)).toBe(true);
  });

  it("расписание такта 03:12: 03:11, обрыв гула, тишина, щелчок, строка входа, очереди, возврат гула", () => {
    const t = NIGHT_TIMING;
    const full = clickSchedule({ full: true, bursts: 2, login: {}, cronRows: [] });
    expect(full.showAt311Until).toBe(t.at311 + t.silence);
    expect(full.cutAt).toBe(t.at311);
    expect(full.clickAt).toBe(t.at311 + t.silence);
    expect(full.loginAt).toBe(full.clickAt + t.loginDelay);
    expect(full.bursts).toHaveLength(2);
    expect(full.bursts[1] - full.bursts[0]).toBe(t.burst + t.burstGap);
    expect(full.end - (full.resumeAt as number)).toBe(t.humBack);
    const short = clickSchedule({ full: false, bursts: 0, login: null, cronRows: [] });
    expect(short).toMatchObject({ cutAt: null, clickAt: 0, resumeAt: null, end: t.shortClick });
  });

  it("маски: nol — всегда, zero и i.valts — до Д4, Лыков, a.lykov и B-4210 — до Д8", () => {
    const none = new Set<number>();
    expect(maskNightText("nol  вход  i.valts", new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]))).toEqual([{ mask: "*****" }, { text: "  вход  i.valts" }]);
    expect(maskNightText("zero  вход", none)).toEqual([{ mask: "*****" }, { text: "  вход" }]);
    expect(maskNightText("КПП-1  B-4210  вход", none)).toEqual([{ text: "КПП-1  " }, { mask: "B-****" }, { text: "  вход" }]);
    expect(maskNightText("Лыков А. С.  чай", none)).toEqual([{ mask: "*****" }, { text: "  чай" }]);
    expect(maskNightText("Лыков  Серверная", none)).toEqual([{ mask: "*****" }, { text: "  Серверная" }]);
    expect(maskNightText("a.lykov  токен", new Set([4]))).toEqual([{ mask: "*****" }, { text: "  токен" }]);
    expect(maskNightText("a.lykov  B-4210", new Set([4, 8]))).toEqual([{ text: "a.lykov  B-4210" }]);
    // zero внутри другого слова не маскируется
    expect(maskNightText("zeroth", none)).toEqual([{ text: "zeroth" }]);
  });

  it("карточка: день недели, «До солнца» той же формулой, что журнал дел; в день солнца — часы и минуты", () => {
    expect(daysToSunrise("2026-12-03 21:30")).toBe(39);
    expect(nightCardDate("2026-12-03 21:30")).toBe("3 декабря 2026 года, четверг, 21:30. До солнца 39 дней.");
    expect(nightCardDate("2026-12-28 11:00")).toBe("28 декабря 2026 года, понедельник, 11:00. До солнца 14 дней.");
    expect(nightCardDate("2026-12-31 09:00")).toBe("31 декабря 2026 года, четверг, 09:00. До солнца 11 дней.");
    expect(nightCardDate("2027-01-11 11:30")).toBe("11 января 2027 года, понедельник, 11:30. До солнца 1 ч 28 мин.");
    expect(nightCardDate("2026-12-07 13:00")).toBe("7 декабря 2026 года, понедельник, 13:00. До солнца 35 дней.");
    expect(nightCardDate("2026-12-21 16:00")).toContain("До солнца 21 день.");
    expect(nightCardDate("2026-12-09 15:00")).toContain("До солнца 33 дня.");
  });

  it("без ночи в деле или не на фазе night — null", () => {
    // Ночи нет только у пролога: перед ним сезона ещё нет
    expect(buildNightView(C00, { season: season() })).toBeNull();
    const state = { profile: {} as never, settings: DEFAULT_SETTINGS, season: season(), session: null, last: null };
    expect(nightView(state)).toBeNull();
  });
});

describe("показ ночи: настройка и отметка night_seen", () => {
  it("«только новые» — не раскрытое дело без отметки; «всегда» — и при переигровке; «не показывать» — никогда", () => {
    const fresh = season({ solved: solvedUpTo(3) });
    expect(nightWanted(C04, { nightScreens: "new" }, fresh)).toBe(true);
    expect(nightWanted(C04, { nightScreens: "new" }, { ...fresh, events: [nightSeenEvent(C04.id)] })).toBe(false);
    expect(nightWanted(C04, { nightScreens: "new" }, season({ solved: solvedUpTo(4) }))).toBe(false);
    expect(nightWanted(C04, { nightScreens: "always" }, season({ solved: solvedUpTo(4), events: [nightSeenEvent(C04.id)] }))).toBe(true);
    expect(nightWanted(C04, { nightScreens: "off" }, fresh)).toBe(false);
    expect(nightWanted(C00, { nightScreens: "always" }, fresh)).toBe(false);
    // «Продолжить» на ночи: только пока она не досмотрена
    expect(nightResumes(C04, { nightScreens: "always" }, { events: [] })).toBe(true);
    expect(nightResumes(C04, { nightScreens: "always" }, { events: [nightSeenEvent(C04.id)] })).toBe(false);
    expect(nightResumes(C04, { nightScreens: "off" }, { events: [] })).toBe(false);
  });

  it("по умолчанию «только новые»; старое сохранение без настройки и cronSeen получает значения по умолчанию", () => {
    expect(DEFAULT_SETTINGS.nightScreens).toBe("new");
    const old = migrateSave({ settings: { textSpeed: "fast" }, season: { solved: {} }, session: null }, SAVE_VERSION);
    expect(old.settings.nightScreens).toBe("new");
    expect(old.settings.textSpeed).toBe("fast");
    expect(old.season.cronSeen).toEqual({});
  });
});

describe("стор: фаза night", () => {
  let shared: EngineClient;
  beforeAll(async () => {
    shared = createEngineClient({ mode: "in-process" });
    await shared.init();
  }, 120_000);

  const makeStore = (storage = memoryStorage()) => createGameStore({ engine: () => shared, storage: () => storage, now: NOW });

  it("openCase показывает ночь, пока собирается база; finishNight — отметка и вступление", async () => {
    const store = makeStore();
    store.getState().setProfile({ playerName: "Тестов", onboarded: true });
    await store.getState().boot();
    store.setState({ season: season({ solved: solvedUpTo(3) }) });

    const opening = store.getState().openCase(C04.id);
    // Фаза стоит до ожидания ядра: ночь закрывает сборку базы
    expect(store.getState().session).toMatchObject({ caseId: C04.id, phase: "night", stage: null });
    expect(store.getState().caseReady).toBe(false);
    expect(nightView(store.getState())?.caseId).toBe(C04.id);
    expect(await opening).toBe(true);
    expect(store.getState().caseReady).toBe(true);
    expect(store.getState().session).toMatchObject({ phase: "night", stage: null });
    // Запросы ночью не идут
    expect(await store.getState().runQuery("SELECT 1")).toBeNull();

    await store.getState().finishNight();
    expect(store.getState().session).toMatchObject({ phase: "intro", stage: { sceneId: C04.introScene, line: 0 } });
    expect(store.getState().season.events).toContain(nightSeenEvent(C04.id));
    expect(nightView(store.getState())).toBeNull();
    // Повторный вызов ничего не ломает
    await store.getState().finishNight();
    expect(store.getState().session!.stage?.sceneId).toBe(C04.introScene);

    // «только новые»: досмотренная ночь при новом открытии не повторяется
    store.getState().abandonCase();
    expect(await store.getState().openCase(C04.id)).toBe(true);
    expect(store.getState().session).toMatchObject({ phase: "intro", stage: { sceneId: C04.introScene } });

    // «всегда» — ночь снова; «не показывать» — нет
    store.getState().abandonCase();
    store.getState().updateSettings({ nightScreens: "always" });
    expect(await store.getState().openCase(C04.id)).toBe(true);
    expect(store.getState().session!.phase).toBe("night");
    store.getState().abandonCase();
    store.getState().updateSettings({ nightScreens: "off" });
    expect(await store.getState().openCase(C04.id)).toBe(true);
    expect(store.getState().session!.phase).toBe("intro");
  }, 120_000);

  it("«Продолжить» на ночи: недосмотренная ночь начинается сначала, досмотренная — сразу к делу", async () => {
    const storage = memoryStorage();
    const first = makeStore(storage);
    first.getState().setProfile({ playerName: "Тестов", onboarded: true });
    await first.getState().boot();
    first.setState({ season: season({ solved: solvedUpTo(3) }) });
    await first.getState().openCase(C04.id);
    expect(first.getState().session!.phase).toBe("night");

    // Перезагрузка на ночи: ночь снова
    const again = createGameStore({ engine: () => shared, storage: () => storage, now: NOW, skipHydration: true });
    await again.getState().boot();
    expect(again.getState().session).toMatchObject({ caseId: C04.id, phase: "night" });
    expect(again.getState().caseReady).toBe(true);

    // Отметка уже есть (ночь досмотрена в другой вкладке) — сразу вступление
    const raw = JSON.parse(storage.getItem(SAVE_KEY)!);
    raw.state.season.events = [...raw.state.season.events, nightSeenEvent(C04.id)];
    storage.setItem(SAVE_KEY, JSON.stringify(raw));
    const later = createGameStore({ engine: () => shared, storage: () => storage, now: NOW, skipHydration: true });
    await later.getState().boot();
    expect(later.getState().session).toMatchObject({ caseId: C04.id, phase: "intro", stage: { sceneId: C04.introScene } });
  }, 120_000);
});

describe("cron: условие not_seen — по всему сезону, seen — по своему делу", () => {
  const SMS = "gs_comms_2015:sms:2-14:2015-02-19";
  const fired = new Set([1, 2, 3, 5, 6]);

  it("ключи увиденного дела", () => {
    expect(cronSeenKeys(["…к старому причалу…", "3313"])).toEqual(expect.arrayContaining([SMS, "doc_registry:3313"]));
    expect(cronSeenKeys(["ничего"])).toEqual([]);
  });

  it("задание 4 не срабатывает после Д7 у того, кто видел SMS ещё в Д6", () => {
    const after7 = (seenBefore: string[]) => cronFiresAfterCase(7, [], fired, "2026-12-21 23:41:00", seenBefore).map((p) => p.jobId);
    expect(after7([])).toContain(4);
    expect(after7([SMS])).not.toContain(4);
    // seen — только по своему делу: 3313 из Д1–Д4 (persons.id, transactions.id, КУСП) задание 2 не включает
    expect(cronFiresAfterCase(6, [], new Set([1, 3]), "2026-12-17 20:00:00", ["doc_registry:3313"]).map((p) => p.jobId)).not.toContain(2);
    expect(cronFiresAfterCase(6, ["3313"], new Set([1, 3]), "2026-12-17 20:00:00").map((p) => p.jobId)).toContain(2);
  });
});
