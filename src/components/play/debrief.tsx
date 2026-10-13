"use client";

import type { Debrief, EndingResult } from "@/stores/game/types";
import { BURTSEV_TEXT, ENDING_TEXT, EPILOGUE_TEXT, GRANIN_TEXT, POST_CREDITS, RECIPIENT_TEXT, VARIANT_TEXT } from "@/data/endings";
import { ScreenButton } from "@/components/kit/screen";
import { formatInt, typo } from "@/components/kit/typo";
import { RichText } from "@/components/kit/rich-text";
import { cn } from "@/lib/utils";
import { MirrorWindow, WindowHeading } from "./mirror-window";

const starsText = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));
const signed = (n: number) => (n > 0 ? `+${formatInt(n)}` : n < 0 ? `−${formatInt(-n)}` : "0");

function SqlBlock({ label, sql }: { label: string; sql?: string }) {
  return (
    <div className="min-w-0">
      <p className="ui-12 text-ink-3">{label}</p>
      {sql ? (
        <pre className="mt-1 bg-room px-3 py-2 mono-13 break-words whitespace-pre-wrap text-ink-1">{sql}</pre>
      ) : (
        <p className="mt-1 mono-13 text-ink-3">—</p>
      )}
    </div>
  );
}

/**
 * Разбор и оценка (библия 9.1, п. 10; 6.13): эталон рядом с запросом игрока, слагаемые
 * оценки, «погода» дела, звание до и после, новые достижения.
 */
