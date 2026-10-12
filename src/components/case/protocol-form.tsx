"use client";

import type { ReactNode } from "react";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown, FileSignature, Loader2, ScrollText, Stamp } from "lucide-react";
import type { ProtocolBlank, ProtocolMessage, ProtocolQuestionView } from "@/types/ui";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/kit/atmosphere";

export interface ProtocolFormProps {
  questions: ProtocolQuestionView[];
  /** Выбранные значения по id пропуска */
  values: Record<string, string | null | undefined>;
  onChange: (blankId: string, value: string | null) => void;
  /** «Сверить протокол» */
  onSubmit: () => void;
  /** Подтверждённые пропуски — фиксируются штампом */
  confirmedIds?: string[];
  /** Ответ проверки: «Верно 2 из 4…» */
  message?: ProtocolMessage | null;
  title?: string;
  /** «Дело № 01 · Тёплая вода» */
  caseLabel?: string;
  /** Номер документа в шапке */
  docNumber?: string;
  /** Сноска под протоколом (правила сверки и т. п.) */
  footnote?: ReactNode;
  submitting?: boolean;
  disabled?: boolean;
  className?: string;
}

const MESSAGE_TONE: Record<ProtocolMessage["tone"], string> = {
  success: "border-aurora/40 bg-aurora/[0.08] text-aurora",
  partial: "border-sodium/40 bg-sodium/[0.08] text-sodium",
  fail: "border-signal/40 bg-signal/[0.08] text-signal",
  info: "border-frost-line-strong bg-steam/[0.04] text-frost",
};

type Segment = { kind: "text"; text: string } | { kind: "blank"; blank: ProtocolBlank };

function parseStatement(q: ProtocolQuestionView): Segment[] {
  const byId = new Map(q.blanks.map((b) => [b.id, b]));
  const out: Segment[] = [];
  for (const part of q.text.split(/(\{[^}]+\})/g)) {
    if (!part) continue;
    const m = part.match(/^\{([^}]+)\}$/);
    const blank = m ? byId.get(m[1]) : undefined;
    out.push(blank ? { kind: "blank", blank } : { kind: "text", text: part });
  }
  return out;
}

