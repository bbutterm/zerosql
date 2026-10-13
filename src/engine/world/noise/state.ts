/**
 * Общее состояние генераторов шума: население, адреса, организации,
 * сотрудники, машины, телефоны, счета. Генераторы идут в фиксированном
 * порядке (noise/index.ts) и дописывают сюда то, что нужно следующим.
 */
import type { WorldContext } from "../context";
import type { District } from "../catalog";
import { TABLE_BY_NAME } from "../schema";

export interface NoisePerson {
  id: number;
  last: string;
  first: string;
  middle: string | null;
  sex: "М" | "Ж";
  /** мс */
  birth: number;
  /** Момент смерти (мс) или null */
  death: number | null;
  /** «Фамилия И. О.» */
  short: string;
  /** «Фамилия Имя Отчество» */
  full: string;
  /** Запись-дубль (опечатка, ё/е): в событиях не участвует */
  dup: boolean;
  /** id домохозяйства (семьи живут вместе) */
  household: number;
  district?: District;
  home?: number;
  employer?: number;
}

export interface NoiseAddress {
  id: number;
  district: District;
  street: string;
  house: string;
  apt: string | null;
}

export interface NoiseCompany {
  id: number;
  name: string;
  kind: string;
  registered: number;
  liquidated: number | null;
  /** Посажена в core или делом: шум не трогает её владельцев и деньги */
  planted: boolean;
}

export interface NoiseStaff {
  id: number;
  personId: number;
  short: string;
  login: string | null;
  rank: string | null;
  position: string;
  dept: string;
  workstation: string | null;
  badge: string;
  hired: number;
  fired: number | null;
  cast: boolean;
}

export interface NoiseVehicle {
  id: number;
  plate: string;
  make: string;
  ownerPersonId: number | null;
  ownerCompanyId: number | null;
  /** Ездит сейчас (не продана, не снята с учёта) */
  active: boolean;
  kind: "легковая" | "такси" | "служебная" | "грузовая";
}

export interface NoiseState {
  people: NoisePerson[];
  byId: Map<number, NoisePerson>;
  /** Живые взрослые (18–80) — пул для событий */
  adults: NoisePerson[];
  addresses: NoiseAddress[];
  addressById: Map<number, NoiseAddress>;
  /** Ключ 'улица|дом|кв' → id */
  addressByKey: Map<string, number>;
  residents: Map<number, number[]>;
  companies: NoiseCompany[];
  staff: NoiseStaff[];
  workstations: string[];
  vehicles: NoiseVehicle[];
  phoneOf: Map<number, string>;
  accountOf: Map<number, string>;
  companyAccounts: Map<number, string>;
  incidents: { id: number; kusp: number; at: number; applicant: number | null }[];
  cases2015: { id: string; opened: number }[];
  casesAll: { id: string; opened: number }[];
}

export function noiseState(ctx: WorldContext): NoiseState {
  let s = ctx.state.noise as NoiseState | undefined;
  if (!s) {
    s = {
      people: [],
      byId: new Map(),
      adults: [],
      addresses: [],
      addressById: new Map(),
      addressByKey: new Map(),
      residents: new Map(),
      companies: [],
      staff: [],
      workstations: [],
      vehicles: [],
      phoneOf: new Map(),
      accountOf: new Map(),
      companyAccounts: new Map(),
      incidents: [],
      cases2015: [],
      casesAll: [],
    };
    ctx.state.noise = s;
  }
  return s;
}

/** Сколько строк шума нужно, чтобы таблица вышла на объём разд. 8.2 */
export function noiseTarget(ctx: WorldContext, table: string): number {
  const def = TABLE_BY_NAME.get(table);
  if (!def) throw new Error(`noiseTarget: нет таблицы ${table}`);
  return Math.max(0, def.target - ctx.plantedCount(table));
}

export const addressKey = (street: string, house: string, apt: string | null): string =>
  `${street.trim()}|${house}|${apt ?? ""}`;
