import type { Metadata } from "next";
import { LabRoot } from "./lab-root";

export const metadata: Metadata = { title: "Лаборатория интерфейса" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /lab — витрина компонентов; /lab?scene=desk|protocol|wall|dialogue|title|coldopen — сцена на весь экран.
 * Ночь между делами: /lab?scene=night&case=case-04-mertvaya-dusha&flags=ratnikov_full&cron=2,3
 * Сцена дела с картиной: /lab?scene=story&case=case-06-polynya&id=intro (&bg=0 — без картины)
 */
export default async function LabPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <LabRoot
      scene={one(params.scene)}
      step={one(params.step)}
      night={{ caseId: one(params.case), sceneId: one(params.id), flags: one(params.flags), cron: one(params.cron), bg: one(params.bg) }}
    />
  );
}
