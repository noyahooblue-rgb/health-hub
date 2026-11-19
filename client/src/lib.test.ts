// 统计口径单元测试（方案 C 等效实现条件 3）：锁定全站唯一口径，防止「两种本周」类问题回归。
// 覆盖：自然周起止（weekRange / weekStats）、均值排除不完整日（baseline / PARTIAL_DATES）、
// 基线带（mean ± sd）、「截至 HH:MM」（asOfLabel）。运行：bun test client/src/lib.test.ts

import { describe, expect, test } from "bun:test";
import {
PARTIAL_DATES,
asOfLabel,
baseline,
dateLabelCn,
fullDaily,
habitResumePlan,
habitStreak,
mean,
probeStats,
sd,
segmentAverage,
syncStaleness,
weekRange,
weekStats,
type DailyRow,
type Dashboard,
} from "./lib";

function mkRow(date: string, steps: number | null, exerciseMin: number | null = null): DailyRow {
  return {
    date,
    steps,
    activeEnergyKcal: null,
    exerciseMin,
    standMin: null,
    restingHr: null,
    hrvMs: null,
    spo2Pct: null,
    respiratoryRate: null,
    wristTempC: null,
    walkingHr: null,
    distanceM: null,
    waterMl: null,
    headphoneDb: null,
  };
}

function mkDashboard(daily: DailyRow[], workouts: Dashboard["workouts"] = []): Dashboard {
  return {
    seeded: true,
    latestDate: daily.length > 0 ? daily[daily.length - 1]!.date : null,
    daily,
    sleep: [],
    workouts,
    profile: null,
    checkins: [],
    suggestionDone: [],
    habits: [],
    habitLogs: [],
    goals: [],
    topicSettings: [],
    weeklyPlan: [],
    labs: [],
    reports: [],
    nutrition: [],
    settings: {},
    sync: { status: "idle", lastAt: null, lastHhmm: null },
    history: { hasOlder: false, oldestDate: null, detailFrom: null, olderMonths: [] },
  };
}

describe("自然周起止（weekRange）", () => {
  test("周二 → 本周一到本周日", () => {
    // 2026-11-17 是周二，所在自然周为 11-16（周一）→ 11-22（周日）
    expect(weekRange("2026-11-17")).toEqual({ from: "2026-11-16", to: "2026-11-22", dow: 1 });
  });
  test("周一当天 → from 就是自己", () => {
    expect(weekRange("2026-11-16")).toEqual({ from: "2026-11-16", to: "2026-11-22", dow: 0 });
  });
  test("周日 → 仍属同一自然周（不滚到下周）", () => {
    expect(weekRange("2026-11-22")).toEqual({ from: "2026-11-16", to: "2026-11-22", dow: 6 });
  });
  test("跨月：11-01（周日）的周一在 10 月", () => {
    expect(weekRange("2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01", dow: 6 });
  });
});

describe("本周统计（weekStats）与自然周同源", () => {
  test("只统计本周一行，上周日的大额数值不混入（防两种「本周」回归）", () => {
    const d = mkDashboard(
      [
        mkRow("2026-11-15", 9000, 999), // 上周日：不得计入本周
        mkRow("2026-11-16", 8000, 30),
        mkRow("2026-11-17", 7000, 20),
      ],
      [
        { id: "a", startDatetime: "2026-11-15 10:00", workoutType: "力量", durationMin: 30, hrAvg: null, hrMax: null, energyKcal: null, isStrength: true },
        { id: "b", startDatetime: "2026-11-16 10:00", workoutType: "力量", durationMin: 30, hrAvg: null, hrMax: null, energyKcal: null, isStrength: true },
      ],
    );
    const wk = weekStats(d);
    expect(wk).not.toBeNull();
    expect(wk!.from).toBe("2026-11-16");
    expect(wk!.to).toBe("2026-11-22");
    expect(wk!.exerciseMin).toBe(50);
    expect(wk!.strengthCount).toBe(1);
    expect(wk!.elapsed).toBe(2);
    expect(wk!.inProgress).toBe(true);
  });
  test("最新日是周日时本周已完整", () => {
    const d = mkDashboard([mkRow("2026-11-22", 8000, 10)]);
    const wk = weekStats(d);
    expect(wk!.inProgress).toBe(false);
    expect(wk!.elapsed).toBe(7);
  });
});

