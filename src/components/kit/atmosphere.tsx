"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Процедурный пар над водой. Сейчас НЕ используется: запасной вариант холодного открытия —
 * титр на чистой комнате (раздел 7.1), атмосфера живёт только в картинах. Компонент оставлен
 * для возможного слоя поверх ключевой картины, если художник попросит живой пар.
 *
 * Canvas 30 к/с, 6–8 полупрозрачных (0.03–0.05) полос шума, подъём ~6 px/с.
 * Останавливается вне экрана и в скрытой вкладке, выключен при prefers-reduced-motion.
 * Свечения, звёзд и сияния нет.
 */
export function SteamCanvas({ className, bands = 7 }: { className?: string; bands?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Детерминированный шум: одна и та же «погода» при каждом запуске
    let seed = 2026;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // Текстура пара: вытянутый по горизонтали value-noise, 256×64
    const tex = document.createElement("canvas");
    tex.width = 256;
    tex.height = 64;
    const tctx = tex.getContext("2d");
    if (!tctx) return;
    const img = tctx.createImageData(256, 64);
    // Два октава периодического шума: крупные клубы и рваный край
    const octave = (gx: number, gy: number) => {
      const grid = Array.from({ length: gx * gy }, () => rand());
      const at = (x: number, y: number) => grid[(((y % gy) + gy) % gy) * gx + (((x % gx) + gx) % gx)];
      const smooth = (t: number) => t * t * (3 - 2 * t);
      return (px: number, py: number) => {
        const fx = (px / 256) * gx;
        const fy = (py / 64) * gy;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        return a + (b - a) * ty;
      };
    };
    const big = octave(8, 3);
    const small = octave(24, 8);
    for (let y = 0; y < 64; y++) {
      // Края полосы гаснут сверху и снизу мягко (sin²)
      const edge = Math.sin((y / 63) * Math.PI) ** 2;
      for (let x = 0; x < 256; x++) {
        const v = big(x, y) * 0.7 + small(x, y) * 0.3;
        const i = (y * 256 + x) * 4;
        img.data[i] = 230;
        img.data[i + 1] = 228;
        img.data[i + 2] = 222;
        img.data[i + 3] = Math.round(255 * Math.max(0, v * 1.6 - 0.45) * edge);
      }
    }
    tctx.putImageData(img, 0, 0);

    const list = Array.from({ length: bands }, () => ({
      start: rand(),
      speed: 5 + rand() * 2.5,
      alpha: 0.03 + rand() * 0.02,
      height: 0.18 + rand() * 0.22,
      sx: rand() * 128,
      drift: (rand() - 0.5) * 3,
    }));

    let raf = 0;
    let last = 0;
    let visible = true;
    const t0 = performance.now();

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || document.hidden || now - last < 1000 / 30) return;
      last = now;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const b of list) {
        const bh = b.height * h;
        const travel = h + bh;
        const pos = (b.start * travel + t * b.speed) % travel;
        const y = h - pos;
        const life = Math.sin(Math.min(1, Math.max(0, pos / travel)) * Math.PI);
        ctx.globalAlpha = b.alpha * life;
        const sx = (((b.sx + t * b.drift) % 128) + 128) % 128;
        ctx.drawImage(tex, sx, 0, 128, 64, -w * 0.05, y, w * 1.1, bh);
      }
      ctx.globalAlpha = 1;
      // Пар растворяется к краям полосы воды: горизонтальная маска по самому холсту
      ctx.globalCompositeOperation = "destination-in";
      const fade = ctx.createLinearGradient(0, 0, w, 0);
      fade.addColorStop(0, "rgba(0,0,0,0.6)");
      fade.addColorStop(0.25, "rgba(0,0,0,1)");
      fade.addColorStop(0.6, "rgba(0,0,0,1)");
      fade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(draw);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [bands]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none block", className)} />;
}
