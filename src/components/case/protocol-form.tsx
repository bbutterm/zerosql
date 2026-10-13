"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Select } from "@base-ui/react/select";
import type { ProtocolBlank, ProtocolCheck, ProtocolMessage, ProtocolQuestionView } from "@/types/ui";
import { cn } from "@/lib/utils";
import { ScreenButton } from "@/components/kit/screen";
import { DaterStamp, PencilCheck, RoundSeal, Signature, Stamp } from "@/components/kit/paper";
import { ruPlural, typo } from "@/components/kit/typo";

export interface ProtocolFormProps {
  questions: ProtocolQuestionView[];
  /** Выбранные значения по id пропуска */
  values: Record<string, string | null | undefined>;
  onChange: (blankId: string, value: string | null) => void;
  /** «Сверить» — пачкой */
  onSubmit: () => void;
  /** Подтверждённые пропуски: синяя ручка и галочка красным карандашом */
  confirmedIds?: string[];
  /** Строка под листом голосом системы: «Совпало 2 из 3. Какие — не сообщается.» */
  message?: ProtocolMessage | null;
  /** Заголовок бланка, по умолчанию «Заключение» */
  title?: string;
  /** «Дело: «Тёплая вода»» */
  caseLabel?: string;
  /** Номер проверки: «№ 01/14-12» */
  docNumber?: string;
  /** Пояснение у кнопки «Сверить» */
  footnote?: ReactNode;
  submitting?: boolean;
  disabled?: boolean;
  /** Отметки о сверке: оттиски датера */
  checks?: ProtocolCheck[];
  /** Дата бланка «14.12.2026» */
  date?: string;
  /** Номер дела для штампа «ПРИНЯТО»: «01» */
  caseNo?: string;
  /** Подпись аналитика под заключением */
  analyst?: string;
  /** «Форма 7-А» */
  formCode?: string;
  /**
   * Пачка сверки (ProtocolDef.batchSize, по умолчанию 3): пропуски засчитываются, только когда
   * верных среди неподтверждённых не меньше пачки (или верны все оставшиеся). «Сверить» активна,
   * когда заполнено не меньше min(пачка, осталось)
   */
  batchSize?: number;
  /** Город в шапке бланка: «г. Полярный» */
  city?: string;
  /** Заключение принято и подписано — «Закрыть дело» */
  onFinish?: () => void;
  /** Подпись главной кнопки после подписи, по умолчанию «Закрыть дело» */
  finishLabel?: string;
  className?: string;
}

type Segment = { kind: "text"; text: string } | { kind: "blank"; blank: ProtocolBlank };

function parseStatement(q: ProtocolQuestionView): Segment[] {
  const byId = new Map(q.blanks.map((b) => [b.id, b]));
  const out: Segment[] = [];
  for (const part of q.text.split(/(\{[^}]+\})/g)) {
    if (!part) continue;
    const m = part.match(/^\{([^}]+)\}$/);
    const blank = m ? byId.get(m[1]) : undefined;
    out.push(blank ? { kind: "blank", blank } : { kind: "text", text: typo(part) });
  }
  return out;
}

/**
 * Заключение (раздел 7.13) — протокол дедукции в духе Obra Dinn, но в материале:
 * лист офисной бумаги на столе, пропуски карандашом, подтверждённое — синей ручкой
 * с галочкой красным карандашом на полях, сверка — оттиском датера. Финал — штамп,
 * печать и росчерк. Кнопка «Сверить» — экранная, под листом.
 */