export function ProtocolForm({
  questions,
  values,
  onChange,
  onSubmit,
  confirmedIds = [],
  message,
  title = "Протокол",
  caseLabel,
  docNumber,
  footnote,
  submitting = false,
  disabled = false,
  className,
}: ProtocolFormProps) {
  const confirmed = new Set(confirmedIds);
  const allBlanks = questions.flatMap((q) => q.blanks);
  const total = allBlanks.length;
  const confirmedCount = allBlanks.filter((b) => confirmed.has(b.id)).length;
  const solved = total > 0 && confirmedCount === total;
  const pendingFilled = allBlanks.filter((b) => !confirmed.has(b.id) && values[b.id]).length;
  const canSubmit = !disabled && !submitting && !solved && pendingFilled > 0;

  return (
    <section aria-label={title} className={cn("relative min-w-0", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border bg-[#0e1427] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)] transition-colors duration-700",
          solved ? "border-signal/40" : "border-frost-line-strong"
        )}
      >
        {/* Поле слева — как у настоящего бланка */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-9 w-px bg-signal/25 sm:left-11" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grain opacity-[0.05] mix-blend-overlay" />

        {/* Шапка бланка */}
        <header className="relative flex flex-wrap items-start justify-between gap-3 border-b border-frost-line px-4 pt-4 pb-3 sm:px-6">
          <div className="min-w-0 pl-7 sm:pl-7">
            <SectionLabel icon={<ScrollText className="size-3 text-sodium" />}>Служебный документ</SectionLabel>
            <h3 className="mt-1 font-display text-lg font-semibold tracking-wide text-steam uppercase sm:text-xl">
              {title}
            </h3>
            {caseLabel && <p className="mt-0.5 text-[13px] text-frost">{caseLabel}</p>}
          </div>
          {docNumber && (
            <span className="shrink-0 rounded-sm border border-frost-line-strong px-2 py-1 font-mono text-[11px] text-frost-dim">
              {docNumber}
            </span>
          )}
        </header>

        {/* Утверждения */}
        <ol className="relative flex flex-col px-4 py-3 sm:px-6">
          {questions.map((q, qi) => {
            const done = q.blanks.length > 0 && q.blanks.every((b) => confirmed.has(b.id));
            return (
              <li
                key={q.id}
                className="relative flex gap-3 border-b border-frost-line/60 py-3 last:border-b-0 sm:gap-4"
              >
                <span className="w-5 shrink-0 pt-1 text-right font-mono text-[12px] text-frost-dim sm:w-6">
                  {qi + 1}.
                </span>
                <p className="min-w-0 flex-1 pr-12 text-[15px] leading-[2.15] text-steam/95 sm:pr-16">
                  {parseStatement(q).map((seg, si) =>
                    seg.kind === "text" ? (
                      <span key={si}>{seg.text}</span>
                    ) : confirmed.has(seg.blank.id) ? (
                      <ConfirmedBlank key={si} blank={seg.blank} value={values[seg.blank.id]} />
                    ) : (
                      <BlankSelect
                        key={si}
                        blank={seg.blank}
                        value={values[seg.blank.id] ?? null}
                        onChange={(v) => onChange(seg.blank.id, v)}
                        disabled={disabled || solved}
                      />
                    )
                  )}
                </p>
                {done && (
                  <span
                    className="pointer-events-none absolute top-2 right-0 rounded-sm border-2 border-aurora/70 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-[0.2em] text-aurora/90 uppercase motion-safe:animate-stamp sm:-right-2"
                    style={{ "--stamp-rot": "-6deg", transform: "rotate(-6deg)" } as React.CSSProperties}
                  >
                    верно
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* Подвал: счёт, сообщение, кнопка */}
        <footer className="relative flex flex-col gap-3 border-t border-frost-line bg-ink-deep/40 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="flex gap-[3px]">
                {allBlanks.map((b) => (
                  <span
                    key={b.id}
                    className={cn(
                      "h-3 w-1.5 rounded-[2px] transition-colors duration-500",
                      confirmed.has(b.id) ? "bg-aurora" : values[b.id] ? "bg-sodium/50" : "bg-frost-line-strong"
                    )}
                  />
                ))}
              </span>
              <span className="text-[13px] text-frost" aria-live="polite">
                Подтверждено{" "}
                <span className="font-mono text-steam tabular-nums">
                  {confirmedCount} из {total}
                </span>
              </span>
            </div>
            <div className="ml-auto">
              {solved ? (
                <span className="inline-flex h-9 items-center gap-2 text-sm text-aurora">
                  <FileSignature className="size-4" />
                  Протокол подписан
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!canSubmit}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-sodium px-4 font-display text-[11px] font-semibold tracking-[0.12em] text-ink-deep uppercase shadow-[0_0_24px_-6px_rgb(255_181_71/0.55)] transition-[filter,transform,opacity] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Stamp className="size-3.5" />}
                  Сверить протокол
                </button>
              )}
            </div>
          </div>
          {message && (
            <p
              role="status"
              className={cn(
                "rounded-md border px-3 py-2 text-[13px] leading-relaxed motion-safe:animate-in motion-safe:fade-in-0",
                MESSAGE_TONE[message.tone]
              )}
            >
              {message.text}
            </p>
          )}
          {footnote && <p className="text-xs leading-relaxed text-frost-dim">{footnote}</p>}
        </footer>

        {/* Штамп «Дело закрыто» */}
        {solved && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-ink-deep/20">
            <div
              className="rounded-md border-[3px] border-signal px-5 py-3 text-center text-signal mix-blend-screen motion-safe:animate-stamp sm:px-8 sm:py-4"
              style={
                {
                  "--stamp-rot": "-9deg",
                  transform: "rotate(-9deg)",
                  boxShadow: "inset 0 0 0 2px rgb(255 106 43 / 0.35), 0 0 60px -10px rgb(255 106 43 / 0.5)",
                } as React.CSSProperties
              }
            >
              <div className="font-display text-2xl leading-none font-black tracking-[0.12em] uppercase sm:text-4xl">
                Дело закрыто
              </div>
              <div className="mt-1.5 font-mono text-[10px] tracking-[0.3em] uppercase opacity-80 sm:text-xs">
                протокол сверен · {total}/{total}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ConfirmedBlank({ blank, value }: { blank: ProtocolBlank; value?: string | null }) {
  const label = blank.options.find((o) => o.value === value)?.label ?? value ?? "—";
  return (
    <span
      className="mx-0.5 inline-flex items-baseline gap-1 border-b-2 border-aurora/70 px-1 font-semibold text-aurora"
      aria-label={`${blank.label}: ${label}, подтверждено`}
    >
      {label}
      <Check className="size-3 translate-y-[1px] self-center" strokeWidth={3} aria-hidden />
    </span>
  );
}

function BlankSelect({
  blank,
  value,
  onChange,
  disabled,
}: {
  blank: ProtocolBlank;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const items = blank.options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <Select.Root
      items={items}
      value={value}
      onValueChange={(v) => onChange((v as string | null) ?? null)}
      disabled={disabled}
    >
      <Select.Trigger
        aria-label={blank.label}
        className={cn(
          "mx-0.5 inline-flex h-7 max-w-full translate-y-[-1px] items-center gap-1 rounded-t-sm border-b-2 px-1.5 align-baseline text-[14.5px] transition-colors",
          "hover:bg-steam/[0.06] data-popup-open:bg-steam/[0.08] disabled:cursor-not-allowed",
          value
            ? "border-sodium/80 bg-sodium/[0.06] font-semibold text-sodium"
            : "border-dashed border-frost-dim/70 bg-steam/[0.025] text-frost-dim italic"
        )}
      >
        <Select.Value className="truncate" placeholder={blank.label}>
          {(v: string | null) => (v ? (blank.options.find((o) => o.value === v)?.label ?? v) : blank.label)}
        </Select.Value>
        <Select.Icon className="shrink-0 opacity-70">
          <ChevronDown className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-[70] outline-none" sideOffset={6} alignItemWithTrigger={false}>
          <Select.Popup className="min-w-[max(var(--anchor-width),12rem)] origin-(--transform-origin) overflow-hidden rounded-lg border border-frost-line-strong bg-ink-high text-steam shadow-[0_24px_48px_-16px_rgb(0_0_0/0.85)] transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="border-b border-frost-line px-3 py-1.5 font-display text-[9.5px] tracking-[0.2em] text-frost-dim uppercase">
              {blank.label}
            </div>
            <Select.List className="scrollbar-ice max-h-[min(var(--available-height),18rem)] overflow-y-auto py-1">
              {blank.options.map((opt) => (
                <Select.Item
                  key={opt.value}
                  value={opt.value}
                  className="grid cursor-default grid-cols-[1rem_1fr_auto] items-center gap-2 px-3 py-1.5 text-[13.5px] outline-none select-none data-highlighted:bg-aurora/[0.12] data-highlighted:text-steam data-selected:text-sodium"
                >
                  <Select.ItemIndicator className="col-start-1">
                    <Check className="size-3.5 text-sodium" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 truncate">{opt.label}</Select.ItemText>
                  {opt.note && <span className="col-start-3 text-[11px] text-frost-dim">{opt.note}</span>}
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
