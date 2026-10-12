"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

/**
 * Подсказка «Зеркала» (раздел 7.17): --scr-chrome, рамка --line-strong, Golos 12,
 * задержка 500 мс, появляется без анимации. Триггер — переданный элемент (через render).
 */
export function HintTooltip({
  content,
  children,
  side = "top",
  delay = 500,
  className,
}: {
  content: ReactNode;
  /** Один элемент-триггер, например <button> */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={delay} render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={4} className="z-[70]">
          <Tooltip.Popup
            className={cn(
              "max-w-72 border border-line-strong bg-scr-chrome px-2 py-1 ui-12 text-ink-1",
              className
            )}
          >
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
