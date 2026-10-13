// Копирует sql-wasm.wasm из установленного sql.js в public/.
// JS-обвязка и wasm должны быть одной версии, иначе база не стартует в браузере.
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const target = join(root, "public", "sql-wasm.wasm");

if (!existsSync(source)) {
  console.warn("[sync-wasm] sql.js не установлен — пропускаю");
  process.exit(0);
}

const same = existsSync(target) && Buffer.compare(readFileSync(source), readFileSync(target)) === 0;
if (!same) {
  copyFileSync(source, target);
  console.log("[sync-wasm] public/sql-wasm.wasm обновлён");
}
