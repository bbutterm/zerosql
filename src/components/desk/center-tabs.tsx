"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Переключатель центральной зоны «Запрос | Заключение | Стена» (раздел 6.2). Его рисует стол,
 * а встаёт он в заголовок той панели, что сейчас в центре: в виде «Запрос» — в шапку терминала
 * на место заголовка, рядом с квотой и «Выполнить». Одна строка 28 px вместо двух.
 */
export const DeskCenterTabsContext = createContext<ReactNode>(null);

export function useDeskCenterTabs(): ReactNode {
  return useContext(DeskCenterTabsContext);
}
