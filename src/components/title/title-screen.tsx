"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@base-ui/react/select";
import { cn } from "@/lib/utils";
import { Glyph } from "@/components/kit/glyphs";
import { StickyNote } from "@/components/kit/paper";
import { MENU_ITEM, MENU_POPUP, ScreenButton, ScreenField, screenButtonClass } from "@/components/kit/screen";
import { useBackground } from "@/components/story/scene-backdrop";
import { TITLE_PAINTING } from "@/data/backgrounds";

export interface TitleMenuAction {
  /** Ссылка (next/link) или колбэк */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Подпись к пункту: «Дело 01, «Тёплая вода»» */
  meta?: string;
}

export interface TitleScreenProps {
  /** Строка под окном входа */
  subtitle?: ReactNode;
  /** Режим «Новый сеанс» */
  newGame?: TitleMenuAction;
  /** Режим «Продолжить сеанс» (выбран по умолчанию, если есть); meta — строка под полями */
  continueGame?: TitleMenuAction;
  /** Режим «Журнал дел» */
  archive?: TitleMenuAction;
  /** Кнопка «Параметры…» */
  settings?: TitleMenuAction;
  /** Версия в подвале окна */
  version?: string;
  /** Подвал экрана справа внизу (вне окна) */
  footer?: ReactNode;
  /** Логин в поле «Пользователь» */
  login?: string;
  /** «Последний вход: 14.12.2026 02:44» — из сохранения; сюжет может переопределить */
  lastLogin?: string;
  /** Стикер рукой предшественницы на углу окна */
  stickyNote?: string;
  className?: string;
}

const enabled = (a?: TitleMenuAction) => Boolean(a && !a.disabled && (a.href || a.onClick));

type Mode = "continue" | "new" | "archive";

/**
 * Экран входа = главное меню (раздел 7.2). Это диалог ведомственной программы, а не карточка
 * SaaS: строка окна, шапка организации, поля с подписями слева, «Режим», кнопки внизу справа,
 * версия в подвале окна. Единственный предмет поверх экрана вне диалога — стикер предшественницы.
 */
export function TitleScreen({
  subtitle,
  newGame,
  continueGame,
  archive,
  settings,
  version = "АИС «Зеркало» 4.2.17",
  footer,
  login = "ноль",
  lastLogin,
  stickyNote = "пароль — как всегда",
  className,
}: TitleScreenProps) {
  const router = useRouter();
  const modes = (
    [
      { id: "continue", label: "Продолжить сеанс", action: continueGame },
      { id: "new", label: "Новый сеанс", action: newGame },
      { id: "archive", label: "Журнал дел", action: archive },
    ] as Array<{ id: Mode; label: string; action?: TitleMenuAction }>
  ).filter((m) => enabled(m.action));
  const [mode, setMode] = useState<Mode | null>(null);
  const current = modes.find((m) => m.id === mode) ?? modes[0];
  const submitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => submitRef.current?.focus({ preventScroll: true }), []);

  const run = (action?: TitleMenuAction) => {
    if (!action || !enabled(action)) return;
    action.onClick?.();
    if (action.href) router.push(action.href);
  };

  return (
    <div className={cn("relative flex h-dvh min-h-[560px] w-full flex-col bg-room", className)}>
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="relative w-full max-w-[420px]">
          <form
            aria-label="Вход в систему"
            className="border border-line-strong bg-scr-base"
            onSubmit={(e) => {
              e.preventDefault();
              run(current?.action);
            }}
          >
            <header className="flex h-7 items-center border-b border-line bg-scr-chrome px-3">
              <h1 className="truncate ui-13 font-medium text-ink-1">Зеркало 4.2 — Вход в систему</h1>
            </header>

            <div className="px-5 pt-4 pb-5">
              <p className="mono-12 text-ink-3">
                УМВД России по&nbsp;г.&nbsp;Полярный
                <br />
                АИС «Зеркало». Подсистема аналитики
              </p>
              <div className="mt-4 h-px bg-line" />

              <div className="mt-4 grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 max-lg:grid-cols-[88px_minmax(0,1fr)]">
                <label htmlFor="login-user" className="text-right ui-13 text-ink-2">
                  Пользователь:
                </label>
                <ScreenField id="login-user" readOnly value={login} aria-readonly className="max-lg:h-11" />
                <label htmlFor="login-pass" className="text-right ui-13 text-ink-2">
                  Пароль:
                </label>
                <ScreenField id="login-pass" readOnly value="●●●●●●●●" aria-readonly className="text-ink-2 max-lg:h-11" />
                {modes.length > 0 && (
                  <>
                    <span id="login-mode-label" className="text-right ui-13 text-ink-2">
                      Режим:
                    </span>
                    <ModeSelect
                      modes={modes}
                      value={current?.id ?? null}
                      onChange={setMode}
                      labelledBy="login-mode-label"
                    />
                  </>
                )}
                {(lastLogin || (current?.id === "continue" && current.action?.meta)) && (
                  <p className="col-start-2 ui-12 text-ink-3">
                    {current?.id === "continue" && current.action?.meta ? current.action.meta : null}
                    {current?.id === "continue" && current.action?.meta && lastLogin ? <br /> : null}
                    {lastLogin && <>Последний вход: {lastLogin}</>}
                  </p>
                )}
              </div>
            </div>

            <footer className="flex items-center gap-2 border-t border-line px-3 py-2.5 max-lg:flex-wrap max-lg:justify-end">
              {/* Узко: версия своей строкой, кнопки — справа под ней, как в настоящем диалоге */}
              <span className="mr-auto truncate mono-12 text-ink-3 max-lg:mr-0 max-lg:mb-1 max-lg:basis-full">{version}</span>
              <button
                ref={submitRef}
                type="submit"
                data-testid="login-submit"
                disabled={!current}
                className={cn(screenButtonClass("primary", { disabled: !current }), "min-w-20")}
              >
                Войти
              </button>
              <button
                type="button"
                onClick={() => run(settings)}
                disabled={!enabled(settings)}
                className={screenButtonClass("secondary", { disabled: !enabled(settings) })}
              >
                Параметры…
              </button>
            </footer>
          </form>

          {stickyNote && (
            <StickyNote
              id="login-sticky"
              rotate={2.5}
              size={120}
              className="absolute -top-8 -right-24 max-lg:hidden"
            >
              {stickyNote}
            </StickyNote>
          )}
          {stickyNote && (
            <StickyNote
              id="login-sticky"
              rotate={2.5}
              size={96}
              className="absolute -top-[92px] right-3 lg:hidden"
            >
              {stickyNote}
            </StickyNote>
          )}
          {subtitle && <div className="mt-4 ui-12 text-ink-3">{subtitle}</div>}
        </div>
      </div>
      {footer && <footer className="flex items-center justify-end gap-4 px-4 pb-4 mono-12 text-ink-3">{footer}</footer>}
    </div>
  );
}

