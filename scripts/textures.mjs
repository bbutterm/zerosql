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

/* ---------- Офисная бумага 80 г/м²: ровная серо-тёплая, фактура видна только при 200 % ----------
 * Крупных «облаков» нет (они читаются как пергамент): только зуб бумаги и редкие короткие волокна. */
{
  const r = rng(80);
  const px = compose(
    [
      [valueNoise(r, 64), 0.003],
      [valueNoise(r, 4), 0.006],
      [valueNoise(r, 2), 0.008],
      [whiteNoise(r), 0.012],
      [fibers(r, 500, { minLen: 4, maxLen: 12, amp: 0.018 }), 1],
    ],
    0.968
  );
  report(await writeWebp("paper-office.webp", toGray8(px, 0.93, 1), 80));
}

/* ---------- Тонкая бумага (лента принтера, протокол опроса): ещё глаже, без пятен ---------- */
{
  const r = rng(45);
  const px = compose(
    [
      [valueNoise(r, 64), 0.002],
      [valueNoise(r, 2), 0.006],
      [whiteNoise(r), 0.009],
      [fibers(r, 260, { minLen: 6, maxLen: 14, amp: 0.012, angleSpread: 0.6 }), 1],
    ],
    0.974
  );
  report(await writeWebp("paper-thin.webp", toGray8(px, 0.94, 1), 80));
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

/* ---------- Маска штампа: резина по бумаге, а не полупрозрачный SVG ----------
 * Альфа 0.25–1: плотная краска с мягкой неравномерностью, мелкая крапина (ячейка 2–4 px),
 * рваные пустоты там, где резина не коснулась бумаги, у кромки пустот краска гуще.
 * WebP с альфой: шум хорошо жмётся, контурных ступенек палитры нет. */
{
  const r = rng(707);
  const body = compose([[valueNoise(r, 64), 0.6], [valueNoise(r, 16), 0.4]], 0);
  const holes = compose([[valueNoise(r, 32), 0.7], [valueNoise(r, 8), 0.3]], 0);
  const speckA = valueNoise(r, 4);
  const speckB = valueNoise(r, 2);
  const grain = whiteNoise(r);
  const rgba = Buffer.alloc(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    let a = 0.9 + body[i] * 0.22;
    // Пустоты: порог по шуму даёт рваный край; на самой кромке — ободок гуще
    const h = holes[i];
    if (h > 0.38) a -= Math.min(0.75, (h - 0.38) * 4.2);
    else if (h > 0.3) a += (h - 0.3) * 1.2;
    // Крапина: светлые точки, где бумажный зуб пробивает краску
    const sp = speckA[i] * 0.45 + speckB[i] * 0.35 + grain[i] * 0.4;
    if (sp > 0.38) a -= Math.min(0.6, (sp - 0.38) * 2.4);
    const v = Math.min(1, Math.max(0.25, a));
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = Math.round(v * 255);
  }
  const file = join(out, "stamp-mask.webp");
  await sharp(rgba, { raw: { width: N, height: N, channels: 4 } })
    .webp({ quality: 50, alphaQuality: 50, effort: 6 })
    .toFile(file);
  report(file);
}

/* ---------- Зерно графита: маска для красного карандаша (галочки), 128 px ----------
 * Карандаш оставляет штрих с просветами бумажного зуба, вытянутыми вдоль движения. */
{
  const M = 128;
  const r = rng(2026);
  const rgba = Buffer.alloc(M * M * 4);
  // Вытянутое зерно: шум 1×3 px, повёрнутый на ~35°
  const cells = Float32Array.from({ length: M * M }, () => r());
  const at = (x, y) => cells[(((y % M) + M) % M) * M + (((x % M) + M) % M)];
  for (let y = 0; y < M; y++) {
    for (let x = 0; x < M; x++) {
      let v = 0;
      for (let k = -2; k <= 2; k++) v += at(x + Math.round(k * 0.8), y - Math.round(k * 0.57));
      v /= 5;
      const tooth = at(x * 3, y * 5) * 0.5 + v * 0.5;
      const a = tooth > 0.6 ? 0.45 + (1 - tooth) * 0.6 : 0.88 + r() * 0.12;
      const i = (y * M + x) * 4;
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  const file = join(out, "pencil-grain.png");
  await sharp(rgba, { raw: { width: M, height: M, channels: 4 } })
    .png({ compressionLevel: 9, palette: true, colors: 12 })
    .toFile(file);
  report(file);
}

/* ---------- Ночной кадр на лазерном принтере: растр 40–60 % с полосами, 240×180 ----------
 * Заглушка кадра камеры и личного фото, пока ассета нет. Сюжет изображения не имитируется:
 * только серое поле растровых точек, как напечатанная тёмная картинка. */
{
  const W = 240;
  const H = 180;
  const r = rng(1210);
  const low = (() => {
    const f = valueNoise(r, 128);
    return (x, y) => f[(y % N) * N + (x % N)];
  })();
  const gray = Buffer.alloc(W * H);
  const pitch = 3.2;
  const ang = Math.PI / 4;
  for (let y = 0; y < H; y++) {
    // Полосы лазерного принтера: едва заметная периодическая неравномерность тонера
    const band = Math.sin((y / H) * Math.PI * 7.3) * 0.035 + (y % 23 < 2 ? 0.03 : 0);
    for (let x = 0; x < W; x++) {
      const cover = 0.56 + low(x * 2, y * 2) * 0.2 + band - (y / H) * 0.08;
      const u = (x * Math.cos(ang) + y * Math.sin(ang)) / pitch;
      const v = (-x * Math.sin(ang) + y * Math.cos(ang)) / pitch;
      const du = u - Math.round(u);
      const dv = v - Math.round(v);
      const d = Math.sqrt(du * du + dv * dv);
      // Радиус точки по покрытию (площадь ≈ πr²)
      const rad = Math.sqrt(Math.max(0, Math.min(0.9, cover)) / Math.PI);
      const ink = d < rad - 0.06 ? 1 : d < rad + 0.06 ? 0.5 : 0;
      const tone = 0.97 - ink * 0.72 + (r() - 0.5) * 0.03;
      gray[y * W + x] = Math.round(Math.min(1, Math.max(0, tone)) * 255);
    }
  }
  const file = join(out, "halftone-night.webp");
  await sharp(gray, { raw: { width: W, height: H, channels: 1 } })
    .webp({ quality: 82, effort: 6 })
    .toFile(file);
  report(file);
}
