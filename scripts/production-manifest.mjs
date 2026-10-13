#!/usr/bin/env node
/**
 * Собирает производственные манифесты из игрового контента и арт-канона:
 *   docs/production/voice-lines.csv       — все реплики (id = имя аудиофайла) + пресет обработки (fx), пауза в начале (head_ms), готов ли файл (exists)
 *   docs/production/voice-master.tsv      — план мастеринга для bash: id, говорящий, fx, head_ms
 *   docs/production/voice-by-character.md — сценарий записи, сгруппированный по персонажам
 *   docs/production/portraits.csv         — все файлы портретов по слотам GAME_DESIGN §11.1 (эмоции + варианты `<emotion>_outdoor`)
 *   docs/production/backgrounds.csv       — фоны и ключевые картины (public/backgrounds/<id>.webp)
 *   docs/production/prompts.csv           — промпты для генерации всех изображений (scripts/art-prompts.mjs)
 *   docs/production/ART_BIBLE.md          — обновляется блок промптов между маркерами
 *   docs/production/VOICE_BIBLE.md        — обновляются таблицы словаря ударений и настроек TTS между маркерами
 *
 * Запуск: npm run manifest
 * Источники: src/data/characters.json, src/data/cases/<case>/{case,script}.json, scripts/art-prompts.mjs.
 * Если контента ещё нет, манифест всё равно пишет канонические списки портретов и фонов.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAST, LOCATIONS, PORTRAIT, BACKGROUND, TITLE, portraitSlots, backgroundFile, writeArtOutputs } from "./art-prompts.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "src", "data");
const casesDir = join(dataDir, "cases");
const outDir = join(root, "docs", "production");

/** EMOTIONS из src/types/story.ts (GAME_DESIGN §11.1) — для проверки опечаток в сценариях */
const EMOTIONS = new Set([
  "neutral", "happy", "sad", "angry", "scared", "surprised", "smug", "thinking", "tired", "hurt",
  "uneasy", "ashamed", "broken", "cold", "shaken", "determined", "lie",
]);
/** Говорящие без портрета: МИРА — голос и строка состояния (§2.13), рассказчик и игрок — текст */
const NO_PORTRAIT = new Set(["mira", "narrator", "player"]);
const NOT_VOICED = new Set(["narrator", "player"]);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const csvCell = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvRow = (cells) => cells.map(csvCell).join(",");
const writeCsv = (name, rows) => writeFileSync(join(outDir, name), "\uFEFF" + rows.join("\n") + "\n");
const warnings = [];

// ─── Каст ───────────────────────────────────────────────────────────────────

const charactersPath = join(dataDir, "characters.json");
const characters = existsSync(charactersPath) ? readJson(charactersPath) : [];
if (!characters.length) warnings.push("src/data/characters.json не найден или пуст — имена и слоты взяты из канона scripts/art-prompts.mjs");
const byId = new Map(characters.map((c) => [c.id, c]));
const canonById = new Map(CAST.map((c) => [c.id, c]));
const speakerName = (id) =>
  id === "narrator" ? "Рассказчик" : id === "player" ? "Игрок (Ноль)" : byId.get(id)?.name ?? canonById.get(id)?.name ?? id;

// ─── Сценарии ───────────────────────────────────────────────────────────────

