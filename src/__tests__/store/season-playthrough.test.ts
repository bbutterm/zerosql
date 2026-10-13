/**
 * Сезон целиком через стор (без браузера): тот же автоигрок, что и
 * scripts/qa-playthrough.mjs, только действия идут прямо в стор. Политика:
 * сцены проматываются, выбор — первый доступный, на допросах и в сценах
 * предъявляются верные улики или приобщённые строки, задачи решаются
 * эталонами по порядку, протокол заполняется верными ответами, обвинение —
 * верный человек и карточки с его ключами. Каждое дело должно дойти до разбора.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  activeObjective,
  cardHasKey,
  cardMatches,
  createEngineClient,
  getScene,
  isSourceCard,
  normalizeCell,
  objectiveApplies,
  type CardPredicate,
  type CaseDef,
  type CaseObjective,
  type EngineClient,
  type EvidencePresent,
  type PinnedCard,
  type ValidationRule,
} from "@/engine";
import { cases } from "@/data";
import { createGameStore, type GameStore, type OfferInput } from "@/stores/game/store";
import { memoryStorage } from "@/stores/game/persist";
import { makeCard } from "@/stores/game/rules";
import { seenValues } from "@/stores/game/selectors";

/**
 * Строки, которые игрок ищет сам прямо на допросе (liveQuery): эталонов задач
 * для них нет. Ключ — утверждение ленты. Тот же список — в scripts/qa-playthrough.mjs.
 */
export const CARD_SQL: Record<string, string[]> = {
  "c06.dream.005": ["SELECT * FROM doc_registry WHERE year = 2015 AND reg_no = 3313"],
  "c06.dream.007": ["SELECT * FROM incidents WHERE id = 7"],
  "c07.office.008": ["SELECT id, reg_no, doc_type, note FROM doc_registry WHERE year = 2015 AND reg_no = 3313"],
  "c07.office.012": ["SELECT id, applicant_text, description FROM incidents WHERE id = 7"],
  "c08.int_tokha.003": ["SELECT ts, badge_id, door, direction FROM door_access WHERE badge_id = 'B-4210' ORDER BY ts DESC LIMIT 1"],
  "c08.int_tokha.011": ["SELECT ts, payer_name, item, qty FROM purchases WHERE payer_person_id = 4127 AND item = 'чай с чабрецом'"],
  "c08.int_tokha.015": ["SELECT ts, amount, counterparty, purpose FROM transactions WHERE counterparty LIKE '%Деньги Сразу%' AND amount = -380000"],
  "c12.int_granin.019": ["SELECT * FROM door_access WHERE badge_id IS NULL"],
  "c12.int_granin.020": [
    "SELECT * FROM gs_comms_2015 WHERE from_ext = '2-14' AND kind = 'sms' AND text LIKE '%ПРИЧАЛУ%'",
    "SELECT * FROM gs_phonebook WHERE ext = '2-14'",
  ],
  "c12.int_granin.024": ["SELECT * FROM construction_docs WHERE doc_no = 'ПД-117/изм.3'"],
  "c12.int_granin.028": ["SELECT o.*, c.name FROM company_owners o JOIN companies c ON c.id = o.company_id WHERE c.name LIKE '%Kordon%'"],
};

const GRANIN_SQL = ["SELECT * FROM gs_phonebook WHERE ext = '2-14'", "SELECT id, doc_no, signed_at, signed_by_person_id FROM construction_docs WHERE doc_no = 'ПД-117/изм.3'"];
const BURTSEV_SQL = ["SELECT * FROM plate_reads WHERE plate = 'К404ТО' ORDER BY read_at LIMIT 1", "SELECT id, full_name, birth_date FROM persons WHERE id = 2214"];

/** Строки с ключами обвиняемых, если эталоны задач их не дали (ключ — id обвинения) */
export const ACCUSE_SQL: Record<string, string[]> = { granin: GRANIN_SQL, burtsev: BURTSEV_SQL };

/** Задачи с правилом pin: строки, которые нужно приобщить до эталона (ключ — id задачи) */
export const PIN_SQL: Record<string, string[]> = { o11_5: [...GRANIN_SQL, ...BURTSEV_SQL] };

const ORDERED = [...cases].sort((a, b) => a.order - b.order);
const NOW = () => new Date("2026-10-13T12:00:00");

let shared: EngineClient;
beforeAll(async () => {
  shared = createEngineClient({ mode: "in-process" });
  await shared.init();
}, 120_000);

/** Предикаты правил pin внутри правила задачи */
function pinRules(rule: ValidationRule): CardPredicate[] {
  if (rule.type === "pin") return [rule.where];
  if (rule.type === "compound" || rule.type === "any_of") return rule.rules.flatMap(pinRules);
  return [];
}