export function DebriefScreen({
  debrief,
  caseLabel,
  achievements,
  onNext,
  onCalendar,
  onEnding,
}: {
  debrief: Debrief;
  /** «Пролог. Нулевой этаж» */
  caseLabel: string;
  /** id → название и описание достижения */
  achievements: Record<string, { title: string; description: string }>;
  onNext?: () => void;
  onCalendar: () => void;
  onEnding?: () => void;
}) {
  const d = debrief;
  const rankUp = d.rankAfter.id !== d.rankBefore.id;
  const main = d.objectives.filter((o) => !o.optional);
  const extra = d.objectives.filter((o) => o.optional);
  const primary = onEnding ? (
    <ScreenButton variant="primary" onClick={onEnding}>
      Финал
    </ScreenButton>
  ) : onNext ? (
    <ScreenButton variant="primary" onClick={onNext}>
      Следующее дело
    </ScreenButton>
  ) : null;

  const objective = (o: Debrief["objectives"][number], n: number) => (
    <li key={o.id} className="border-b border-line py-3">
      <p className="ui-14 text-ink-1">
        <span className="mr-2 mono-12 text-ink-3 tnum">{n}.</span>
        <RichText text={typo(o.task)} />
      </p>
      <p className="mt-1 ui-12 text-ink-3">
        {o.done ? (o.firstTry ? "с первого запроса" : "выполнено") : "не выполнено"}
        {o.hintsUsed > 0 && `, наводок: ${o.hintsUsed}`}
        {o.withHint && ", с подсказкой"}
      </p>
      {o.done && (
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <SqlBlock label="Ваш запрос" sql={o.playerSql} />
          <SqlBlock label="Эталон" sql={o.solution} />
        </div>
      )}
    </li>
  );

  return (
    <MirrorWindow
      section={`Разбор дела. ${caseLabel}`}
      status={`оценка ${formatInt(d.score.points)}`}
      footer={
        <>
          <ScreenButton variant={primary ? "secondary" : "primary"} onClick={onCalendar}>
            Журнал дел
          </ScreenButton>
          {primary}
        </>
      }
    >
      <div className="mx-auto grid max-w-[1080px] gap-8 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <WindowHeading>Задания</WindowHeading>
          <ol>{main.map((o, i) => objective(o, i + 1))}</ol>
          {extra.length > 0 && (
            <>
              <WindowHeading>Сверх плана</WindowHeading>
              <ol>{extra.map((o, i) => objective(o, main.length + i + 1))}</ol>
            </>
          )}
        </div>

        <aside className="min-w-0">
          <WindowHeading>Погода</WindowHeading>
          <p className="ui-20 text-ink-1">{d.weatherLabel}</p>
          <p className="mt-1 mono-14 text-sodium" aria-label={`звёзд: ${d.stars} из 3`}>
            {starsText(d.stars)}
          </p>

          <WindowHeading>Оценка</WindowHeading>
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              {d.score.breakdown.map((line) => (
                <tr key={line.label}>
                  <td className="py-0.5 pr-3 ui-13 text-ink-2">{line.label}</td>
                  <td className="py-0.5 text-right mono-13 text-ink-1 tnum">{signed(line.value)}</td>
                </tr>
              ))}
              <tr>
                <td className="border-t border-line-strong pt-1 ui-13 font-medium text-ink-1">Итог</td>
                <td className="border-t border-line-strong pt-1 text-right mono-13 text-ink-1 tnum">{formatInt(d.score.points)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 ui-12 text-ink-3">
            Запросов: {d.stats.queries}, ошибок: {d.stats.errors}
            {d.stats.protocolAttempts > 0 && `, сверок: ${d.stats.protocolAttempts}`}.
          </p>

          <WindowHeading>Звание</WindowHeading>
          <p className={cn("ui-14", rankUp ? "text-sodium" : "text-ink-1")}>
            {rankUp ? `${d.rankBefore.title} → ${d.rankAfter.title}` : d.rankAfter.title}
          </p>
          <p className="mt-1 ui-12 text-ink-3">
            Очков за сезон: {formatInt(d.seasonPoints)}
            {d.rankAfter.next && `. До звания «${d.rankAfter.next.title}» — ${formatInt(Math.max(0, d.rankAfter.next.at - d.seasonPoints))}`}.
          </p>

          {d.newAchievements.length > 0 && (
            <>
              <WindowHeading>Отметки в личном деле</WindowHeading>
              <ul className="flex flex-col gap-2">
                {d.newAchievements.map((id) => (
                  <li key={id}>
                    <p className="ui-14 text-ink-1">{achievements[id]?.title ?? id}</p>
                    {achievements[id]?.description && <p className="ui-12 text-ink-3">{achievements[id].description}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </MirrorWindow>
  );
}

/* ---------- Финал и эпилог ---------- */

const yes = (v: boolean) => (v ? "да" : "нет");

/**
 * Финал (библия, разд. 3; 9.5): сводка «Что будет» по пяти входам, концовка, абзацы по флагам
 * финала, слайды эпилога и пост-титры. Бумаги нет: это вывод «Зеркала» после отправки.
 */
export function EndingScreen({
  ending,
  onArchive,
  onCalendar,
}: {
  ending: EndingResult;
  /** Свободный архив (после финала) */
  onArchive?: () => void;
  onCalendar: () => void;
}) {
  const { inputs } = ending;
  const empty = ending.id === "empty";
  return (
    <MirrorWindow
      section="Пакет отправлен"
      status="11.01.2027 13:00"
      footer={
        <>
          <ScreenButton variant={onArchive ? "secondary" : "primary"} onClick={onCalendar}>
            Журнал дел
          </ScreenButton>
          {onArchive && (
            <ScreenButton variant="primary" onClick={onArchive}>
              Архив
            </ScreenButton>
          )}
        </>
      }
    >
      <div className="mx-auto max-w-[680px] px-4 py-6">
        <WindowHeading>Что будет</WindowHeading>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 ui-13">
          <dt className="text-ink-2">Адресат пакета</dt>
          <dd className="text-right text-ink-1">{inputs.R ? RECIPIENT_TEXT[inputs.R] : "не выбран"}</dd>
          <dt className="text-ink-2">Узлы доски подтверждены двумя источниками</dt>
          <dd className="text-right text-ink-1">{yes(inputs.A)}</dd>
          <dt className="text-ink-2">Квартира Ратникова в пакете</dt>
          <dd className="text-right text-ink-1">{yes(inputs.K)}</dd>
          <dt className="text-ink-2">Свидетели изнутри</dt>
          <dd className="text-right text-ink-1 tnum">{inputs.W}</dd>
          <dt className="text-ink-2">Архив восстановлен</dt>
          <dd className="text-right text-ink-1">{yes(inputs.V)}</dd>
          <dt className="text-ink-2">Отправлен до 13:00</dt>
          <dd className="text-right text-ink-1">{yes(inputs.sent)}</dd>
        </dl>

        <p className="mt-8 doc-22 text-ink-1">«{ending.title}»</p>
        <div className="mt-3 flex flex-col gap-3 doc-15 text-ink-1">
          {ending.variant && VARIANT_TEXT[ending.variant] && <p>{typo(VARIANT_TEXT[ending.variant])}</p>}
          <p>{typo(ENDING_TEXT[ending.id] ?? "")}</p>
          {ending.burtsev && <p>{typo(BURTSEV_TEXT[ending.burtsev])}</p>}
          {!empty && ending.id !== "still" && <p>{typo(ending.graninBroken ? GRANIN_TEXT.broken : GRANIN_TEXT.intact)}</p>}
        </div>

        {empty && (
          <div className="mt-6 bg-room px-3 py-2">
            <p className="mono-13 text-ink-1">SELECT * FROM staff WHERE login = &apos;nol&apos;;</p>
            <p className="mt-1 mono-13 text-ink-2">МИРА: Найдено строк: ноль.</p>
          </div>
        )}

        {ending.epilogue.length > 0 && (
          <>
            <WindowHeading className="mt-8">Эпилог</WindowHeading>
            <ol className="flex flex-col gap-3">
              {ending.epilogue.map((key) => (
                <li key={key} className="doc-15 text-ink-1">
                  {typo(EPILOGUE_TEXT[key] ?? "")}
                </li>
              ))}
            </ol>
          </>
        )}

        {ending.postCredits && (
          <div className="mt-10 border-t border-line pt-3">
            <p className="mono-12 text-ink-3">{POST_CREDITS.source}</p>
            <p className="mt-1 mono-13 text-ink-1">{POST_CREDITS.line}</p>
          </div>
        )}
      </div>
    </MirrorWindow>
  );
}