const caseDirs = existsSync(casesDir)
  ? readdirSync(casesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : [];

/** Пресет обработки голоса по ремарке (VOICE_BIBLE, разд. 6.4). Порядок важен: первое совпадение */
const FX_RULES = [
  ["voice_message", /голосов(ое|ом|ого)/i],
  ["radio", /рац(ия|ии|ию|ией)/i],
  ["phone", /телефон|звонок|в трубк|на линии|по связи/i],
  ["broadcast_tv", /телевиз|телеобращ|(^|[^А-Яа-яЁё])ТВ([^А-Яа-яЁё]|$)/i],
  ["broadcast_radio", /радио|в эфире|дебаты/i],
  ["glass", /за стеклом/i],
  ["dictaphone", /диктофон/i],
];
const fxFor = (line) => {
  if (line.id.startsWith("note.")) return "dictaphone";
  const direction = line.direction ?? "";
  for (const [fx, re] of FX_RULES) if (re.test(direction)) return fx;
  return "dry";
};
/** Тик лжи Ратникова — полсекундная пауза перед ответом (§2.1): голова файла 600 мс вместо 100 */
const headMsFor = (line) => (line.lie || /ложь/i.test(line.direction ?? "") ? 600 : 100);
const voicedLinesOf = (list) => list.filter((l) => !NOT_VOICED.has(l.speaker));

const canonSlots = portraitSlots();
const hasSlot = (characterId, slot) =>
  canonSlots.some((s) => s.character === characterId && s.slot === slot) ||
  (byId.get(characterId)?.emotions ?? []).includes(slot) ||
  Object.entries(byId.get(characterId)?.variants ?? {}).some(([v, list]) => list.some((e) => `${e}_${v}` === slot));
const baseEmotion = (characterId) => byId.get(characterId)?.emotions?.[0] ?? "neutral";

const lines = [];
const usedSlots = new Map(); // characterId -> Map<slot, firstLineId>
const usedLocations = new Map(); // locationId -> first case
const markUsed = (characterId, emotion, outdoor, where) => {
  if (NO_PORTRAIT.has(characterId)) return;
  if (!EMOTIONS.has(emotion)) warnings.push(`${where}: эмоция «${emotion}» не входит в EMOTIONS (§11.1)`);
  const slot = outdoor && hasSlot(characterId, `${emotion}_outdoor`) ? `${emotion}_outdoor` : emotion;
  if (!hasSlot(characterId, slot)) warnings.push(`${where}: у ${characterId} нет слота «${slot}» — в игре сработает запасной neutral`);
  const map = usedSlots.get(characterId) ?? new Map();
  if (!map.has(slot)) map.set(slot, where);
  usedSlots.set(characterId, map);
};

for (const caseDir of caseDirs) {
  const scriptPath = join(casesDir, caseDir, "script.json");
  if (!existsSync(scriptPath)) continue;
  const casePath = join(casesDir, caseDir, "case.json");
  const meta = existsSync(casePath) ? readJson(casePath) : { id: caseDir, title: caseDir };
  const script = readJson(scriptPath);
  for (const scene of script.scenes ?? []) {
    if (scene.location) {
      if (/^[a-z0-9_]+$/.test(scene.location)) {
        if (!usedLocations.has(scene.location)) usedLocations.set(scene.location, meta.id);
      } else {
        warnings.push(`${meta.id}/${scene.id}: location «${scene.location}» — подпись, а не id фона (ожидается snake_case из backgrounds.csv)`);
      }
    }
    for (const line of scene.lines ?? []) {
      lines.push({ caseId: meta.id, caseTitle: meta.title, sceneId: scene.id, ...line });
      if (byId.has(line.speaker) || canonById.has(line.speaker)) {
        markUsed(line.speaker, line.emotion ?? baseEmotion(line.speaker), Boolean(scene.outdoor), line.id);
      }
    }
    const interrogation = scene.interrogation;
    if (interrogation?.suspect) {
      for (const emotion of interrogation.breakSteps ?? []) {
        markUsed(interrogation.suspect, emotion, Boolean(scene.outdoor), `${meta.id}/${scene.id} (breakSteps)`);
      }
    }
  }
}

mkdirSync(outDir, { recursive: true });

// ─── voice-lines.csv ────────────────────────────────────────────────────────

const voiceExists = (l) => existsSync(join(root, "public", "voice", `${l.id}.mp3`));
writeCsv("voice-lines.csv", [
  csvRow(["id", "file", "case", "scene", "speaker", "speaker_name", "emotion", "text", "direction", "chars", "fx", "head_ms", "exists"]),
  ...lines.map((l) =>
    csvRow([
      l.id,
      `public/voice/${l.id}.mp3`,
      l.caseId,
      l.sceneId,
      l.speaker,
      speakerName(l.speaker),
      l.emotion ?? "neutral",
      l.text,
      l.direction ?? "",
      l.text.length,
      NOT_VOICED.has(l.speaker) ? "" : fxFor(l),
      NOT_VOICED.has(l.speaker) ? "" : headMsFor(l),
      NOT_VOICED.has(l.speaker) ? "" : voiceExists(l) ? "yes" : "no",
    ])
  ),
]);

// voice-master.tsv — план мастеринга для bash-цикла (VOICE_BIBLE, разд. 6.5): id, говорящий, пресет, пауза в начале
writeFileSync(
  join(outDir, "voice-master.tsv"),
  ["id\tspeaker\tfx\thead_ms", ...voicedLinesOf(lines).map((l) => [l.id, l.speaker, fxFor(l), headMsFor(l)].join("\t"))].join("\n") + "\n"
);

// ─── voice-by-character.md ──────────────────────────────────────────────────

const bySpeaker = new Map();
for (const l of lines) {
  const list = bySpeaker.get(l.speaker) ?? [];
  list.push(l);
  bySpeaker.set(l.speaker, list);
}
const speakerOrder = [...bySpeaker.keys()].sort((a, b) => bySpeaker.get(b).length - bySpeaker.get(a).length);
const voicedLines = voicedLinesOf(lines);
let md = "# Сценарий озвучки по персонажам\n\n";
md += "> Сгенерировано `npm run manifest` из игрового контента. Не редактируйте вручную — правьте `script.json` кейсов.\n";
md += "> Кастинг, настройки TTS, словарь ударений и спецификация звука — в `docs/production/VOICE_BIBLE.md`.\n\n";
md += `Всего реплик: **${lines.length}**, к озвучке: **${voicedLines.length}**, символов к озвучке: **${voicedLines.reduce((s, l) => s + l.text.length, 0)}**.\n\n`;
md += "| Персонаж | Реплик | Символов |\n|---|---:|---:|\n";
for (const id of speakerOrder) {
  const list = bySpeaker.get(id);
  const mark = NOT_VOICED.has(id) ? " — не озвучивается" : "";
  md += `| ${speakerName(id)} (\`${id}\`)${mark} | ${list.length} | ${list.reduce((s, l) => s + l.text.length, 0)} |\n`;
}
for (const id of speakerOrder) {
  if (NOT_VOICED.has(id)) continue;
  const ch = byId.get(id);
  md += `\n## ${speakerName(id)} — \`${id}\`\n\n`;
  if (ch?.voice) md += `**Голос:** ${ch.voice}\n\n`;
  md += "| Файл | Эмоция | Реплика | Ремарка | Обработка |\n|---|---|---|---|---|\n";
  for (const l of bySpeaker.get(id)) {
    const text = l.text.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const dir = (l.direction ?? "").replace(/\|/g, "\\|");
    md += `| \`${l.id}.mp3\` | ${l.emotion ?? "neutral"} | ${text} | ${dir} | ${fxFor(l)}${headMsFor(l) > 100 ? ", пауза 600 мс" : ""} |\n`;
  }
}
writeFileSync(join(outDir, "voice-by-character.md"), md);

// ─── portraits.csv ──────────────────────────────────────────────────────────

const portraitList = []; // { character, name, slot, tier, canon }
const seen = new Set();
const addPortrait = (character, slot, canon, tier = "") => {
  const key = `${character}/${slot}`;
  if (seen.has(key) || NO_PORTRAIT.has(character)) return;
  seen.add(key);
  portraitList.push({ character, name: speakerName(character), slot, canon, tier });
};
for (const s of canonSlots) addPortrait(s.character, s.slot, true, s.rank ? `${s.tier} №${s.rank}` : s.tier);
for (const ch of characters) {
  for (const emotion of ch.emotions ?? []) addPortrait(ch.id, emotion, false);
  for (const [variant, list] of Object.entries(ch.variants ?? {})) for (const emotion of list) addPortrait(ch.id, `${emotion}_${variant}`, false);
}
for (const [character, slots] of usedSlots) for (const slot of slots.keys()) addPortrait(character, slot, false);

const portraitRows = [csvRow(["character", "name", "emotion", "variant", "file", "used_in_script", "canon", "tier", "export_px", "exists"])];
let portraitsDone = 0;
for (const p of portraitList) {
  const file = `public/portraits/${p.character}/${p.slot}.webp`;
  const exists = existsSync(join(root, file));
  if (exists) portraitsDone += 1;
  const [emotion, variant = ""] = p.slot.split(/_(?=outdoor$)/);
  portraitRows.push(
    csvRow([
      p.character,
      p.name,
      emotion,
      variant,
      file,
      usedSlots.get(p.character)?.has(p.slot) ? "yes" : "no",
      p.canon ? "yes" : "no (нет в §11.1)",
      p.tier,
      PORTRAIT.export.join("x"),
      exists ? "yes" : "no",
    ])
  );
}
writeCsv("portraits.csv", portraitRows);

// ─── backgrounds.csv ────────────────────────────────────────────────────────

const backgroundRows = [csvRow(["id", "name", "file", "export_px", "tier", "used_in_script", "canon", "exists"])];
let backgroundsDone = 0;
const canonLocationIds = new Set(LOCATIONS.map((l) => l.id));
const backgroundEntries = [
  ...LOCATIONS.map((l) => ({ id: l.id, name: l.name, file: backgroundFile(l), px: (l.title ? TITLE.export : BACKGROUND.export).join("x"), tier: l.rank ? `${l.tier} №${l.rank}` : l.tier, canon: true })),
  ...[...usedLocations.keys()].filter((id) => !canonLocationIds.has(id)).map((id) => ({ id, name: id, file: `public/backgrounds/${id}.webp`, px: BACKGROUND.export.join("x"), tier: "", canon: false })),
];
for (const b of backgroundEntries) {
  const exists = existsSync(join(root, b.file));
  if (exists) backgroundsDone += 1;
  if (!b.canon) warnings.push(`фон «${b.id}» используется в сценарии (${usedLocations.get(b.id)}), но его нет в каноне LOCATIONS`);
  backgroundRows.push(csvRow([b.id, b.name, b.file, b.px, b.tier, usedLocations.has(b.id) ? "yes" : "no", b.canon ? "yes" : "no", exists ? "yes" : "no"]));
}
writeCsv("backgrounds.csv", backgroundRows);

// ─── prompts.csv + ART_BIBLE ────────────────────────────────────────────────

const promptCount = writeArtOutputs();

// ─── VOICE_BIBLE: таблицы из pronunciation.json и tts-voices.example.json ────

/** Заменяет содержимое между <!-- name:begin --> и <!-- name:end --> */
function replaceBlock(path, name, content) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  const begin = `<!-- ${name}:begin -->`;
  const end = `<!-- ${name}:end -->`;
  const a = text.indexOf(begin);
  const b = text.indexOf(end);
  if (a === -1 || b < a) {
    warnings.push(`${path.replace(root + "/", "")}: нет маркеров ${begin} … ${end}`);
    return;
  }
  const next = text.slice(0, a + begin.length) + "\n" + content + text.slice(b);
  if (next !== text) writeFileSync(path, next);
}
const mdCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const voiceBible = join(outDir, "VOICE_BIBLE.md");
const generatedNote = "<!-- Сгенерировано npm run manifest. Правьте исходный JSON, а не таблицу. -->\n\n";