/** Все предикаты карточек дела: допросы, предъявления в сценах, правила pin задач */
function casePredicates(def: CaseDef): CardPredicate[] {
  const out: CardPredicate[] = def.objectives.flatMap((o) => pinRules(o.validation));
  for (const sc of def.scenes) {
    out.push(...(sc.present?.cards ?? []));
    for (const p of sc.interrogation?.points ?? []) out.push(...(p.present?.cards ?? []));
  }
  return out;
}

function offerFor(store: GameStore, present: EvidencePresent): OfferInput | null {
  const st = store.getState();
  const s = st.session!;
  const have = new Set([...st.season.evidence, ...s.evidence]);
  const pins = s.pins.filter(isSourceCard);
  const ids = present.correct.filter((id) => have.has(id));
  const cards = (present.cards ?? []).map((p) => pins.find((c) => cardMatches(c, p)));
  if (present.requireAll) {
    if (ids.length < present.correct.length || cards.some((c) => !c)) return null;
    return { evidenceIds: ids, cardIds: cards.map((c) => c!.id) };
  }
  if (ids.length) return { evidenceIds: [ids[0]] };
  const card = cards.find(Boolean);
  return card ? { cardIds: [card.id] } : null;
}

interface Run {
  log: string[];
  pinned: Set<string>;
}

/** Выполнить запрос и приобщить строки, которые подходят под карточки дела или содержат ключи обвиняемых */
async function query(store: GameStore, def: CaseDef, sql: string, run: Run) {
  const ev = await store.getState().runQuery(sql);
  if (!ev) throw new Error(`запрос не выполнен: ${sql.slice(0, 80)}`);
  if (ev.result.error) run.log.push(`  ошибка SQL: ${ev.result.error}`);
  const preds = casePredicates(def);
  const keys = (def.accusations ?? []).map((a) => a.keys);
  const clock = store.getState().session!.clock;
  let byKey = 0;
  ev.result.rows.forEach((row, i) => {
    const card = makeCard(row, ev.result.columns, sql, clock);
    if (run.pinned.has(card.fingerprint!)) return;
    const pred = preds.some((p) => cardMatches(card, p));
    const key = byKey < 3 && keys.some((k) => cardHasKey(card, k));
    if (pred || key) {
      if (key) byKey++;
      store.getState().pinRow(i);
      run.pinned.add(card.fingerprint!);
    }
  });
  return ev;
}

