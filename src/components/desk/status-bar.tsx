"use client";

import { useEffect, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
import { FieldDivider, MENU_POPUP } from "@/components/kit/screen";

/** Системное сообщение строки состояния. id нужен, чтобы одинаковый текст показался снова */
export type StatusMessage = string | { id: string | number; text: string };

export interface StatusBarProps {
  /** «ноль@зеркало» */
  login?: string;
  /** «только чтение» */
  mode?: string;
  /** Число сеансов под логином; 2 и больше — сюжетный второй сеанс */
  sessions?: number;
  /** Подсветить сеансы тревогой (сюжетный флаг) */
  sessionsAlarm?: boolean;
  /** Последнее системное сообщение: держится 6 с, затем поле пустеет */
  message?: StatusMessage | null;
  /** Игровые дата и время «14.12.2026 02:44» */
  dateTime?: string;
  className?: string;
}

interface Entry {
  key: string;
  text: string;
  at?: string;
}

const keyOf = (m: StatusMessage) => (typeof m === "string" ? `s:${m}` : `i:${m.id}`);
const textOf = (m: StatusMessage) => (typeof m === "string" ? m : m.text);

/**
 * Строка состояния (раздел 7.4): 24 px, PT Mono 12. Заменяет тосты для системы:
 * сообщение пишется сюда, держится 6 с и сменяется пустотой без анимации.
 * Клик по полю открывает журнал последних 20 сообщений.
 */
export function StatusBar({
  login = "ноль@зеркало",
  mode = "только чтение",
  sessions = 1,
  sessionsAlarm,
  message,
  dateTime,
  className,
}: StatusBarProps) {
  const [log, setLog] = useState<Entry[]>([]);
  const [current, setCurrent] = useState<Entry | null>(null);
  const [seenKey, setSeenKey] = useState<string | null>(null);

  // Новое сообщение от стора — в поле и в журнал (паттерн «состояние от пропса»)
  const incoming = message ? keyOf(message) : null;
  if (incoming !== seenKey) {
    setSeenKey(incoming);
    if (message) {
      const entry = { key: incoming!, text: textOf(message), at: dateTime?.match(/\d{2}:\d{2}$/)?.[0] };
      setCurrent(entry);
      setLog((l) => [...l, entry].slice(-20));
    }
  }

  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => setCurrent(null), 6000);
    return () => window.clearTimeout(t);
  }, [current]);

  const alarm = sessionsAlarm ?? sessions > 1;

  return (
    <footer
      className={cn(
        "flex h-6 shrink-0 items-center gap-3 border-t border-line bg-scr-chrome px-3 mono-12 whitespace-nowrap text-ink-3",
        className
      )}
    >
      <span>{login}</span>
      <FieldDivider />
      <span>{mode}</span>
      <FieldDivider />
      <span className={cn(alarm && "text-alarm")}>сеансов: {sessions}</span>
      <FieldDivider />
      <Popover.Root>
        <Popover.Trigger
          className="h-full min-w-0 flex-1 truncate text-left text-ink-1 focus-visible:-outline-offset-2"
          aria-label="Журнал сообщений"
        >
          {current?.text ?? ""}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" align="start" sideOffset={0} className="z-[60]">
            <Popover.Popup className={cn(MENU_POPUP, "max-h-80 w-[420px] overflow-y-auto py-1")}>
              {log.length === 0 ? (
                <p className="px-3 py-1 ui-13 text-ink-3">Записей нет.</p>
              ) : (
                <ol>
                  {[...log].reverse().map((e, i) => (
                    <li key={`${e.key}-${i}`} className="flex gap-3 px-3 py-[3px] mono-12">
                      <span className="w-10 shrink-0 text-ink-3">{e.at ?? "—"}</span>
                      <span className="text-ink-1">{e.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {dateTime && (
        <>
          <FieldDivider />
          <span className="text-ink-2">{dateTime}</span>
        </>
      )}
    </footer>
  );
}
