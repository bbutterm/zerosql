/**
 * Концовки (GAME_DESIGN разд. 3): пять входов A, R, K, W, V, исходы финала
 * burtsev_caught / granin_broken и модификаторы эпилога. Чистая функция от
 * сюжетных флагов сезона.
 *
 * Флаги финала (ставит контент Д11):
 *   final_board   — A: все 9 обязательных узлов подтверждены ≥2 источниками
 *   recipient     — R: prosecutor | sk | alla | sk_alla | deal
 *   final_k       — K: узел «Квартира Ратникова» в пакете
 *   archive_restored — V: контрольный запрос 11.3 вернул 0 до удаления staging
 *   package_sent  — пакет отправлен до 13:00
 *   ratnikov_full, tokha_turned — W
 *   burtsev_caught (лестница | дверь), granin_broken
 *   tokha_turned, melnik, dasha_truth, valentina_warned, redacted — эпилог
 */
import type { EndingId, EndingInputs, EndingResult, Flags, Recipient } from "./types";

export const ENDING_TITLES: Record<EndingId, string> = {
  empty: "Пустая выборка",
  still: "Тихая вода",
  ripples: "Круги по воде",
  murky: "Мутная вода",
  first_sun: "Первое солнце",
};

const RECIPIENTS: readonly Recipient[] = ["prosecutor", "sk", "alla", "sk_alla", "deal"];

const truthy = (v: unknown) => v === true || v === 1 || v === "true" || v === "да";

export function endingInputs(flags: Flags): EndingInputs {
  const r = flags.recipient;
  return {
    A: truthy(flags.final_board),
    R: typeof r === "string" && (RECIPIENTS as readonly string[]).includes(r) ? (r as Recipient) : null,
    K: truthy(flags.final_k),
    W: (truthy(flags.ratnikov_full) ? 1 : 0) + (truthy(flags.tokha_turned) ? 1 : 0),
    V: truthy(flags.archive_restored),
    sent: truthy(flags.package_sent),
  };
}

const includesSk = (r: Recipient | null) => r === "sk" || r === "sk_alla";
const includesAlla = (r: Recipient | null) => r === "alla" || r === "sk_alla";

/**
 * Концовка по флагам. Условия проверяются сверху вниз, как в таблице разд. 3.
 * В режиме «Без таймера» неотправленный пакет не означает провал: часы ждут.
 */
export function computeEnding(flags: Flags, options: { noTimer?: boolean } = {}): EndingResult {
  const inputs = endingInputs(flags);
  const { A, R, K, W, V, sent } = inputs;

  let id: EndingId;
  let variant: string | undefined;
  if (R === "deal" || (!sent && !options.noTimer)) {
    id = "empty";
  } else if (R === "prosecutor" || R === null || !A) {
    id = "still";
    variant = R === "prosecutor" || R === null ? "prosecutor" : R === "alla" ? "alla_weak" : "sk_weak";
  } else if (R === "alla") {
    id = "ripples";
    variant = truthy(flags.redacted) ? "redacted" : "unredacted";
  } else if (includesSk(R) && (!K || W === 0 || !V)) {
    id = "murky";
    variant = !K ? "no_k" : W === 0 ? "no_w" : "no_v";
  } else {
    id = "first_sun";
  }

  const caught = flags.burtsev_caught;
  const burtsev = caught === "лестница" || caught === "дверь" ? caught : null;

  const epilogue: string[] = [];
  if (id !== "empty") {
    epilogue.push(truthy(flags.tokha_turned) ? "tokha.kettle" : "tokha.morgue");
    if (flags.melnik === "blackmail") epilogue.push("melnik.debt");
    else if (flags.melnik === "reported") epilogue.push("melnik.fired");
    if (flags.dasha_truth !== undefined) epilogue.push(truthy(flags.dasha_truth) ? "dasha.stays" : "dasha.leaves");
    epilogue.push(truthy(flags.valentina_warned) ? "valentina.bridge" : "valentina.kitchen");
    if (includesAlla(R)) epilogue.push(truthy(flags.redacted) ? "sources.protected" : "sources.exposed");
  }

  return {
    id,
    title: ENDING_TITLES[id],
    inputs,
    ...(variant ? { variant } : {}),
    burtsev,
    graninBroken: truthy(flags.granin_broken),
    epilogue,
    postCredits: id !== "empty",
  };
}
