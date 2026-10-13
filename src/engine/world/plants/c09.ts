import type { Database } from "sql.js";
import type { Row, WorldContext } from "../context";
import * as F from "../facts";
import { fmtTs, parseTs, type Rng } from "../rng";
import type { LateFillerContext, LateFillers } from "./types";

/**
 * Посадка дела `case-09-matryoshka` — «Матрёшка» (разд. 5.9 и 8.4 библии).
 *
 * - company_owners: цепочка «Щита» вверх (17 ← 14 ← 13 ← 12 ← люди 70/30),
 *   «Сияние» и его дочки, «Глубина-Строй» до 2017, цикл 15 ↔ 16 в стороне,
 *   история Kordon (номинал владел 100 % до 2013-07-01: ловушка «забытый until»);
 * - transactions: «Ладога Инвест» → «Щит» по 180 000 ₽ каждое 5-е число
 *   (300 000 «доп. соглашение № 7» 20.11 сажает core), «Возврат» → ИП Мельник Е. А.;
 * - accounts: Kordon, «Возврат», ИП Мельник Е. А. (карточка в persons — см. plantPeopleAndAccounts);
 * - share_deals Kordon: итог после СД-0145 — 31 500 000, СД-0146 и СД-0147 в один день;
 * - contracts: две гранта фонда-приманки рядом с ТБ-2026/117 (сам договор — патч p0.player);
 * - grant_requests: заявка Ратникова 2026-11-20 10:15:00;
 * - late.bank_statements: ответ банка «Северный кредит».
 *
 * migration_jobs 17–20 (финализация под nol) сажает core.
 */

/** Счета, которых нет в core */
export const C09_ACCOUNT = {
  kordon: "ACC-10012",
  vozvrat: "ACC-10060",
  ipMelnik: "ACC-10061",
  /** Счёт игрока в «Северном кредите» — только в выписке банка */
  player: "ACC-90000",
} as const;

/** Ежемесячный платёж «Ладога Инвест» → «Щит» */
export const C09_SHCHIT_MONTHLY = { amount: 180_000, from: "2024-01-05", to: "2026-12-05", time: "10:15:00", purpose: "абонентская охрана" } as const;

/** «Возврат» → ИП Мельник Е. А.: 60 000 ₽ в месяц с июня 2025 */
export const C09_VOZVRAT = { amount: 60_000, from: "2025-06-10", to: "2026-12-10", time: "12:40:00", purpose: "консультационные услуги" } as const;

/** Сделки Kordon Holdings Ltd (покупатель 12): итог 31 500 000 после СД-0145 */
export const C09_KORDON_DEALS: readonly { no: string; date: string; amount: number; seller: string }[] = [
  { no: "СД-0021", date: "2015-03-16", amount: 3_200_000, seller: "физлица (миноритарии)" },
  { no: "СД-0034", date: "2015-04-20", amount: 4_100_000, seller: "физлица (миноритарии)" },
  { no: "СД-0049", date: "2015-05-25", amount: 3_800_000, seller: "физлица (миноритарии)" },
  { no: "СД-0063", date: "2015-06-29", amount: 4_400_000, seller: "физлица (миноритарии)" },
  { no: "СД-0080", date: "2015-08-10", amount: 3_900_000, seller: "физлица (миноритарии)" },
  { no: "СД-0097", date: "2015-09-14", amount: 4_300_000, seller: "физлица (миноритарии)" },
  { no: "СД-0114", date: "2015-10-19", amount: 4_000_000, seller: "физлица (миноритарии)" },
  { no: "СД-0131", date: "2015-11-23", amount: 2_100_000, seller: "физлица (миноритарии)" },
  { no: "СД-0145", date: "2015-12-04", amount: 1_700_000, seller: "физлица (миноритарии)" },
  { no: "СД-0146", date: "2015-12-07", amount: 200_000, seller: "физлица (миноритарии)" },
  { no: "СД-0147", date: "2015-12-07", amount: 400_000, seller: "физлица (миноритарии)" },
];

/** Порог: столько «внёс Бурцев» на счёт Kordon в 2015 году */
export const C09_RESETTLEMENT_SUM = 31_820_000;