const dictPath = join(outDir, "pronunciation.json");
if (existsSync(dictPath)) {
  const { entries = [] } = readJson(dictPath);
  const modeRu = { stem: "основа", word: "слово", phrase: "сочетание" };
  let table = generatedNote;
  for (const group of [...new Set(entries.map((e) => e.group))]) {
    table += `**${group}**\n\n| Пишется | Говорится | Правило | Примечание |\n|---|---|---|---|\n`;
    for (const e of entries.filter((x) => x.group === group)) {
      table += `| ${mdCell(e.match)} | ${mdCell(e.say)} | ${modeRu[e.mode] ?? e.mode}${e.ci ? ", любой регистр" : ""} | ${mdCell(e.note)} |\n`;
    }
    table += "\n";
  }
  replaceBlock(voiceBible, "pronunciation", table);
}

const voicesExample = join(outDir, "tts-voices.example.json");
if (existsSync(voicesExample)) {
  const { defaults = {}, speakers = {} } = readJson(voicesExample);
  const vs = (s) => ({ ...(defaults.voice_settings ?? {}), ...(s.voice_settings ?? {}) });
  let table = generatedNote;
  table += `Модель по умолчанию: \`${defaults.model_id}\`, формат сырья: \`${defaults.output_format}\`, ударения: \`${defaults.stress}\`, контекст соседних реплик: ${defaults.context ? "да" : "нет"}.\n\n`;
  table += "| Голос | stability | similarity_boost | style | speaker_boost | speed | Проба (preview_text) |\n|---|---:|---:|---:|---|---:|---|\n";
  for (const [id, s] of Object.entries(speakers)) {
    const v = vs(s);
    table += `| \`${id}\` | ${v.stability} | ${v.similarity_boost} | ${v.style} | ${v.use_speaker_boost ? "вкл" : "выкл"} | ${v.speed} | ${mdCell(s.preview_text)} |\n`;
  }
  table += "\n**Промпты Voice Design (EN):**\n\n";
  for (const [id, s] of Object.entries(speakers)) table += `- \`${id}\`: ${mdCell(s.design_prompt)}\n`;
  replaceBlock(voiceBible, "tts-settings", table + "\n");
}

for (const w of [...new Set(warnings)]) console.warn(`[manifest] внимание: ${w}`);
console.log(
  `[manifest] ${lines.length} реплик (${voicedLines.length} к озвучке), ${speakerOrder.length} говорящих; ` +
    `портретов ${portraitList.length} (готово ${portraitsDone}); фонов ${backgroundEntries.length} (готово ${backgroundsDone}); ` +
    `промптов ${promptCount} → docs/production/`
);
