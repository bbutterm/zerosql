"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

/**
 * Тёмная подсказка в стиле «иней». Триггер — переданный элемент
 * (через render), чтобы не плодить вложенные кнопки.
 */
export function HintTooltip({
  content,
  children,
  side = "top",
  delay = 250,
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
        <Tooltip.Positioner side={side} sideOffset={6} className="z-[70]">
          <Tooltip.Popup
            className={cn(
              "max-w-64 origin-(--transform-origin) rounded-md border border-frost-line-strong bg-ink-high px-2.5 py-1.5 text-xs leading-snug text-steam shadow-[0_12px_32px_-12px_rgb(0_0_0/0.8)]",
              "transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
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