export function ProtocolForm({
  questions,
  values,
  onChange,
  onSubmit,
  confirmedIds = [],
  message,
  title = "Заключение",
  caseLabel,
  docNumber,
  footnote,
  submitting = false,
  disabled = false,
  checks = [],
  date,
  caseNo,
  analyst = "Ноль",
  formCode = "Форма 7-А",
  batchSize = 3,
  city = "г.\u00A0Полярный",
  onFinish,
  finishLabel = "Закрыть дело",
  className,
}: ProtocolFormProps) {
  const confirmed = new Set(confirmedIds);
  const allBlanks = questions.flatMap((q) => q.blanks);
  const solved = allBlanks.length > 0 && allBlanks.every((b) => confirmed.has(b.id));
  const remaining = allBlanks.filter((b) => !confirmed.has(b.id)).length;
  const pendingFilled = allBlanks.filter((b) => !confirmed.has(b.id) && values[b.id]).length;
  const need = Math.max(1, Math.min(batchSize, remaining));
  const canSubmit = !disabled && !submitting && !solved && pendingFilled >= need;

  /* ---------- Номер пачки карандашом на поле: в какой сверке ушёл этот ответ ---------- */
  const [sent, setSent] = useState<Record<string, { value: string; attempt: number }>>({});
  const [sentAt, setSentAt] = useState(checks.length);
  if (checks.length !== sentAt) {
    // Пришёл новый оттиск: всё заполненное и неподтверждённое ушло в эту пачку
    setSentAt(checks.length);
    if (checks.length > sentAt) {
      const next = { ...sent };
      for (const b of allBlanks) {
        const v = values[b.id];
        if (v && !confirmed.has(b.id)) next[b.id] = { value: v, attempt: checks.length };
      }
      setSent(next);
    }
  }
  const batchOf = (q: ProtocolQuestionView): number | null => {
    const filled = q.blanks.filter((b) => !confirmed.has(b.id) && values[b.id]);
    if (filled.length === 0) return null;
    // Ответ не меняли после сверки — номер той пачки; новый или исправленный — следующей
    const sentAll = filled.every((b) => sent[b.id]?.value === values[b.id]);
    return sentAll ? Math.max(...filled.map((b) => sent[b.id].attempt)) : checks.length + 1;
  };

  /* ---------- Что подтвердилось на глазах игрока: галочки по очереди, затем финал ---------- */
  const seen = useRef<{ confirmed: Set<string>; checks: number } | null>(null);
  const [fresh, setFresh] = useState<{ questions: string[]; checks: number; final: boolean }>({
    questions: [],
    checks: -1,
    final: false,
  });
  const confirmedKey = confirmedIds.join("|");
  useEffect(() => {
    const before = seen.current;
    seen.current = { confirmed: new Set(confirmedIds), checks: checks.length };
    if (!before) return;
    const newly = questions
      .filter((q) => q.blanks.length > 0 && q.blanks.every((b) => confirmedIds.includes(b.id)))
      .filter((q) => !q.blanks.every((b) => before.confirmed.has(b.id)))
      .map((q) => q.id);
    const wasSolved = allBlanks.length > 0 && allBlanks.every((b) => before.confirmed.has(b.id));
    if (newly.length === 0 && checks.length === before.checks) return;
    const t = window.setTimeout(
      () =>
        setFresh({
          questions: newly,
          checks: checks.length > before.checks ? checks.length - 1 : -1,
          final: solved && !wasSolved,
        }),
      0
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- сравниваем по составу, а не по ссылкам
  }, [confirmedKey, checks.length]);

  // Тайминги финала: дата (70 мс) → галочки через 140 мс → через 400 мс штамп → печать → подпись
  const checkDelay = (qid: string) => 280 + Math.max(0, fresh.questions.indexOf(qid)) * 140;
  const lastCheck = 280 + Math.max(0, fresh.questions.length - 1) * 140 + 180;
  const stampDelay = lastCheck + 400;
  const signedAt = stampDelay + 250 + 270 + 400;

  // Строка «Заключение принято» и «Закрыть дело» — после удара штампа и росчерка, а не раньше
  const [landed, setLanded] = useState<"none" | "stamp" | "signed">(solved ? "signed" : "none");
  useEffect(() => {
    if (!fresh.final) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = window.setTimeout(() => setLanded("none"), 0);
    const t1 = window.setTimeout(() => setLanded("stamp"), reduced ? 0 : stampDelay + 70);
    const t2 = window.setTimeout(() => setLanded("signed"), reduced ? 0 : signedAt);
    return () => [t0, t1, t2].forEach(window.clearTimeout);
  }, [fresh.final, stampDelay, signedAt]);
  const showMessage = !solved || landed !== "none";

  return (
    <section aria-label={title} className={cn("min-w-0 px-4 pt-8 pb-10 max-lg:px-0 max-lg:pt-0 max-lg:pb-0", className)}>
      <article className="relative mx-auto w-full max-w-[720px] paper shadow-paper toner max-lg:shadow-none">
        <div className="pt-12 pr-16 pb-16 pl-[72px] max-lg:pt-6 max-lg:pr-4 max-lg:pb-8 max-lg:pl-10">
          {/* Шапка бланка: угловой штамп организации, гриф, номер формы */}
          <div className="flex items-start justify-between gap-6 font-serif text-print max-lg:flex-col max-lg:gap-3">
            <div className="flex flex-col items-center text-center text-[11px] leading-[15px] tracking-[0.04em] uppercase">
              <span>МВД России</span>
              <span>УМВД по&nbsp;г.&nbsp;Полярный</span>
              <span>Отдел аналитики</span>
              <span className="mt-1.5 flex items-baseline gap-1 tracking-normal normal-case">
                №<span className="inline-block w-14 border-b border-print-3" />
                от<span className="inline-block w-16 border-b border-print-3" />
              </span>
            </div>
            <div className="flex flex-col items-end text-right text-[11px] leading-[15px] text-print-2 max-lg:items-start max-lg:text-left">
              <span>Для служебного пользования</span>
              <span>Экз. №&nbsp;1</span>
              <span className="mt-1.5">{formCode}</span>
            </div>
          </div>
          <h2 className="mt-8 text-center doc-head">{title}</h2>
          {docNumber && <p className="mt-1 text-center doc-15">аналитика по материалам проверки {typo(docNumber)}</p>}
          <div className="mt-6 flex items-baseline justify-between gap-4 doc-15">
            <span>{city}</span>
            <span className="tnum">{date}</span>
          </div>
          {caseLabel && <p className="doc-15">{caseLabel}</p>}
          <div className="mt-2 h-px bg-print-3" />

          {/* Пункты */}
          <ol className="mt-6 flex flex-col gap-2">
            {questions.map((q, qi) => {
              const done = q.blanks.length > 0 && q.blanks.every((b) => confirmed.has(b.id));
              const isFresh = fresh.questions.includes(q.id);
              const batch = done ? null : batchOf(q);
              return (
                <li key={q.id} className="relative grid grid-cols-[24px_1fr] font-serif text-[15px] leading-8">
                  {done && (
                    <span className="absolute top-1.5 -left-14 max-lg:-left-9">
                      <PencilCheck id={q.id} animate={isFresh} delay={isFresh ? checkDelay(q.id) : 0} />
                    </span>
                  )}
                  {batch !== null && (
                    // Номер пачки карандашом: после «СВЕРКА 2 … СОВПАЛО 1 ИЗ 2» видно, какие пункты были во второй
                    <span
                      className="absolute top-0 -left-12 font-serif text-[13px] text-pencil italic max-lg:-left-8"
                      title={`Пачка ${batch}`}
                    >
                      {batch}
                    </span>
                  )}
                  <span>{qi + 1}.</span>
                  <p className="min-w-0">
                    {parseStatement(q).map((seg, si) =>
                      seg.kind === "text" ? (
                        <span key={si}>{seg.text}</span>
                      ) : (
                        <Blank
                          key={si}
                          blank={seg.blank}
                          value={values[seg.blank.id] ?? null}
                          confirmed={confirmed.has(seg.blank.id)}
                          inkDelay={isFresh ? checkDelay(q.id) + 180 : 0}
                          disabled={disabled || solved}
                          onChange={(v) => onChange(seg.blank.id, v)}
                        />
                      )
                    )}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* Отметки о сверке */}
          <h3 className="mt-10 doc-15 font-bold">Отметки о сверке</h3>
          <div className="mt-2 flex h-24 flex-wrap content-start items-start gap-x-4 overflow-hidden border border-print-3 px-3 py-2 max-lg:h-auto max-lg:min-h-16 max-lg:flex-col max-lg:flex-nowrap max-lg:gap-y-1">
            {checks.map((c, i) => (
              <DaterStamp
                key={c.attempt}
                id={`dater-${c.attempt}`}
                attempt={c.attempt}
                date={date ? date.replace(/\.(\d{2})(\d{2})$/, ".$2") : undefined}
                time={c.at}
                matched={c.matched}
                total={c.total}
                animate={i === fresh.checks}
              />
            ))}
          </div>

          {/* Подпись; штамп «ПРИНЯТО» и печать ложатся справа от неё, а не на отметки */}
          <div className="relative mt-12 doc-15 max-lg:mt-10">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-4">
              <span>Аналитик</span>
              <span className="flex flex-col items-center">
                <span className="relative h-8 w-36 border-b border-print-3">
                  {solved && (
                    <Signature animate={fresh.final} delay={stampDelay + 250 + 270} className="absolute -bottom-1 left-2" />
                  )}
                </span>
                <span className="doc-11 text-print-2">(подпись)</span>
              </span>
              <span className="flex flex-col items-center">
                <span className="flex h-8 min-w-24 items-end justify-center border-b border-print-3 px-2">{analyst}</span>
                <span className="doc-11 text-print-2">(расшифровка подписи)</span>
              </span>
            </div>

            {/* Финал: штамп «ПРИНЯТО», через 250 мс — круглая печать */}
            {solved && (
              <div className="pointer-events-none absolute -top-8 -right-8 max-lg:relative max-lg:right-auto max-lg:top-auto max-lg:mt-6 max-lg:flex max-lg:justify-end max-lg:pr-10">
                <Stamp
                  id={`accepted-${caseNo ?? docNumber ?? "case"}`}
                  rotate={-3}
                  animate={fresh.final}
                  delay={stampDelay}
                  className="px-5 py-2"
                >
                  <span className="text-[28px] leading-8">Принято</span>
                  <span className="mt-0.5 text-[10px] leading-3 whitespace-pre">
                    {`заключение по делу № ${caseNo ?? "—"}   ${date ?? ""}`}
                  </span>
                </Stamp>
                <RoundSeal
                  id={`seal-${caseNo ?? docNumber ?? "case"}`}
                  animate={fresh.final}
                  delay={stampDelay + 250}
                  className="absolute -right-4 -bottom-16 max-lg:right-0 max-lg:-bottom-10 max-lg:size-24"
                />
              </div>
            )}
          </div>
        </div>

        {/* Выходные данные типографии по нижнему краю бланка */}
        <p aria-hidden className="absolute right-0 bottom-2 left-0 text-center font-serif text-[8px] leading-[10px] text-print-2">
          Ф.&nbsp;7-А. Тип. УВД г.&nbsp;Полярный. Зак.&nbsp;114. Тир.&nbsp;500.
        </p>
      </article>

      {/* Экранная часть под листом: «Сверить» и строка системы */}
      <div className="mx-auto mt-4 flex w-full max-w-[720px] flex-col items-end gap-2 max-lg:sticky max-lg:bottom-0 max-lg:mt-0 max-lg:gap-1 max-lg:border-t max-lg:border-line max-lg:bg-scr-chrome max-lg:px-4 max-lg:py-1.5">
        {!solved && (
          <div className="flex items-center gap-4 max-lg:w-full max-lg:justify-between">
            <p className={cn("ui-12 max-lg:max-w-[64%]", pendingFilled < need ? "text-ink-2" : "text-ink-3")} aria-live="polite">
              {footnote ?? batchLine(pendingFilled, need, remaining)}
            </p>
            <ScreenButton variant="primary" onClick={onSubmit} disabled={!canSubmit} className="min-w-24" data-testid="protocol-submit">
              Сверить
            </ScreenButton>
          </div>
        )}
        {message && showMessage && (
          <p role="status" className="ui-13 text-ink-2">
            {typo(message.text)}
          </p>
        )}
        {solved && onFinish && landed === "signed" && (
          <ScreenButton variant="primary" onClick={onFinish} className="min-w-28">
            {finishLabel}
          </ScreenButton>
        )}
      </div>
    </section>
  );
}

const blanksWord = (n: number) => ruPlural(n, ["пропуск", "пропуска", "пропусков"]);

/** Живая строка у «Сверить»: сколько в пачке и от скольки верных она засчитывается */
function batchLine(filled: number, need: number, remaining: number): string {
  if (filled === 0) return need >= remaining ? `Сверка пачкой: заполните все ${remaining}.` : `Сверка пачкой, от ${need} ${blanksWord(need)}.`;
  const head = `В пачке ${filled}\u00A0${blanksWord(filled)}.`;
  if (filled < need) return `${head} Нужно не меньше ${need}.`;
  if (need >= remaining) return `${head} Засчитывается, только если верны все.`;
  return `${head} Засчитывается от ${need}\u00A0верных.`;
}

/* ---------- Пропуск в бланке ---------- */

function Blank({
  blank,
  value,
  confirmed,
  inkDelay,
  disabled,
  onChange,
}: {
  blank: ProtocolBlank;
  value: string | null;
  confirmed: boolean;
  inkDelay: number;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const label = value ? (blank.options.find((o) => o.value === value)?.label ?? value) : null;
  const caption = `(${blank.label})`;
  const ink: CSSProperties = {
    color: confirmed ? "var(--pen)" : "var(--pencil)",
    transition: "color 160ms linear",
    transitionDelay: `${inkDelay}ms`,
  };

  return (
    <span className="relative mx-1 inline-flex min-w-[8em] flex-col align-baseline" style={ink}>
      {confirmed ? (
        <span className="border-b border-print-3 px-1 text-center font-serif text-[15px] leading-6 italic" aria-label={`${blank.label}: ${label}, подтверждено`}>
          {label}
        </span>
      ) : (
        <Select.Root
          items={blank.options.map((o) => ({ value: o.value, label: o.label }))}
          value={value}
          onValueChange={(v) => onChange((v as string | null) ?? null)}
          disabled={disabled}
        >
          <Select.Trigger
            aria-label={blank.label}
            data-blank-id={blank.id}
            className={cn(
              "relative h-6 border-b border-print-3 px-1 text-center font-serif text-[15px] leading-6 italic outline-none",
              // Касание 44 px на мобильном — невидимое поле вокруг пропуска
              "max-lg:before:absolute max-lg:before:-inset-x-1 max-lg:before:-inset-y-2.5 max-lg:before:content-['']",
              "hover:border-print-2 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-print data-popup-open:border-print-2",
              "disabled:cursor-default"
            )}
          >
            <Select.Value>{() => label ?? " "}</Select.Value>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="z-[70] outline-none" side="bottom" align="start" sideOffset={14} alignItemWithTrigger={false}>
              {/* Бумажка с вариантами под пропуском */}
              <Select.Popup className="w-[280px] paper-2 py-1 shadow-pinned outline-none toner">
                <Select.List className="max-h-[min(var(--available-height),20rem)] overflow-y-auto">
                  {blank.options.map((opt) => (
                    <Select.Item
                      key={opt.value}
                      value={opt.value}
                      data-value={opt.value}
                      className="group/opt flex h-8 cursor-default items-baseline gap-3 px-4 font-serif text-[15px] leading-8 text-print outline-none select-none"
                    >
                      <Select.ItemText className="decoration-pencil decoration-1 underline-offset-4 group-data-highlighted/opt:underline group-data-selected/opt:underline">
                        {opt.label}
                      </Select.ItemText>
                      {opt.note && <span className="ml-auto doc-11 text-print-2">{opt.note}</span>}
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      )}
      <span aria-hidden className="text-center doc-11 text-print-2">
        {caption}
      </span>
    </span>
  );
}
