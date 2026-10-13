import type { Metadata } from "next";
import { LabRoot } from "./lab-root";

export const metadata: Metadata = { title: "Лаборатория интерфейса" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /lab — витрина компонентов; /lab?scene=desk|protocol|wall|dialogue|title|coldopen — сцена на весь экран */
export default async function LabPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return <LabRoot scene={one(params.scene)} step={one(params.step)} />;
}
