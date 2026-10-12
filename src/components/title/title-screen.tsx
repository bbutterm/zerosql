"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SteamCanvas } from "@/components/kit/atmosphere";
import { Glyph } from "@/components/kit/glyphs";
import { StickyNote } from "@/components/kit/paper";
import { ScreenButton, ScreenField, screenButtonClass } from "@/components/kit/screen";

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
  /** «Начать смену» (нет сохранения) или «Новый сеанс» (есть) */
  newGame?: TitleMenuAction;
  /** «Войти» — продолжить сохранённый сеанс */
  continueGame?: TitleMenuAction;
  /** «Журнал дел» */
  archive?: TitleMenuAction;
  /** «Параметры» */
  settings?: TitleMenuAction;
  /** Подпись сборки внизу экрана */
  version?: string;
  /** Подвал справа внизу */
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

function ActionButton({
  action,
  variant,
  children,
  className,
}: {
  action?: TitleMenuAction;
  variant: "primary" | "text";
  children: ReactNode;
  className?: string;
}) {
  const on = enabled(action);
  const cls = cn(
    variant === "primary"
      ? cn("w-full", screenButtonClass("primary", { disabled: !on }))
      : cn("h-8 justify-start", screenButtonClass("text"), "max-lg:h-11"),
    className
  );
  if (on && action?.href) {
    return (
      <Link href={action.href} onClick={action.onClick} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action?.onClick} disabled={!on} className={cls}>
      {children}
    </button>
  );
}

/**
 * Экран входа = главное меню (раздел 7.2): окно «Зеркала» 400 px на фоне комнаты.
 * Поля с логином и паролем, главная кнопка во всю ширину, текстовые пункты столбиком.
 * Единственный предмет поверх экрана вне диалога — стикер предшественницы.
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
  const hasSave = enabled(continueGame);
  return (
    <div className={cn("relative flex h-dvh min-h-[560px] w-full flex-col bg-room", className)}>
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="relative w-full max-w-[400px]">
          <section aria-label="Вход в систему" className="border border-line-strong bg-scr-base">
            <header className="flex h-7 items-center justify-between border-b border-line bg-scr-chrome px-3">
              <span className="ui-13 font-medium text-ink-1">Зеркало 4.2</span>
              {/* Стикер заходит на окно на 24 px — подпись отодвинута из-под него */}
              <span className={cn("ui-13 text-ink-3", stickyNote && "lg:mr-6")}>Вход в систему</span>
            </header>
            <div className="flex flex-col p-6">
              <label className="flex flex-col gap-1">
                <span className="ui-12 text-ink-3">Пользователь</span>
                <ScreenField readOnly value={login} aria-readonly />
              </label>
              <label className="mt-3 flex flex-col gap-1">
                <span className="ui-12 text-ink-3">Пароль</span>
                <ScreenField readOnly value="●●●●●●●●" aria-readonly className="text-ink-2" />
              </label>
              {lastLogin && <p className="mt-3 ui-12 text-ink-3">Последний вход: {lastLogin}</p>}

              <div className="mt-6">
                {hasSave ? (
                  <ActionButton action={continueGame} variant="primary">
                    Войти
                  </ActionButton>
                ) : (
                  <ActionButton action={newGame} variant="primary">
                    Начать смену
                  </ActionButton>
                )}
                {hasSave && continueGame?.meta && <p className="mt-2 ui-12 text-ink-3">{continueGame.meta}</p>}
              </div>

              <nav aria-label="Меню" className="mt-4 flex flex-col">
                {hasSave && (
                  <ActionButton action={newGame} variant="text">
                    Новый сеанс
                  </ActionButton>
                )}
                <ActionButton action={archive} variant="text">
                  Журнал дел
                </ActionButton>
                <ActionButton action={settings} variant="text">
                  Параметры
                </ActionButton>
              </nav>
            </div>
          </section>

          {stickyNote && (
            <StickyNote
              id="login-sticky"
              rotate={2.5}
              size={120}
              className="absolute -top-6 -right-24 max-lg:hidden"
            >
              {stickyNote}
            </StickyNote>
          )}
          {stickyNote && (
            <StickyNote
              id="login-sticky"
              rotate={2.5}
              size={96}
              className="absolute -top-[90px] right-3 lg:hidden"
            >
              {stickyNote}
            </StickyNote>
          )}
          {subtitle && <div className="mt-4 ui-12 text-ink-3">{subtitle}</div>}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-4 px-4 pb-4 mono-12 text-ink-3">
        <span>{version}</span>
        {footer}
      </footer>
    </div>
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
        <ScreenButton ref={ref} variant="secondary" onClick={onAccept} className="mt-6">
          Понятно
        </ScreenButton>
      </div>
    </div>
  );
}

