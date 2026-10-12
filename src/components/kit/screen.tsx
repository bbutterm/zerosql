import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

/**
 * Базовые элементы экрана «Зеркала» (раздел 7.17). Непрозрачно, без теней и иконок,
 * радиус 2 px только у кнопок и полей. Главная кнопка — одна на экран.
 */

export type ButtonVariant = "primary" | "secondary" | "text";

export interface ScreenButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Подпись клавиш внутри главной кнопки: «Ctrl+Enter» — обычный текст, не чип */
  keys?: string;
  /** Касание 44 px всегда (по умолчанию: 44 на мобильном, 24 на десктопе) */
  touch?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap ui-13 font-medium transition-[color,background-color,border-color] duration-[80ms] ease-linear disabled:cursor-default";

export function screenButtonClass(variant: ButtonVariant, { touch = false, disabled = false } = {}): string {
  const height = touch ? "h-11" : "h-11 lg:h-6";
  if (variant === "text") {
    return cn(
      "inline-flex items-center gap-2 ui-13 text-ink-2 underline-offset-[3px] decoration-1 transition-colors duration-[80ms] ease-linear",
      "hover:text-ink-1 hover:underline disabled:cursor-default disabled:text-ink-3 disabled:no-underline",
      touch && "min-h-11"
    );
  }
  if (variant === "primary" && !disabled) {
    return cn(
      BASE,
      height,
      "rounded-[2px] bg-sodium px-2.5 text-sodium-ink hover:bg-sodium-hover active:bg-sodium-press"
    );
  }
  // Вторичная, а также неактивная главная — она становится вторичной
  return cn(
    BASE,
    height,
    "rounded-[2px] border border-line-strong bg-transparent px-2.5",
    disabled ? "text-ink-3" : "text-ink-1 hover:bg-scr-raise active:bg-scr-select"
  );
}

export function ScreenButton({
  variant = "secondary",
  keys,
  touch,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: ScreenButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(screenButtonClass(variant, { touch, disabled }), className)}
      {...rest}
    >
      {children}
      {keys && <span className="ui-12 font-normal opacity-70 max-lg:hidden">{keys}</span>}
    </button>
  );
}

/** Заголовок панели: 28 px, Golos 13/500, без иконок. Справа — счётчики и действия */
export function PanelHeader({
  title,
  children,
  className,
  as: Tag = "header",
}: {
  title: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: "header" | "div";
}) {
  return (
    <Tag className={cn("flex h-7 shrink-0 items-center gap-3 border-b border-line px-3", className)}>
      <h2 className="min-w-0 truncate ui-13 font-medium text-ink-2">{title}</h2>
      {children && <div className="ml-auto flex min-w-0 items-center gap-3">{children}</div>}
    </Tag>
  );
}

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  /** Счётчик текстом рядом с названием */
  count?: number | string;
  /** Счётчик натрием: есть непросмотренное */
  alert?: boolean;
  /** id панели для aria-controls */
  controls?: string;
  /** Дополнительные data-атрибуты кнопки вкладки */
  attrs?: Record<`data-${string}`, string>;
}

/**
 * Вкладки: Golos 13/500, высота 32; активная — ink-1 и линия 2 px снизу,
 * неактивные — ink-3. Переключение мгновенное. size="sm" — 12 px (мобильный, реестр).
 */
export function TabBar<T extends string>({
  items,
  value,
  onChange,
  label,
  size = "md",
  className,
  idPrefix,
  superscript = false,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  size?: "md" | "sm";
  className?: string;
  idPrefix?: string;
  /** Число верхним индексом: «Все⁷» в реестре */
  superscript?: boolean;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex min-w-0 items-stretch gap-4", className)}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
            aria-selected={selected}
            aria-controls={item.controls}
            tabIndex={selected ? 0 : -1}
            {...item.attrs}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = items.findIndex((x) => x.id === value);
              const next = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
              onChange(next.id);
              const el = idPrefix ? document.getElementById(`${idPrefix}-tab-${next.id}`) : null;
              el?.focus();
            }}
            className={cn(
              "relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors duration-[80ms] ease-linear",
              size === "md" ? "h-8 ui-13 font-medium" : "h-8 ui-12 font-medium",
              selected ? "border-ink-1 text-ink-1" : "border-transparent text-ink-3 hover:text-ink-2"
            )}
          >
            {item.label}
            {item.count !== undefined && item.count !== "" && (
              <Counter
                value={item.count}
                alert={item.alert}
                className={cn(superscript && "-translate-y-1 text-[11px] leading-none")}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Счётчик — только текст, tabular-nums; натрий, если нужно привлечь внимание */
export function Counter({
  value,
  alert = false,
  className,
}: {
  value: number | string;
  alert?: boolean;
  className?: string;
}) {
  return <span className={cn("tnum font-normal", alert ? "text-sodium" : "text-ink-3", className)}>{value}</span>;
}

/**
 * Плашка-редактура: закрытое показывается вымаранным, а не замком.
 * Ширина — длина скрытого текста в ch текущего шрифта.
 */
export function Redaction({
  chars,
  height = 10,
  className,
  style,
}: {
  chars: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 bg-ink-4 align-middle", className)}
      style={{ width: `${chars}ch`, height, ...style }}
    />
  );
}

/** Поле ввода: 28 px, фон комнаты, PT Mono 14 */
export function ScreenField({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-7 w-full min-w-0 rounded-[2px] border border-line-strong bg-room px-2 mono-14 text-ink-1 outline-none",
        "placeholder:text-ink-4 focus:border-ink-2 focus-visible:outline-none read-only:cursor-default",
        className
      )}
      {...rest}
    />
  );
}

/** Вертикальный разделитель полей строки состояния: 1×12, --line-strong */
export function FieldDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("h-3 w-px shrink-0 bg-line-strong", className)} />;
}

/* ---------- Выпадающие меню (раздел 7.17): общие классы для @base-ui Menu/Select ---------- */

export const MENU_POPUP =
  "min-w-48 border border-line-strong bg-scr-chrome py-1 text-ink-1 shadow-menu outline-none";
export const MENU_ITEM =
  "flex h-[26px] cursor-default items-center gap-6 px-3 ui-13 text-ink-1 outline-none select-none data-highlighted:bg-scr-select data-disabled:text-ink-3";
export const MENU_SHORTCUT = "ml-auto ui-12 text-ink-3";
export const MENU_SEPARATOR = "my-1 h-px bg-line";
