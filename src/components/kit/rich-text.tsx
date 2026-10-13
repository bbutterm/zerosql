import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { typo } from "./typo";

/**
 * Текст с кодом: `код` в обратных кавычках набирается PT Mono, без подложки и цвета.
 * Остальное проходит русский набор (typo). Только для экранного текста на Golos:
 * внутри PT Serif моноширинный не смешивается (там идентификаторы пишутся в «ёлочках»).
 */
export function RichText({ text, codeClassName }: { text: string; codeClassName?: string }): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
      // Короткий код не рвётся посередине («= NULL», «IS NULL»), длинный переносится как текст
      <code
        key={i}
        className={cn("font-mono text-[0.93em]", part.length <= 26 ? "whitespace-nowrap" : "break-words", codeClassName)}
      >
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{typo(part)}</span>
    )
  );
}
