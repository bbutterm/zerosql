/**
 * Расписание zero (М6): какие задания срабатывают после дела, с какой веткой
 * текста и в какую ночь. Строку в query_log вставляет патч cron.fire.
 */
import { describe, expect, it } from "vitest";
import {
  CRON_PATCH,
  cronConditionHolds,
  cronFiresAfterCase,
  cronJob1Variant,
  cronLiveParams,
  firedCronJobs,
  nextCronNight,
} from "@/engine";

describe("М6: расписание zero", () => {
  it("ночь после дела — ближайшие 03:12:00 не раньше часов", () => {
    expect(nextCronNight("2026-12-17 21:40:00")).toBe("2026-12-18 03:12:00");
    expect(nextCronNight("2026-12-15 02:40:00")).toBe("2026-12-15 03:12:00");
    expect(nextCronNight("2026-12-15 03:12:00")).toBe("2026-12-15 03:12:00");
    expect(nextCronNight("2026-12-31 23:59")).toBe("2027-01-01 03:12:00");
  });

  it("задание 1: ветка по увиденным 3311 и 3313", () => {
    expect(cronJob1Variant(["3311", "3313", "4471"])).toBe("a");
    expect(cronJob1Variant(["3313"])).toBe("b");
    expect(cronJob1Variant(["3312"])).toBe("c");
  });

  it("условия: всегда, видела, не видела", () => {
    expect(cronConditionHolds('{"always":true}', [])).toBe(true);
    expect(cronConditionHolds('{"seen":"doc_registry:3313"}', ["3313"])).toBe(true);
    expect(cronConditionHolds('{"seen":"doc_registry:3313"}', ["3312"])).toBe(false);
    const sig = '{"not_seen":"construction_docs:ПД-117/изм.3:signed_by_person_id"}';
    expect(cronConditionHolds(sig, ["ПД-117/изм.3"])).toBe(true);
    expect(cronConditionHolds(sig, ["ПД-117/изм.3", "1001"])).toBe(false);
    const sms = '{"not_seen":"gs_comms_2015:sms:2-14:2015-02-19"}';
    expect(cronConditionHolds(sms, ["ГОСТЬ ЕДЕТ К СТАРОМУ ПРИЧАЛУ. ВСТРЕТЬ."])).toBe(false);
    expect(cronConditionHolds(sms, [])).toBe(true);
    expect(cronConditionHolds("не json", [])).toBe(false);
  });

  it("живое задание есть только у Д5", () => {
    expect(cronLiveParams(5, ["3313"])).toEqual({ jobId: 1, variant: "b" });
    expect(cronLiveParams(6, [])).toBeNull();
  });

  it("после Д5 — задания 2 и 3 (живое уже сработало), после Д6 — 4–6; сработавшие не повторяются", () => {
    const after5 = cronFiresAfterCase(5, ["3313"], new Set([1]), "2026-12-15 05:40:00");
    expect(after5.map((p) => p.jobId)).toEqual([2, 3]);
    expect(after5.every((p) => p.at === "2026-12-16 03:12:00")).toBe(true);

    // 3313 не увидена в Д5 — задание 2 проверяется снова после Д6
    const after6 = cronFiresAfterCase(6, [], new Set([1, 3]), "2026-12-17 21:00:00");
    expect(after6.map((p) => p.jobId)).toEqual([4, 5, 6]);
    expect(cronFiresAfterCase(6, ["3313"], new Set([1, 3]), "2026-12-17 21:00:00").map((p) => p.jobId)).toEqual([2, 4, 5, 6]);

    // живое задание, которое не сработало событием, срабатывает ночью со своей веткой
    expect(cronFiresAfterCase(5, [], new Set(), "2026-12-15 05:40:00")[0]).toMatchObject({ jobId: 1, variant: "c" });
  });

  it("сработавшие задания читаются из патчей", () => {
    const fired = firedCronJobs(["p0.player", { id: CRON_PATCH, params: { jobId: 2 } }, { id: "c07.admission" }, { id: CRON_PATCH, params: { jobId: 5 } }]);
    expect([...fired]).toEqual([2, 5]);
  });
});
