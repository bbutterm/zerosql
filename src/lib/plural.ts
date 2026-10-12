/**
 * Русское склонение по числу: plural(5, ["строка", "строки", "строк"]) → "строк".
 */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

/** «5 строк», «1 запрос», … */
export function pluralize(n: number, forms: readonly [string, string, string]): string {
  return `${n.toLocaleString("ru-RU")} ${plural(n, forms)}`;
}
