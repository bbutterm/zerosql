"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cases } from "@/data";
import { continueTarget, gameStore, playSfx, useGame, useGameView, useHydrated } from "@/stores/game";
import { OnboardingDialog, SettingsPanel } from "@/components/play/screens";
import { AgeWarning, ColdOpen, TitleScreen, type TitleMenuAction } from "./title-screen";

/**
 * Запуск игры (раздел 7.1–7.2): предупреждение 18+ (только первый раз), холодное открытие
 * (раз за сеанс вкладки, пропускается любой клавишей), окно входа «Зеркала»; при первом
 * входе — имя или ник и режим. Мир начинает собираться сразу после предупреждения,
 * пока идёт холодное открытие. Прогресс — из стора v2 (сохранение в localStorage).
 */

const COLD_KEY = "zerosql-cold-open";

function coldShown(): boolean {
  try {
    return window.sessionStorage.getItem(COLD_KEY) === "1";
  } catch {
    return false;
  }
}
function markCold() {
  try {
    window.sessionStorage.setItem(COLD_KEY, "1");
  } catch {
    // приватный режим: титр просто покажется снова
  }
}

function stamp(clock: string): string {
  const m = clock.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d:\d\d)/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}` : clock;
}

type Overlay = null | "settings" | "register" | "new";

export function TitleFlow({ playHref = "/play", journalHref = "/play?journal=1" }: { playHref?: string; journalHref?: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const profile = useGame((s) => s.profile);
  const settings = useGame((s) => s.settings);
  const season = useGame((s) => s.season);
  const session = useGame((s) => s.session);
  const target = useGameView(continueTarget);
  const [cold, setCold] = useState<boolean | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const act = gameStore.getState;

  // Хранилище вкладки читается только на клиенте
  useEffect(() => {
    void gameStore.persist.rehydrate();
    const t = window.setTimeout(() => setCold(coldShown()), 0);
    return () => window.clearTimeout(t);
  }, []);

  // Мир собирается, пока игрок смотрит холодное открытие
  useEffect(() => {
    if (hydrated && profile.ageConfirmed) void act().boot();
  }, [hydrated, profile.ageConfirmed, act]);

  if (!hydrated || cold === null) return <div className="h-dvh w-full bg-room" />;
  if (!profile.ageConfirmed) return <AgeWarning onAccept={() => act().confirmAge()} />;
  if (!cold) {
    return (
      <ColdOpen
        onContinue={() => {
          playSfx("amb.bay", settings);
          markCold();
          act().markColdOpenSeen();
          setCold(true);
        }}
      />
    );
  }

  if (overlay === "settings") {
    return (
      <SettingsPanel
        settings={settings}
        profile={profile}
        zeroOpen={season.ending !== null}
        onSettings={(p) => act().updateSettings(p)}
        onProfile={(p) => act().setProfile(p)}
        onClose={() => setOverlay(null)}
      />
    );
  }
  if (overlay === "register" || overlay === "new") {
    const fresh = overlay === "new";
    return (
      <OnboardingDialog
        defaultName={profile.playerName}
        defaultMode={profile.mode === "zero" && !season.ending ? "standard" : profile.mode}
        zeroOpen={season.ending !== null}
        warning={fresh ? "Новый сеанс: раскрытые дела, улики и звание будут стёрты." : undefined}
        onCancel={() => setOverlay(null)}
        onDone={(p) => {
          if (fresh) act().resetSeason();
          act().setProfile({ ...p, onboarded: true });
          router.push(playHref);
        }}
      />
    );
  }

  const hasProgress = Boolean(session) || Object.keys(season.solved).length > 0;
  const current = cases.find((c) => c.id === (session?.caseId ?? target));
  const enter = (href: string) => (profile.onboarded ? router.push(href) : setOverlay("register"));

  const continueGame: TitleMenuAction | undefined = hasProgress
    ? { onClick: () => enter(playHref), ...(current ? { meta: `${current.code}, «${current.title}»` } : {}) }
    : undefined;
  const newGame: TitleMenuAction = { onClick: () => (hasProgress ? setOverlay("new") : setOverlay("register")) };

  return (
    <TitleScreen
      continueGame={continueGame}
      newGame={newGame}
      archive={{ onClick: () => enter(journalHref) }}
      settings={{ onClick: () => setOverlay("settings") }}
      login={profile.playerName ? profile.playerName.toLowerCase() : undefined}
      lastLogin={session ? stamp(session.clock) : undefined}
    />
  );
}
