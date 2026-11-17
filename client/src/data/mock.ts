// ═══ 示例数据（设计预览模式专用） ═══
// 全部为虚构数值与虚构条目，与任何真实健康数据无关；预览界面顶部有「示例数据」横幅标注。
// 数值由固定公式按天数生成（确定性伪变化），保证每次打开、每张审查截图都一致。

import type { Dashboard } from "../lib";
import type { HealthDataProvider } from "./provider";

function dstr(base: Date, offsetDays: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 生成一份虚构 dashboard：以「今天」为最新日，共 14 天明细。 */
export function buildMockDashboard(): Dashboard {
  const now = new Date();
  const days = 14;
  const daily: Dashboard["daily"] = [];
  const sleep: Dashboard["sleep"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dstr(now, -i);
    const w = (i * 733) % 997; // 确定性伪变化
    daily.push({
      date,
      steps: 5800 + (w % 3200),
      activeEnergyKcal: 260 + (w % 190),
      exerciseMin: (w % 5) * 9 + (i % 3) * 6,
      standMin: 480 + (w % 160),
      restingHr: 61 + (w % 5),
      hrvMs: 38 + (w % 14),
      spo2Pct: 0.97,
      respiratoryRate: 14 + (w % 3) * 0.5,
      wristTempC: 36.4 + (w % 4) * 0.1,
      walkingHr: 96 + (w % 12),
      distanceM: 4200 + (w % 2400),
      waterMl: 1200 + (w % 700),
      headphoneDb: 62 + (w % 9),
    });
    const total = 402 + (w % 68);
    sleep.push({
      date,
      startDatetime: `${dstr(now, -i - 1)} 23:52`,
      endDatetime: `${date} 06:47`,
      totalMin: total,
      coreMin: Math.round(total * 0.52),
      deepMin: Math.round(total * 0.17),
      remMin: Math.round(total * 0.22),
      awakeMin: Math.round(total * 0.09),
      efficiency: 0.93,
      qualityScore: 78 + (w % 12),
      awakenings: 1 + (w % 3),
    });
  }
  const latest = dstr(now, 0);
  // 预览专用：地址带 stale 参数（如 ?preview=1&stale=1）时，把示例同步时间设为 3 天前，
  // 供审查 M26 数据过期态；示例数值仍全为虚构，正式数据不受影响。
  const wantStale =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("stale");
  const sync: Dashboard["sync"] = wantStale
    ? {
        status: "idle",
        lastAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString(),
        lastHhmm: "09:00",
      }
    : { status: "idle", lastAt: null, lastHhmm: "09:00" };
  return {
    seeded: true,
    latestDate: latest,
    daily,
    sleep,
    workouts: [
      { id: "mock-w1", startDatetime: `${dstr(now, -2)} 18:30`, workoutType: "快走（示例）", durationMin: 32, hrAvg: 108, hrMax: 126, energyKcal: 148, isStrength: false },
      { id: "mock-w2", startDatetime: `${dstr(now, -4)} 07:15`, workoutType: "力量训练（示例）", durationMin: 26, hrAvg: 96, hrMax: 118, energyKcal: 122, isStrength: true },
      { id: "mock-w3", startDatetime: `${dstr(now, -9)} 18:40`, workoutType: "骑行（示例）", durationMin: 41, hrAvg: 116, hrMax: 138, energyKcal: 236, isStrength: false },
    ],
    profile: {
      age: 30,
      sex: "示例",
      heightCm: 172,
      workPattern: "示例作息（虚构）",
      exerciseHabit: "示例运动习惯（虚构）",
      goalPrimary: "改善睡眠",
      goalSecondary: null,
      doctorNotes: null,
    },
    checkins: [0, 1, 2, 3].map((k) => ({
      date: dstr(now, -k - 1),
      energy: 3 + (k % 2),
      mood: 4 - (k % 2),
      stress: 2 + (k % 3),
      note: k === 1 ? "示例备注（虚构）" : null,
      tags: k === 0 ? ["咖啡因"] : [],
      redFlag: false,
    })),
    suggestionDone: [],
    habits: [
      { id: 1, topic: "sleep", name: "示例习惯：睡前阅读 20 分钟", minVersion: "至少读 5 分钟", active: true },
      { id: 2, topic: "exercise", name: "示例习惯：每周三次快走", minVersion: "没时间就走 10 分钟", active: true },
      { id: 3, topic: "activity", name: "示例习惯：晨间拉伸 5 分钟", minVersion: "只做颈部和肩部也可以", active: true },
      { id: 4, topic: "sleep", name: "示例习惯：午后不喝咖啡", minVersion: "换成无咖啡因饮品", active: false },
    ],
    habitLogs: [`1:${dstr(now, -1)}`, `1:${dstr(now, -2)}`, `2:${dstr(now, -2)}`, `3:${dstr(now, -1)}`],
    goals: [
      { id: 1, topic: "sleep", title: "示例目标：四周内把平均入睡提前到 23:45", detail: "虚构目标，仅用于设计预览。", status: "active", tier: "基础达标" },
      { id: 2, topic: "exercise", title: "示例目标：每周锻炼达到 150 分钟", detail: null, status: "draft", tier: "基础达标" },
    ],
    topicSettings: ["sleep", "exercise", "activity", "cardio", "weight", "nutrition", "stress", "desk", "prevention", "travel"].map(
      (topic) => ({ topic, mode: topic === "sleep" ? "active" : "monitor", tier: "基础达标" }),
    ),
    weeklyPlan: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      kind: weekday === 2 || weekday === 4 ? "力量" : weekday === 6 ? "有氧" : "灵活",
      label: null,
    })),
    labs: [],
    reports: [
      {
        id: 1,
        kind: "weekly",
        periodLabel: "示例周",
        title: "示例周报（虚构）",
        body: "这是设计预览用的虚构周报正文，不包含任何真实健康结论。",
        createdAt: new Date(now).toISOString(),
      },
    ],
    nutrition: [],
    settings: {
      habit_cap_v1: "1",
      bedtime_target: "23:15",
      bedtime_stage_target: "00:30",
      nav_shrink: "1",
    },
    sync,
    history: { hasOlder: false, oldestDate: daily[0]?.date ?? null, detailFrom: daily[0]?.date ?? null, olderMonths: [] },
  };
}

export const mockProvider: HealthDataProvider = {
  kind: "mock",
  async getDashboard() {
    return buildMockDashboard();
  },
};
