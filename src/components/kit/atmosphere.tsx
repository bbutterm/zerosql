import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Атмосферные слои: пар над чёрной водой, зерно, виньетка, трещина во льду.
 * Чистая разметка без состояния — можно рендерить на сервере.
 */

const PLUMES: Array<{ left: string; size: string; delay: string; duration: string; bottom: string }> = [
  { left: "4%", size: "38%", delay: "0s", duration: "13s", bottom: "-18%" },
  { left: "26%", size: "30%", delay: "-4s", duration: "11s", bottom: "-14%" },
  { left: "48%", size: "42%", delay: "-8s", duration: "15s", bottom: "-20%" },
  { left: "70%", size: "32%", delay: "-2s", duration: "12s", bottom: "-16%" },
  { left: "84%", size: "28%", delay: "-6s", duration: "10s", bottom: "-12%" },
];

export function SteamLayer({
  className,
  intensity = 1,
}: {
  className?: string;
  /** 0..1.5 — плотность пара */
  intensity?: number;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {PLUMES.map((p, i) => (
        <span
          key={i}
          className="absolute aspect-square rounded-full blur-3xl motion-safe:animate-steam-rise"
          style={
            {
              left: p.left,
              bottom: p.bottom,
              width: p.size,
              animationDelay: p.delay,
              animationDuration: p.duration,
              backgroundColor: `rgb(238 243 250 / ${(0.09 * intensity).toFixed(3)})`,
            } satisfies CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function GrainLayer({ className, opacity = 0.07 }: { className?: string; opacity?: number }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 bg-grain mix-blend-overlay", className)}
      style={{ opacity }}
    />
  );
}

export function Vignette({ className, strength = 0.65 }: { className?: string; strength?: number }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        background: `radial-gradient(120% 90% at 50% 45%, transparent 55%, rgb(2 4 10 / ${strength}) 100%)`,
      }}
    />
  );
}

/** Разделитель «трещина во льду» */
export function IceCrack({ className }: { className?: string }) {
  return <div aria-hidden className={cn("ice-crack w-full", className)} />;
}

/** Подпись секции: мелкие капители, широкий шрифт */
export function SectionLabel({
  children,
  className,
  icon,
}: {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-display text-[10px] font-medium uppercase tracking-[0.2em] text-frost-dim",
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-frost-line-strong bg-ink-deep/80 px-1 font-mono text-[10px] leading-none text-frost",
        className
      )}
    >
      {children}
    </kbd>
  );
}