/** 16 взносов наличными «вноситель Бурцев В. Н.» (сумма ровно 31 820 000) */
export const C09_CASH_DEPOSITS: readonly [string, number][] = [
  ["2015-03-10 11:20:00", 1_850_000], ["2015-03-27 15:05:00", 2_100_000], ["2015-04-14 10:40:00", 1_960_000],
  ["2015-04-30 16:10:00", 2_240_000], ["2015-05-19 11:55:00", 1_780_000], ["2015-06-05 14:30:00", 2_050_000],
  ["2015-06-23 10:15:00", 2_310_000], ["2015-07-10 15:45:00", 1_890_000], ["2015-07-29 11:05:00", 2_020_000],
  ["2015-08-17 16:25:00", 1_940_000], ["2015-09-03 10:50:00", 2_180_000], ["2015-09-22 14:15:00", 1_870_000],
  ["2015-10-09 11:35:00", 2_060_000], ["2015-10-28 15:20:00", 1_930_000], ["2015-11-16 10:05:00", 2_090_000],
  ["2015-11-30 16:40:00", 1_550_000],
];

/** Гранты фонда рядом с договором игрока: ложные варианты протокола */
export const C09_FUND_DECOYS: readonly Row[] = [
  {
    doc_no: "ТБ-2026/112", company_id: F.COMPANY.fund, person_id: null, counterparty_text: "Детский дом № 1",
    subject: "грант: детский дом № 1, новогодние подарки", signed_at: "2026-11-24", clause: null, amount: 420_000,
  },
  {
    doc_no: "ТБ-2026/118", company_id: F.COMPANY.fund, person_id: null, counterparty_text: "Хоккейная секция «Норд»",
    subject: "грант: хоккейная секция «Норд», форма и лёд", signed_at: "2026-11-26", clause: null, amount: 380_000,
  },
];

/** Заявка Ратникова в фонд (М19). id — по месту в хронологии заявок шума */
export const C09_GRANT_REQUEST = {
  id: 121,
  requested_at: "2026-11-20 10:15:00",
  requester_person_id: F.PERSON.ratnikov,
  org_text: "ГУ МВД, ОЦР",
  request_text: "требуется кандидат без опыта работы в органах",
  status: "исполнено",
} as const;

const ts = parseTs;

export function plant(ctx: WorldContext): void {
  plantOwners(ctx);
  plantPeopleAndAccounts(ctx);
  plantMoney(ctx);
  plantShareDeals(ctx);
  plantContractsAndGrants(ctx);
}

// ==================================================================== владельцы

function plantOwners(ctx: WorldContext): void {
  const C = F.COMPANY;
  const P = F.PERSON;
  const rows: Row[] = [
    // История: до прихода бенефициара Kordon целиком числился за номиналом
    { company_id: C.kordon, owner_type: "person", owner_id: P.eliseev, share: 100, since: "2011-08-23", until: "2013-07-01" },
    { company_id: C.kordon, owner_type: "person", owner_id: P.granin, share: 70, since: "2013-07-01", until: null },
    { company_id: C.kordon, owner_type: "person", owner_id: P.eliseev, share: 30, since: "2013-07-01", until: null },
    { company_id: C.severnyKordon, owner_type: "company", owner_id: C.kordon, share: 100, since: "2012-11-05", until: null },
    { company_id: C.glubinaStroy, owner_type: "company", owner_id: C.severnyKordon, share: 100, since: "2013-03-04", until: "2017-06-30" },
    { company_id: C.ladogaInvest, owner_type: "company", owner_id: C.severnyKordon, share: 100, since: "2014-04-17", until: null },
    { company_id: C.shchit, owner_type: "company", owner_id: C.ladogaInvest, share: 100, since: "2014-09-30", until: null },
    // «Сияние»: 51 % у Kordon, остальное — рынок (owner_type 'market', без владельца)
    { company_id: C.siyanie, owner_type: "company", owner_id: C.kordon, share: 51, since: "2015-12-07", until: null },
    { company_id: C.siyanie, owner_type: "market", owner_id: null, share: 49, since: "2015-12-07", until: null },
    { company_id: C.glubina, owner_type: "company", owner_id: C.siyanie, share: 100, since: "2016-02-01", until: null },
    { company_id: C.fund, owner_type: "company", owner_id: C.siyanie, share: 100, since: "2015-03-02", until: null },
    { company_id: C.siyaniePay, owner_type: "company", owner_id: C.siyanie, share: 100, since: "2019-10-01", until: null },
    // Цикл в стороне от пути вверх: 15 ↔ 16
    { company_id: C.ladogaLogistik, owner_type: "company", owner_id: C.severnyKordon, share: 95, since: "2016-02-09", until: null },
    { company_id: C.ladogaLogistik, owner_type: "company", owner_id: C.kordonServis, share: 5, since: "2016-02-09", until: null },
    { company_id: C.kordonServis, owner_type: "company", owner_id: C.severnyKordon, share: 90, since: "2016-02-09", until: null },
    { company_id: C.kordonServis, owner_type: "company", owner_id: C.ladogaLogistik, share: 10, since: "2016-02-09", until: null },
    // «Возврат» — чужая матрёшка: владеет директор
    { company_id: C.vozvrat, owner_type: "person", owner_id: 2058, share: 100, since: "2019-03-12", until: null },
  ];
  for (const r of rows) ctx.insert("company_owners", r);
}

