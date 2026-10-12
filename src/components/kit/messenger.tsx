"use client";

import { cn } from "@/lib/utils";
import { Glyph } from "./glyphs";
import { typo } from "./typo";

export interface MessengerNoteProps {
  /** «Соколова В. А.» */
  sender: string;
  /** «02:47» */
  time?: string;
  text: string;
  /** 1,2 с перед текстом — строка «печатает…» */
  typing?: boolean;
  /** Сколько сообщений ждёт за этим: «ещё 2» */
  more?: number;
  onClose?: () => void;
  onOpen?: () => void;
  className?: string;
}

/**
 * Сообщение человека (раздел 7.16): окно рабочего мессенджера «Зеркала»,
 * справа снизу над строкой состояния. Само не исчезает — закрывает игрок.
 * Системные события сюда не пишутся: им место в строке состояния.
 */
export function MessengerNote({ sender, time, text, typing = false, more = 0, onClose, onOpen, className }: MessengerNoteProps) {
  return (
    <section
      aria-label={`Сообщение: ${sender}`}
      aria-live="polite"
      className={cn("w-[320px] max-w-[calc(100vw-32px)] border border-line-strong bg-scr-chrome shadow-menu", className)}
    >
      <header className="flex h-6 items-center gap-2 border-b border-line pr-1 pl-3">
        <span className="min-w-0 truncate ui-12 font-medium text-ink-1">{sender}</span>
        {more > 0 && <span className="tnum ui-12 text-ink-3">ещё {more}</span>}
        {time && <span className="ml-auto mono-12 text-ink-3">{time}</span>}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className={cn("grid size-6 place-items-center text-ink-3 hover:text-ink-1", !time && "ml-auto")}
          >
            <Glyph name="close" size={10} />
          </button>
        )}
      </header>
      <div className="px-3 pt-2 pb-2.5">
        {typing ? (
          <p className="ui-12 text-ink-3">печатает…</p>
        ) : (
          <>
            <p className="line-clamp-4 doc-14 text-ink-1">{typo(text)}</p>
            {onOpen && (
              <button type="button" onClick={onOpen} className="mt-1 ui-12 text-ink-2 hover:text-ink-1 hover:underline underline-offset-[3px]">
                Открыть
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
