"use client";

import { useEffect } from "react";

/**
 * Скрытая вкладка — каретка и прочие циклы замирают (раздел 5.9):
 * на <html> ставится data-hidden, CSS ставит анимации на паузу.
 */
export function VisibilityPause() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      if (document.hidden) root.setAttribute("data-hidden", "");
      else root.removeAttribute("data-hidden");
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return null;
}