// ==================================================================== люди и счета

function plantPeopleAndAccounts(ctx: WorldContext): void {
  // Карточку Мельник Е. А. в persons пока не сажаем: любая лишняя строка persons
  // сдвигает шум жителей (noise/people.ts заполняет все свободные id), и шум СКУД
  // даёт Мельнику (B-1412) визит в серверную поверх выхода с КПП-Б0 (review.test).
  // Счёт ИП держит только имя — holder_name «ИП Мельник Е. А.».
  const accounts: Row[] = [
    { id: C09_ACCOUNT.kordon, holder_person_id: null, holder_company_id: F.COMPANY.kordon, holder_name: F.COMPANY_NAME[F.COMPANY.kordon], bank: "Северный кредит", opened_at: "2015-03-02" },
    { id: C09_ACCOUNT.vozvrat, holder_person_id: null, holder_company_id: F.COMPANY.vozvrat, holder_name: F.COMPANY_NAME[F.COMPANY.vozvrat], bank: "Северный кредит", opened_at: "2019-03-20" },
    { id: C09_ACCOUNT.ipMelnik, holder_person_id: null, holder_company_id: F.COMPANY.ipMelnik, holder_name: F.COMPANY_NAME[F.COMPANY.ipMelnik], bank: "Сияние.Pay", opened_at: "2025-05-21" },
  ];
  for (const a of accounts) {
    ctx.insert("accounts", a);
    ctx.reserve("account", String(a.id));
  }
  ctx.reserve("account", C09_ACCOUNT.player);
}

// ==================================================================== деньги

/** Каждое число `day` месяца от from до to включительно */
function monthly(from: string, to: string, time: string): string[] {
  const out: string[] = [];
  const [y0, m0, d] = from.split("-").map(Number);
  const end = ts(`${to} ${time}`);
  for (let y = y0, m = m0 - 1; ; m++) {
    if (m === 12) {
      m = 0;
      y++;
    }
    const at = Date.UTC(y, m, d) + ts(`1970-01-01 ${time}`);
    if (at > end) break;
    out.push(fmtTs(at));
  }
  return out;
}

function plantMoney(ctx: WorldContext): void {
  const ladoga = F.COMPANY_NAME[F.COMPANY.ladogaInvest];
  for (const at of monthly(C09_SHCHIT_MONTHLY.from, C09_SHCHIT_MONTHLY.to, C09_SHCHIT_MONTHLY.time)) {
    ctx.insert("transactions", {
      ts: at, account_id: F.ACCOUNT.shchit, amount: C09_SHCHIT_MONTHLY.amount, counterparty: ladoga,
      counterparty_account: F.ACCOUNT.ladogaInvest, channel: "перевод", purpose: C09_SHCHIT_MONTHLY.purpose,
    }, { orderAt: ts(at) });
  }
  const vozvrat = F.COMPANY_NAME[F.COMPANY.vozvrat];
  for (const at of monthly(C09_VOZVRAT.from, C09_VOZVRAT.to, C09_VOZVRAT.time)) {
    ctx.insert("transactions", {
      ts: at, account_id: C09_ACCOUNT.ipMelnik, amount: C09_VOZVRAT.amount, counterparty: vozvrat,
      counterparty_account: C09_ACCOUNT.vozvrat, channel: "перевод", purpose: C09_VOZVRAT.purpose,
    }, { orderAt: ts(at) });
  }
}