describe("均值排除不完整日（baseline / PARTIAL_DATES）", () => {
  test("部分同步日与最新日都排除在基线之外", () => {
    expect(PARTIAL_DATES.has("2026-11-07")).toBe(true);
    const daily = [
      mkRow("2026-11-05", 8000),
      mkRow("2026-11-06", 9000),
      mkRow("2026-11-07", 99999), // 部分同步日：极端值不得污染基线
      mkRow("2026-11-08", 10000),
      mkRow("2026-11-09", 88888), // 最新日（当日仅截至最近同步）：排除
    ];
    const b = baseline(daily, "steps");
    expect(b).not.toBeNull();
    expect(b!.n).toBe(3);
    expect(b!.mean).toBe(9000);
  });
  test("fullDaily 排除部分同步日", () => {
    const d = mkDashboard([mkRow("2026-11-07", 100), mkRow("2026-11-08", 200)]);
    expect(fullDaily(d).map((r) => r.date)).toEqual(["2026-11-08"]);
  });
  test("数据不足时基线为 null（界面显示数据不足，不编造）", () => {
    expect(baseline([], "steps")).toBeNull();
    expect(baseline([mkRow("2026-11-09", 8000)], "steps")).toBeNull();
  });
});

describe("基线带（mean ± sd）", () => {
  test("mean / sd 基础值", () => {
    expect(mean([8000, 9000, 10000])).toBe(9000);
    expect(sd([8000, 9000, 10000])).toBe(1000);
    expect(sd([8000])).toBeNull();
    expect(mean([])).toBeNull();
  });
  test("基线带 = mean ± 1sd，可直接用于图表常态范围", () => {
    const daily = [
      mkRow("2026-11-05", 8000),
      mkRow("2026-11-06", 9000),
      mkRow("2026-11-08", 10000),
      mkRow("2026-11-09", 5000), // 最新日排除
    ];
    const b = baseline(daily, "steps")!;
    expect(b.mean - (b.sd ?? 0)).toBe(8000);
    expect(b.mean + (b.sd ?? 0)).toBe(10000);
  });
});

describe("截至 HH:MM（asOfLabel）", () => {
  test("有同步时间时直接使用", () => {
    expect(asOfLabel("17:13")).toBe("截至 17:13");
    expect(asOfLabel("07:30")).toBe("截至 07:30");
  });
  test("无同步时间时回退晨间设置，再缺失回退 07:30", () => {
    expect(asOfLabel(null, "07:00")).toBe("截至 07:00");
    expect(asOfLabel(null)).toBe("截至 07:30");
    expect(asOfLabel(undefined, undefined)).toBe("截至 07:30");
  });
});

describe("图表静置读数 = 分段平均（segmentAverage，M10）", () => {
  test("只计有值且完整的点：空值与不完整日都不进平均", () => {
    const pts = [
      { value: 8000 },
      { value: null },
      { value: 10000 },
      { value: 99999, incomplete: true }, // 不完整日（当日仅截至最近同步）：不得拉高平均
    ];
    expect(segmentAverage(pts)).toBe(9000);
  });
  test("全部为空 / 全部不完整时返回 null（读数区显示 —，不编造）", () => {
    expect(segmentAverage([{ value: null }, { value: null }])).toBeNull();
    expect(segmentAverage([{ value: 5000, incomplete: true }])).toBeNull();
    expect(segmentAverage([])).toBeNull();
  });
});

