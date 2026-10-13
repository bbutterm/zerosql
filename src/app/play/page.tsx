import type { Metadata } from "next";
import { PlayRoot } from "./play-root";

export const metadata: Metadata = { title: "Зеркало" };

type Params = Record<string, string | string[] | undefined>;

/** Стол «Зеркала». /play?journal=1 — открыть с журналом дел (из окна входа) */
export default async function PlayPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return <PlayRoot journal={params.journal !== undefined} />;
}