/** «Режим:» — выпадающий список окна входа, как в ведомственном диалоге */
function ModeSelect({
  modes,
  value,
  onChange,
  labelledBy,
}: {
  modes: Array<{ id: Mode; label: string }>;
  value: Mode | null;
  onChange: (m: Mode) => void;
  labelledBy: string;
}) {
  return (
    <Select.Root
      items={modes.map((m) => ({ value: m.id, label: m.label }))}
      value={value}
      onValueChange={(v) => v && onChange(v as Mode)}
    >
      <Select.Trigger
        aria-labelledby={labelledBy}
        className="flex h-7 w-full min-w-0 items-center justify-between gap-2 rounded-[2px] border border-line-strong bg-room pr-2 pl-2 text-left ui-13 text-ink-1 outline-none focus-visible:border-ink-2 data-popup-open:border-ink-2 max-lg:h-11"
      >
        <Select.Value />
        <Glyph name="disclosure-open" size={10} className="text-ink-3" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-[70] outline-none" side="bottom" align="start" sideOffset={2} alignItemWithTrigger={false}>
          <Select.Popup className={cn(MENU_POPUP, "min-w-[var(--anchor-width)]")}>
            <Select.List>
              {modes.map((m) => (
                <Select.Item key={m.id} value={m.id} className={cn(MENU_ITEM, "max-lg:h-11")}>
                  <Select.ItemText>{m.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/* ---------- Предупреждение (только первый запуск) ---------- */

export function AgeWarning({ onAccept, className }: { onAccept?: () => void; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <div className={cn("flex h-dvh min-h-[420px] w-full items-center justify-center bg-room px-4", className)}>
      <div className="w-full max-w-[520px]">
        <p className="mono-13 text-ink-2">18+</p>
        <p className="mt-3 ui-15 font-normal text-ink-1">
          Игра для взрослых. В&nbsp;ней есть смерть, насилие и&nbsp;ненормативная речь. Играть лучше в&nbsp;наушниках.
        </p>
        <ScreenButton ref={ref} variant="secondary" onClick={onAccept} className="mt-6" data-testid="age-ok">
          Понятно
        </ScreenButton>
      </div>
    </div>
  );
}

/* ---------- Холодное открытие ---------- */

export interface ColdOpenProps {
  /**
   * Ключевая картина: id из src/data/locations.json, файл public/backgrounds/<id>.webp
   * (по умолчанию title_night). Нет файла или null — титр на чистой комнате
   */
  painting?: string | null;
  /** Первая строка (печатается): «Полярная ночь. 14 декабря 2026 года, 01:40.» */
  stamp?: string;
  /** Вторая строка (PT Serif) */
  line?: string;
  /** Любая клавиша или клик */
  onContinue?: () => void;
  className?: string;
}

/** Сколько ждать ключевую картину, прежде чем начать титром, мс */
const PAINTING_WAIT_MS = 800;

/**
 * Холодное открытие (раздел 7.1). С картиной — кадр на весь экран, текст слева снизу,
 * знак и название продукта слева сверху. Без картины — киношный титр: чистая комната,
 * по центру колонка 640 px, время PT Mono над фразой PT Serif. Пейзажа кодом нет.
 *
 * Раскладка выбирается один раз, до первой буквы: картина, если она загрузилась (404 запоминает
 * media-cache), иначе титр. Пока картина грузится (не дольше 800 мс), на экране чистая комната.
 */
export function ColdOpen({
  painting = TITLE_PAINTING,
  stamp = "Полярная ночь. 14 декабря 2026 года, 01:40.",
  line = "Город греет дата-центр. Полынья в заливе не замерзает даже в минус сорок.",
  onContinue,
  className,
}: ColdOpenProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState(0);

  const art = useBackground(painting);
  const [waited, setWaited] = useState(false);
  const [layout, setLayout] = useState<{ image: string | null } | null>(null);
  if (layout === null && (art.url !== null || !art.pending || waited)) setLayout({ image: art.url });
  const image = layout?.image ?? null;
  const started = layout !== null;

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (started) return;
    const t = window.setTimeout(() => setWaited(true), PAINTING_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [started]);

  useEffect(() => {
    if (!started) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = window.setTimeout(() => {
        setTyped(stamp.length);
        setPhase(2);
      }, 0);
      return () => window.clearTimeout(t);
    }
    let n = 0;
    const timers: number[] = [];
    const tick = window.setInterval(() => {
      n += 1;
      setTyped(n);
      if (n >= stamp.length) {
        window.clearInterval(tick);
        timers.push(window.setTimeout(() => setPhase(1), 600));
        timers.push(window.setTimeout(() => setPhase(2), 600 + 1200));
      }
    }, 22);
    return () => {
      window.clearInterval(tick);
      timers.forEach(window.clearTimeout);
    };
  }, [stamp, started]);

  const text = (
    <>
      <p className="mono-13 text-ink-2">
        {/* Печать скрыта от чтения, полный текст — для экранного диктора (aria-label у <p> не читается) */}
        <span className="sr-only">{stamp}</span>
        <span aria-hidden>{stamp.slice(0, typed)}</span>
        <span aria-hidden className="invisible">
          {stamp.slice(typed)}
        </span>
      </p>
      <p
        className="mt-4 doc-22 text-ink-1 [text-wrap:pretty] max-lg:text-[19px] max-lg:leading-7"
        style={{ opacity: phase >= 1 ? 1 : 0, transition: "opacity 400ms linear" }}
      >
        {line}
      </p>
      <p className="mt-8 ui-13 text-ink-3" style={{ visibility: phase >= 2 ? "visible" : "hidden" }}>
        Нажмите любую клавишу
      </p>
    </>
  );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={() => onContinue?.()}
      onClick={() => onContinue?.()}
      data-testid="cold-open"
      className={cn("relative h-dvh min-h-[480px] w-full overflow-hidden bg-room outline-none", className)}
    >
      {!started ? null : image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- ключевая картина из public/ */}
          <img src={image} alt="" className="absolute inset-0 size-full object-cover object-[30%_70%]" draggable={false} />
          <div className="absolute top-12 left-12 flex items-center gap-2 max-lg:top-6 max-lg:left-4">
            <Glyph name="zero-mark" size={16} className="text-cold" />
            <span className="mono-13 text-ink-2">ZeroSQL</span>
          </div>
          <div className="absolute right-16 bottom-16 left-16 max-w-[640px] max-lg:right-4 max-lg:bottom-10 max-lg:left-4">
            {text}
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="w-full max-w-[640px] -translate-y-[4%]">{text}</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Блокировка станции (пауза) ---------- */

export function LockScreen({
  onUnlock,
  burnIn,
  className,
}: {
  onUnlock?: () => void;
  /** Сюжетное выгорание: её логин и строка состояния, непрозрачность 0.04 */
  burnIn?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      onKeyDown={() => onUnlock?.()}
      onClick={() => onUnlock?.()}
      className={cn("relative flex h-dvh w-full flex-col items-center justify-center bg-room outline-none", className)}
    >
      <p className="ui-15 font-normal text-ink-2">Рабочая станция заблокирована.</p>
      <p className="mt-2 ui-12 text-ink-3">Нажмите любую клавишу.</p>
      {burnIn && (
        <p aria-hidden className="absolute inset-x-3 bottom-1 mono-12 text-ink-1 opacity-[0.04]">
          {burnIn}
        </p>
      )}
    </div>
  );
}
