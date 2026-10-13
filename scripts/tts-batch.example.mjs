#!/usr/bin/env node
/**
 * ПРИМЕР пакетной озвучки ZeroSQL «Полынья» через HTTP API TTS (по умолчанию ElevenLabs).
 *
 *   ⚠ Это пример для адаптации, а не часть сборки: его не вызывает ни `npm run build`, ни тесты,
 *     ни `npm run manifest`. Запускается только вручную. Тратит платные символы TTS.
 *
 * Что делает:
 *   1. читает docs/production/voice-lines.csv (его пишет `npm run manifest`);
 *   2. берёт голос и настройки персонажа из docs/production/tts-voices.json
 *      (скопируйте docs/production/tts-voices.example.json и впишите свои voice_id);
 *   3. ставит ударения по docs/production/pronunciation.json (только в тексте для TTS, не в субтитрах);
 *   4. на каждую реплику делает один запрос и пишет сырой файл <out>/<lineId>.mp3 (или .wav для pcm_*);
 *   5. пропускает уже готовые файлы, держит паузу между запросами, повторяет при 429/5xx с отступом;
 *   6. ведёт журнал <out>/_tts-log.csv (seed, request-id, байты) — чтобы перегенерировать дубль точно.
 *
 * Сырые файлы — НЕ финал: дальше мастеринг (громкость, тишина, обработка рации/телефона) по
 * VOICE_BIBLE.md, разд. 6, и только потом public/voice/<lineId>.mp3. Папку --out не коммитьте.
 *
 * Ключ API — только из переменной окружения (имя задано в tts-voices.json → api.key_env,
 * по умолчанию ELEVENLABS_API_KEY). В коде и в файлах ключа нет и быть не должно.
 *
 * Примеры:
 *   node scripts/tts-batch.example.mjs --dry-run --limit 5
 *   ELEVENLABS_API_KEY=… node scripts/tts-batch.example.mjs --only ratnikov,dasha --case case-00-nulevoy-etazh
 *   ELEVENLABS_API_KEY=… node scripts/tts-batch.example.mjs --ids c03.int_burtsev.002 --take 2 --force
 *
 * Требуется Node 18+ (встроенный fetch). Проверьте актуальную документацию API перед запуском:
 * имена моделей, форматы вывода и поля тела запроса у провайдеров меняются.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { values: opt } = parseArgs({
  options: {
    csv: { type: "string", default: "docs/production/voice-lines.csv" },
    voices: { type: "string", default: "docs/production/tts-voices.json" },
    dict: { type: "string", default: "docs/production/pronunciation.json" },
    out: { type: "string", default: "voice-raw" },
    only: { type: "string" }, // ratnikov,dasha
    ids: { type: "string" }, // c00.desk.011,c03.int_burtsev.002
    case: { type: "string" }, // case-03-polyarnaya
    limit: { type: "string" },
    take: { type: "string", default: "1" }, // номер дубля: меняет seed
    stress: { type: "string" }, // acute | plus | caps | none
    delay: { type: "string" },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "v3-tags": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (opt.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}

const dryRun = opt["dry-run"];
const fromRoot = (p) => resolve(root, p);
const fail = (message) => {
  console.error(`[tts] ${message}`);
  process.exit(1);
};

// ─── CSV ────────────────────────────────────────────────────────────────────

/** Разбор CSV по RFC 4180: кавычки, запятые и переводы строк внутри ячеек, BOM */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// ─── Словарь ударений ───────────────────────────────────────────────────────

const ACUTE = "́";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compileDictionary(path) {
  if (!existsSync(path)) {
    console.warn(`[tts] словарь ${path} не найден — ударения не ставятся`);
    return [];
  }
  const { entries = [] } = JSON.parse(readFileSync(path, "utf8"));
  return entries
    .slice()
    .sort((a, b) => b.match.length - a.match.length)
    .map((e) => {
      const head = "(?<![\\p{L}\\p{M}\\p{N}_.])";
      const tail = e.mode === "stem" ? "" : "(?![\\p{L}\\p{M}\\p{N}_])";
      return { ...e, re: new RegExp(head + escapeRe(e.match) + tail, "gu" + (e.ci ? "i" : "")) };
    });
}

function applyDictionary(text, dict) {
  let out = text;
  for (const e of dict) {
    // ci-запись сохраняет заглавную первую букву кириллического слова: «Полынья» → «Полынья́»
    out = out.replace(e.re, (m) =>
      e.ci && /^\p{Lu}/u.test(m) && /^\p{Script=Cyrillic}/u.test(m) ? e.say[0].toUpperCase() + e.say.slice(1) : e.say
    );
  }
  // имя таблицы, которого нет в словаре: без этого TTS читает «нижнее подчёркивание» вслух
  return out.replace(/(?<=[\p{L}\p{N}])_(?=[\p{L}\p{N}])/gu, " ");
}

