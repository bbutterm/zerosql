#!/usr/bin/env node
/**
 * Собирает производственные манифесты из игрового контента:
 *   docs/production/voice-lines.csv      — все реплики (id = имя аудиофайла)
 *   docs/production/voice-by-character.md — сценарий записи, сгруппированный по персонажам
 *   docs/production/portraits.csv        — все нужные файлы портретов (персонаж × эмоция)
 *
 * Запуск: npm run manifest
 * Источник: src/data/characters.json и src/data/cases/<case>/script.json
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "src", "data");
const casesDir = join(dataDir, "cases");
const outDir = join(root, "docs", "production");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const csvCell = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvRow = (cells) => cells.map(csvCell).join(",");

const characters = readJson(join(dataDir, "characters.json"));
const byId = new Map(characters.map((c) => [c.id, c]));
const speakerName = (id) =>
  id === "narrator" ? "Рассказчик" : id === "player" ? "Игрок (аналитик)" : byId.get(id)?.name ?? id;

const caseDirs = readdirSync(casesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const lines = [];
const usedEmotions = new Map(); // characterId -> Set<emotion>
for (const caseDir of caseDirs) {
  const scriptPath = join(casesDir, caseDir, "script.json");
  if (!existsSync(scriptPath)) continue;
  const meta = readJson(join(casesDir, caseDir, "case.json"));
  const script = readJson(scriptPath);
  for (const scene of script.scenes) {
    for (const line of scene.lines) {
      lines.push({ caseId: meta.id, caseTitle: meta.title, sceneId: scene.id, ...line });
      if (byId.has(line.speaker)) {
        const set = usedEmotions.get(line.speaker) ?? new Set();
        set.add(line.emotion ?? byId.get(line.speaker).emotions[0]);
        usedEmotions.set(line.speaker, set);
      }
    }
  }
}

mkdirSync(outDir, { recursive: true });

// --- voice-lines.csv ---
const voiceCsv = [
  csvRow(["id", "file", "case", "scene", "speaker", "speaker_name", "emotion", "text", "direction", "chars"]),
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
    ])
  ),
].join("\n");
writeFileSync(join(outDir, "voice-lines.csv"), "﻿" + voiceCsv + "\n");

// --- voice-by-character.md ---
const bySpeaker = new Map();
for (const l of lines) {
  const list = bySpeaker.get(l.speaker) ?? [];
  list.push(l);
  bySpeaker.set(l.speaker, list);
}
const speakerOrder = [...bySpeaker.keys()].sort((a, b) => bySpeaker.get(b).length - bySpeaker.get(a).length);
let md = "# Сценарий озвучки по персонажам\n\n";
md += "> Сгенерировано `npm run manifest` из игрового контента. Не редактируйте вручную — правьте `script.json` кейсов.\n\n";
md += `Всего реплик: **${lines.length}**, символов: **${lines.reduce((s, l) => s + l.text.length, 0)}**.\n\n`;
md += "| Персонаж | Реплик | Символов |\n|---|---:|---:|\n";
for (const id of speakerOrder) {
  const list = bySpeaker.get(id);
  md += `| ${speakerName(id)} (\`${id}\`) | ${list.length} | ${list.reduce((s, l) => s + l.text.length, 0)} |\n`;
}
for (const id of speakerOrder) {
  const ch = byId.get(id);
  md += `\n## ${speakerName(id)} — \`${id}\`\n\n`;
  if (ch?.voice) md += `**Голос:** ${ch.voice}\n\n`;
  md += "| Файл | Эмоция | Реплика | Ремарка |\n|---|---|---|---|\n";
  for (const l of bySpeaker.get(id)) {
    const text = l.text.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const dir = (l.direction ?? "").replace(/\|/g, "\\|");
    md += `| \`${l.id}.mp3\` | ${l.emotion ?? "neutral"} | ${text} | ${dir} |\n`;
  }
}
writeFileSync(join(outDir, "voice-by-character.md"), md);

// --- portraits.csv ---
const portraitRows = [csvRow(["character", "name", "emotion", "file", "used_in_script"])];
for (const ch of characters) {
  const used = usedEmotions.get(ch.id) ?? new Set();
  const all = new Set([...ch.emotions, ...used]);
  for (const emotion of all) {
    portraitRows.push(
      csvRow([ch.id, ch.name, emotion, `public/portraits/${ch.id}/${emotion}.webp`, used.has(emotion) ? "yes" : "no"])
    );
  }
}
writeFileSync(join(outDir, "portraits.csv"), "﻿" + portraitRows.join("\n") + "\n");

console.log(
  `[manifest] ${lines.length} реплик, ${speakerOrder.length} говорящих, ${portraitRows.length - 1} портретов → docs/production/`
);