async function playCase(store: GameStore, def: CaseDef): Promise<Run> {
  const run: Run = { log: [], pinned: new Set() };
  const say = (m: string) => run.log.push(m);
  expect(await store.getState().openCase(def.id), `${def.id}: открывается`).toBe(true);
  const optTries = new Map<string, { n: number; scenes: number }>();
  const mainTries = new Map<string, number>();
  const stuckInterro = new Set<string>();
  const ranCardSql = new Set<string>();
  const resweep = new Set<string>();

  for (let step = 0; step < 600; step++) {
    const st = store.getState();
    const s = st.session!;
    if (s.phase === "debrief") return run;
    // Ночь между делами: как «Пропустить ночь» и «К делу»
    if (s.phase === "night") {
      say("ночь");
      await st.finishNight();
      continue;
    }
    const flags = { ...s.baseFlags, ...s.flags };

    if (s.stage) {
      const scene = getScene(def, s.stage.sceneId)!;
      if (s.stage.awaiting === "choice") {
        const have = new Set([...st.season.evidence, ...s.evidence]);
        const choice = scene.choices!.find((c) => (c.requires ?? []).every((id) => have.has(id)))!;
        say(`выбор ${scene.id} → ${choice.id}`);
        await st.choose(choice.id);
      } else if (s.stage.awaiting === "present") {
        const offer = offerFor(store, scene.present!);
        if (!offer) throw new Error(`${def.id}: нечего предъявить в сцене ${scene.id}\n${run.log.join("\n")}`);
        say(`предъявление в сцене ${scene.id}: ${JSON.stringify(offer)}`);
        expect(await st.presentInScene(offer)).toBe(true);
      } else {
        say(`сцена ${scene.id}`);
        await st.skipScene();
      }
      continue;
    }

    if (s.interrogation && !stuckInterro.has(s.interrogation.sceneId)) {
      const { sceneId, state } = s.interrogation;
      const idef = getScene(def, sceneId)!.interrogation!;
      const visible = idef.points.filter((p) => !p.revealedBy || state.pressed.includes(p.revealedBy));
      let acted = false;
      for (const p of visible) {
        if (!p.present || state.broken.includes(p.line)) continue;
        const offer = offerFor(store, p.present);
        if (offer) {
          say(`допрос ${sceneId}: пробой ${p.line}`);
          await st.presentToSuspect(p.line, offer);
          acted = true;
          break;
        }
      }
      if (acted) continue;
      const press = visible.find((p) => p.press && !state.pressed.includes(p.line) && !state.broken.includes(p.line));
      if (press) {
        say(`допрос ${sceneId}: надавить ${press.line}`);
        await st.pressStatement(press.line);
        continue;
      }
      say(`допрос ${sceneId}: нечего предъявить на ${visible.filter((p) => p.present && !state.broken.includes(p.line)).map((p) => p.line)}`);
      stuckInterro.add(sceneId);
      continue;
    }

    // застрявший допрос: запросы на нужные строки, затем эталоны ещё раз, чтобы приобщить строки
    if (s.interrogation && stuckInterro.has(s.interrogation.sceneId)) {
      const { sceneId, state } = s.interrogation;
      const open = getScene(def, sceneId)!.interrogation!.points.filter((p) => p.present && !state.broken.includes(p.line));
      const extra = open.flatMap((p) => CARD_SQL[p.line] ?? []).filter((sql) => !ranCardSql.has(sql));
      if (extra.length) {
        for (const sql of extra) {
          ranCardSql.add(sql);
          say(`запрос для допроса: ${sql}`);
          await query(store, def, sql, run);
        }
        stuckInterro.clear();
        continue;
      }
      if (!resweep.has(sceneId)) {
        resweep.add(sceneId);
        const reads = def.objectives.filter((x) => s.completed.includes(x.id) && /^\s*(select|with)\b/i.test(x.solution));
        for (const o of reads) await query(store, def, o.solution, run);
        stuckInterro.clear();
        continue;
      }
    }

    // стол: основная задача и дополнительные. Дополнительная с order < 10 идёт перед
    // основной с большим order, 10–89 — после основной floor(order / 10), от 90 — перед
    // последней основной. Неудачную дополнительную пробуем снова после новых сцен (до 3 раз).
    const active = activeObjective(def, new Set(s.completed), flags);
    const mains = def.objectives.filter((o) => !o.optional && objectiveApplies(o, flags)).sort((a, b) => a.order - b.order);
    const doneOrder = (n: number) => mains.some((m) => m.order === n && s.completed.includes(m.id));
    const eligible = (o: CaseObjective) =>
      o.order < 10 ? !active || o.order < active.order : o.order < 90 ? doneOrder(Math.floor(o.order / 10)) || !active : !active || active === mains[mains.length - 1];
    const optional = def.objectives
      .filter((o) => o.optional && objectiveApplies(o, flags) && !s.completed.includes(o.id) && eligible(o))
      .filter((o) => (optTries.get(o.id)?.n ?? 0) < 3 && (optTries.get(o.id)?.scenes ?? -1) < s.endedScenes.length)
      .sort((a, b) => a.order - b.order);
    const nextOpt = optional[0];
    const mainReady = active && active.validation.type !== "slot" && (mainTries.get(active.id) ?? 0) < 2 ? active : undefined;
    const target = nextOpt ?? mainReady;
    if (target) {
      if (target.optional) optTries.set(target.id, { n: (optTries.get(target.id)?.n ?? 0) + 1, scenes: s.endedScenes.length });
      else mainTries.set(target.id, (mainTries.get(target.id) ?? 0) + 1);
      for (const sql of (PIN_SQL[target.id] ?? []).filter((q) => !ranCardSql.has(q))) {
        ranCardSql.add(sql);
        say(`запрос для доски: ${sql}`);
        await query(store, def, sql, run);
      }
      if (target.prediction && !s.predictions[target.id]) st.answerPrediction(target.id, target.prediction.answer);
      const ev = await query(store, def, target.solution, run);
      const ok = store.getState().session!.completed.includes(target.id);
      stuckInterro.clear();
      say(`${ok ? "засчитана" : "НЕ засчитана"} ${target.id}${ev.result.error ? "" : `, строк ${ev.result.rowCount}`}${ok ? "" : `: ${ev.progress.activeFeedback ?? ""}`}`);
      continue;
    }

    // обвинения
    const acc = (def.accusations ?? []).find((a) => !s.accusations[a.id]?.accepted && (s.accusations[a.id]?.attempts ?? 0) < 2);
    if (acc) {
      const enough = (x: PinnedCard[]) => x.filter((c) => isSourceCard(c) && cardHasKey(c, acc.keys)).length >= (acc.minCards ?? 2);
      if (!enough(s.pins)) {
        for (const sql of (ACCUSE_SQL[acc.id] ?? []).filter((q) => !ranCardSql.has(q))) {
          ranCardSql.add(sql);
          say(`запрос для обвинения: ${sql}`);
          await query(store, def, sql, run);
        }
      }
      const cards = store.getState().session!.pins.filter((c) => isSourceCard(c) && cardHasKey(c, acc.keys)).map((c) => c.id);
      say(`обвинение ${acc.id}: карточек ${cards.length}`);
      // Как в интерфейсе: обвиняемый — из увиденного (ФИО или любой его ключ)
      const wanted = new Set([acc.answer, ...acc.keys].map((k) => normalizeCell(k)));
      const who = seenValues(store.getState(), acc.answer.split(" ")[0]).find((v) => wanted.has(normalizeCell(v)));
      if (!who) throw new Error(`${def.id}: обвиняемого ${acc.answer} нет среди увиденного\n${run.log.join("\n")}`);
      const check = await st.accuse(acc.id, who, cards);
      say(`  → ${check?.outcome} ${check?.message}`);
      continue;
    }

    // протокол
    if (def.protocol && s.closingScene === null) {
      for (const b of def.protocol.blanks) {
        if (s.protocolConfirmed.includes(b.id)) continue;
        if (!st.setSlot(b.id, b.answer)) throw new Error(`${def.id}: ответ протокола ${b.id}=«${b.answer}» не увиден\n${run.log.join("\n")}`);
      }
      await st.submitProtocol();
      say(`протокол: ${store.getState().session!.protocolMessage}`);
      if (store.getState().session!.closingScene === null) throw new Error(`${def.id}: протокол не сошёлся\n${run.log.join("\n")}`);
      continue;
    }

    throw new Error(
      `${def.id}: застряли. Активная задача ${active?.id ?? "—"}, допрос ${s.interrogation?.sceneId ?? "—"}, closing ${s.closingScene}\n${run.log.join("\n")}`
    );
  }
  throw new Error(`${def.id}: слишком много шагов`);
}