/** acute — как есть (U+0301); plus — «+» перед ударной гласной (Yandex SpeechKit, Silero); caps — ударная гласная заглавной; none — без знаков */
function renderStress(text, mode) {
  const re = new RegExp(`([аеиоуыэюяАЕИОУЫЭЮЯ])${ACUTE}`, "g");
  if (mode === "plus") return text.replace(re, "+$1");
  if (mode === "caps") return text.replace(re, (_, v) => v.toUpperCase());
  if (mode === "none") return text.replaceAll(ACUTE, "");
  return text;
}

/** Ремарка → аудиотег eleven_v3 (только с --v3-tags). Список тегов сверяйте с документацией v3 */
const V3_TAGS = [
  [/шёпот|шепот/i, "[whispers]"],
  [/вздох/i, "[sighs]"],
  [/выдох/i, "[exhales]"],
  [/смешок|смеётся|смех/i, "[chuckles]"],
  [/плач|сквозь слёзы|рыда/i, "[crying]"],
  [/ирони|язвит|сарказм/i, "[sarcastic]"],
];
const v3Prefix = (direction) => V3_TAGS.filter(([re]) => re.test(direction)).map(([, tag]) => tag).join(" ");

// ─── Прочее ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** FNV-1a: детерминированный seed из id реплики и номера дубля */
function seedFor(id, take) {
  let h = 0x811c9dc5;
  for (const ch of `${id}#${take}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
/** pcm_* у ElevenLabs — сырой s16le моно без заголовка; оборачиваем в WAV */
function wavFromPcm(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // моно
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
const csvCell = (v) => {
  const t = String(v ?? "");
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

async function synthesize({ baseUrl, apiKey, voiceId, outputFormat, body }) {
  const url = `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { audio: Buffer.from(await res.arrayBuffer()), requestId: res.headers.get("request-id") ?? "" };
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 1000 * 2 ** attempt);
      console.warn(`[tts]   HTTP ${res.status}, повтор через ${Math.round(wait / 1000)} с (попытка ${attempt})`);
      await sleep(wait);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error("сдаюсь после 6 попыток (429/5xx)");
}

// ─── Основной проход ────────────────────────────────────────────────────────

const csvPath = fromRoot(opt.csv);
if (!existsSync(csvPath)) fail(`нет ${opt.csv}. Сначала: npm run manifest`);

let voicesPath = fromRoot(opt.voices);
if (!existsSync(voicesPath)) {
  const example = fromRoot("docs/production/tts-voices.example.json");
  if (!dryRun) fail(`нет ${opt.voices}. Скопируйте docs/production/tts-voices.example.json и впишите voice_id (или запустите с --dry-run)`);
  console.warn(`[tts] ${opt.voices} нет — для пробного прогона беру пример`);
  voicesPath = example;
}
const config = JSON.parse(readFileSync(voicesPath, "utf8"));
const defaults = config.defaults ?? {};
const skipSpeakers = new Set(config.skip_speakers ?? ["narrator", "player"]);
const stressMode = opt.stress ?? defaults.stress ?? "acute";
const delayMs = Number(opt.delay ?? defaults.delay_ms ?? 700);
const take = Number(opt.take) || 1;
const dict = compileDictionary(fromRoot(opt.dict));

const keyEnv = config.api?.key_env ?? "ELEVENLABS_API_KEY";
const apiKey = process.env[keyEnv];
if (!dryRun && !apiKey) fail(`нет ключа: задайте переменную окружения ${keyEnv}`);
const baseUrl = (config.api?.base_url ?? "https://api.elevenlabs.io").replace(/\/+$/, "");

const allLines = parseCsv(readFileSync(csvPath, "utf8"));
const only = opt.only ? new Set(opt.only.split(",").map((s) => s.trim())) : null;
const ids = opt.ids ? new Set(opt.ids.split(",").map((s) => s.trim())) : null;

// Соседние реплики сцены — контекст интонации (previous_text / next_text)
const sceneKey = (l) => `${l.case}/${l.scene}`;
const byScene = new Map();
for (const l of allLines) {
  if (skipSpeakers.has(l.speaker)) continue;
  const list = byScene.get(sceneKey(l)) ?? [];
  list.push(l);
  byScene.set(sceneKey(l), list);
}

let queue = allLines.filter(
  (l) =>
    !skipSpeakers.has(l.speaker) &&
    (!only || only.has(l.speaker)) &&
    (!ids || ids.has(l.id)) &&
    (!opt.case || l.case === opt.case)
);
if (opt.limit) queue = queue.slice(0, Number(opt.limit));

