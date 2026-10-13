import type { Metadata } from "next";
import { GameDesk } from "./game-desk";

export const metadata: Metadata = { title: "Зеркало" };

type Params = Record<string, string | string[] | undefined>;

/** Стол «Зеркала». /game?journal=1 — открыть с журналом дел (из окна входа) */
export default async function GamePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return <GameDesk journal={params.journal !== undefined} />;
}
