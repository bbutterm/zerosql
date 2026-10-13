import { missions } from "@/data/missions";
import { TitleFlow } from "@/components/title/title-flow";

/** Запуск: предупреждение (первый раз), холодное открытие, окно входа «Зеркала» */
export default function HomePage() {
  const cases = missions.map((m, i) => ({ id: m.id, label: `Дело ${String(i).padStart(2, "0")}, «${m.title}»` }));
  return <TitleFlow cases={cases} />;
}
