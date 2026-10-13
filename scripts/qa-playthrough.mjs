#!/usr/bin/env node
/**
 * QA: автоматическое прохождение сезона «Полыньи» в настоящем браузере.
 *
 * Скрипт играет дела по порядку через настоящий интерфейс, с чистого профиля:
 * предупреждение 18+ → холодное открытие → вход «Зеркала» с именем → журнал дел →
 * для каждого дела сцены (проматываются; выбор — первый доступный), эталоны задач
 * (src/data/cases/<id>/case.json → solution) в редактор и «Выполнить», предсказания,
 * допросы (верные улики или приобщённые строки), обвинения, «Заключение» с верными
 * ответами → разбор → следующее дело. Каждое дело должно дойти до «раскрыто».
 * Состояние игры бот читает из сохранения в localStorage, действует — кликами.
 *
 * Запуск (нужен работающий сервер: npm run dev или npm run build && npm start):
 *   node scripts/qa-playthrough.mjs [параметры]
 *
 *   --base-url <url>   адрес игры (по умолчанию http://localhost:3150)
 *   --cases <список>   какие дела играть: «0-12» (по умолчанию), «5», «0,3,7-9». Дела раньше
 *                      первого из списка восстанавливаются из сохранения <shots-dir>/state-after-NN.json
 *                      (его пишет каждый прогон после разбора); сохранения нет — они проходятся заново
 *   --headed           показать окно браузера
 *   --shots-dir <dir>  снимки (desk-NN.png — стол посреди дела, debrief-NN.png — разбор),
 *                      сохранения после дел и отчёт report.json (по умолчанию ./qa-shots)
 *
 * Playwright: модуль «playwright» из node_modules или путь в PLAYWRIGHT_MODULE
 *   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/qa-playthrough.mjs
 * Браузер не скачивается: нужен установленный Chromium (PLAYWRIGHT_BROWSERS_PATH).
 *
 * Код выхода: 0 — все выбранные дела раскрыты и без ошибок консоли, 1 — иначе.
 * Ошибки консоли собираются; 404 на /portraits, /voice, /backgrounds, /sfx не считаются.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAVE_KEY = "zerosql.season.v2";
const COLD_KEY = "zerosql-cold-open";
const PLAYER = "Тестов";

// ---------------------------------------------------------------- параметры

function parseArgs(argv) {
  const out = { baseUrl: "http://localhost:3150", cases: null, headed: false, shotsDir: path.resolve("qa-shots") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`нет значения у ${a}`);
      return v;
    };
    if (a === "--base-url") out.baseUrl = next().replace(/\/$/, "");
    else if (a === "--cases") out.cases = next();
    else if (a === "--headed") out.headed = true;
    else if (a === "--shots-dir") out.shotsDir = path.resolve(next());
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    } else throw new Error(`неизвестный параметр ${a}`);
  }
  return out;
}

function parseCases(spec, max) {
  if (!spec) return Array.from({ length: max + 1 }, (_, i) => i);
  const set = new Set();
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`--cases: не понял «${part}»`);
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i <= max) set.add(i);
  }
  return [...set].sort((x, y) => x - y);
}

// ---------------------------------------------------------------- контент

function loadCases() {
  const dir = path.join(ROOT, "src/data/cases");
  return fs
    .readdirSync(dir)
    .filter((d) => d.startsWith("case-"))
    .sort()
    .map((d) => {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, d, "case.json"), "utf8"));
      const { scenes } = JSON.parse(fs.readFileSync(path.join(dir, d, "script.json"), "utf8"));
      return { ...meta, scenes };
    });
}

/**
 * Строки, которые игрок ищет сам прямо на допросе (liveQuery): эталонов задач для них
 * нет. Ключ — утверждение ленты. Тот же список — в src/__tests__/store/season-playthrough.test.ts.
 */
