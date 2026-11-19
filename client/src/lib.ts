// 共享逻辑：类型、统计（基线/趋势）、分析引擎（恢复状态、红旗、今日建议）、专题内容。
// 所有分析只基于库中真实数据；数据不足时返回 null，由界面显示「数据不足」。

import type { QueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "./api";
import type { api } from "./api";

export type Dashboard = ApiResponse<typeof api, "getDashboard">;

/**
 * 乐观更新：直接改本地 dashboard 缓存让界面立即响应，保存动作异步落盘；
 * 失败时用快照回滚。不再在每次交互后全量重拉 getDashboard。
 * 返回修改前的快照（无缓存时为 undefined）。
 */
export function patchDashboard(
  qc: QueryClient,
  patch: (d: Dashboard) => Dashboard,
): Dashboard | undefined {
  const prev = qc.getQueryData<Dashboard>(["dashboard"]);
  if (prev) qc.setQueryData<Dashboard>(["dashboard"], patch(prev));
  return prev;
}

/** 乐观更新失败回滚。 */
export function restoreDashboard(qc: QueryClient, prev: Dashboard | undefined) {
  if (prev) qc.setQueryData<Dashboard>(["dashboard"], prev);
  else void qc.invalidateQueries({ queryKey: ["dashboard"] });
}
export type DailyRow = Dashboard["daily"][number];
export type SleepRow = Dashboard["sleep"][number];
export type WorkoutRow = Dashboard["workouts"][number];

// ---------- 基础统计 ----------

export function mean(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function sd(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const m = mean(vals);
  if (m == null) return null;
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1));
}

export interface Baseline {
  mean: number;
  sd: number | null;
  n: number;
}

/** 部分同步的日期（health-cli coverage 明确警告 2026-11-07 未完整同步）：全站统一排除，避免把同步缺口误读为真实偏低。 */
export const PARTIAL_DATES = new Set(["2026-11-07"]);

/** 完整日序列：排除部分同步日（保留最新日，最新日在图中标为不完整点）。 */
export function fullDaily(d: Dashboard): DailyRow[] {
  return d.daily.filter((r) => !PARTIAL_DATES.has(r.date));
}

export function fullSleep(d: Dashboard): SleepRow[] {
  return d.sleep.filter((r) => !PARTIAL_DATES.has(r.date));
}

/** 某指标最近 28 天的基线；全站统一口径：不完整日（部分同步日 + 最新日，当日仅截至最近一次同步）一律排除。 */
export function baseline(
  daily: DailyRow[],
  key: keyof DailyRow,
  upto?: string,
): Baseline | null {
  const latest = daily.length > 0 ? daily[daily.length - 1]!.date : null;
  const rows = daily.filter(
    (d) =>
      typeof d[key] === "number" &&
      !PARTIAL_DATES.has(d.date) &&
      d.date !== latest &&
      (!upto || d.date <= upto),
  );
  const recent = rows.slice(-28);
  const vals = recent.map((d) => d[key] as number);
  const m = mean(vals);
  if (m == null) return null;
  return { mean: m, sd: sd(vals), n: vals.length };
}

