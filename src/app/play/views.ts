/**
 * Перевод данных стора в виды презентационных компонентов (src/types/ui.ts).
 * Чистые функции: ни ядра, ни React.
 */
import type { CaseDef, EvidenceDef, PinnedCard } from "@/types/case";
import { SOURCE_CLASS_LABELS } from "@/types/case";
import type { CharacterDef } from "@/types/story";
import type { EvidenceCardData, ObjectiveView as UiObjective, ProtocolQuestionView } from "@/types/ui";
import type { ObjectiveView, ProtocolView } from "@/stores/game";
import { characters, handbookByCase } from "@/data";
import type { HandbookEntry } from "@/types/case";

export const CHARACTERS: Record<string, CharacterDef> = Object.fromEntries(characters.map((c) => [c.id, c]));

/** «2026-12-02 18:05:30» → «18:05» */
export const hhmm = (clock: string | undefined | null): string => clock?.match(/(\d\d:\d\d)/)?.[1] ?? "";

/** «2026-12-02 18:05» → «02.12.2026 18:05» */
export function clockRu(clock: string | undefined | null): string {
  const m = clock?.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d:\d\d)/);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}` : "";
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Титр локации сцены: «ГУ МВД, цокольный этаж, Б0-03. 2 декабря, 18:05» (id фона игроку не показывается) */
export function sceneTitle(def: Pick<CaseDef, "location">, clock: string | undefined | null): string | undefined {
  const m = clock?.match(/^\d{4}-(\d\d)-(\d\d)[ T](\d\d:\d\d)/);
  const when = m ? `${Number(m[2])} ${MONTHS[Number(m[1]) - 1]}, ${m[3]}` : "";
  const parts = [def.location, when].filter(Boolean);
  return parts.length ? parts.join(". ") : undefined;
}

export const caseNo = (def: Pick<CaseDef, "order">) => String(def.order).padStart(2, "0");

/** «Дело 03» или код пролога */
export const caseCode = (def: Pick<CaseDef, "order" | "code">) => (def.code && !/^\d+$/.test(def.code) ? def.code : `Дело ${caseNo(def)}`);

/** Методичка: статьи всех дел до этого включительно */
export function handbookFor(def: Pick<CaseDef, "order">): HandbookEntry[] {
  const out: HandbookEntry[] = [];
  for (let i = 0; i <= def.order; i++) out.push(...(handbookByCase[`c${String(i).padStart(2, "0")}`] ?? []));
  return out;
}

export function evidenceCard(e: EvidenceDef): EvidenceCardData {
  return { id: e.id, kind: e.kind, title: e.title, text: e.text };
}

const NAME_COLUMNS = ["full_name", "name", "title", "owner_name", "holder_name", "guest_name", "login", "plate", "badge_id", "kusp_no", "doc_no"];
const DATETIME = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)/;

const cell = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > 24 ? `${s.slice(0, 23)}…` : s;
};

/** Приобщённая строка → распечатка на стене и в реестре */
export function pinCard(pin: PinnedCard, n: number, fresh = false): EvidenceCardData {
  const cols = pin.columns.map((c) => c.toLowerCase());
  const nameIdx = NAME_COLUMNS.map((c) => cols.indexOf(c)).find((i) => i >= 0) ?? cols.findIndex((c, i) => c !== "id" && typeof pin.values[i] === "string");
  const idIdx = cols.indexOf("id");
  const pick = [idIdx, nameIdx, ...cols.map((_, i) => i)].filter((i, k, all) => i >= 0 && all.indexOf(i) === k).slice(0, 4);
  const name = nameIdx >= 0 ? pin.values[nameIdx] : null;
  const at = pin.values.map((v) => (typeof v === "string" ? v.match(DATETIME)?.[2] : undefined)).find(Boolean);
  const source = [pin.table, pin.sourceClass ? SOURCE_CLASS_LABELS[pin.sourceClass] : null].filter(Boolean).join(", ");
  return {
    id: pin.id,
    kind: "record",
    title: name !== null && name !== undefined ? String(name) : idIdx >= 0 ? `Запись ${String(pin.values[idIdx])}` : `Строка ${n}`,
    text: pin.table ? `Строка таблицы ${pin.table}.` : "Строка результата запроса.",
    ...(pin.sql ? { sourceQuery: pin.sql } : {}),
    ...(source ? { source } : {}),
    queryNo: n,
    ...(pin.pinnedAt ? { foundAt: hhmm(pin.pinnedAt) } : {}),
    ...(at ? { at } : {}),
    excerpt: {
      columns: pick.map((i) => pin.columns[i]),
      rows: [pick.map((i) => cell(pin.values[i]))],
      ...(nameIdx >= 0 ? { mark: [0, pick.indexOf(nameIdx)] as [number, number] } : {}),
    },
    ...(fresh ? { isNew: true } : {}),
  };
}

/**
 * Задачи стора → блокнот. Неоткрытые уровни подсказок передаются без текста: блокноту
 * нужны только число уровней, голос следующего и его цена.
 */
export function uiObjectives(views: ObjectiveView[], def: CaseDef, feedback: string | null): UiObjective[] {
  const byId = new Map(def.objectives.map((o) => [o.id, o]));
  const currentId = views.find((v) => !v.optional && v.state === "active")?.id;
  return views.map((v) => {
    const o = byId.get(v.id);
    const shown = v.hints.length;
    const total = shown + (v.nextHint ? Math.max(1, (o?.hints.length ?? 0) - (v.nextHint.tier - 1)) : 0);
    const hints = Array.from({ length: total }, (_, i) => {
      const h = v.hints[i];
      if (h) return { text: h.text, ...(h.by ? { speaker: h.by } : {}) };
      const tier = (v.nextHint?.tier ?? 0) + (i - shown);
      const def_ = o?.hints[tier - 1];
      return {
        text: "",
        ...(def_?.by ? { speaker: def_.by } : {}),
        ...(i === shown && v.nextHint ? { cost: v.nextHint.free ? 0 : 40 } : {}),
      };
    });
    return {
      id: v.id,
      text: v.task,
      state: v.state,
      ...(v.optional ? { optional: true } : {}),
      ...(hints.length ? { hints, hintsRevealed: shown } : {}),
      ...(v.state === "done" && o?.success ? { outcome: o.success } : {}),
      ...(v.id === currentId && feedback ? { feedback } : {}),
    };
  });
}

const BLANK_LABELS: Record<string, string> = { person: "кто", number: "сколько", datetime: "когда", text: "что" };

/** Протокол стора → бланк заключения: варианты — только увиденные */
export function protocolQuestions(view: ProtocolView): ProtocolQuestionView[] {
  const blanks = new Map(view.blanks.map((b) => [b.id, b]));
  return view.statements.map((parts, i) => {
    const ids = parts.flatMap((p) => (p.kind === "blank" ? [p.blankId] : []));
    return {
      id: `s${i + 1}`,
      text: parts.map((p) => (p.kind === "blank" ? `{${p.blankId}}` : p.text)).join(""),
      blanks: ids.flatMap((id) => {
        const b = blanks.get(id);
        if (!b) return [];
        const label = (v: string) => (b.kind === "datetime" ? clockRu(v).slice(0, 5) + clockRu(v).slice(10) || v : v);
        const options = b.options.filter((o) => o.available || o.value === b.value).map((o) => ({ value: o.value, label: label(o.value) }));
        return [{ id, label: BLANK_LABELS[b.kind] ?? id, options }];
      }),
    };
  });
}
