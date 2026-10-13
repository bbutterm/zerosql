"use client";

import type { ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Menubar } from "@base-ui/react/menubar";
import { cn } from "@/lib/utils";
import { MENU_ITEM, MENU_POPUP, MENU_SEPARATOR, MENU_SHORTCUT } from "@/components/kit/screen";

/** Команды строки меню «Зеркала» (раздел 7.3) */
export type DeskMenuAction =
  | "save"
  | "settings"
  | "lock"
  | "exit"
  | "run"
  | "clear"
  | "history"
  | "tasks"
  | "evidence"
  | "wall"
  | "protocol"
  | "reference"
  | "about"
  /** Журнал дел: выбор дела */
  | "journal"
  /** Начать текущее дело заново */
  | "reset"
  /** Повторить ориентировку по делу */
  | "briefing";

export interface DeskMenuItem {
  action: DeskMenuAction;
  label: string;
  keys?: string;
  disabled?: boolean;
  /** Разделитель перед пунктом */
  separated?: boolean;
}

export interface DeskMenuGroup {
  label: string;
  items: DeskMenuItem[];
}

export const DEFAULT_MENUS: DeskMenuGroup[] = [
  {
    label: "Файл",
    items: [
      { action: "save", label: "Сохранить сеанс" },
      { action: "settings", label: "Параметры" },
      { action: "lock", label: "Заблокировать", separated: true },
      { action: "exit", label: "Выйти" },
    ],
  },
  {
    label: "Запрос",
    items: [
      { action: "run", label: "Выполнить", keys: "Ctrl+Enter" },
      { action: "clear", label: "Очистить" },
      { action: "history", label: "История запросов", separated: true },
    ],
  },
  {
    label: "Дело",
    items: [
      { action: "tasks", label: "Задания" },
      { action: "evidence", label: "Материалы" },
      { action: "wall", label: "Стена" },
      { action: "protocol", label: "Заключение", separated: true },
    ],
  },
  {
    label: "Справка",
    items: [
      { action: "reference", label: "Справочник SQL" },
      { action: "about", label: "О программе", separated: true },
    ],
  },
];

function Items({ items, onAction }: { items: DeskMenuItem[]; onAction: (a: DeskMenuAction) => void }) {
  return (
    <>
      {items.map((item) => (
        <MenuItemRow key={item.action} item={item} onAction={onAction} />
      ))}
    </>
  );
}

function MenuItemRow({ item, onAction }: { item: DeskMenuItem; onAction: (a: DeskMenuAction) => void }) {
  return (
    <>
      {item.separated && <Menu.Separator className={MENU_SEPARATOR} />}
      <Menu.Item className={MENU_ITEM} disabled={item.disabled} onClick={() => onAction(item.action)}>
        {item.label}
        {item.keys && <span className={MENU_SHORTCUT}>{item.keys}</span>}
      </Menu.Item>
    </>
  );
}

/** Строка окна 28 px: «Зеркало», меню, справа — дело. Без логотипа, бургера и кнопок окна */
export function MirrorMenuBar({
  menus = DEFAULT_MENUS,
  onAction,
  right,
  className,
}: {
  menus?: DeskMenuGroup[];
  onAction: (a: DeskMenuAction) => void;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-7 shrink-0 items-center border-b border-line bg-scr-chrome pr-4 pl-4",
        className
      )}
    >
      <span className="mr-2 ui-13 font-semibold text-ink-1">Зеркало</span>
      <Menubar className="flex h-full items-stretch" loopFocus>
        {menus.map((group) => (
          <Menu.Root key={group.label}>
            <Menu.Trigger className="flex h-full items-center px-2 ui-13 text-ink-2 outline-none hover:text-ink-1 focus-visible:bg-scr-raise focus-visible:text-ink-1 data-popup-open:bg-scr-raise data-popup-open:text-ink-1">
              {group.label}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="z-[60] outline-none" side="bottom" align="start" sideOffset={0}>
                <Menu.Popup className={MENU_POPUP}>
                  <Items items={group.items} onAction={onAction} />
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ))}
      </Menubar>
      {right && <div className="ml-auto flex min-w-0 items-center gap-4">{right}</div>}
    </div>
  );
}

/** Мобильный: «Зеркало» — кнопка, меню одним списком с группами */
export function MirrorMenuButton({
  menus = DEFAULT_MENUS,
  onAction,
  onOpen,
}: {
  menus?: DeskMenuGroup[];
  onAction: (a: DeskMenuAction) => void;
  onOpen?: () => void;
}) {
  return (
    <Menu.Root onOpenChange={(open) => open && onOpen?.()}>
      <Menu.Trigger className="-ml-3 flex h-8 min-w-11 items-center px-3 ui-13 font-semibold text-ink-1 outline-none data-popup-open:bg-scr-raise">
        Зеркало
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[60] outline-none" side="bottom" align="start" sideOffset={0}>
          <Menu.Popup className={cn(MENU_POPUP, "max-h-[var(--available-height)] min-w-60 overflow-y-auto")}>
            {menus.map((group, gi) => (
              <Menu.Group key={group.label}>
                {gi > 0 && <Menu.Separator className={MENU_SEPARATOR} />}
                <Menu.GroupLabel className="flex h-7 items-center px-3 ui-12 text-ink-3">{group.label}</Menu.GroupLabel>
                {group.items.map((item) => (
                  <Menu.Item
                    key={item.action}
                    className={cn(MENU_ITEM, "h-11")}
                    disabled={item.disabled}
                    onClick={() => onAction(item.action)}
                  >
                    {item.label}
                  </Menu.Item>
                ))}
              </Menu.Group>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