// ==================================================================== сделки и договоры

function plantShareDeals(ctx: WorldContext): void {
  C09_KORDON_DEALS.forEach((d, i) => {
    // Цена акции растёт с 55 до 61 копеек: число бумаг — из суммы
    const price = 0.55 + i * 0.006;
    ctx.insert("share_deals", {
      deal_no: d.no, deal_date: d.date, buyer_company_id: F.COMPANY.kordon, seller_text: d.seller,
      shares: Math.round(d.amount / price / 100) * 100, amount: d.amount,
    });
  });
}

function plantContractsAndGrants(ctx: WorldContext): void {
  for (const c of C09_FUND_DECOYS) {
    ctx.insert("contracts", c);
    ctx.reserve("contract_no", String(c.doc_no));
  }
  ctx.insert("grant_requests", { ...C09_GRANT_REQUEST });
}

// ==================================================================== ответ банка

interface Statement {
  ts: string;
  payer: string;
  payer_account: string | null;
  payee: string;
  payee_account: string | null;
  amount: number;
  purpose: string;
}

const GRANT_ORGS = [
  "Детский дом № 1", "Хоккейная секция «Норд»", "ДК «Полярник»", "Школа № 2", "Дом престарелых «Сосны»",
  "Секция лыжных гонок", "Музыкальная школа", "Школа № 5",
];
const GRANT_PURPOSES = [
  "благотворительный грант", "новогодние подарки", "ремонт помещений", "форма и инвентарь", "поездка на соревнования",
  "тёплые вещи", "компьютерный класс",
];