const CARD_SQL = {
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
const ACCUSE_SQL = { granin: GRANIN_SQL, burtsev: BURTSEV_SQL };
/** Задачи с правилом pin: строки, которые нужно приобщить до эталона */
const PIN_SQL = { o11_5: [...GRANIN_SQL, ...BURTSEV_SQL] };

// ---------------------------------------------------------------- правила ядра (порт board.ts / values.ts)

const NUMERIC_TEXT = /^[-+]?\d+(?:\.\d+)?$/;
const canonicalNumber = (n) => String(Math.round(n * 100) / 100);
function normalizeCell(v) {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "number") return canonicalNumber(v);
  const t = String(v).trim().replace(/−/g, "-");
  if (NUMERIC_TEXT.test(t)) return canonicalNumber(Number(t));
  return t.toLowerCase().replace(/ё/g, "е");
}
function asNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim().replace(/−/g, "-");
    if (NUMERIC_TEXT.test(t)) return Number(t);
  }
  return null;
}
function cellsEqual(a, b, tol = 0.01) {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return Math.abs(na - nb) <= tol + 1e-9;
  return normalizeCell(a) === normalizeCell(b);
}
const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
function compareOrdered(a, b) {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na - nb;
  if (a === null || a === undefined || b === null || b === undefined) return null;
  const sa = String(a).trim();
  const sb = String(b).trim();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
function cellSatisfies(cell, c) {
  const tol = c.tolerance ?? 0.01;
  if (c.eq !== undefined && !cellsEqual(cell, c.eq, tol)) return false;
  if (c.in !== undefined && !c.in.some((v) => cellsEqual(cell, v, tol))) return false;
  if (c.prefix !== undefined && (cell === null || cell === undefined || !normalizeCell(cell).startsWith(normalizeCell(c.prefix)))) return false;
  if (c.contains !== undefined && (cell === null || cell === undefined || !normalizeCell(cell).includes(normalizeCell(c.contains)))) return false;
  if (c.between !== undefined) {
    const lo = compareOrdered(cell, c.between[0]);
    const hi = compareOrdered(cell, c.between[1]);
    if (lo === null || hi === null || lo < 0 || hi > 0) return false;
  }
  return true;
}
function conditionHolds(card, c) {
  const names = asList(c.column).map((x) => x.toLowerCase());
  const idx = names.length ? card.columns.flatMap((col, i) => (names.includes(col.toLowerCase()) ? [i] : [])) : card.values.map((_, i) => i);
  return idx.some((i) => cellSatisfies(card.values[i], c));
}
const NOT_A_SOURCE = new Set(["mismatch", "ghost", "forgery"]);
const isSourceCard = (card) => !card.stamp || !NOT_A_SOURCE.has(card.stamp);
function cardMatches(card, p) {
  const tables = asList(p.table).map((t) => t.toLowerCase());
  if (tables.length && !tables.includes((card.table ?? "").toLowerCase())) return false;
  const classes = asList(p.sourceClass);
  if (classes.length && (!card.sourceClass || !classes.includes(card.sourceClass))) return false;
  if (p.node !== undefined && card.node !== p.node) return false;
  if (p.all && !p.all.every((c) => conditionHolds(card, c))) return false;
  if (p.any && p.any.length > 0 && !p.any.some((c) => conditionHolds(card, c))) return false;
  return true;
}
function cardHasKey(card, keys) {
  const wanted = new Set(keys.map(normalizeCell));
  return card.values.some((v) => v !== null && wanted.has(normalizeCell(v)));
}
/** Таблица-источник запроса: первая после FROM (как sourceTable в сторе) */
function sourceTable(sql) {
  const m = /\bfrom\s+["`[]?([a-z_][a-z0-9_]*)/i.exec(sql.replace(/--[^\n]*/g, " "));
  return m ? m[1].toLowerCase() : undefined;
}
/** Условие на флаги (live.ts): отсутствующий флаг равен false и null; массив — любое из значений */
function flagsMatch(when, flags) {
  if (!when) return true;
  const eq = (actual, expected) => (expected === null || expected === false ? actual === undefined || actual === false : actual === expected);
  return Object.entries(when).every(([k, want]) => (Array.isArray(want) ? want.some((w) => eq(flags[k], w)) : eq(flags[k], want)));
}
/** Значение атрибута для CSS-селектора */
const attr = (v) => JSON.stringify(String(v));
function pinRules(rule) {
  if (rule.type === "pin") return [rule.where];
  if (rule.type === "compound" || rule.type === "any_of") return rule.rules.flatMap(pinRules);
  return [];
}
function casePredicates(def) {
  const out = def.objectives.flatMap((o) => pinRules(o.validation));
  for (const sc of def.scenes) {
    out.push(...(sc.present?.cards ?? []));
    for (const p of sc.interrogation?.points ?? []) out.push(...(p.present?.cards ?? []));
  }
  return out;
}

// ---------------------------------------------------------------- бот

class Fail extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = loadCases();
  const wanted = parseCases(args.cases, cases.length - 1);
  fs.mkdirSync(args.shotsDir, { recursive: true });

  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch({ headless: !args.headed });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  let current = null;
  const consoleErrors = [];
  const IGNORED_404 = /\/(portraits|voice|backgrounds|sfx)\//;
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url ?? "";
    if (/Failed to load resource/.test(msg.text()) && IGNORED_404.test(url)) return;
    consoleErrors.push({ case: current?.id ?? "title", text: msg.text().slice(0, 400), url });
  });
  page.on("pageerror", (err) => consoleErrors.push({ case: current?.id ?? "title", text: `pageerror: ${err.message}`.slice(0, 400) }));

  const report = { started: new Date().toISOString(), baseUrl: args.baseUrl, cases: [], consoleErrors, ending: null };
  const log = (...m) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...m);

  // --- состояние из сохранения ---
  const save = async () =>
    page.evaluate((key) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw).state : null;
      } catch {
        return null;
      }
    }, SAVE_KEY);
  const session = async () => (await save())?.session ?? null;

  async function waitState(pred, what, timeout = 30_000) {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < timeout) {
      last = await save();
      if (last && pred(last)) return last;
      await sleep(120);
    }
    throw new Fail(`не дождались: ${what}`);
  }

  const visible = async (selector) => {
    const loc = page.locator(selector).first();
    return (await loc.count()) > 0 && (await loc.isVisible().catch(() => false));
  };

  // --- запуск: 18+ → холодное открытие → вход ---
  async function titleFlow(restore) {
    await page.goto(`${args.baseUrl}/`);
    if (restore) {
      await page.evaluate(
        ([key, value, cold]) => {
          localStorage.setItem(key, value);
          sessionStorage.setItem(cold, "1");
        },
        [SAVE_KEY, restore, COLD_KEY]
      );
      await page.goto(`${args.baseUrl}/play`);
      return;
    }
    await page.getByTestId("age-ok").click();
    await page.getByTestId("cold-open").waitFor();
    await sleep(2600); // титр допечатывается — для снимка
    await page.screenshot({ path: path.join(args.shotsDir, "title-cold-open.png") });
    await page.getByTestId("cold-open").click();
    await page.getByTestId("login-submit").click();
    await page.locator("#ob-name").fill(PLAYER);
    await page.getByTestId("onboarding-done").click();
    await page.waitForURL(/\/play/);
  }

  // --- журнал: открыть дело ---
  async function openCase(def) {
    const t0 = Date.now();
    while (Date.now() - t0 < 120_000) {
      const s = await session();
      if (s?.caseId === def.id && s.phase !== "debrief") return;
      if (await visible('[data-testid="debrief-next"]')) {
        await page.getByTestId("debrief-next").click();
      } else if (await visible('[data-testid="journal-open"]')) {
        await page.locator(`tr[data-case="${def.id}"]`).click();
        await page.getByTestId("journal-open").click();
      } else if (await visible('[data-testid="debrief-calendar"]')) {
        await page.getByTestId("debrief-calendar").click();
      }
      await sleep(400);
    }
    throw new Fail(`дело ${def.id} не открылось`);
  }

  // --- редактор и запрос ---
  async function centerTab(id) {
    const tab = page.locator(`#desk-center-tab-${id}`);
    if ((await tab.count()) > 0 && (await tab.getAttribute("aria-selected")) !== "true") {
      await tab.click();
      await sleep(150);
    }
  }

  async function closeMessages() {
    for (let i = 0; i < 6; i++) {
      const btn = page.locator('[aria-label^="Сообщение:"] button[aria-label="Закрыть"]').first();
      if ((await btn.count()) === 0 || !(await btn.isVisible().catch(() => false))) return;
      await btn.click().catch(() => {});
      await sleep(80);
    }
  }

  async function runSql(sql) {
    await centerTab("query");
    await closeMessages();
    const before = await session();
    const editor = page.locator(".cm-content").first();
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText(sql);
    await waitState((st) => st.session?.draftSql?.trim() === sql.trim(), "текст запроса в редакторе");
    await page.getByTestId("run-query").click();
    const st = await waitState((x) => (x.session?.queries ?? 0) > before.queries || x.session?.phase === "debrief", `выполнение запроса: ${sql.slice(0, 60)}`, 60_000);
    await page.locator('[data-testid="run-query"]:not([aria-busy="true"])').first().waitFor().catch(() => {});
    return st.session;
  }

  // --- приобщение строк из таблицы результата ---
  async function gridRows() {
    return page.evaluate(() => {
      const region = document.querySelector('[aria-label="Строки результата"]');
      if (!region) return null;
      const columns = [...region.querySelectorAll("thead th[data-col]")].map((th) => th.textContent ?? "");
      const rows = [...region.querySelectorAll("tbody tr[data-row]")].map((tr) =>
        [...tr.querySelectorAll("td[data-col]")].map((td) => {
          const t = td.textContent ?? "";
          if (t === "NULL" && td.querySelector(".text-ink-3")) return null;
          if (t === "''") return "";
          return t;
        })
      );
      return { columns, rows };
    });
  }

  /** Приобщить подходящие строки результата. null — стол закрыт сценой или допросом, попробовать позже */
  const overlayOpen = async () => (await visible('[data-testid="scene"]')) || (await visible('[data-testid="interrogation"]'));
  async function pinFromGrid(def, sql, extraPreds = []) {
    if (await overlayOpen()) return null;
    if (!(await visible('[aria-label="Строки результата"]'))) return 0;
    const grid = await gridRows();
    if (!grid || grid.rows.length === 0) return 0;
    const preds = [...casePredicates(def), ...extraPreds];
    const keys = (def.accusations ?? []).map((a) => a.keys);
    const table = sourceTable(sql);
    const have = new Set(((await session())?.pins ?? []).map((p) => JSON.stringify(p.values.map(normalizeCell))));
    let pinned = 0;
    let byKey = 0;
    for (let r = 0; r < grid.rows.length && pinned < 12; r++) {
      const values = grid.rows[r].map((v) => (v === null ? null : asNumber(v) ?? v));
      if (have.has(JSON.stringify(values.map(normalizeCell)))) continue;
      const card = { columns: grid.columns, values, ...(table ? { table } : {}) };
      const pred = preds.some((p) => cardMatches(card, p));
      const key = byKey < 3 && keys.some((k) => cardHasKey(card, k));
      if (!pred && !key) continue;
      if (key) byKey++;
      if (await overlayOpen()) return null;
      const before = (await session()).pins.length;
      await closeMessages();
      await page.locator(`[aria-label="Строки результата"] tr[data-row="${r}"] td[data-col="0"]`).click();
      await page.getByTestId("pin-row").click();
      await waitState((st) => (st.session?.pins.length ?? 0) > before, `приобщение строки ${r + 1}`, 10_000).catch(() => null);
      pinned++;
    }
    return pinned;
  }

  // --- сцены ---
  async function playStage(def, s, st) {
    const scene = def.scenes.find((x) => x.id === s.stage.sceneId);
    if (!(await visible('[data-testid="scene"]'))) {
      if (await visible('[data-testid="resume-scene"]')) await page.getByTestId("resume-scene").click();
      await page.getByTestId("scene").waitFor({ timeout: 10_000 });
    }
    const key = JSON.stringify(s.stage);
    // Конец сцены: выбор, предъявление или просто следующая. «Пропустить сцену» доводит до конца
    const end = scene.present ? "present" : scene.choices?.length ? "choice" : "next";
    if (end === "choice") {
      const have = new Set([...st.season.evidence, ...s.evidence]);
      const choice = scene.choices.find((c) => (c.requires ?? []).every((id) => have.has(id)));
      const btn = page.locator(`[data-testid="scene-choice"][data-choice-id="${choice.id}"]`);
      if (!(await btn.isVisible().catch(() => false))) await page.getByTestId("scene-skip").click();
      await btn.click();
      caseLog.push(`выбор ${scene.id} → ${choice.id}`);
    } else if (end === "present") {
      const offer = offerFor(st, s, scene.present);
      if (!offer) throw new Fail(`нечего предъявить в сцене ${scene.id}`);
      const id = [...(offer.evidenceIds ?? []), ...(offer.cardIds ?? [])][0];
      const item = page.locator(`[data-testid="scene-present-item"][data-item-id=${attr(id)}]`);
      if (!(await item.isVisible().catch(() => false))) await page.getByTestId("scene-skip").click();
      await item.click();
      await page.getByTestId("scene-present").click();
      caseLog.push(`предъявление в сцене ${scene.id}: ${id}`);
    } else {
      await page.getByTestId("scene-skip").click();
    }
    const after = await waitState((x) => JSON.stringify(x.session?.stage ?? null) !== key || x.session?.phase === "debrief", `сцена ${scene.id} дальше`, 15_000);
    // События «после сцены» идут через ядро: следующая сцена может начаться чуть позже — не лезть к столу раньше неё
    if (!after.session?.stage && after.session?.phase !== "debrief") {
      const until = Date.now() + 500;
      while (Date.now() < until) {
        const x = await session();
        if (x?.stage || x?.phase === "debrief") break;
        await sleep(50);
      }
    }
  }

  function offerFor(st, s, present) {
    const have = new Set([...st.season.evidence, ...s.evidence]);
    const pins = s.pins.filter(isSourceCard);
    const ids = present.correct.filter((id) => have.has(id));
    const cards = (present.cards ?? []).map((p) => pins.find((c) => cardMatches(c, p)));
    if (present.requireAll) {
      if (ids.length < present.correct.length || cards.some((c) => !c)) return null;
      return { evidenceIds: ids, cardIds: cards.map((c) => c.id) };
    }
    if (ids.length) return { evidenceIds: [ids[0]] };
    const card = cards.find(Boolean);
    return card ? { cardIds: [card.id] } : null;
  }

  // --- допрос ---
  async function interrogate(def, s, st, stuck) {
    const { sceneId, state } = s.interrogation;
    if (!(await visible('[data-testid="interrogation"]'))) {
      if (await visible('[data-testid="resume-interrogation"]')) await page.getByTestId("resume-interrogation").click();
      await page.getByTestId("interrogation").waitFor({ timeout: 10_000 });
    }
    const idef = def.scenes.find((x) => x.id === sceneId).interrogation;
    const shown = idef.points.filter((p) => !p.revealedBy || state.pressed.includes(p.revealedBy));
    const key = JSON.stringify([state, s.stage]);
    for (const p of shown) {
      if (!p.present || state.broken.includes(p.line)) continue;
      const offer = offerFor(st, s, p.present);
      if (!offer) continue;
      const point = page.locator(`[data-testid="interrogation"] li[data-line="${p.line}"]`);
      await point.getByTestId("present-open").click();
      for (const id of [...(offer.evidenceIds ?? []), ...(offer.cardIds ?? [])]) {
        await page.locator(`[data-testid="interrogation"] [role="option"][data-item-id="${id}"]`).click();
      }
      await page.getByTestId("present-submit").click();
      caseLog.push(`допрос ${sceneId}: пробой ${p.line}`);
      await waitState((x) => JSON.stringify([x.session?.interrogation?.state ?? null, x.session?.stage ?? null]) !== key, `допрос ${sceneId}: предъявление`, 15_000);
      return "acted";
    }
    const press = shown.find((p) => p.press && !state.pressed.includes(p.line) && !state.broken.includes(p.line));
    if (press) {
      await page.locator(`[data-testid="interrogation"] li[data-line="${press.line}"]`).getByTestId("press").click();
      caseLog.push(`допрос ${sceneId}: надавить ${press.line}`);
      await waitState((x) => JSON.stringify([x.session?.interrogation?.state ?? null, x.session?.stage ?? null]) !== key, `допрос ${sceneId}: нажим`, 15_000);
      return "acted";
    }
    caseLog.push(`допрос ${sceneId}: нечего предъявить на ${shown.filter((p) => p.present && !state.broken.includes(p.line)).map((p) => p.line)}`);
    stuck.add(sceneId);
    await page.getByTestId("interrogation-leave").click();
    return "stuck";
  }

  // --- заключение и обвинение ---
  async function fillProtocol(def, s) {
    await centerTab("protocol");
    await closeMessages();
    for (const b of def.protocol.blanks) {
      if (s.protocolConfirmed.includes(b.id)) continue;
      if (s.slots[b.id] === b.answer) continue;
      await page.locator(`[data-blank-id="${b.id}"]`).click();
      // У закрытых списков других пропусков те же варианты: берём только открытый
      const opt = page.locator(`[role="option"][data-value=${attr(b.answer)}]`).filter({ visible: true });
      await opt.first().waitFor({ timeout: 5_000 }).catch(() => {});
      if ((await opt.count()) === 0) throw new Fail(`ответ протокола ${b.id} = «${b.answer}» не виден в списке`);
      await opt.first().click();
      await waitState((x) => x.session?.slots?.[b.id] === b.answer, `пропуск ${b.id}`, 10_000);
    }
    const before = s.protocolAttempts;
    await page.getByTestId("protocol-submit").click();
    const after = await waitState((x) => (x.session?.protocolAttempts ?? 0) > before, "сверка протокола", 15_000);
    caseLog.push(`протокол: ${after.session.protocolMessage}`);
    if (after.session.closingScene === null) throw new Fail(`протокол не сошёлся: ${after.session.protocolMessage}`);
  }

  async function accuse(def, acc) {
    const s = await session();
    const cards = s.pins.filter((c) => isSourceCard(c) && cardHasKey(c, acc.keys)).map((c) => c.id);
    await centerTab("protocol");
    await closeMessages();
    const panel = page.locator(`[data-testid="accusation"][data-accusation-id="${acc.id}"]`);
    // Обвиняемого ищут среди увиденного: подходит ФИО или любой его ключ (краткое имя, логин, пропуск)
    await panel.getByTestId("accusation-query").fill(acc.answer.split(" ")[0]);
    await sleep(150);
    const seen = await panel.locator('[role="option"][data-value]').evaluateAll((els) => els.map((e) => e.getAttribute("data-value")));
    const wantedNames = new Set([acc.answer, ...acc.keys].map(normalizeCell));
    const who = seen.find((v) => wantedNames.has(normalizeCell(v)));
    if (!who) throw new Fail(`обвинение ${acc.id}: «${acc.answer}» нет среди увиденного (есть: ${seen.join("; ") || "—"})`);
    await panel.locator(`[role="option"][data-value=${attr(who)}]`).click();
    for (const id of cards) await panel.locator(`input[data-card-id=${attr(id)}]`).check();
    const before = s.accusations[acc.id]?.attempts ?? 0;
    await panel.getByTestId("accuse").click();
    const after = await waitState((x) => (x.session?.accusations?.[acc.id]?.attempts ?? 0) > before, `обвинение ${acc.id}`, 15_000);
    caseLog.push(`обвинение ${acc.id}: карточек ${cards.length} → ${after.session.accusations[acc.id].accepted ? "принято" : "не принято"}`);
  }

  // --- одно дело ---
  let caseLog = [];
  async function playCase(def, shots) {
    current = def;
    caseLog = [];
    const t0 = Date.now();
    await openCase(def);
    const optTries = new Map();
    const mainTries = new Map();
    const stuck = new Set();
    const ranExtra = new Set();
    const resweep = new Set();
    let pendingPin = null;
    let deskShot = false;
    const mains0 = def.objectives.filter((o) => !o.optional).length;

    for (let step = 0; step < 400; step++) {
      const st = await save();
      const s = st.session;
      if (!s || s.caseId !== def.id) throw new Fail("сессия дела пропала");
      if (s.phase === "debrief") {
        await page.getByTestId("debrief-calendar").waitFor();
        if (shots) await page.screenshot({ path: path.join(args.shotsDir, `debrief-${String(def.order).padStart(2, "0")}.png`), fullPage: false });
        return { stars: s.debrief?.stars, queries: s.queries, ms: Date.now() - t0, flags: s.flags };
      }
      const flags = { ...s.baseFlags, ...s.flags };

      // Ночь между делами: Esc — к карточке, дождаться «К делу» (дело собрано) и нажать
      if (s.phase === "night") {
        await page.getByTestId("night-screen").waitFor({ timeout: 30_000 });
        if (shots) await page.screenshot({ path: path.join(args.shotsDir, `night-${String(def.order).padStart(2, "0")}.png`) });
        caseLog.push("ночь: пропустить");
        await page.getByTestId("night-screen").press("Escape");
        const start = page.locator('[data-testid="night-start"]:not([disabled])');
        await start.waitFor({ timeout: 60_000 });
        await start.click();
        await waitState((x) => x.session?.phase !== "night", "конец ночи", 30_000);
        continue;
      }

      // Дело ещё открывается: сессия уже есть, вступительная сцена — ещё нет
      if (s.phase === "intro" && !s.stage && !s.interrogation) {
        await waitState((x) => x.session?.phase !== "intro" || Boolean(x.session?.stage), "вступительная сцена", 60_000);
        continue;
      }

      if (s.stage) {
        await playStage(def, s, st);
        continue;
      }
      if (s.interrogation && !stuck.has(s.interrogation.sceneId)) {
        if ((await interrogate(def, s, st, stuck)) === "stuck") continue;
        continue;
      }
      if (s.interrogation && (await visible('[data-testid="interrogation"]'))) await page.getByTestId("interrogation-leave").click();

      // на столе: приобщить строки последнего результата
      if (pendingPin) {
        if ((await pinFromGrid(def, pendingPin.sql, pendingPin.extra)) === null) {
          await sleep(200);
          continue;
        }
        pendingPin = null;
        stuck.clear();
        continue;
      }
      if (shots && !deskShot && s.completed.length >= Math.ceil(mains0 / 2)) {
        await centerTab("query");
        await page.screenshot({ path: path.join(args.shotsDir, `desk-${String(def.order).padStart(2, "0")}.png`) });
        deskShot = true;
      }

      // застрявший допрос: строки для него, затем эталоны ещё раз
      if (s.interrogation && stuck.has(s.interrogation.sceneId)) {
        const { sceneId, state } = s.interrogation;
        const open = def.scenes.find((x) => x.id === sceneId).interrogation.points.filter((p) => p.present && !state.broken.includes(p.line));
        const extra = open.flatMap((p) => CARD_SQL[p.line] ?? []).filter((q) => !ranExtra.has(q));
        const preds = open.flatMap((p) => p.present.cards ?? []);
        if (extra.length) {
          const sql = extra[0];
          ranExtra.add(sql);
          caseLog.push(`запрос для допроса: ${sql}`);
          await runSql(sql);
          pendingPin = { sql, extra: preds };
          continue;
        }
        if (!resweep.has(sceneId)) {
          resweep.add(sceneId);
          for (const o of def.objectives.filter((x) => s.completed.includes(x.id) && /^\s*(select|with)\b/i.test(x.solution))) {
            await runSql(o.solution);
            if ((await pinFromGrid(def, o.solution, preds)) === null) break;
          }
          stuck.clear();
          continue;
        }
      }

      // задачи: основная и дополнительные (порядок — как в season-playthrough.test.ts)
      const mains = def.objectives.filter((o) => !o.optional && flagsMatch(o.when, flags)).sort((a, b) => a.order - b.order);
      const active = mains.find((o) => !s.completed.includes(o.id)) ?? null;
      const doneOrder = (n) => mains.some((m) => m.order === n && s.completed.includes(m.id));
      const eligible = (o) =>
        o.order < 10 ? !active || o.order < active.order : o.order < 90 ? doneOrder(Math.floor(o.order / 10)) || !active : !active || active === mains[mains.length - 1];
      const optional = def.objectives
        .filter((o) => o.optional && flagsMatch(o.when, flags) && !s.completed.includes(o.id) && eligible(o))
        .filter((o) => (optTries.get(o.id)?.n ?? 0) < 3 && (optTries.get(o.id)?.scenes ?? -1) < s.endedScenes.length)
        .sort((a, b) => a.order - b.order);
      const mainReady = active && active.validation.type !== "slot" && (mainTries.get(active.id) ?? 0) < 2 ? active : null;
      const target = optional[0] ?? mainReady;
      if (target) {
        if (target.optional) optTries.set(target.id, { n: (optTries.get(target.id)?.n ?? 0) + 1, scenes: s.endedScenes.length });
        else mainTries.set(target.id, (mainTries.get(target.id) ?? 0) + 1);
        const pinSql = (PIN_SQL[target.id] ?? []).find((q) => !ranExtra.has(q));
        if (pinSql) {
          // строки для доски — по одной за ход: запрос может запустить сцену
          if (!target.optional) mainTries.set(target.id, (mainTries.get(target.id) ?? 1) - 1);
          ranExtra.add(pinSql);
          caseLog.push(`запрос для доски: ${pinSql}`);
          await runSql(pinSql);
          pendingPin = { sql: pinSql, extra: [] };
          continue;
        }
        if (target.prediction && !s.predictions[target.id] && target === active) {
          await centerTab("query");
          const opt = page.locator(`[data-testid="prediction-option"][data-value="${target.prediction.answer}"]`);
          if (await opt.isVisible().catch(() => false)) {
            await opt.click();
            await waitState((x) => Boolean(x.session?.predictions?.[target.id]), `предсказание ${target.id}`, 10_000);
            caseLog.push(`предсказание ${target.id}: ${target.prediction.answer}`);
          }
        }
        const after = await runSql(target.solution);
        const ok = after.completed.includes(target.id);
        caseLog.push(`${ok ? "засчитана" : "НЕ засчитана"} ${target.id}`);
        if (!ok && !target.optional && (mainTries.get(target.id) ?? 0) >= 2 && !PIN_SQL[target.id]) {
          throw new Fail(`эталон ${target.id} не засчитан`);
        }
        pendingPin = { sql: target.solution, extra: [] };
        stuck.clear();
        continue;
      }

      // обвинения
      const acc = (def.accusations ?? []).find((a) => !s.accusations[a.id]?.accepted && (s.accusations[a.id]?.attempts ?? 0) < 2);
      if (acc) {
        const enough = s.pins.filter((c) => isSourceCard(c) && cardHasKey(c, acc.keys)).length >= (acc.minCards ?? 2);
        const extra = enough ? [] : (ACCUSE_SQL[acc.id] ?? []).filter((q) => !ranExtra.has(q));
        if (extra.length) {
          ranExtra.add(extra[0]);
          caseLog.push(`запрос для обвинения: ${extra[0]}`);
          await runSql(extra[0]);
          pendingPin = { sql: extra[0], extra: [] };
          continue;
        }
        await accuse(def, acc);
        continue;
      }

      // заключение
      if (def.protocol && s.closingScene === null) {
        await fillProtocol(def, s);
        continue;
      }

      throw new Fail(`застряли: активная задача ${active?.id ?? "—"}, допрос ${s.interrogation?.sceneId ?? "—"}, closing ${s.closingScene}`);
    }
    throw new Fail("слишком много шагов");
  }

  // --- сезон ---
  const first = wanted[0];
  const snapshot = first > 0 ? path.join(args.shotsDir, `state-after-${String(first - 1).padStart(2, "0")}.json`) : null;
  const restore = snapshot && fs.existsSync(snapshot) ? fs.readFileSync(snapshot, "utf8") : null;
  const order = restore ? wanted : Array.from({ length: wanted[wanted.length - 1] + 1 }, (_, i) => i);
  if (snapshot && !restore) log(`нет ${path.basename(snapshot)} — дела до ${first} проходятся заново`);

  let failed = false;
  try {
    await titleFlow(restore);
    log(restore ? `восстановлено ${path.basename(snapshot)}` : "запуск пройден: 18+, холодное открытие, вход");
    for (const n of order) {
      const def = cases.find((c) => c.order === n);
      const t0 = Date.now();
      let entry;
      try {
        const res = await playCase(def, wanted.includes(n));
        const st = await save();
        const solved = Boolean(st.season.solved[def.id]);
        entry = { id: def.id, solved, ...res, log: caseLog };
        await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY).then((raw) => fs.writeFileSync(path.join(args.shotsDir, `state-after-${String(n).padStart(2, "0")}.json`), raw));
        log(`${def.id}: ${solved ? "РАСКРЫТО" : "НЕ раскрыто"}, ★${res.stars}, запросов ${res.queries}, ${Math.round((Date.now() - t0) / 1000)} с`);
        if (!solved) failed = true;
      } catch (e) {
        failed = true;
        const shot = path.join(args.shotsDir, `fail-${String(n).padStart(2, "0")}.png`);
        await page.screenshot({ path: shot }).catch(() => {});
        const s = await session().catch(() => null);
        const where = s && {
          phase: s.phase,
          stage: s.stage,
          queue: s.queue,
          interrogation: s.interrogation?.sceneId ?? null,
          closingScene: s.closingScene,
          completed: s.completed,
          endedScenes: s.endedScenes,
        };
        entry = { id: def.id, solved: false, error: e instanceof Error ? e.message : String(e), log: caseLog, shot, session: where };
        log(`${def.id}: ОШИБКА — ${entry.error}\n  ${caseLog.slice(-12).join("\n  ")}`);
      }
      report.cases.push(entry);
      if (!entry.solved) break;
    }
    const st = await save();
    report.ending = st?.season?.ending?.id ?? null;
    if (report.ending && (await visible('[data-testid="debrief-ending"]'))) {
      await page.getByTestId("debrief-ending").click();
      await page.getByTestId("ending-calendar").waitFor();
      await page.screenshot({ path: path.join(args.shotsDir, "ending.png") });
    }
  } finally {
    report.finished = new Date().toISOString();
    fs.writeFileSync(path.join(args.shotsDir, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
  }

  const errs = consoleErrors.length;
  log(`итог: ${report.cases.filter((c) => c.solved).length}/${order.length} дел раскрыто, ошибок консоли ${errs}${report.ending ? `, концовка ${report.ending}` : ""}`);
  for (const e of consoleErrors.slice(0, 20)) log(`  консоль [${e.case}]: ${e.text}`);
  process.exit(failed || errs > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