describe("同步过期判定（syncStaleness，M26）", () => {
  const now = Date.parse("2026-11-17T12:00:00.000Z");
  test("24 小时内不过期（边界含恰好 24 小时）", () => {
    expect(syncStaleness("2026-11-17T11:00:00.000Z", now).stale).toBe(false);
    expect(syncStaleness("2026-11-16T12:00:00.000Z", now).stale).toBe(false);
  });
  test("超过 24 小时过期，天数向下取整且至少 1", () => {
    expect(syncStaleness("2026-11-16T11:59:59.000Z", now)).toEqual({ stale: true, days: 1 });
    expect(syncStaleness("2026-11-14T12:00:00.000Z", now)).toEqual({ stale: true, days: 3 });
    expect(syncStaleness("2026-11-15T13:00:00.000Z", now)).toEqual({ stale: true, days: 1 });
  });
  test("无同步记录 / 时间不可解析时不过期（不误报）", () => {
    expect(syncStaleness(null, now)).toEqual({ stale: false, days: 0 });
    expect(syncStaleness(undefined, now)).toEqual({ stale: false, days: 0 });
    expect(syncStaleness("not-a-date", now)).toEqual({ stale: false, days: 0 });
  });
});

describe("验收探针统计（probeStats，发布规范第 7 节）", () => {
  test("无记录时 count=0、中位数与最大值均为 null（不编造）", () => {
    expect(probeStats([])).toEqual({ count: 0, medianMs: null, maxMs: null });
  });
  test("奇数个样本：中位数取排序后中间值，最大值取最大样本", () => {
    expect(probeStats([30, 10, 20])).toEqual({ count: 3, medianMs: 20, maxMs: 30 });
  });
  test("偶数个样本：中位数取中间两数均值，结果保留 1 位小数", () => {
    expect(probeStats([10.04, 20.06, 30, 45.25])).toEqual({
      count: 4,
      medianMs: 25,
      maxMs: 45.3,
    });
  });
});

describe("习惯恢复前置判断（habitResumePlan，M17）", () => {
  const hs = (actives: number, paused: number) => [
    ...Array.from({ length: actives }, (_, i) => ({ id: i + 1, name: `进行中${i + 1}`, active: true })),
    ...Array.from({ length: paused }, (_, i) => ({ id: 101 + i, name: `已暂停${i + 1}`, active: false })),
  ];
  test("未满 3 个 → direct（可直接恢复）", () => {
    expect(habitResumePlan(hs(2, 1), 101).mode).toBe("direct");
    expect(habitResumePlan(hs(0, 2), 102).mode).toBe("direct");
  });
  test("已满 3 个 → swap，并带出全部进行中习惯供选择暂停", () => {
    const plan = habitResumePlan(hs(3, 2), 101);
    expect(plan.mode).toBe("swap");
    if (plan.mode === "swap") {
      expect(plan.active.map((h) => h.id)).toEqual([1, 2, 3]);
      expect(plan.activeCount).toBe(3);
    }
  });
  test("目标已在进行中或不存在 → none", () => {
    expect(habitResumePlan(hs(3, 1), 2).mode).toBe("none");
    expect(habitResumePlan(hs(1, 1), 999).mode).toBe("none");
  });
});

describe("日期中文标签（dateLabelCn，打卡标题明示所属日期）", () => {
  test("YYYY-MM-DD → M月D日（不带零填充）", () => {
    expect(dateLabelCn("2026-11-18")).toBe("11月18日");
    expect(dateLabelCn("2026-01-05")).toBe("1月5日");
  });
  test("不可解析时原样返回，不编造", () => {
    expect(dateLabelCn("")).toBe("");
    expect(dateLabelCn("未知")).toBe("未知");
  });
});

describe("习惯连续天数以设备今日为锚（habitStreak）", () => {
  // 同步滞后场景：日志只到昨天（D-1），锚点是设备今日 D —— 今天未勾，
  // 连续天数从昨天起算，不因数据未同步而归零或错位。
  test("今日未勾、昨日起连续 3 天 → 3", () => {
    const logs = ["1:2026-11-17", "1:2026-11-16", "1:2026-11-15"];
    expect(habitStreak(logs, 1, "2026-11-18")).toBe(3);
  });
  test("今日已勾且连续 → 含今日计数", () => {
    const logs = ["1:2026-11-18", "1:2026-11-17", "1:2026-11-16"];
    expect(habitStreak(logs, 1, "2026-11-18")).toBe(3);
  });
  test("昨日断档 → 0（今日未勾时不追溯更早）", () => {
    const logs = ["1:2026-11-15"];
    expect(habitStreak(logs, 1, "2026-11-18")).toBe(0);
  });
});
