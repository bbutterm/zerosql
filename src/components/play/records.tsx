"use client";

import { useState } from "react";
import { Redaction, ScreenButton, TabBar } from "@/components/kit/screen";
import { formatInt, typo } from "@/components/kit/typo";
import { MirrorWindow } from "./mirror-window";

export type RecordsTab = "secrets" | "achievements" | "profile";

export interface SecretRecord {
  id: string;
  title: string;
  text: string;
  found: boolean;
}

export interface AchievementRecord {
  id: string;
  title: string;
  description: string;
  got: boolean;
  hidden?: boolean;
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).map((w) => w.length);

/**
 * Личное дело аналитика: «Тайники» (найденные записки, ненайденные — редактурой),
 * «Отметки» (достижения; скрытые до получения не раскрываются) и «Профиль»
 * (звание, мастерство по понятиям, увиденные концовки).
 */
export function SeasonRecords({
  secrets,
  achievements,
  mastery,
  rank,
  endings,
  tab: initialTab = "secrets",
  onClose,
}: {
  secrets: SecretRecord[];
  achievements: AchievementRecord[];
  mastery: Record<string, number>;
  rank: { title: string; points: number; next?: { title: string; at: number } };
  /** Названия увиденных концовок */
  endings: string[];
  tab?: RecordsTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<RecordsTab>(initialTab);
  const found = secrets.filter((s) => s.found).length;
  const got = achievements.filter((a) => a.got).length;
  const concepts = Object.entries(mastery).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <MirrorWindow
      section="Личное дело"
      status={rank.title}
      footer={
        <ScreenButton variant="primary" onClick={onClose}>
          Закрыть
        </ScreenButton>
      }
    >
      <div className="mx-auto max-w-[760px] px-4 pt-2 pb-6" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <TabBar
          label="Разделы личного дела"
          value={tab}
          onChange={setTab}
          items={[
            { id: "secrets", label: "Тайники", count: `${found} из ${secrets.length}` },
            { id: "achievements", label: "Отметки", count: `${got} из ${achievements.length}` },
            { id: "profile", label: "Профиль" },
          ]}
          className="mb-4"
        />

        {tab === "secrets" &&
          (secrets.length === 0 ? (
            <p className="ui-14 text-ink-2">Записей нет.</p>
          ) : (
            <ol className="flex flex-col">
              {secrets.map((s, i) => (
                <li key={s.id} className="border-b border-line py-3">
                  <p className="flex gap-3">
                    <span className="w-6 shrink-0 mono-12 text-ink-3 tnum">{String(i + 1).padStart(2, "0")}</span>
                    {s.found ? (
                      <span className="ui-15 text-ink-1">{typo(s.title)}</span>
                    ) : (
                      <Redaction chars={s.title.length} words={words(s.title)} className="mono-13 text-ink-3" />
                    )}
                  </p>
                  {s.found && <p className="mt-1 ml-9 doc-14 text-ink-2">{typo(s.text)}</p>}
                </li>
              ))}
            </ol>
          ))}

        {tab === "achievements" && (
          <ul className="flex flex-col">
            {achievements.map((a) => (
              <li key={a.id} className="border-b border-line py-2.5">
                {a.got || !a.hidden ? (
                  <>
                    <p className={a.got ? "ui-14 text-ink-1" : "ui-14 text-ink-3"}>{typo(a.title)}</p>
                    <p className="ui-12 text-ink-3">
                      {typo(a.description)}
                      {!a.got && " Не получено."}
                    </p>
                  </>
                ) : (
                  <>
                    <Redaction chars={a.title.length} words={words(a.title)} className="mono-13 text-ink-3" />
                    <p className="ui-12 text-ink-3">Скрыто до получения.</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {tab === "profile" && (
          <div className="flex flex-col gap-6">
            <section>
              <p className="ui-12 text-ink-3">Звание</p>
              <p className="ui-20 text-ink-1">{rank.title}</p>
              <p className="ui-13 text-ink-2">
                Очков за сезон: {formatInt(rank.points)}
                {rank.next && `. Следующее — «${rank.next.title}» с ${formatInt(rank.next.at)}`}.
              </p>
            </section>
            <section>
              <p className="mb-1 ui-12 text-ink-3">Мастерство</p>
              {concepts.length === 0 ? (
                <p className="ui-14 text-ink-2">Записей нет.</p>
              ) : (
                <table className="w-full max-w-[420px] border-separate border-spacing-0">
                  <tbody>
                    {concepts.map(([concept, value]) => (
                      <tr key={concept}>
                        <td className="border-b border-line py-1 pr-3 mono-13 text-ink-1">{concept}</td>
                        <td className="border-b border-line py-1 text-right mono-13 text-ink-2 tnum">{Math.round(value)} из 100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section>
              <p className="mb-1 ui-12 text-ink-3">Концовки</p>
              <p className="ui-14 text-ink-1">{endings.length ? endings.map((t) => `«${t}»`).join(", ") : "Записей нет."}</p>
            </section>
          </div>
        )}
      </div>
    </MirrorWindow>
  );
}