/* ---------- Холодное открытие ---------- */

// Нитка натриевых огней ЦОДа на горизонте: неравный шаг 6–40 px, яркость 0.5–1, без свечения
const LIGHTS = (() => {
  let s = 1401;
  const r = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 4294967296;
  };
  let x = 0;
  return Array.from({ length: 24 }, () => {
    x += 6 + Math.round(r() * 34);
    return { x, o: Math.round((0.5 + r() * 0.5) * 100) / 100, dy: r() < 0.3 ? -4 - Math.round(r() * 6) : 0 };
  });
})();

export interface ColdOpenProps {
  /** Ключевая картина; без неё — запасной кадр кодом */
  image?: string;
  /** Первая строка (печатается): «Полярная ночь. 14 декабря 2026 года, 01:40.» */
  stamp?: string;
  /** Вторая строка (PT Serif) */
  line?: string;
  /** Любая клавиша или клик */
  onContinue?: () => void;
  className?: string;
}

/**
 * Холодное открытие (раздел 7.1). Единственное место в игре, где написано название продукта.
 * Без картины: комната, горизонт на 62 %, нитка огней справа, пар над левой третью воды.
 */
export function ColdOpen({
  image,
  stamp = "Полярная ночь. 14 декабря 2026 года, 01:40.",
  line = "Город греет дата-центр. Полынья в заливе не замерзает даже в минус сорок.",
  onContinue,
  className,
}: ColdOpenProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
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
  }, [stamp]);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={() => onContinue?.()}
      onClick={() => onContinue?.()}
      className={cn("relative h-dvh min-h-[480px] w-full overflow-hidden bg-room outline-none", className)}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- ключевая картина из public/
        <img src={image} alt="" className="absolute inset-0 size-full object-cover object-[30%_70%]" draggable={false} />
      ) : (
        <div aria-hidden className="absolute inset-0">
          <div className="absolute inset-x-0 top-[62%] h-px bg-[#2a3134]" />
          <div className="absolute top-[62%] right-[9%] h-0" style={{ width: LIGHTS[LIGHTS.length - 1].x }}>
            {LIGHTS.map((l, i) => (
              <span
                key={i}
                className="absolute size-[2px] bg-sodium"
                style={{ left: l.x, top: -3 + l.dy, opacity: l.o }}
              />
            ))}
          </div>
          <SteamCanvas className="absolute top-[44%] left-0 h-[56%] w-[40%]" />
        </div>
      )}

      <div className="absolute top-12 left-12 flex items-center gap-2 max-lg:top-6 max-lg:left-4">
        <Glyph name="zero-mark" size={16} className="text-cold" />
        <span className="mono-13 text-ink-2">ZeroSQL</span>
      </div>

      <div className="absolute right-16 bottom-16 left-16 max-w-[640px] max-lg:right-4 max-lg:bottom-10 max-lg:left-4">
        <p className="mono-13 text-ink-1" aria-label={stamp}>
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
        <p className="mt-6 ui-13 text-ink-3" style={{ visibility: phase >= 2 ? "visible" : "hidden" }}>
          Нажмите любую клавишу
        </p>
      </div>
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