export function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtMin(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`;
}

export function fmtDelta(
  cur: number | null,
  base: Baseline | null,
  unit: string,
  digits = 0,
): string {
  if (cur == null || !base) return "基线积累中";
  const d = cur - base.mean;
  const sign = d > 0 ? "+" : "";
  return `相对基线 ${sign}${fmt(d, digits)}${unit}（基线 ${fmt(base.mean, digits)}${unit}，${base.n} 天）`;
}

/** 日期加减（本地日期字符串）。 */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 「今日」口径（2026-11-18 批复 zjzjfgzz 定案）：一律以设备本地日期为准，
 *  不以数据 latestDate（最新已同步数据日）为准——同步滞后时 latestDate 是昨天，
 *  但用户要打的卡、要勾的习惯仍是设备今天的。凡是「今日」的用户状态（打卡
 *  日期键、习惯/建议/饮食的今日判定、保存写入的日期键）都必须经 todayStr()
 *  取值；latestDate 只用于数据序列本身的展示与统计锚点。 */

/** "2026-11-18" → "11月18日"（打卡表单标题等处显示所属日期用）。 */
export function dateLabelCn(date: string): string {
  const parts = date.split("-");
  const m = Number(parts[1]);
  const dd = Number(parts[2]);
  if (!m || !dd) return date;
  return `${m}月${dd}日`;
}

/** "2026-11-14 02:08" → 当天分钟数（入睡时刻，跨零点按 +24h 处理由调用方负责）。 */
export function clockMinutes(dt: string | null): number | null {
  if (!dt) return null;
  const t = dt.split(" ")[1];
  if (!t) return null;
  const [h = 0, m = 0] = t.split(":").map(Number);
  return h * 60 + m;
}

/** 入睡时刻归一：00:00–11:59 视为次日凌晨（+1440），便于算波动。 */
export function bedtimeNorm(dt: string | null): number | null {
  const v = clockMinutes(dt);
  if (v == null) return null;
  return v < 720 ? v + 1440 : v;
}

export function fmtClock(normMin: number): string {
  const v = ((Math.round(normMin) % 1440) + 1440) % 1440;
  const h = String(Math.floor(v / 60)).padStart(2, "0");
  const m = String(v % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// ---------- 本周（全站唯一口径：自然周 周一 → 周日） ----------

export interface WeekStats {
  from: string;
  to: string;
  exerciseMin: number;
  strengthCount: number;
  days: number;
  /** 本周已过天数（含最新日） */
  elapsed: number;
  /** 最新日还不是周日时为 true */
  inProgress: boolean;
}

/** 自然周边界（全站唯一实现）：给定任一日期，返回其所在自然周的周一（from）与周日（to）。
 *  「本周」在今日/趋势/复盘/周报各处都必须经此函数取值——v3 审查出现过两种「本周」，靠单元测试锁定。 */
export function weekRange(date: string): { from: string; to: string; dow: number } {
  const dow = (new Date(`${date}T00:00:00`).getDay() + 6) % 7; // 0 = 周一
  const from = addDays(date, -dow);
  return { from, to: addDays(from, 6), dow };
}

/** 「截至 HH:MM」统一格式：同步时间缺失时回退设置里的晨间时间，再缺失才用 07:30。 */
export function asOfLabel(lastHhmm: string | null | undefined, fallback?: string | null): string {
  return `截至 ${lastHhmm ?? fallback ?? "07:30"}`;
}

// ---------- 同步过期判定（M26，动效与交互清单 v2） ----------

/** 最近一次同步距今超过 24 小时即视为过期：徽标改显「X 天前」、今日结论区置灰并给重试入口。 */
export const SYNC_STALE_MS = 24 * 60 * 60 * 1000;

export interface SyncStaleness {
  stale: boolean;
  /** 过期天数（向下取整，过期时至少为 1） */
  days: number;
}

export function syncStaleness(
  lastAt: string | null | undefined,
  nowMs: number,
): SyncStaleness {
  if (!lastAt) return { stale: false, days: 0 };
  const t = Date.parse(lastAt);
  if (Number.isNaN(t)) return { stale: false, days: 0 };
  const diff = nowMs - t;
  if (diff <= SYNC_STALE_MS) return { stale: false, days: 0 };
  return { stale: true, days: Math.max(1, Math.floor(diff / SYNC_STALE_MS)) };
}

// ---------- 验收探针统计（发布规范第 7 节） ----------

export interface ProbeStats {
  count: number;
  /** 中位数（毫秒，1 位小数）；无记录时为 null */
  medianMs: number | null;
  /** 最大值（毫秒，1 位小数）；无记录时为 null */
  maxMs: number | null;
}

/** 交互响应日志的统计口径：中位数 = 排序后中间值（偶数个取中间两数均值），最大值 = 最大样本。
 *  纯函数，验收页提交与单测共用同一实现。 */
export function probeStats(samples: number[]): ProbeStats {
  if (samples.length === 0) return { count: 0, medianMs: null, maxMs: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    count: samples.length,
    medianMs: round1(median),
    maxMs: round1(sorted[sorted.length - 1]!),
  };
}

// ---------- 图表读数口径（M10） ----------

/** 分段区间平均：只计有数值且完整的点（不完整日不进平均，与基线口径一致）。
 *  图表静置时读数区显示此平均 + 日期范围；拖动时才换成所拖那天的值。 */
export function segmentAverage(
  points: { value: number | null; incomplete?: boolean }[],
): number | null {
  return mean(
    points
      .filter((p) => p.value != null && !p.incomplete)
      .map((p) => p.value as number),
  );
}

// ---------- 习惯恢复前置判断（M17） ----------

/** 同时进行中的习惯上限（与后端 setHabitActive 校验同值，后端保留作兜底）。 */
export const HABIT_ACTIVE_LIMIT = 3;

export type HabitResumePlan =
  /** 未满额：可直接恢复 */
  | { mode: "direct"; activeCount: number }
  /** 已满额：必须先暂停一个进行中的习惯（前端弹选择菜单，一次操作内完成暂停+恢复） */
  | { mode: "swap"; activeCount: number; active: { id: number; name: string }[] }
  /** 目标不存在或已在进行中：无可恢复 */
  | { mode: "none"; activeCount: number };

/** 恢复前的纯前端判断：满额时绝不走「先乐观恢复→后端拒绝→回滚」的闪动路径。 */
export function habitResumePlan(
  habits: { id: number; name: string; active: boolean }[],
  targetId: number,
): HabitResumePlan {
  const active = habits.filter((h) => h.active);
  const target = habits.find((h) => h.id === targetId);
  if (!target || target.active) return { mode: "none", activeCount: active.length };
  if (active.length >= HABIT_ACTIVE_LIMIT) {
    return {
      mode: "swap",
      activeCount: active.length,
      active: active.map((h) => ({ id: h.id, name: h.name })),
    };
  }
  return { mode: "direct", activeCount: active.length };
}

/** 「本周」= 自然周，与 WHO 每周口径、周报、周计划、趋势锻炼周柱同源同算法；
 *  滚动 7 天窗口一律改称「近 7 天」。统计只用完整日（排除部分同步日）。 */
export function weekStats(d: Dashboard): WeekStats | null {
  const latest = d.latestDate;
  if (!latest) return null;
  const { from, to, dow } = weekRange(latest);
  const rows = fullDaily(d).filter((r) => r.date >= from && r.date <= latest);
  const exerciseMin = rows.reduce((a, r) => a + (r.exerciseMin ?? 0), 0);
  const strengthCount = d.workouts.filter((w) => {
    const day = w.startDatetime.slice(0, 10);
    return w.isStrength && day >= from && day <= latest;
  }).length;
  return {
    from,
    to,
    exerciseMin,
    strengthCount,
    days: rows.length,
    elapsed: dow + 1,
    inProgress: latest < to,
  };
}

export function weekLabel(wk: WeekStats): string {
  return `本周（${wk.from} → ${wk.to}）${wk.inProgress ? ` · 本周进行中 · 已过 ${wk.elapsed} 天` : ""}`;
}

/** 训练负荷比：近 7 天锻炼分钟 /（近 28 天周均）。数据不足 28 天返回 null。 */
export function loadRatio(daily: DailyRow[]): number | null {
  if (daily.length < 28) return null;
  const last28 = daily.slice(-28);
  const sum7 = last28.slice(-7).reduce((a, r) => a + (r.exerciseMin ?? 0), 0);
  const sum28 = last28.reduce((a, r) => a + (r.exerciseMin ?? 0), 0);
  if (sum28 === 0) return null;
  return sum7 / (sum28 / 4);
}

// ---------- 恢复状态 ----------

export type RecoveryLevel = "充分" | "一般" | "偏低";

export interface RecoverySignal {
  name: string;
  icon: string;
  state: string;
  bad: boolean;
  text?: string;
}

export interface Recovery {
  level: RecoveryLevel;
  points: number;
  notes: string[];
  /** 每项信号只给「与个人常态比」的状态；观察期内只看信号、不下等级结论 */
  signals: RecoverySignal[];
  driver: string;
  observing: boolean;
}

export function recovery(d: Dashboard): Recovery | null {
  const latest = d.latestDate;
  if (!latest) return null;
  const today = d.daily[d.daily.length - 1];
  if (!today) return null;
  const hrvBase = baseline(d.daily, "hrvMs", latest);
  const rhrBase = baseline(d.daily, "restingHr", latest);
  const lastNight = d.sleep[d.sleep.length - 1];
  let points = 0;
  const notes: string[] = [];
  const signals: RecoverySignal[] = [];

  if (today.hrvMs != null && hrvBase?.sd) {
    const dev = (today.hrvMs - hrvBase.mean) / hrvBase.sd;
    if (dev >= 0.5) points += 1;
    else if (dev <= -0.5) points -= 1;
    notes.push(
      `HRV ${fmt(today.hrvMs, 1)} ms，${dev >= 0.5 ? "高于" : dev <= -0.5 ? "低于" : "接近"}个人基线 ${fmt(hrvBase.mean, 1)} ms`,
    );
    signals.push({
      name: "心率变异性",
      icon: "wave",
      state: dev >= 0.5 ? "↑ 高于常态" : dev <= -0.5 ? "↓ 低于常态" : "→ 常态范围内",
      bad: dev <= -0.5,
    });
  } else if (today.hrvMs != null) {
    notes.push(`HRV ${fmt(today.hrvMs, 1)} ms（基线积累中）`);
    signals.push({ name: "心率变异性", icon: "wave", state: "基线积累中", bad: false });
  }
  if (today.restingHr != null && rhrBase?.sd) {
    const dev = (today.restingHr - rhrBase.mean) / rhrBase.sd;
    if (dev <= -0.5) points += 1;
    else if (dev >= 0.5) points -= 1;
    notes.push(
      `静息心率 ${fmt(today.restingHr)} bpm，${dev <= -0.5 ? "低于" : dev >= 0.5 ? "高于" : "接近"}个人基线 ${fmt(rhrBase.mean, 1)} bpm`,
    );
    signals.push({
      name: "静息心率",
      icon: "heart",
      state: dev >= 0.5 ? "↑ 高于常态" : dev <= -0.5 ? "↓ 低于常态" : "→ 常态范围内",
      bad: dev >= 0.5,
    });
  }
  if (lastNight?.totalMin != null) {
    if (lastNight.totalMin >= 420) points += 1;
    else if (lastNight.totalMin < 360) points -= 1;
    notes.push(
      `昨晚睡眠 ${fmtMin(lastNight.totalMin)}${lastNight.qualityScore != null ? `，质量分 ${fmt(lastNight.qualityScore)}` : ""}`,
    );
    signals.push({
      name: "昨晚睡眠",
      icon: "moon",
      state:
        lastNight.totalMin >= 420
          ? "达到 7 小时参考"
          : lastNight.totalMin >= 360
            ? "略短于 7 小时"
            : "偏短",
      bad: lastNight.totalMin < 360,
      text: fmtMin(lastNight.totalMin),
    });
  }
  const level: RecoveryLevel = points >= 2 ? "充分" : points >= 0 ? "一般" : "偏低";
  let driver = "";
  if (lastNight?.totalMin != null && lastNight.totalMin < 360) {
    driver = "昨晚睡眠偏短是主要影响因素";
  } else if (
    today.hrvMs != null && hrvBase?.sd &&
    (today.hrvMs - hrvBase.mean) / hrvBase.sd <= -0.5
  ) {
    driver = "HRV 低于个人常态是主要影响因素";
  } else if (
    today.restingHr != null && rhrBase?.sd &&
    (today.restingHr - rhrBase.mean) / rhrBase.sd >= 0.5
  ) {
    driver = "静息心率高于个人常态是主要影响因素";
  } else if (lastNight?.totalMin != null && lastNight.totalMin >= 420) {
    driver = "昨晚睡眠时长达标是主要支撑因素";
  }
  return {
    level,
    points,
    notes,
    signals,
    driver,
    observing: fullDaily(d).length < 28,
  };
}

// ---------- 红旗规则（只提示就医，不下结论） ----------

export interface RedFlag {
  urgent: boolean;
  text: string;
}

export function redFlags(d: Dashboard): RedFlag[] {
  const flags: RedFlag[] = [];
  // 打卡备注中的症状词
  for (const c of d.checkins) {
    if (!c.redFlag) continue;
    const urgentWords = ["胸痛", "晕厥", "呼吸困难", "晕倒"];
    const urgent = c.note ? urgentWords.some((w) => c.note!.includes(w)) : false;
    flags.push({
      urgent,
      text: urgent
        ? `你在 ${c.date} 的打卡备注中记录了不适症状。如正在出现胸痛、晕厥或呼吸困难，请立即就医或拨打当地急救电话（120）。`
        : `你在 ${c.date} 的打卡备注中记录了不适症状，这个变化建议尽快咨询医生。`,
    });
  }
  // 静息心率连续 3 天明显高于基线
  const daily = d.daily;
  if (daily.length >= 6) {
    const last3 = daily.slice(-3);
    const base = baseline(daily, "restingHr", last3[0]?.date);
    if (base?.sd && last3.every((r) => r.restingHr != null)) {
      const threshold = base.mean + Math.max(2 * base.sd, 5);
      if (last3.every((r) => (r.restingHr as number) > threshold)) {
        flags.push({
          urgent: false,
          text: "静息心率已连续 3 天明显高于你的个人基线，且没有明显的运动等原因可解释，这个变化建议尽快咨询医生。",
        });
      }
    }
  }
  // 血氧：近 7 天多次低于 94%
  const lowSpo2 = daily
    .slice(-7)
    .filter((r) => r.spo2Pct != null && r.spo2Pct < 94).length;
  if (lowSpo2 >= 2) {
    flags.push({
      urgent: false,
      text: "近 7 天血氧多次低于 94%，这个变化建议尽快咨询医生。",
    });
  }
  return flags;
}

// ---------- 今日建议（最多 3 条，每条带依据） ----------

export interface Suggestion {
  title: string;
  basis: string;
}

export function suggestions(d: Dashboard): Suggestion[] {
  const out: Suggestion[] = [];
  const latest = d.latestDate;
  if (!latest) return out;
  const today = d.daily[d.daily.length - 1];
  const lastNight = d.sleep[d.sleep.length - 1];
  const rec = recovery(d);
  const travel = d.settings["travel_mode"] === "1";
  const stageTarget = d.settings["bedtime_stage_target"] || "00:30";
  const morningTime = d.sync.lastHhmm ?? (d.settings["morning_time"] || "07:30");
  const sleeps = fullSleep(d);

  // 0) 优先补本周目标缺口：力量训练未达 2 次（习惯清单未覆盖这一项）
  const wk = weekStats(d);
  if (wk && wk.strengthCount < 2) {
    out.push({
      title: "今天安排一次力量训练（20–30 分钟，深蹲 / 俯卧撑 / 弹力带即可）",
      basis: `依据：本周力量训练 ${wk.strengthCount} / 2 次，是本周目标里最大的缺口（WHO 建议每周 ≥2 天力量训练）；习惯清单未覆盖这一项。`,
    });
  }

  // 1) 睡眠：入睡波动大或昨晚不足；与进行中的「放下屏幕」习惯去重，不重复同一件事
  const bedtimes = sleeps
    .map((s) => bedtimeNorm(s.startDatetime))
    .filter((v): v is number => v != null);
  const btSd = sd(bedtimes);
  const screenHabitOn = d.habits.some(
    (h) => h.active && h.name.includes("放下屏幕"),
  );
  if (
    lastNight &&
    ((lastNight.totalMin != null && lastNight.totalMin < 420) ||
      (btSd != null && btSd > 45))
  ) {
    const rangeNote = `近 ${bedtimes.length} 晚入睡时刻在 ${fmtClock(Math.min(...bedtimes))}–${fmtClock(Math.max(...bedtimes))} 间大幅波动，昨晚 ${lastNight.startDatetime?.split(" ")[1] ?? ""} 入睡、只睡 ${fmtMin(lastNight.totalMin)}（数据：近 ${sleeps.length} 晚完整睡眠记录）`;
    if (travel) {
      out.push({
        title: "按当地时间固定起床，今晚到点放下屏幕，争取睡够时间窗",
        basis: `依据：${rangeNote}。`,
      });
    } else if (!screenHabitOn) {
      out.push({
        title: `今晚提前放下屏幕，争取 ${stageTarget} 前入睡（当前阶段目标）`,
        basis: `依据：${rangeNote}。`,
      });
    } else if (lastNight.totalMin != null && lastNight.totalMin < 360) {
      out.push({
        title: "昨晚睡得偏短，今晚把入睡时间再往前挪 20 分钟",
        basis: `依据：昨晚只睡 ${fmtMin(lastNight.totalMin)}，明显短于 7 小时参考；「放下屏幕」已在习惯清单里，这里只补时间缺口，不重复同一件事。`,
      });
    }
  }

  // 2) 运动强度：有恢复信号不在常态 → 轻量；昨日负荷大 → 中等即可
  const yesterday = d.daily[d.daily.length - 2];
  const recBad = rec
    ? rec.observing
      ? rec.signals.some((s) => s.bad)
      : rec.level === "偏低"
    : false;
  if (recBad && rec) {
    out.push({
      title: "今天只做轻量活动：散步或拉伸，不上高强度训练",
      basis: `依据：今晨有恢复信号不在常态内（${rec.signals.filter((s) => s.bad).map((s) => `${s.name} ${s.state}`).join("；")}），这类日子运动自动降为轻量，并优先保证今晚睡眠。`,
    });
  } else if (yesterday && ((yesterday.exerciseMin ?? 0) >= 120 || (yesterday.activeEnergyKcal ?? 0) >= 1000)) {
    out.push({
      title: "今天中等强度活动约 30 分钟即可，不上高强度",
      basis: `依据：昨日锻炼 ${fmt(yesterday.exerciseMin)} 分钟、活动能量 ${fmt(yesterday.activeEnergyKcal)} kcal，负荷不小（数据：昨日训练记录与今晨恢复信号）。`,
    });
  } else if (rec) {
    out.push({
      title: "今天适合按计划完成一次中等强度有氧（能说话的强度）",
      basis: `依据：今晨三项恢复信号均未见明显偏离（${rec.signals.map((s) => `${s.name} ${s.state}`).join("；")}）。`,
    });
  }

  // 3) 久坐/步数：今日步数明显低于完整日均值（全站同口径：不含不完整日与今日）
  if (today?.steps != null) {
    const prev = fullDaily(d)
      .slice(0, -1)
      .map((r) => r.steps)
      .filter((v): v is number => v != null);
    const m = mean(prev);
    if (m != null && today.steps < m * 0.6) {
      out.push({
        title: "每坐约 1 小时起身活动几分钟，饭后步行 10 分钟",
        basis: `依据：WHO 久坐建议每 30–60 分钟起身活动；今日步数 ${fmt(today.steps)}（截至 ${morningTime} 同步），不到完整日均值 ${fmt(m)} 的六成。`,
      });
    }
  }

  // 4) 训练负荷比（有 28 天数据时）
  const lr = loadRatio(d.daily);
  if (out.length < 3 && lr != null && lr > 1.3) {
    out.push({
      title: "本周训练量增幅偏快，今天安排恢复或轻量活动",
      basis: `依据：近 7 天与近 28 天训练量之比为 ${lr.toFixed(2)}，明显高于约 1.3 的参考线，增量过快时受伤与疲劳风险上升。`,
    });
  }
  if (out.length < 3 && lr != null && lr < 0.8) {
    out.push({
      title: "近期训练量偏低，可在本周多安排一次中等强度有氧",
      basis: `依据：近 7 天与近 28 天训练量之比为 ${lr.toFixed(2)}，低于约 0.8，可适当加量（单周加量不超过约 10%）。`,
    });
  }

  return out.slice(0, 3);
}

// ---------- 趋势解读（一句话，基于序列如实生成） ----------

/** 趋势解读（设计版定版分级）：不足 14 天不解读（返回空串）；14–27 天只给初步观察；满 28 天才按常态范围下结论。 */
export function trendNote(
  vals: (number | null)[],
  opts: { higherBetter: boolean | null; unit: string; label: string },
): string {
  const clean = vals.filter((v): v is number => v != null);
  if (clean.length < 3) return "数据不足，积累中。";
  if (clean.length < 14) return "";
  const half = Math.floor(clean.length / 2);
  const first = mean(clean.slice(0, half));
  const second = mean(clean.slice(half));
  if (first == null || second == null) return "数据不足，积累中。";
  const diff = second - first;
  const rel = first !== 0 ? Math.abs(diff / first) : 0;
  if (clean.length < 28) {
    if (rel < 0.03) {
      return `${opts.label}近 ${clean.length} 天初步看整体平稳，在个人波动范围内。`;
    }
    return `${opts.label}近 ${clean.length} 天初步看后段${diff > 0 ? "高于" : "低于"}前段（前段均值 ${fmt(first, 1)}${opts.unit} → 后段 ${fmt(second, 1)}${opts.unit}）；样本不足 28 天，只作初步观察，不下结论。`;
  }
  const mAll = mean(clean);
  const sAll = sd(clean);
  const last7 = mean(clean.slice(-7));
  if (mAll == null || last7 == null) return "数据不足，积累中。";
  if (sAll != null && Math.abs(last7 - mAll) < sAll) {
    return `${opts.label}近 7 日均值 ${fmt(last7, 1)}${opts.unit}，在你的常态波动范围内（常态 ${fmt(mAll, 1)}${opts.unit} ± ${fmt(sAll, 1)}${opts.unit}）。`;
  }
  return `${opts.label}近 7 日均值 ${fmt(last7, 1)}${opts.unit}，${last7 > mAll ? "高于" : "低于"}你的常态（${fmt(mAll, 1)}${opts.unit}），已超出常态波动范围，值得留意持续性。`;
}

// ---------- 专题定义 ----------

export interface TopicDef {
  key: string;
  name: string;
  why: string;
  standards: { text: string; source: string }[];
  actions: string[];
  doctor: string;
}

export const TOPICS: TopicDef[] = [
  {
    key: "sleep",
    name: "睡眠",
    why: "睡眠是恢复的底盘：时长、规律性和分期一起决定第二天的精力和 HRV、静息心率等指标。相比偶尔睡个长觉，稳定的入睡与起床时间对身体节律更重要。",
    standards: [
      { text: "成人每晚规律睡眠 7 小时及以上，参考范围 7–9 小时", source: "AASM 与睡眠研究学会共识" },
      { text: "入睡与起床时间保持规律，周末与工作日差异尽量小", source: "AASM 睡眠卫生建议" },
    ],
    actions: ["固定起床时间", "睡前 45 分钟放下屏幕", "午后不摄入咖啡因", "起床后尽早接触日光"],
    doctor: "长期失眠、白天严重嗜睡、被告知呼吸暂停或大声打鼾时，建议咨询医生。",
  },
  {
    key: "exercise",
    name: "运动与体能",
    why: "规律的中高强度有氧和力量训练是提升心肺适能（VO2max）、改善静息心率与代谢最可靠的手段。分布均匀比单日突击更重要，负荷增加要循序渐进。",
    standards: [
      { text: "每周 150–300 分钟中等强度或 75–150 分钟高强度有氧活动", source: "WHO《身体活动和久坐行为指南 2020》" },
      { text: "每周至少 2 天涉及主要肌群的力量训练", source: "WHO《身体活动和久坐行为指南 2020》" },
      { text: "训练负荷循序增加，单周加量约不超过上周的 10%；近 7 天/28 天负荷比明显高于约 1.3 提示增量过快", source: "运动医学通行做法" },
    ],
    actions: ["每周固定 3 个运动时段", "大部分有氧保持能说话的强度", "至少留 1 个恢复日"],
    doctor: "运动中出现胸痛、明显心悸、头晕或晕厥时应立即停止并就医；有慢性病且长期不运动者，开始高强度训练前建议咨询医生。",
  },
  {
    key: "activity",
    name: "日常活动与久坐",
    why: "全天总活动量和打断久坐的频率，独立于正式锻炼影响代谢与心血管健康。非运动日的步数和站立时间，往往是活动量最大的缺口。",
    standards: [
      { text: "减少久坐时间，每 30–60 分钟起身活动", source: "WHO《身体活动和久坐行为指南 2020》" },
      { text: "步数没有 WHO 标准；本页采用「在个人基线上逐步增加」，页面所示范围来自国际研究证据而非 WHO 指南", source: "国际队列研究证据" },
    ],
    actions: ["整点起身提醒", "饭后步行 10 分钟", "通话时站立走动"],
    doctor: "出现不明原因的活动耐量明显下降（如走平路即气促）时，建议咨询医生。",
  },
  {
    key: "cardio",
    name: "心血管",
    why: "静息心率与 HRV 的长期趋势是心肺适能和自主神经状态的窗口；血压是心血管风险的核心指标。单日读数意义有限，看相对个人基线的持续偏离。",
    standards: [
      { text: "收缩压 ≥140 或舒张压 ≥90 mmHg 为高血压诊断阈值（需由医生确诊）；低于 120/80 mmHg 作理想参考", source: "WHO 高血压事实清单" },
      { text: "静息心率与 HRV 以个人长期趋势为准，不套用统一正常值", source: "个人基线原则" },
    ],
    actions: ["有血压计时每周固定时间自测并记录", "以有氧运动、充足睡眠、控盐改善指标"],
    doctor: "家庭血压多次偏高、收到房颤或心率异常通知、静息心率无原因持续偏离基线时，建议咨询医生。",
  },
  {
    key: "weight",
    name: "体重与体成分",
    why: "体重受水分和进食影响波动很大，只看 7 天移动平均的趋势才有意义。腰围反映内脏脂肪，与代谢风险的关系比体重本身更直接。",
    standards: [
      { text: "BMI 18.5–24.9 正常，25.0–29.9 超重，≥30 肥胖", source: "WHO" },
      { text: "注：WHO 专家咨询指出亚洲人群 BMI 23 起风险即可能上升，仅作参考信息，不作主标准", source: "WHO 专家咨询" },
      { text: "腰围：男 >94 cm、女 >80 cm 风险增加；男 >102 cm、女 >88 cm 风险明显增加", source: "WHO" },
      { text: "如需减重，速度不超过每周约体重的 0.5–1%；BMI 在健康范围内不设减重目标，改为「保持＋体能」", source: "通行临床建议" },
    ],
    actions: ["每周固定 2–3 次晨起称重", "每月量一次腰围"],
    doctor: "无原因的体重快速变化（短期内增减超过约 5%）时，建议咨询医生。",
  },
  {
    key: "nutrition",
    name: "饮食与营养",
    why: "饮食对体重、血糖和精力的作用是累积的。本页采用轻量打卡而非称重算热量：先把蔬菜、饮水、含糖饮料几个关键习惯做稳。",
    standards: [
      { text: "蔬菜水果每天合计至少 400 克（约 5 份）", source: "WHO 健康膳食建议" },
      { text: "盐每天少于 5 克；游离糖低于总能量 10%，降到 5% 以下（约每天 25 克）更有益", source: "WHO 健康膳食建议" },
      { text: "总脂肪不超过总能量 30%、饱和脂肪低于 10%、反式脂肪低于 1%", source: "WHO 健康膳食建议" },
      { text: "酒精不存在对健康安全的饮酒量，越少越好", source: "WHO" },
      { text: "饮水以口渴感和尿色偏浅为准；总水分参考量女性约 2.0 升、男性约 2.5 升每天（含食物中的水）", source: "WHO / EFSA" },
    ],
    actions: ["每餐先吃蔬菜", "用水或无糖茶替代含糖饮料", "出差优先选有蔬菜和蛋白质的餐食"],
    doctor: "本页不开治疗性饮食处方、不推荐补剂；有糖尿病、肾病等饮食限制时以医生叮嘱为准。",
  },
  {
    key: "stress",
    name: "压力与情绪",
    why: "主观感受（精力/情绪/压力）和客观指标（HRV、睡眠）互相印证：连续的压力打卡偏高又伴随 HRV 下降、睡眠变差时，说明恢复在透支，需要先减负再谈训练。",
    standards: [
      { text: "以规律作息、身体活动、日照和社交连接作为压力管理的基础手段", source: "WHO 心理健康与压力管理建议" },
      { text: "情绪低落或焦虑持续两周以上并影响工作生活时，寻求心理或医疗专业帮助", source: "WHO 心理健康建议" },
    ],
    actions: ["每天 5 分钟慢呼吸", "工作间隙短暂散步", "每天户外日照", "每周与亲友交流＋一项纯放松活动"],
    doctor: "情绪低落或焦虑持续两周以上并影响工作生活时，建议寻求心理或医疗专业帮助。",
  },
  {
    key: "desk",
    name: "伏案工作健康",
    why: "长时间伏案和耳机使用是办公人群最日常的健康损耗：颈肩僵硬、视疲劳和听力暴露都是慢变量，靠每天的小动作打断累积。",
    standards: [
      { text: "安全聆听：80 分贝每周累计不超过 40 小时", source: "WHO 安全聆听标准" },
      { text: "用眼 20-20-20：每 20 分钟看 20 英尺外约 20 秒", source: "美国眼科学会（AAO）" },
      { text: "每 30–60 分钟起身活动", source: "WHO《身体活动和久坐行为指南 2020》" },
    ],
    actions: ["每天两次 3 分钟颈肩拉伸", "调整显示器高度与坐姿", "通勤时降低耳机音量"],
    doctor: "持续手麻、放射性疼痛、视力明显下降或耳鸣时，建议咨询医生。",
  },
  {
    key: "prevention",
    name: "预防与体检",
    why: "体检的价值在逐年对比：单次轻微异常多数是波动，持续同向变化才值得和医生讨论。本页只做记录与按医嘱复查提醒，不把体检数值解读为诊断。",
    standards: [
      { text: "体检指标参考范围以体检报告自带范围和医生意见为准", source: "体检报告与医嘱" },
      { text: "口腔检查按牙医建议的间隔进行；视力检查按眼科医生建议", source: "牙医 / 眼科医生建议" },
    ],
    actions: ["每年完成一次全面体检并录入本页", "按牙医建议间隔做口腔检查", "疫苗接种情况记录在档案页"],
    doctor: "体检出现异常项时，按报告建议和医嘱复查；本空间不解读为诊断。",
  },
  {
    key: "travel",
    name: "出差与作息打乱模式",
    why: "出差和跨时区会同时打乱睡眠、活动和饮食。模式开启后目标自动精简为三项最低版本，先保住节律，回来后用 3–5 天恢复，期间不算打卡中断。",
    standards: [
      { text: "按目的地当地时间安排睡眠时间窗、晨间日照和进餐", source: "时差调整通行建议" },
      { text: "精简目标只保留：睡眠时间窗、每日步数最低版本、饮水", source: "本空间规则" },
    ],
    actions: ["到达后按当地时间作息", "上午尽早户外活动接触日光", "保持饮水，午后避免咖啡因"],
    doctor: "出差期间出现持续心悸、胸闷等不适时，建议及时就医。",
  },
];

export const TOPIC_MAP: Record<string, TopicDef> = Object.fromEntries(
  TOPICS.map((t) => [t.key, t]),
);

/** 专题的类别色与图标（苹果健康分类色；HRV 紫色为用户定案，心脏类粉红、睡眠靛蓝、活动橙）。 */
export const TOPIC_META: Record<string, { colorVar: string; icon: string }> = {
  sleep: { colorVar: "--c-sleep", icon: "moon" },
  exercise: { colorVar: "--c-activity", icon: "flame" },
  activity: { colorVar: "--c-energy", icon: "steps" },
  cardio: { colorVar: "--c-heart", icon: "heart" },
  weight: { colorVar: "--c-spo2", icon: "scale" },
  nutrition: { colorVar: "--ok", icon: "leaf" },
  stress: { colorVar: "--c-mint", icon: "wave" },
  desk: { colorVar: "--c-spo2", icon: "desk" },
  prevention: { colorVar: "--ok", icon: "shield" },
  travel: { colorVar: "--c-spo2", icon: "plane" },
};

// ---------- 就寝时间唯一登记表 ----------

/** 长期方向（建档/设置里定，默认 23:15）。 */
export function bedtimeLongTerm(settings: Record<string, string>): string {
  return settings["bedtime_target"] || "23:15";
}

/** 当前阶段目标（默认 00:30，用户已确认的阶段目标）。 */
export function bedtimeStage(settings: Record<string, string>): string {
  return settings["bedtime_stage_target"] || "00:30";
}

/** 晚间提醒 = 当前阶段目标 − 45 分钟，自动计算，全站只此一处来源。 */
export function bedtimeReminder(settings: Record<string, string>): string {
  const t = bedtimeStage(settings);
  const [h = 0, m = 0] = t.split(":").map(Number);
  const mins = (((h * 60 + m - 45) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** 习惯连续天数：以设备今日为锚（调用方传 todayStr()），今天没打卡则从昨天起算。 */
export function habitStreak(
  logs: string[],
  habitId: number,
  latest: string | null,
): number {
  if (!latest) return 0;
  const set = new Set(logs);
  let anchor = latest;
  if (!set.has(`${habitId}:${anchor}`)) anchor = addDays(anchor, -1);
  let n = 0;
  let cur = anchor;
  while (set.has(`${habitId}:${cur}`)) {
    n += 1;
    cur = addDays(cur, -1);
  }
  return n;
}

/** 打卡生活标签（设计版定版）。 */
export const LIFE_TAGS = [
  "饮酒",
  "下午后咖啡因",
  "晚餐很晚",
  "出差 / 倒时差",
  "熬夜加班",
  "身体不适",
] as const;

export const GOAL_OPTIONS = [
  "改善睡眠",
  "提升体能",
  "控制体重",
  "缓解压力",
  "心血管健康",
  "综合保持",
];

export const NUTRITION_ITEMS = [
  { key: "veg", label: "蔬菜吃够了" },
  { key: "water", label: "水喝够了" },
  { key: "no_sugar_drink", label: "没有含糖饮料" },
  { key: "no_alcohol", label: "没有饮酒" },
  { key: "regular_meals", label: "三餐规律" },
] as const;

export const LAB_FIELDS = [
  "血压（收缩/舒张）",
  "空腹血糖",
  "糖化血红蛋白 HbA1c",
  "总胆固醇",
  "低密度脂蛋白 LDL",
  "高密度脂蛋白 HDL",
  "甘油三酯",
  "尿酸",
  "ALT 谷丙转氨酶",
  "AST 谷草转氨酶",
  "肌酐",
  "尿素氮",
  "体重",
  "腰围",
] as const;

export const DATA_SOURCE_NOTE = "来源：Apple Health（iPhone 与 Apple Watch 汇总）";
