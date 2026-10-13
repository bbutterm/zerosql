import type { WorldContext } from "../context";
import { parseTs } from "../rng";
import { DOC_REG } from "../facts";

/**
 * Посадка дела `case-05-nomer-3312` — «Номер 3312» (разд. 5.5 и 8.4 библии,
 * блок «Д5»).
 *
 * - Дыра 4471 в журнале «Сокола» 2015 года — 10.03.2015 около 14:00. Ложный
 *   след (side-05 «Пробел 4471»): соседи — кража велосипеда, № 4472 записала
 *   практикантка Валя «взамен испорченного». Нина: «Валька кофе пролила».
 * - Дело 15-0310 о краже велосипеда: заявление 4470 и объяснение 4472.
 *
 * Чего здесь нет (уже посажено): дело 15-0219, документы 3311 / 3313 / 3320 /
 * 3322 и дыра 3312 (core), 60 объяснений 15-0219 и подделки 5203 / 5204 / 5207
 * (core), persons 4127 / 1388 / 1389 (core). 12 черновиков с reg_no NULL и
 * ровно 61 % документов на Шустову Н. Ф. держит шум (noise/police.ts).
 */

export const C05 = {
  /** Пропуски 2015 года: ответ 5.1 */
  gaps: [DOC_REG.missing, DOC_REG.coffee] as const,
  coffeeAt: "2015-03-10 14:00:00",
  bikeCase: "15-0310",
  bikeTitle: "Кража велосипеда «Кама» из подъезда (Шахтная, 9)",
  intern: "Валеева В. А.",
  /** Ответы протокола */
  answers: {
    reg: "3312",
    caseId: "15-0219",
    missing: "Сазонов Пётр Ильич",
    investigator: "майор Ратников Л. Б.",
    applicant: "Сазонова В. С. (жена)",
  },
} as const;

const NINA = "Шустова Н. Ф.";

export function plant(ctx: WorldContext): void {
  // Дыра «кофе пролила»: шум номер 4471 не выдаёт, соседи встают по времени
  ctx.reserve("doc_reg_hole", String(DOC_REG.coffee), parseTs(C05.coffeeAt));

  ctx.insert("cases", {
    id: C05.bikeCase, title: C05.bikeTitle, opened_at: "2015-03-10 11:20:00",
    applicant_text: "Тарасов Г. Н.", investigator: "капитан Дьячков Е. М.",
    status: "приостановлено", status_at: "2015-06-10",
  });
  ctx.reserve("case_id", C05.bikeCase);

  const docs = [
    { reg: DOC_REG.coffee - 1, at: "2015-03-10 13:52:00", type: "заявление", by: NINA, note: "Тарасов Г. Н.: о краже велосипеда из подъезда" },
    { reg: DOC_REG.coffee + 1, at: "2015-03-10 14:17:00", type: "объяснение", by: C05.intern, note: "взамен испорченного № 4471, повторно не выдавался" },
  ];
  for (const d of docs) {
    ctx.insert("doc_registry", {
      year: 2015, reg_no: d.reg, registered_at: d.at, doc_type: d.type, case_id: C05.bikeCase,
      registered_by: d.by, note: d.note,
    }, { orderAt: parseTs(d.at) });
  }
}