function bankStatements(db: Database, rng: Rng, context: LateFillerContext): void {
  void context;
  const N = F.COMPANY_NAME;
  const C = F.COMPANY;
  const fund = N[C.fund];
  const out: Statement[] = [];
  const playerName = (() => {
    const r = db.exec(`SELECT full_name FROM main.persons WHERE id = ${F.PERSON.player}`);
    const v = r[0]?.values[0]?.[0];
    return typeof v === "string" && v.trim() ? v.trim() : "Ноль";
  })();

  // Kordon Holdings, 2015: наличные «Бурцева» и оплата сделок 07.12
  for (const [at, amount] of C09_CASH_DEPOSITS) {
    out.push({
      ts: at, payer: "взнос наличными, вноситель Бурцев В. Н.", payer_account: null, payee: N[C.kordon],
      payee_account: C09_ACCOUNT.kordon, amount, purpose: "взнос наличных на счёт",
    });
  }
  for (const d of C09_KORDON_DEALS.filter((x) => x.date === "2015-12-07")) {
    out.push({
      ts: `${d.date} ${d.no === "СД-0146" ? "11:10:00" : "11:25:00"}`, payer: N[C.kordon], payer_account: C09_ACCOUNT.kordon,
      payee: "Реестр акционеров ПАО «Сияние»", payee_account: null, amount: d.amount, purpose: `оплата по сделке ${d.no}`,
    });
  }
  // «Ладога Инвест» → «Щит» (как в ЗЕРКАЛЕ) и «Щит» → МФО
  for (const at of monthly(C09_SHCHIT_MONTHLY.from, C09_SHCHIT_MONTHLY.to, C09_SHCHIT_MONTHLY.time)) {
    out.push({
      ts: at, payer: N[C.ladogaInvest], payer_account: F.ACCOUNT.ladogaInvest, payee: N[C.shchit],
      payee_account: F.ACCOUNT.shchit, amount: C09_SHCHIT_MONTHLY.amount, purpose: C09_SHCHIT_MONTHLY.purpose,
    });
  }
  out.push({
    ts: F.KEY_TIMES.shchitBonus, payer: N[C.ladogaInvest], payer_account: F.ACCOUNT.ladogaInvest, payee: N[C.shchit],
    payee_account: F.ACCOUNT.shchit, amount: 300_000, purpose: "доп. соглашение № 7",
  });
  out.push({
    ts: F.KEY_TIMES.lykovLoanPaid, payer: N[C.shchit], payer_account: F.ACCOUNT.shchit, payee: N[C.mfo],
    payee_account: F.ACCOUNT.mfo, amount: 380_000, purpose: "погашение займа за Лыкова А. С.",
  });
  // Фонд → Пахомова: 139 × 7 000 и возврат
  for (let y = 2015, m = 2, n = 0; n < 139; n++) {
    out.push({
      ts: fmtTs(Date.UTC(y, m, 5, 10, rng.int(0, 59), rng.int(0, 59))), payer: fund, payer_account: F.ACCOUNT.fund,
      payee: "Пахомова З. П.", payee_account: F.ACCOUNT.pakhomova, amount: 7000, purpose: "матпомощь ветерану «Глубина-Строя»",
    });
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
  out.push({
    ts: "2026-09-07 11:16:42", payer: "Пахомова З. П.", payer_account: F.ACCOUNT.pakhomova, payee: fund,
    payee_account: F.ACCOUNT.fund, amount: 7000, purpose: "возврат: отказ получателя",
  });
  // Фонд → игрок по ТБ-2026/117 и платежи игрока по образовательному кредиту
  const contract = F.PLAYER_CONTRACT.docNo;
  out.push(
    { ts: "2026-12-05 09:40:00", payer: fund, payer_account: F.ACCOUNT.fund, payee: playerName, payee_account: C09_ACCOUNT.player, amount: 47_500, purpose: `аванс по договору ${contract}` },
    { ts: "2026-12-20 09:40:00", payer: fund, payer_account: F.ACCOUNT.fund, payee: playerName, payee_account: C09_ACCOUNT.player, amount: 47_500, purpose: `оплата по договору ${contract}` },
  );
  [["2026-10-15 08:02:00", 431_600], ["2026-11-15 08:02:00", 421_800], ["2026-12-15 08:02:00", 412_000]].forEach(([at, rest]) => {
    out.push({
      ts: String(at), payer: playerName, payer_account: C09_ACCOUNT.player, payee: N[C.bank], payee_account: null, amount: 9800,
      purpose: `образовательный кредит, ежемесячный платёж; остаток ${Number(rest).toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`,
    });
  });
  // Остальное — гранты фонда и расчёты внутри группы
  const lo = ts("2015-04-01 00:00:00");
  const hi = ts("2026-12-26 18:00:00");
  const intra: [number, number, string][] = [
    [C.siyanie, C.glubina, "оплата по договору подряда"], [C.siyanie, C.siyaniePay, "обслуживание платёжного шлюза"],
    [C.siyanie, C.fund, "целевое пожертвование"], [C.ladogaInvest, C.ladogaLogistik, "транспортные услуги"],
    [C.severnyKordon, C.kordonServis, "аренда техники"], [C.glubina, C.siyanie, "возврат займа"],
  ];
  while (out.length < 500) {
    const at = fmtTs(Math.floor(rng.float(lo, hi) / 60_000) * 60_000 + rng.int(0, 59) * 1000);
    if (rng.chance(0.6)) {
      out.push({
        ts: at, payer: fund, payer_account: F.ACCOUNT.fund, payee: rng.pick(GRANT_ORGS), payee_account: null,
        amount: rng.int(5, 80) * 10_000, purpose: rng.pick(GRANT_PURPOSES),
      });
    } else {
      const [a, b, purpose] = rng.pick(intra);
      if (at < "2016-03-01" && (a === C.ladogaLogistik || b === C.ladogaLogistik || a === C.kordonServis || b === C.kordonServis)) continue;
      if (at < "2019-10-01" && (a === C.siyaniePay || b === C.siyaniePay)) continue;
      out.push({
        ts: at, payer: N[a], payer_account: null, payee: N[b], payee_account: null, amount: rng.int(20, 900) * 10_000, purpose,
      });
    }
  }
  out.sort((x, y) => x.ts.localeCompare(y.ts));
  const stmt = db.prepare(
    "INSERT INTO main.bank_statements (id, ts, statement_no, payer, payer_account, payee, payee_account, amount, purpose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  try {
    out.forEach((s, i) => {
      stmt.run([i + 1, s.ts, `СК-${s.ts.slice(0, 4)}/${String(i + 1).padStart(5, "0")}`, s.payer, s.payer_account, s.payee, s.payee_account, s.amount, s.purpose]);
    });
  } finally {
    stmt.free();
  }
}

/** Наполнители поздних таблиц этого дела (патч `late.bank_statements`) */
export const late: LateFillers = { bank_statements: bankStatements };