const outDir = fromRoot(opt.out);
const logPath = join(outDir, "_tts-log.csv");
if (!dryRun) {
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(logPath)) writeFileSync(logPath, "time,id,speaker,voice_id,model_id,seed,take,request_id,bytes,file\n");
}

let stop = false;
process.on("SIGINT", () => {
  if (stop) process.exit(130);
  stop = true;
  console.warn("\n[tts] остановка после текущей реплики (Ctrl+C ещё раз — сразу)");
});

const missingVoice = new Set();
let done = 0;
let skipped = 0;
let failed = 0;

console.log(`[tts] реплик к обработке: ${queue.length}${dryRun ? " (пробный прогон, без запросов)" : ""}; ударения: ${stressMode}; пауза ${delayMs} мс`);

for (const line of queue) {
  if (stop) break;
  const speaker = config.speakers?.[line.speaker];
  if (!speaker?.voice_id || (!dryRun && speaker.voice_id.startsWith("REPLACE"))) {
    if (!missingVoice.has(line.speaker)) console.warn(`[tts] у «${line.speaker}» нет voice_id в ${opt.voices} — его реплики пропускаются`);
    missingVoice.add(line.speaker);
    skipped += 1;
    continue;
  }

  const model = speaker.model_id ?? defaults.model_id ?? "eleven_multilingual_v2";
  const outputFormat = speaker.output_format ?? defaults.output_format ?? "mp3_44100_192";
  const ext = outputFormat.startsWith("pcm_") ? "wav" : outputFormat.startsWith("mp3_") ? "mp3" : "bin";
  const file = join(outDir, `${line.id}.${ext}`);
  if (!opt.force && existsSync(file) && statSync(file).size > 0) {
    skipped += 1;
    continue;
  }

  if (/\d/.test(line.text)) console.warn(`[tts] ${line.id}: в тексте есть цифры — по §11.3 числа пишутся словами`);
  if (line.text.length > 160) console.warn(`[tts] ${line.id}: ${line.text.length} знаков — больше 160 (§11.3)`);

  let text = renderStress(applyDictionary(line.text, dict), stressMode);
  if (opt["v3-tags"] && model.startsWith("eleven_v3")) {
    const tags = v3Prefix(line.direction ?? "");
    if (tags) text = `${tags} ${text}`;
  }

  const seed = seedFor(line.id, take);
  const body = {
    text,
    model_id: model,
    voice_settings: { ...(defaults.voice_settings ?? {}), ...(speaker.voice_settings ?? {}) },
    seed,
  };
  if (speaker.language_code ?? defaults.language_code) body.language_code = speaker.language_code ?? defaults.language_code;
  if (speaker.context ?? defaults.context) {
    const scene = byScene.get(sceneKey(line)) ?? [];
    const i = scene.findIndex((l) => l.id === line.id);
    const prev = scene[i - 1]?.text;
    const next = scene[i + 1]?.text;
    if (prev) body.previous_text = renderStress(applyDictionary(prev, dict), stressMode).slice(-300);
    if (next) body.next_text = renderStress(applyDictionary(next, dict), stressMode).slice(0, 300);
  }

  if (dryRun) {
    console.log(`— ${line.id} [${line.speaker}/${line.emotion}] seed ${seed}${line.direction ? `\n    ремарка: ${line.direction}` : ""}\n    TTS: ${text}`);
    done += 1;
    continue;
  }

  try {
    const { audio, requestId } = await synthesize({ baseUrl, apiKey, voiceId: speaker.voice_id, outputFormat, body });
    const data = ext === "wav" ? wavFromPcm(audio, Number(outputFormat.split("_")[1]) || 44100) : audio;
    writeFileSync(`${file}.part`, data);
    renameSync(`${file}.part`, file);
    appendFileSync(
      logPath,
      [new Date().toISOString(), line.id, line.speaker, speaker.voice_id, model, seed, take, requestId, data.length, file]
        .map(csvCell)
        .join(",") + "\n"
    );
    done += 1;
    console.log(`[tts] ✓ ${line.id} (${Math.round(data.length / 1024)} КБ)`);
  } catch (error) {
    failed += 1;
    console.error(`[tts] ✗ ${line.id}: ${error.message}`);
    if (/HTTP 40[13]/.test(error.message)) fail("ключ не принят или нет прав — останавливаюсь");
  }
  await sleep(delayMs);
}

console.log(`[tts] готово: ${done}, пропущено: ${skipped}, ошибок: ${failed}. Сырые файлы: ${opt.out}/ → мастеринг по VOICE_BIBLE.md, разд. 6`);
if (failed) process.exitCode = 1;