describe("сезон через стор: автоигрок проходит все дела", () => {
  it("13 дел от пролога до финала", async () => {
    const store = createGameStore({ engine: () => shared, storage: () => memoryStorage(), now: NOW });
    store.getState().setProfile({ playerName: "Тестов", onboarded: true, ageConfirmed: true });
    await store.getState().boot();
    for (const def of ORDERED) {
      const run = await playCase(store, def);
      const s = store.getState().session!;
      expect(s.phase, def.id).toBe("debrief");
      // Д8 не закрывается до обвинения: допрос Тохи, выбор и кода (o8_5 по строкам zero, М6)
      if (def.id === "case-08-prizrak") {
        expect(s.accusations.ghost?.accepted).toBe(true);
        expect(s.completed).toContain("o8_5");
        expect(s.endedScenes).toEqual(expect.arrayContaining(["int_tokha_done", "coda", "outro"]));
        // outro доиграна один раз (по коде), финал её не повторяет
        expect(run.log.filter((l) => l === "сцена outro")).toHaveLength(1);
      }
      store.getState().finishDebrief();
      expect(store.getState().season.solved[def.id], def.id).toBeDefined();
    }
    // Ночи между делами показаны по разу (только новые) и отмечены
    const events = store.getState().season.events;
    for (const def of ORDERED.filter((c) => c.night)) expect(events, def.id).toContain(`night_seen:${def.id}`);
    // Ключи условий заданий zero сохранены по делам — not_seen перепроверяется по всему сезону
    expect(Object.keys(store.getState().season.cronSeen)).toHaveLength(ORDERED.length);
    // Сработавшие задания zero ушли в патчи следующих дел
    const cron = Object.values(store.getState().season.casePatches)
      .flat()
      .flatMap((p) => (typeof p !== "string" && p.id === "cron.fire" ? [p.params?.jobId] : []));
    expect(cron).toEqual(expect.arrayContaining([1, 5, 6, 7, 8, 9]));
    // Патчи уходят в следующие дела с флагами и часами; подставным правкам Д10 нужны запросы Д9
    const frame = store.getState().season.casePatches["case-10-kopirka"].find((p) => typeof p !== "string" && p.id === "c10.frame");
    expect(frame).toMatchObject({ params: { flags: expect.any(Object), clock: expect.stringMatching(/^2026-12-31/) } });
    expect(typeof frame !== "string" && frame?.params?.queries?.some((q) => q.loggedAt.startsWith("2026-12-28"))).toBe(true);
    expect(store.getState().season.ending).not.toBeNull();
  }, 600_000);
});
