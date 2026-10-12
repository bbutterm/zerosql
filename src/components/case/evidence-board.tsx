"use client";

import { useMemo, useState } from "react";
import { Pin } from "lucide-react";
import type { EvidenceCardData, EvidenceKind } from "@/types/ui";
import { EVIDENCE_KINDS } from "@/types/ui";
import { cn } from "@/lib/utils";
import { plural, pluralize } from "@/lib/plural";
import { SectionLabel } from "@/components/kit/atmosphere";
import { EVIDENCE_KIND_META, EvidenceCard } from "./evidence-card";

export interface EvidenceBoardProps {
  cards: EvidenceCardData[];
  /** Клик по карточке (например, открыть подробности) */
  onCardClick?: (id: string) => void;
  selectedId?: string | null;
  /** Фильтр по типам улик (по умолчанию включён, если типов больше одного) */
  filterable?: boolean;
  /** Скрыть заголовок (если доска уже внутри вкладки «Улики») */
  hideHeader?: boolean;
  emptyText?: string;
  className?: string;
}

export function EvidenceBoard({
  cards,
  onCardClick,
  selectedId,
  filterable = true,
  hideHeader = false,
  emptyText = "Улик пока нет. Закрепляйте важные строки результатов булавкой — они появятся здесь.",
  className,
}: EvidenceBoardProps) {
  const [filter, setFilter] = useState<EvidenceKind | "all">("all");

  const counts = useMemo(() => {
    const map = new Map<EvidenceKind, number>();
    for (const c of cards) map.set(c.kind, (map.get(c.kind) ?? 0) + 1);
    return map;
  }, [cards]);

  const kinds = EVIDENCE_KINDS.filter((k) => counts.has(k));
  const active = filter !== "all" && counts.has(filter) ? filter : "all";
  const visible = active === "all" ? cards : cards.filter((c) => c.kind === active);
  const newCount = cards.filter((c) => c.isNew).length;

  return (
    <section className={cn("flex min-w-0 flex-col gap-3", className)} aria-label="Доска улик">
      {!hideHeader && (
        <header className="flex items-baseline justify-between gap-3">
          <SectionLabel icon={<Pin className="size-3 text-signal" />}>Улики</SectionLabel>
          <span className="text-xs text-frost-dim">
            {pluralize(cards.length, ["улика", "улики", "улик"])}
            {newCount > 0 && (
              <span className="ml-1.5 text-signal">
                +{newCount} {plural(newCount, ["новая", "новые", "новых"])}
              </span>
            )}
          </span>
        </header>
      )}

      {filterable && kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Фильтр по типу улик">
          <FilterChip active={active === "all"} onClick={() => setFilter("all")} count={cards.length}>
            Все
          </FilterChip>
          {kinds.map((k) => (
            <FilterChip
              key={k}
              active={active === k}
              onClick={() => setFilter(k)}
              count={counts.get(k) ?? 0}
              color={EVIDENCE_KIND_META[k].color}
            >
              {EVIDENCE_KIND_META[k].plural}
            </FilterChip>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="relative overflow-hidden rounded-lg border border-dashed border-frost-line-strong px-5 py-10 text-center">
          <Pin className="mx-auto mb-3 size-5 text-frost-faint" aria-hidden />
          <p className="mx-auto max-w-xs text-sm leading-relaxed text-frost-dim">{emptyText}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,232px),1fr))] gap-3">
          {visible.map((card, i) => (
            <EvidenceCard
              key={card.id}
              card={card}
              index={i}
              selected={selectedId === card.id}
              onSelect={onCardClick}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
        active
          ? "border-frost-line-strong bg-ink-high text-steam"
          : "border-frost-line text-frost-dim hover:border-frost-line-strong hover:text-frost"
      )}
    >
      {color && <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />}
      {children}
      <span className="font-mono text-[10px] tabular-nums text-frost-dim">{count}</span>
    </button>
  );
}
