// Однократная генерация растровых фактур для бумаги, стены и штампа (UI_ART_DIRECTION, раздел 5).
// Запускать вручную: `node scripts/textures.mjs`. Результат коммитится в public/textures/
// как обычные файлы — во время работы игры шум не генерируется.
//
// Все тайлы бесшовные (периодический шум по решётке, делящей 512), детерминированные (своё зерно).
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "textures");
mkdirSync(out, { recursive: true });

const N = 512;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Периодический value-noise: cell — шаг решётки в пикселях (делитель 512), sx/sy — анизотропия */
function valueNoise(rand, cellX, cellY = cellX) {
  const gx = N / cellX;
  const gy = N / cellY;
  const grid = Float32Array.from({ length: gx * gy }, () => rand() * 2 - 1);
  const at = (x, y) => grid[((y + gy) % gy) * gx + ((x + gx) % gx)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const field = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = y / cellY;
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    for (let x = 0; x < N; x++) {
      const fx = x / cellX;
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      field[y * N + x] = a + (b - a) * ty;
    }
  }
  return field;
}

function whiteNoise(rand) {
  return Float32Array.from({ length: N * N }, () => rand() * 2 - 1);
}

/** Короткие волокна: тонкие отрезки с переносом через край тайла */
function fibers(rand, count, { minLen, maxLen, amp, angleSpread = Math.PI, baseAngle = 0 }) {
  const f = new Float32Array(N * N);
  for (let i = 0; i < count; i++) {
    let x = rand() * N;
    let y = rand() * N;
    const len = minLen + rand() * (maxLen - minLen);
    let angle = baseAngle + (rand() - 0.5) * angleSpread;
    const strength = amp * (0.4 + rand() * 0.6) * (rand() < 0.75 ? -1 : 1);
    for (let s = 0; s < len; s++) {
      angle += (rand() - 0.5) * 0.25;
      x += Math.cos(angle);
      y += Math.sin(angle);
      const fade = Math.sin((s / len) * Math.PI);
      const ix = ((Math.round(x) % N) + N) % N;
      const iy = ((Math.round(y) % N) + N) % N;
      f[iy * N + ix] += strength * fade;
    }
  }
  return f;
}

function compose(layers, base) {
  const px = new Float32Array(N * N).fill(base);
  for (const [field, amp] of layers) for (let i = 0; i < px.length; i++) px[i] += field[i] * amp;
  return px;
}

function toGray8(px, lo, hi) {
  const buf = Buffer.alloc(N * N);
  for (let i = 0; i < px.length; i++) buf[i] = Math.round(Math.min(hi, Math.max(lo, px[i])) * 255);
  return buf;
}

async function writeWebp(name, gray, quality) {
  const file = join(out, name);
  await sharp(gray, { raw: { width: N, height: N, channels: 1 } })
    .webp({ quality, effort: 6 })
    .toFile(file);
  return file;
}

function report(file) {
  console.log(`${file.replace(root + "/", "")}: ${(statSync(file).size / 1024).toFixed(1)} КБ`);
}

/* ---------- Офисная бумага 80 г/м²: средняя яркость ~97 %, уровни 92–100 % ---------- */
{
  const r = rng(80);
  const px = compose(
    [
      [valueNoise(r, 128), 0.016],
      [valueNoise(r, 32), 0.012],
      [valueNoise(r, 8), 0.01],
      [valueNoise(r, 2), 0.012],
      [whiteNoise(r), 0.008],
      [fibers(r, 1400, { minLen: 6, maxLen: 26, amp: 0.05 }), 1],
    ],
    0.966
  );
  report(await writeWebp("paper-office.webp", toGray8(px, 0.92, 1), 80));
}

/* ---------- Тонкая бумага (лента принтера, протокол опроса): глаже, длинные волокна ---------- */
{
  const r = rng(45);
  const px = compose(
    [
      [valueNoise(r, 128), 0.01],
      [valueNoise(r, 16), 0.006],
      [valueNoise(r, 2), 0.006],
      [fibers(r, 420, { minLen: 20, maxLen: 60, amp: 0.03, angleSpread: 0.6 }), 1],
    ],
    0.974
  );
  report(await writeWebp("paper-thin.webp", toGray8(px, 0.93, 1), 80));
}

/* ---------- Стена: валик по масляной краске, контраст ≤ 5 % (кладётся multiply на --wall) ---------- */
{
  const r = rng(1974);
  const px = compose(
    [
      [valueNoise(r, 256, 512), 0.014],
      [valueNoise(r, 16, 64), 0.01],
      [valueNoise(r, 4, 8), 0.01],
      [valueNoise(r, 2), 0.008],
    ],
    0.972
  );
  report(await writeWebp("wall-paint.webp", toGray8(px, 0.95, 1), 80));
}

/* ---------- Маска штампа: пятнистая заливка 70–100 %, белый цвет + альфа ---------- */
{
  const r = rng(707);
  const blot = compose(
    [
      [valueNoise(r, 64), 0.09],
      [valueNoise(r, 16), 0.07],
      [valueNoise(r, 4), 0.05],
    ],
    0.86
  );
  const rgba = Buffer.alloc(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    // 16 уровней: пятна краски, а не плавный градиент; так и PNG легче
    const a = Math.min(1, Math.max(0.7, blot[i]));
    const q = Math.round(a * 15) / 15;
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = Math.round(q * 255);
  }
  const file = join(out, "stamp-mask.png");
  await sharp(rgba, { raw: { width: N, height: N, channels: 4 } })
    .png({ compressionLevel: 9, palette: true, colors: 16 })
    .toFile(file);
  report(file);
}
