/**
 * Русский набор (раздел 3.3–3.5): неразрывные пробелы, разряды, множественное число.
 * Применяется к строкам интерфейса и к данным дел перед показом.
 */

const NBSP = " ";
/** Узкий неразрывный пробел — разделитель разрядов: 12 480 */
export const THIN = " ";

const pluralRules = new Intl.PluralRules("ru");

/** «1 строка», «3 строки», «42 строки», «0 строк» — через Intl.PluralRules("ru") */
export function ruPlural(n: number, forms: readonly [one: string, few: string, many: string]): string {
  const cat = pluralRules.select(n);
  if (cat === "one") return forms[0];
  if (cat === "few") return forms[1];
  if (cat === "many") return forms[2];
  return forms[1]; // дробные: «1,5 строки»
}

/** Целое с разрядами через U+202F */
export function formatInt(n: number): string {
  const sign = n < 0 ? "−" : "";
  const digits = Math.abs(Math.trunc(n)).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** «42 строки» с неразрывным пробелом */
export function countOf(n: number, forms: readonly [string, string, string]): string {
  return `${formatInt(n)}${NBSP}${ruPlural(n, forms)}`;
}

/** Время выполнения: «3,4 мс», «0,3 мс», «1,25 с» */
export function formatMs(ms: number): string {
  if (ms < 1000) {
    const v = ms < 10 ? Math.round(ms * 10) / 10 : Math.round(ms);
    return `${String(v).replace(".", ",")}${NBSP}мс`;
  }
  return `${String(Math.round(ms / 10) / 100).replace(".", ",")}${NBSP}с`;
}

/**
 * Неразрывные пробелы: после однобуквенных предлогов и союзов, перед тире,
 * в «№ 01», «Д. Рябов», «86 МВт», «6 из 8».
 */
export function typo(text: string): string {
  return (
    text
      // однобуквенные предлоги и союзы
      .replace(/(?<=^|[\s(«„" ])([вксиоуаВКСИОУА])\s+/g, `$1${NBSP}`)
      // тире: неразрывный пробел перед ним
      .replace(/\s+—/g, `${NBSP}—`)
      // номер
      .replace(/№\s+/g, `№${NBSP}`)
      // инициал и фамилия
      .replace(/(^|[\s(«])([А-ЯЁ]\.)\s+(?=[А-ЯЁ])/g, `$1$2${NBSP}`)
      // «6 из 8»
      .replace(/(\d)\s+из\s+(\d)/g, `$1${NBSP}из${NBSP}$2`)
      // число и единица: «86 МВт», «3,4 мс», «40 °C»
      .replace(/(\d)\s+(?=(?:МВт|кВт|мс|мин|сек|км|кг|руб|₽|%|°|с|м|ч)(?![а-яёА-ЯЁ]))/g, `$1${NBSP}`)
  );
}

/** Первая буква строчная, если это не аббревиатура: «Столбца…» → «столбца…», «SQLite…» остаётся */
export function lowerFirst(text: string): string {
  if (text.length < 2) return text;
  const [a, b] = [text[0], text[1]];
  if (a === a.toLowerCase() || b !== b.toLowerCase()) return text;
  return a.toLowerCase() + text.slice(1);
}

/** Детерминированный хеш id: повороты, номера карточек, позиции маски штампа */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Значение в [min, max] по id — для поворотов предметов (±1,2°), стикеров (±3°) и т. п. */
export function fromId(id: string, min: number, max: number, salt = 0): number {
  const h = hashId(`${id}:${salt}`);
  return Math.round((min + ((h % 10007) / 10006) * (max - min)) * 100) / 100;
}

/** Винительный падеж фамилии для «Спросить Соколову»: -ова/-ева/-ина → -у; -ов/-ев/-ин → -а */
export function surnameAccusative(name: string): string {
  if (/(ова|ева|ёва|ина|ына|ская|цкая)$/.test(name)) {
    return name.endsWith("ая") ? `${name.slice(0, -2)}ую` : `${name.slice(0, -1)}у`;
  }
  if (/(ов|ев|ёв|ин|ын)$/.test(name)) return `${name}а`;
  if (/(ский|цкий)$/.test(name)) return `${name.slice(0, -2)}ого`;
  return name;
}
