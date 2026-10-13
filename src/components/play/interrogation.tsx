"use client";

import { useState } from "react";
import type { CharacterDef, Emotion } from "@/types/story";
import type { EvidenceCardData } from "@/types/ui";
import { ScreenButton } from "@/components/kit/screen";
import { Glyph } from "@/components/kit/glyphs";
import { typo } from "@/components/kit/typo";
import { PortraitFrame } from "@/components/story/portrait";
import { EVIDENCE_KIND_META } from "@/components/case/evidence-card";
import { cn } from "@/lib/utils";

export interface InterrogationPoint {
  line: string;
  text: string;
  broken: boolean;
  pressed: boolean;
  lie: boolean;
  canPress: boolean;
  canPresent: boolean;
}

/**
 * Допрос «Наушник» (библия 6.9, 9.1 п. 5): игрок за стеклом, Даша в комнате. Слева —
 * подозреваемый (портрет по шагам пробоя), справа — лента утверждений с «Надавить» и
 * «Предъявить», терпение Даши текстом. Предъявление — выбор из материалов дела.
 * «К столу» сворачивает допрос: можно сделать запрос и приобщить новую строку.
 */
export function InterrogationPanel({
  suspect,
  interrogator,
  emotion,
  points,
  patience,
  modeNote,
  items,
  lieHighlight = false,
  busy = false,
  liveQuery = false,
  onPress,
  onPresent,
  onLeave,
}: {
  suspect?: CharacterDef;
  interrogator?: CharacterDef;
  emotion: Emotion;
  points: InterrogationPoint[];
  /** Терпение: осталось из всего; null — шкалы нет (союзник) */
  patience: { left: number; total: number } | null;
  /** «Беседа: одно предъявление» */
  modeNote?: string;
  /** Материалы для предъявления: улики и приобщённые строки */
  items: EvidenceCardData[];
  lieHighlight?: boolean;
  busy?: boolean;
  liveQuery?: boolean;
  onPress: (line: string) => void;
  onPresent: (line: string, itemId: string) => void;
  onLeave?: () => void;
}) {
  const [presenting, setPresenting] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const name = suspect?.shortName ?? "Подозреваемый";
  const target = points.find((p) => p.line === presenting);

  return (
    <div role="dialog" aria-label={`Допрос: ${name}`} className="fixed inset-0 z-40 flex flex-col bg-room text-ink-1">
      <header className="flex h-7 shrink-0 items-center gap-3 border-b border-line bg-scr-chrome px-4">
        <span className="ui-13 font-semibold">Допрос</span>
        <span className="truncate ui-13 text-ink-2">
          {suspect?.name ?? name}
          {interrogator ? `, ведёт ${interrogator.shortName}` : ""}
        </span>
        <span className="ml-auto mono-12 text-ink-3">
          {patience ? `терпение ${patience.left} из ${patience.total}` : modeNote ?? ""}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,38%)_1fr]">
        <div className="relative hidden min-h-0 items-end justify-center overflow-hidden border-r border-line lg:flex">
          <PortraitFrame character={suspect} emotion={emotion} size="dialogue" speaking />
          <p className="absolute bottom-3 left-4 ui-12 text-ink-3">за стеклом</p>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2 lg:hidden">
            <PortraitFrame character={suspect} emotion={emotion} size="avatar" />
            <p className="ui-14 text-ink-1">{name}</p>
          </div>

          <ol className="min-h-0 flex-1 overflow-auto px-4 py-4" aria-label="Показания">
            {points.map((p, i) => (
              <li key={p.line} className={cn("border-b border-line py-3", presenting === p.line && "bg-scr-base")}>
                <div className="flex gap-3">
                  <span className="w-5 shrink-0 pt-0.5 mono-12 text-ink-3 tnum">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("doc-15", p.broken ? "text-ink-3 line-through decoration-1" : "text-ink-1")}>{typo(p.text)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 ui-12 text-ink-3">
                      {p.broken && <span>пробито</span>}
                      {p.pressed && !p.broken && <span>уточнено</span>}
                      {lieHighlight && p.lie && !p.broken && <span className="text-ink-2">сомнительно</span>}
                      {p.canPress && !p.pressed && !p.broken && (
                        <button type="button" disabled={busy} onClick={() => onPress(p.line)} className="ui-13 text-ink-2 hover:text-ink-1 hover:underline hover:underline-offset-3 disabled:opacity-50">
                          Надавить
                        </button>
                      )}
                      {p.canPresent && !p.broken && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setPresenting(p.line);
                            setPicked(null);
                          }}
                          className="ui-13 text-ink-2 hover:text-ink-1 hover:underline hover:underline-offset-3 disabled:opacity-50"
                        >
                          Предъявить…
                        </button>
                      )}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {target && (
            <div className="max-h-[45%] shrink-0 overflow-auto border-t border-line-strong bg-scr-base px-4 py-3">
              <p className="ui-13 text-ink-2">
                Что показать на «{typo(target.text.length > 60 ? `${target.text.slice(0, 59)}…` : target.text)}»
              </p>
              {items.length === 0 ? (
                <p className="mt-2 ui-13 text-ink-3">Материалов нет. Строку результата можно приобщить к делу.</p>
              ) : (
                <ul role="listbox" aria-label="Материалы" className="mt-2 flex flex-col">
                  {items.map((it) => (
                    <li
                      key={it.id}
                      role="option"
                      aria-selected={picked === it.id}
                      tabIndex={0}
                      onClick={() => setPicked(it.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPicked(it.id)}
                      className={cn("flex h-8 cursor-default items-center gap-2 px-2 outline-none focus-visible:outline-1 focus-visible:outline-ink-1", picked === it.id ? "bg-scr-select" : "hover:bg-scr-raise")}
                    >
                      <span className="w-3 text-ink-1">{picked === it.id && <Glyph name="marker" size={10} />}</span>
                      <span className="w-12 shrink-0 mono-11 text-ink-3">{EVIDENCE_KIND_META[it.kind]?.code ?? ""}</span>
                      <span className="truncate ui-13 text-ink-1">{typo(it.title)}</span>
                      {it.source && <span className="ml-auto hidden truncate ui-12 text-ink-3 sm:inline">{it.source}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-end gap-3">
                <ScreenButton variant="secondary" onClick={() => setPresenting(null)}>
                  Отмена
                </ScreenButton>
                <ScreenButton
                  variant="primary"
                  disabled={!picked || busy}
                  onClick={() => {
                    if (!picked || !target) return;
                    onPresent(target.line, picked);
                    setPresenting(null);
                  }}
                >
                  Предъявить
                </ScreenButton>
              </div>
            </div>
          )}

          {onLeave && !target && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-scr-chrome px-4 py-2">
              <p className="ui-12 text-ink-3">{liveQuery ? "Запрос можно сделать прямо сейчас: новая строка станет материалом." : "Допрос можно отложить и вернуться."}</p>
              <ScreenButton variant="secondary" onClick={onLeave}>
                К столу
              </ScreenButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
