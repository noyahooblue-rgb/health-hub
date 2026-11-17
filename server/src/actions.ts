// 个人健康管理中心 · 服务端 actions。
// 健康数据只存本空间数据库；刷新由后台 agent 任务经 health-cli 读取后回填。

import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";
import {
FIRST_WEEKLY_REPORT,
SEED_DAILY,
SEED_GOALS,
SEED_HABITS,
SEED_SLEEP,
SEED_WEEKLY_PLAN,
SEED_WORKOUTS,
} from "./seed";

const okResponse = z.object({ ok: z.literal(true) });

// 真机验收提交记录的结构（验收页与读回共用）：7 条勾选、总备注、探针统计
// （记录条数/中位数/最大值）、能力探针结果、首屏时间、提交时间、界面版本、模式。
const acceptanceRecordSchema = z.object({
  checks: z.array(z.boolean()).length(7),
  note: z.string().max(4000),
  probe: z.object({
    count: z.number().int().min(0),
    medianMs: z.number().nullable(),
    maxMs: z.number().nullable(),
  }),
  capabilities: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  firstScreenMs: z.number().min(0),
  submittedAt: z.string().min(1),
  uiVersion: z.string().min(1),
  mode: z.enum(["正式版", "预览版"]),
});

const submitAcceptanceResponse = z.object({
  ok: z.literal(true),
  id: z.number(),
  submittedAt: z.string(),
});

const listAcceptanceResponse = z.object({
  records: z.array(
    z.object({
      id: z.number(),
      submittedAt: z.string(),
      record: acceptanceRecordSchema,
    }),
  ),
});

const dailyRow = z.object({
  date: z.string(),
  steps: z.number().nullable(),
  activeEnergyKcal: z.number().nullable(),
  exerciseMin: z.number().nullable(),
  standMin: z.number().nullable(),
  restingHr: z.number().nullable(),
  hrvMs: z.number().nullable(),
  spo2Pct: z.number().nullable(),
  respiratoryRate: z.number().nullable(),
  wristTempC: z.number().nullable(),
  walkingHr: z.number().nullable(),
  distanceM: z.number().nullable(),
  waterMl: z.number().nullable(),
  headphoneDb: z.number().nullable(),
});

const sleepRow = z.object({
  date: z.string(),
  startDatetime: z.string().nullable(),
  endDatetime: z.string().nullable(),
  totalMin: z.number().nullable(),
  coreMin: z.number().nullable(),
  deepMin: z.number().nullable(),
  remMin: z.number().nullable(),
  awakeMin: z.number().nullable(),
  efficiency: z.number().nullable(),
  qualityScore: z.number().nullable(),
  awakenings: z.number().nullable(),
});

const workoutRow = z.object({
  id: z.string(),
  startDatetime: z.string(),
  workoutType: z.string(),
  durationMin: z.number().nullable(),
  hrAvg: z.number().nullable(),
  hrMax: z.number().nullable(),
  energyKcal: z.number().nullable(),
  isStrength: z.boolean(),
});

const dashboardResponse = z.object({
  seeded: z.boolean(),
  latestDate: z.string().nullable(),
  daily: z.array(dailyRow),
  sleep: z.array(sleepRow),
  workouts: z.array(workoutRow),
  profile: z
    .object({
      age: z.number().nullable(),
      sex: z.string().nullable(),
      heightCm: z.number().nullable(),
      workPattern: z.string().nullable(),
      exerciseHabit: z.string().nullable(),
      goalPrimary: z.string().nullable(),
      goalSecondary: z.string().nullable(),
      doctorNotes: z.string().nullable(),
    })
    .nullable(),
  checkins: z.array(
    z.object({
      date: z.string(),
      energy: z.number(),
      mood: z.number(),
      stress: z.number(),
      note: z.string().nullable(),
      tags: z.array(z.string()),
      redFlag: z.boolean(),
    }),
  ),
  suggestionDone: z.array(z.string()),
  habits: z.array(
    z.object({
      id: z.number(),
      topic: z.string(),
      name: z.string(),
      minVersion: z.string().nullable(),
      active: z.boolean(),
    }),
  ),
  habitLogs: z.array(z.string()),
  goals: z.array(
    z.object({
      id: z.number(),
      topic: z.string(),
      title: z.string(),
      detail: z.string().nullable(),
      status: z.string(),
      tier: z.string().nullable(),
    }),
  ),
  topicSettings: z.array(
    z.object({ topic: z.string(), mode: z.string(), tier: z.string() }),
  ),
  weeklyPlan: z.array(
    z.object({
      weekday: z.number(),
      kind: z.string(),
      label: z.string().nullable(),
    }),
  ),
  labs: z.array(
    z.object({
      id: z.number(),
      date: z.string(),
      payload: z.record(z.string(), z.string()),
    }),
  ),
  reports: z.array(
    z.object({
      id: z.number(),
      kind: z.string(),
      periodLabel: z.string(),
      title: z.string(),
      body: z.string(),
      createdAt: z.string(),
    }),
  ),
  nutrition: z.array(z.string()),
  settings: z.record(z.string(), z.string()),
  sync: z.object({
    status: z.enum(["idle", "syncing", "error"]),
    lastAt: z.string().nullable(),
    lastHhmm: z.string().nullable(),
  }),
  // 按需拉取（方案 C 等效实现条件 2）：detailDays 窗口之外的更早数据只回月份汇总，不回明细。
  history: z.object({
    hasOlder: z.boolean(),
    oldestDate: z.string().nullable(),
    detailFrom: z.string().nullable(),
    olderMonths: z.array(
      z.object({
        month: z.string(),
        days: z.number(),
        avgSteps: z.number().nullable(),
        totalExerciseMin: z.number(),
      }),
    ),
  }),
});

/** 日期字符串加减天数（YYYY-MM-DD，本地零点构造避免时区漂移）。 */
function addDaysStr(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ---------- 同步状态（meta 表 sync_* 键） ----------
// sync_status: idle | syncing | error | done（done 对外映射为 idle）。
// 同步开始后 5 分钟仍未见 saveHealthData 回填，视为失败（可重试），不静默卡住。
const SYNC_STALE_MS = 5 * 60 * 1000;

type SyncStatus = "idle" | "syncing" | "error";
interface SyncState {
  status: SyncStatus;
  lastAt: string | null;
  lastHhmm: string | null;
}

/** Asia/Shanghai 当前时刻（HH:MM、距零点分钟数、日期）。 */
function shanghaiNow(): { hhmm: string; minutes: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hh = get("hour");
  const mm = get("minute");
  return {
    hhmm: `${hh}:${mm}`,
    minutes: Number(hh) * 60 + Number(mm),
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function syncStateFromMeta(rows: { key: string; value: string }[]): SyncState {
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const raw = m.get("sync_status") ?? "idle";
  const startedAt = Number(m.get("sync_started_at") ?? 0);
  let status: SyncStatus = "idle";
  if (raw === "syncing") {
    status = Date.now() - startedAt > SYNC_STALE_MS ? "error" : "syncing";
  } else if (raw === "error") {
    status = "error";
  }
  return {
    status,
    lastAt: m.get("sync_last_at") ?? null,
    lastHhmm: m.get("sync_last_hhmm") ?? null,
  };
}

const TOPICS = [
  "sleep",
  "exercise",
  "activity",
  "cardio",
  "weight",
  "nutrition",
  "stress",
  "desk",
  "prevention",
  "travel",
] as const;

export const Actions = {
  seedSnapshot: defineAction({
    description:
      "首次打开时写入经授权实查的 Apple Health 快照（2026-11-07→11-14）与观察期初始结构；已种子则跳过，不覆盖任何已有数据。",
    request: z.object({}),
    response: z.object({ seeded: z.boolean() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const flag = await db
        .select()
        .from(schema.meta)
        .where(eq(schema.meta.key, "seeded"))
        .limit(1);
      const cleared = await db
        .select()
        .from(schema.meta)
        .where(eq(schema.meta.key, "cleared"))
        .limit(1);
      if (flag.length > 0 || cleared.length > 0) return { seeded: false };

      const stmts: BatchItem<"sqlite">[] = [];
      for (const d of SEED_DAILY) {
        stmts.push(
          db
            .insert(schema.dailyMetrics)
            .values({ ...d })
            .onConflictDoNothing(),
        );
      }
      for (const s of SEED_SLEEP) {
        stmts.push(
          db.insert(schema.sleepNights).values({ ...s }).onConflictDoNothing(),
        );
      }
      for (const w of SEED_WORKOUTS) {
        stmts.push(
          db.insert(schema.workouts).values({ ...w }).onConflictDoNothing(),
        );
      }
      for (const h of SEED_HABITS) {
        stmts.push(db.insert(schema.habits).values({ ...h }));
      }
      for (const g of SEED_GOALS) {
        stmts.push(
          db.insert(schema.goals).values({
            topic: g.topic,
            title: g.title,
            detail: g.detail,
            tier: g.tier,
            status: "draft",
            createdAt: Date.now(),
          }),
        );
      }
      for (const p of SEED_WEEKLY_PLAN) {
        stmts.push(db.insert(schema.weeklyPlan).values({ ...p }));
      }
      for (const t of TOPICS) {
        stmts.push(
          db
            .insert(schema.topicSettings)
            .values({
              topic: t,
              mode: t === "sleep" || t === "exercise" ? "active" : "monitor",
              tier: "基础达标",
            })
            .onConflictDoNothing(),
        );
      }
      stmts.push(
        db.insert(schema.reports).values({
          kind: FIRST_WEEKLY_REPORT.kind,
          periodLabel: FIRST_WEEKLY_REPORT.periodLabel,
          title: FIRST_WEEKLY_REPORT.title,
          body: FIRST_WEEKLY_REPORT.body,
          createdAt: Date.now(),
        }),
      );
      const defaults: Record<string, string> = {
        morning_time: "07:30",
        morning_on: "1",
        bedtime_target: "23:15",
        bedtime_stage_target: "00:30",
        bedtime_remind_on: "1",
        travel_mode: "0",
        nav_shrink: "1",
        observation_start: "2026-11-14",
      };
      for (const [key, value] of Object.entries(defaults)) {
        stmts.push(
          db
            .insert(schema.meta)
            .values({ key, value })
            .onConflictDoNothing(),
        );
      }
      stmts.push(
        db
          .insert(schema.meta)
          .values({ key: "seeded", value: "1" })
          .onConflictDoNothing(),
      );
      const [first, ...rest] = stmts;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return { seeded: true };
    },
  }),

  getDashboard: defineAction({
    description:
      "读取健康中心状态：健康序列、档案、打卡、习惯、目标、体检、报告与设置。传 detailDays 时只回最近 N 天明细，更早数据折叠为月份汇总（history），供按需拉取。",
    request: z.object({
      detailDays: z.number().int().min(7).max(3660).optional(),
    }),
    response: dashboardResponse,
    async handler(ctx, args): Promise<z.infer<typeof dashboardResponse>> {
      const db = ctx.db<typeof schema>();
      const flag = await db
        .select()
        .from(schema.meta)
        .where(eq(schema.meta.key, "seeded"))
        .limit(1);
      const clearedFlag = await db
        .select()
        .from(schema.meta)
        .where(eq(schema.meta.key, "cleared"))
        .limit(1);
      const isSeeded = flag.length > 0 || clearedFlag.length > 0;
      const daily = await db
        .select()
        .from(schema.dailyMetrics)
        .orderBy(asc(schema.dailyMetrics.date));
      const sleep = await db
        .select()
        .from(schema.sleepNights)
        .orderBy(asc(schema.sleepNights.date));
      const wk = await db
        .select()
        .from(schema.workouts)
        .orderBy(asc(schema.workouts.startDatetime));
      const prof = await db.select().from(schema.profile).limit(1);
      const cks = await db
        .select()
        .from(schema.checkins)
        .orderBy(asc(schema.checkins.date));
      const sd = await db.select().from(schema.suggestionDone);
      const hb = await db
        .select()
        .from(schema.habits)
        .orderBy(asc(schema.habits.sort));
      const hl = await db.select().from(schema.habitLogs);
      const gl = await db
        .select()
        .from(schema.goals)
        .orderBy(asc(schema.goals.id));
      const ts = await db.select().from(schema.topicSettings);
      const wp = await db
        .select()
        .from(schema.weeklyPlan)
        .orderBy(asc(schema.weeklyPlan.weekday));
      const lb = await db
        .select()
        .from(schema.labReports)
        .orderBy(desc(schema.labReports.date));
      const rp = await db
        .select()
        .from(schema.reports)
        .orderBy(desc(schema.reports.id));
      const nt = await db.select().from(schema.nutritionChecks);
      const mt = await db.select().from(schema.meta);
      const settings: Record<string, string> = {};
      for (const row of mt) {
        if (row.key !== "seeded" && !row.key.startsWith("sync_")) {
          settings[row.key] = row.value;
        }
      }
      const p = prof[0];
      // ── 按需拉取窗口：detailDays 给定时，明细只保留最近 N 天（含最新日），更早 daily 折叠为月份汇总。
      // 不传 detailDays = 全量（趋势切到长区间时由客户端再取）。窗口外数据仍在库中，一行不删。
      const latestStored = daily.length > 0 ? daily[daily.length - 1]!.date : null;
      const detailFrom =
        args.detailDays && latestStored ? addDaysStr(latestStored, -(args.detailDays - 1)) : null;
      const inWindow = (date: string) => !detailFrom || date >= detailFrom;
      const dailyW = daily.filter((r) => inWindow(r.date));
      const sleepW = sleep.filter((r) => inWindow(r.date));
      const wkW = wk.filter((r) => inWindow(r.startDatetime.slice(0, 10)));
      const cksW = cks.filter((r) => inWindow(r.date));
      const hlW = hl.filter((r) => inWindow(r.date));
      const ntW = nt.filter((r) => inWindow(r.date));
      const olderDaily = detailFrom ? daily.filter((r) => r.date < detailFrom) : [];
      const monthMap = new Map<string, { days: number; steps: number[]; ex: number }>();
      for (const r of olderDaily) {
        const month = r.date.slice(0, 7);
        const acc = monthMap.get(month) ?? { days: 0, steps: [], ex: 0 };
        acc.days += 1;
        if (r.steps != null) acc.steps.push(r.steps);
        acc.ex += r.exerciseMin ?? 0;
        monthMap.set(month, acc);
      }
      const history = {
        hasOlder: olderDaily.length > 0,
        oldestDate: daily.length > 0 ? daily[0]!.date : null,
        detailFrom: detailFrom ?? (daily.length > 0 ? daily[0]!.date : null),
        olderMonths: [...monthMap.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([month, v]) => ({
            month,
            days: v.days,
            avgSteps:
              v.steps.length > 0
                ? Math.round(v.steps.reduce((a, b) => a + b, 0) / v.steps.length)
                : null,
            totalExerciseMin: Math.round(v.ex),
          })),
      };
      return {
        seeded: isSeeded,
        latestDate: daily.length > 0 ? daily[daily.length - 1]!.date : null,
        daily: dailyW.map((d) => ({ ...d })),
        sleep: sleepW.map((s) => ({ ...s })),
        workouts: wkW.map((w) => ({ ...w, isStrength: w.isStrength === 1 })),
        profile: p
          ? {
              age: p.age,
              sex: p.sex,
              heightCm: p.heightCm,
              workPattern: p.workPattern,
              exerciseHabit: p.exerciseHabit,
              goalPrimary: p.goalPrimary,
              goalSecondary: p.goalSecondary,
              doctorNotes: p.doctorNotes,
            }
          : null,
        checkins: cksW.map((c) => {
          let tags: string[] = [];
          try {
            const parsed: unknown = c.tags ? JSON.parse(c.tags) : [];
            if (Array.isArray(parsed)) {
              tags = parsed.filter((t): t is string => typeof t === "string");
            }
          } catch {
            tags = [];
          }
          return {
            date: c.date,
            energy: c.energy,
            mood: c.mood,
            stress: c.stress,
            note: c.note,
            tags,
            redFlag: c.redFlag === 1,
          };
        }),
        suggestionDone: sd.map((r) => `${r.date}:${r.idx}`),
        habits: hb.map((h) => ({
          id: h.id,
          topic: h.topic,
          name: h.name,
          minVersion: h.minVersion,
          active: h.active === 1,
        })),
        habitLogs: hlW.map((r) => `${r.habitId}:${r.date}`),
        goals: gl.map((g) => ({
          id: g.id,
          topic: g.topic,
          title: g.title,
          detail: g.detail,
          status: g.status,
          tier: g.tier,
        })),
        topicSettings: ts.map((t) => ({
          topic: t.topic,
          mode: t.mode,
          tier: t.tier,
        })),
        weeklyPlan: wp.map((w) => ({
          weekday: w.weekday,
          kind: w.kind,
          label: w.label,
        })),
        labs: lb.map((l) => {
          let payload: Record<string, string> = {};
          try {
            payload = JSON.parse(l.payload) as Record<string, string>;
          } catch {
            payload = {};
          }
          return { id: l.id, date: l.date, payload };
        }),
        reports: rp.map((r) => ({
          id: r.id,
          kind: r.kind,
          periodLabel: r.periodLabel,
          title: r.title,
          body: r.body,
          createdAt: new Date(r.createdAt).toISOString(),
        })),
        nutrition: ntW.map((r) => `${r.date}:${r.item}`),
        settings,
        sync: syncStateFromMeta(mt),
        history,
      };
    },
  }),

  saveProfile: defineAction({
    description: "保存建档问卷（全部可选填）：年龄、性别、身高、作息、运动习惯、主要目标与医生叮嘱。",
    request: z.object({
      age: z.number().int().min(1).max(120).nullable(),
      sex: z.string().max(10).nullable(),
      heightCm: z.number().min(80).max(250).nullable(),
      workPattern: z.string().max(500).nullable(),
      exerciseHabit: z.string().max(500).nullable(),
      goalPrimary: z.string().max(50).nullable(),
      goalSecondary: z.string().max(50).nullable(),
      doctorNotes: z.string().max(2000).nullable(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      await db
        .insert(schema.profile)
        .values({ id: 1, ...args, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: schema.profile.id,
          set: { ...args, updatedAt: Date.now() },
        });
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  saveCheckin: defineAction({
    description: "保存某日的 10 秒打卡：精力、情绪、压力各 1–5 分、生活标签与可选备注；备注含症状词或勾选「身体不适」时标记红旗。",
    request: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      energy: z.number().int().min(1).max(5),
      mood: z.number().int().min(1).max(5),
      stress: z.number().int().min(1).max(5),
      note: z.string().max(500).nullable(),
      tags: z.array(z.string().max(30)).max(8).default([]),
    }),
    response: z.object({ ok: z.literal(true), redFlag: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const urgent = [
        "胸痛", "晕厥", "呼吸困难", "晕倒", "心悸", "胸闷",
        "头晕", "不适", "疼痛", "发烧", "呕吐",
      ];
      const redFlag =
        (args.note ? urgent.some((w) => args.note!.includes(w)) : false) ||
        args.tags.includes("身体不适");
      const tagsJson = JSON.stringify(args.tags);
      await db
        .insert(schema.checkins)
        .values({
          date: args.date,
          energy: args.energy,
          mood: args.mood,
          stress: args.stress,
          note: args.note,
          tags: tagsJson,
          redFlag: redFlag ? 1 : 0,
          createdAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: schema.checkins.date,
          set: {
            energy: args.energy,
            mood: args.mood,
            stress: args.stress,
            note: args.note,
            tags: tagsJson,
            redFlag: redFlag ? 1 : 0,
          },
        });
      ctx.invalidateQueries();
      return { ok: true as const, redFlag };
    },
  }),

  toggleSuggestion: defineAction({
    description: "勾选或取消勾选某日某条行动建议的完成状态。",
    request: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      idx: z.number().int().min(0).max(9),
      done: z.boolean(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      if (args.done) {
        await db
          .insert(schema.suggestionDone)
          .values({ date: args.date, idx: args.idx })
          .onConflictDoNothing();
      } else {
        await db
          .delete(schema.suggestionDone)
          .where(
            sql`${schema.suggestionDone.date} = ${args.date} AND ${schema.suggestionDone.idx} = ${args.idx}`,
          );
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  toggleHabit: defineAction({
    description: "记录或取消某习惯在某日的打卡。",
    request: z.object({
      habitId: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      done: z.boolean(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      if (args.done) {
        await db
          .insert(schema.habitLogs)
          .values({ habitId: args.habitId, date: args.date })
          .onConflictDoNothing();
      } else {
        await db
          .delete(schema.habitLogs)
          .where(
            sql`${schema.habitLogs.habitId} = ${args.habitId} AND ${schema.habitLogs.date} = ${args.date}`,
          );
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  addHabit: defineAction({
    description: "为某专题新增一个可打卡习惯（需带最低版本）；同时进行中的习惯最多 3 个，满额时新习惯先放入已暂停。",
    request: z.object({
      topic: z.string().max(30),
      name: z.string().min(1).max(100),
      minVersion: z.string().max(100).nullable(),
    }),
    response: z.object({ id: z.number(), active: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const all = await db.select().from(schema.habits);
      const activeCount = all.filter((h) => h.active === 1).length;
      const active = activeCount < 3;
      const res = await db
        .insert(schema.habits)
        .values({ ...args, active: active ? 1 : 0, sort: 99 })
        .returning({ id: schema.habits.id });
      ctx.invalidateQueries();
      return { id: res[0]!.id, active };
    },
  }),

  setHabitActive: defineAction({
    description: "暂停或恢复一个习惯（不删除，打卡记录保留）；恢复时若进行中已满 3 个则拒绝并返回原因。",
    request: z.object({
      habitId: z.number().int().positive(),
      active: z.boolean(),
    }),
    response: z.object({ ok: z.boolean(), error: z.string().nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      if (args.active) {
        const all = await db.select().from(schema.habits);
        const activeCount = all.filter(
          (h) => h.active === 1 && h.id !== args.habitId,
        ).length;
        if (activeCount >= 3) {
          return {
            ok: false,
            error: "进行中的习惯已满 3 个，请先暂停其中一个，再恢复这个习惯。",
          };
        }
      }
      await db
        .update(schema.habits)
        .set({ active: args.active ? 1 : 0 })
        .where(eq(schema.habits.id, args.habitId));
      ctx.invalidateQueries();
      return { ok: true, error: null };
    },
  }),

  enforceHabitCap: defineAction({
    description:
      "一次性把进行中的习惯收敛到定版 3 个（固定起床时间、睡前放下屏幕、按周计划运动），其余进行中习惯暂停（数据保留、可恢复）；带 meta 标记，执行过即跳过。",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), paused: z.array(z.string()) }),
    async handler(ctx): Promise<{ ok: true; paused: string[] }> {
      const db = ctx.db<typeof schema>();
      const flag = await db
        .select()
        .from(schema.meta)
        .where(eq(schema.meta.key, "habit_cap_v1"))
        .limit(1);
      if (flag.length > 0) return { ok: true as const, paused: [] };
      // 定版三件的语义匹配词：库中实际名称含其一即保留。
      const KEEP_TOKENS = ["固定起床时间", "放下屏幕", "按周计划"];
      const all = await db.select().from(schema.habits);
      const paused: string[] = [];
      const stmts: BatchItem<"sqlite">[] = [];
      for (const h of all) {
        if (h.active !== 1) continue;
        if (KEEP_TOKENS.some((t) => h.name.includes(t))) continue;
        stmts.push(
          db
            .update(schema.habits)
            .set({ active: 0 })
            .where(eq(schema.habits.id, h.id)),
        );
        paused.push(h.name);
      }
      stmts.push(
        db
          .insert(schema.meta)
          .values({ key: "habit_cap_v1", value: "1" })
          .onConflictDoNothing(),
      );
      const [first, ...rest] = stmts;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return { ok: true as const, paused };
    },
  }),

  setGoalStatus: defineAction({
    description: "更新阶段目标状态：确认草案（draft→active）、暂停、恢复或完成。",
    request: z.object({
      id: z.number().int().positive(),
      status: z.enum(["draft", "active", "paused", "done"]),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.goals)
        .set({ status: args.status })
        .where(eq(schema.goals.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  addGoal: defineAction({
    description: "为某专题新增一个阶段目标草案（具体、可量化、有期限）。",
    request: z.object({
      topic: z.string().max(30),
      title: z.string().min(1).max(200),
      detail: z.string().max(1000).nullable(),
      tier: z.string().max(30).nullable(),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .insert(schema.goals)
        .values({ ...args, status: "draft", createdAt: Date.now() })
        .returning({ id: schema.goals.id });
      ctx.invalidateQueries();
      return { id: res[0]!.id };
    },
  }),

  setTopicSetting: defineAction({
    description: "设置专题模式（主动改进 active / 仅监测 monitor）与当前档位；主动改进最多同时 2 个。",
    request: z.object({
      topic: z.string().max(30),
      mode: z.enum(["active", "monitor"]),
      tier: z.string().max(30),
    }),
    response: z.object({ ok: z.boolean(), error: z.string().nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      if (args.mode === "active") {
        const all = await db.select().from(schema.topicSettings);
        const activeCount = all.filter(
          (t) => t.mode === "active" && t.topic !== args.topic,
        ).length;
        if (activeCount >= 2) {
          return {
            ok: false,
            error: "同时主动改进的专题最多 2 个，请先把另一个专题改为仅监测。",
          };
        }
      }
      await db
        .insert(schema.topicSettings)
        .values({ topic: args.topic, mode: args.mode, tier: args.tier })
        .onConflictDoUpdate({
          target: schema.topicSettings.topic,
          set: { mode: args.mode, tier: args.tier },
        });
      ctx.invalidateQueries();
      return { ok: true, error: null };
    },
  }),

  saveWeeklyPlan: defineAction({
    description: "保存每周计划模板（周一至周日每天的类型与说明）。",
    request: z.object({
      days: z
        .array(
          z.object({
            weekday: z.number().int().min(1).max(7),
            kind: z.string().max(20),
            label: z.string().max(100).nullable(),
          }),
        )
        .length(7),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.weeklyPlan);
      const stmts: BatchItem<"sqlite">[] = args.days.map((d) =>
        db.insert(schema.weeklyPlan).values({ ...d }),
      );
      const [first, ...rest] = stmts;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  addLabReport: defineAction({
    description: "录入一次体检报告（日期 + 任意指标键值，全部可选），按日期保存以便逐年对比。",
    request: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      payload: z.record(z.string(), z.string()),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .insert(schema.labReports)
        .values({
          date: args.date,
          payload: JSON.stringify(args.payload),
          createdAt: Date.now(),
        })
        .returning({ id: schema.labReports.id });
      ctx.invalidateQueries();
      return { id: res[0]!.id };
    },
  }),

  deleteLabReport: defineAction({
    description: "删除一条体检报告记录。",
    request: z.object({ id: z.number().int().positive() }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.labReports)
        .where(eq(schema.labReports.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  toggleNutrition: defineAction({
    description: "勾选或取消某日某项饮食轻打卡（蔬菜/饮水/含糖饮料/饮酒/三餐规律）。",
    request: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      item: z.string().max(30),
      done: z.boolean(),
    }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      if (args.done) {
        await db
          .insert(schema.nutritionChecks)
          .values({ date: args.date, item: args.item })
          .onConflictDoNothing();
      } else {
        await db
          .delete(schema.nutritionChecks)
          .where(
            sql`${schema.nutritionChecks.date} = ${args.date} AND ${schema.nutritionChecks.item} = ${args.item}`,
          );
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  saveSettings: defineAction({
    description: "保存设置项（晨间简报时间与开关、目标就寝时间与就寝提醒开关、出差模式开关）。",
    request: z.object({ values: z.record(z.string(), z.string()) }),
    response: okResponse,
    async handler(ctx, args): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      const allowed = new Set([
        "morning_time",
        "morning_on",
        "bedtime_target",
        "bedtime_stage_target",
        "bedtime_remind_on",
        "travel_mode",
        "nav_shrink",
      ]);
      const stmts: BatchItem<"sqlite">[] = [];
      for (const [key, value] of Object.entries(args.values)) {
        if (!allowed.has(key)) continue;
        stmts.push(
          db
            .insert(schema.meta)
            .values({ key, value })
            .onConflictDoUpdate({
              target: schema.meta.key,
              set: { value },
            }),
        );
      }
      const [first, ...rest] = stmts;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  saveReport: defineAction({
    description: "写入一份复盘报告（周报/月报/季度回顾），供定时任务生成后保存。",
    request: z.object({
      kind: z.enum(["weekly", "monthly", "quarterly"]),
      periodLabel: z.string().max(100),
      title: z.string().max(200),
      body: z.string().max(20000),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .insert(schema.reports)
        .values({ ...args, createdAt: Date.now() })
        .returning({ id: schema.reports.id });
      ctx.invalidateQueries();
      return { id: res[0]!.id };
    },
  }),

  saveHealthData: defineAction({
    description:
      "回填 Apple Health 新数据：按日期 upsert 每日指标、睡眠夜与训练记录（供每小时/手动同步任务调用）；每次调用同时把最近同步时间与状态记入 meta，供今日页徽标显示实际同步时间。",
    request: z.object({
      daily: z.array(dailyRow.omit({ date: true }).extend({ date: z.string() })),
      sleep: z.array(sleepRow),
      workouts: z.array(workoutRow),
    }),
    response: z.object({ saved: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const stmts: BatchItem<"sqlite">[] = [];
      for (const d of args.daily) {
        stmts.push(
          db
            .insert(schema.dailyMetrics)
            .values({ ...d })
            .onConflictDoUpdate({
              target: schema.dailyMetrics.date,
              set: { ...d },
            }),
        );
      }
      for (const s of args.sleep) {
        stmts.push(
          db
            .insert(schema.sleepNights)
            .values({ ...s })
            .onConflictDoUpdate({
              target: schema.sleepNights.date,
              set: { ...s },
            }),
        );
      }
      for (const w of args.workouts) {
        const { isStrength, ...rest } = w;
        stmts.push(
          db
            .insert(schema.workouts)
            .values({ ...rest, isStrength: isStrength ? 1 : 0 })
            .onConflictDoUpdate({
              target: schema.workouts.id,
              set: { ...rest, isStrength: isStrength ? 1 : 0 },
            }),
        );
      }
      // 同步完成标记：实际同步时间（Asia/Shanghai HH:MM）+ 状态清回 done。
      // 即使本次没有新数据行，也照常更新，保证徽标时间真实推进。
      const now = shanghaiNow();
      const metaSet = (key: string, value: string) =>
        db
          .insert(schema.meta)
          .values({ key, value })
          .onConflictDoUpdate({
            target: schema.meta.key,
            set: { value },
          });
      stmts.push(metaSet("sync_status", "done"));
      stmts.push(metaSet("sync_last_at", new Date().toISOString()));
      stmts.push(metaSet("sync_last_hhmm", now.hhmm));
      stmts.push(metaSet("sync_started_at", "0"));
      const [first, ...rest] = stmts;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return {
        saved: args.daily.length + args.sleep.length + args.workouts.length,
      };
    },
  }),

  refreshHealthData: defineAction({
    description:
      "发起一次健康数据同步（每小时定时或今日页徽标手动触发）：后台任务经 health-cli 读取已同步到 Muse 的 Apple Health 最新数据并回填本空间。同步进行中重复触发不重复启动；定时触发仅在 07:00–23:00（Asia/Shanghai）内执行。",
    request: z.object({ scheduled: z.boolean().optional() }),
    response: z.object({
      started: z.boolean(),
      status: z.enum(["idle", "syncing", "error"]),
      lastHhmm: z.string().nullable(),
      message: z.string(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const metaSet = (key: string, value: string) =>
        db
          .insert(schema.meta)
          .values({ key, value })
          .onConflictDoUpdate({
            target: schema.meta.key,
            set: { value },
          });
      const mt = await db.select().from(schema.meta);
      const state = syncStateFromMeta(mt);

      // 定时触发只在 07:00–23:00 窗口内跑；手动触发不受窗口限制。
      if (args.scheduled) {
        const { minutes } = shanghaiNow();
        if (minutes < 7 * 60 || minutes > 23 * 60) {
          return {
            started: false,
            status: state.status,
            lastHhmm: state.lastHhmm,
            message: "当前不在每小时同步时段（07:00–23:00），本次跳过。",
          };
        }
      }
      // 同步进行中（且未超时）：不重复触发。
      if (state.status === "syncing") {
        return {
          started: false,
          status: "syncing" as const,
          lastHhmm: state.lastHhmm,
          message: "同步进行中，完成后页面会自动更新。",
        };
      }

      const rows = await db
        .select()
        .from(schema.dailyMetrics)
        .orderBy(desc(schema.dailyMetrics.date))
        .limit(1);
      const last = rows[0]?.date ?? "2026-11-06";
      await db.batch([
        metaSet("sync_status", "syncing"),
        metaSet("sync_started_at", String(Date.now())),
      ]);
      const result = await ctx.agent.spawnTask(
        [
          "任务：为「个人健康管理中心」空间同步 Apple Health 新数据（每小时定时刷新或用户手动触发，逻辑相同）。",
          `本地数据库里最新一条每日指标日期是 ${last}。请用 health-cli（--provider healthkit）读取该日期之后（含当日）到今天的全部数据：`,
          "1) query metrics --interval daily，字段：step_count, active_energy_burned_kcal, apple_exercise_time_sum, apple_stand_time_sum, resting_hr_average_bpm, heart_rate_variability_ms, oxygen_saturation_average（返回为小数，转成百分数）, respiratory_rate_average, apple_sleeping_wrist_temperature_average, walking_heart_rate_average_average, distance_walking_running_meters, dietary_water_sum, headphone_audio_exposure_average。",
          "2) query sessions --category sleep：按起床日归属，totalMin = core+deep+REM+unspecified 分钟数，另带各分期、efficiency、quality_score、awakenings、起止时间。清晨的同步会把昨夜睡眠定版，白天同步时睡眠一般无变化，照常回填即可。",
          "3) query sessions --category workout：类型中文名（如 badminton→羽毛球、walking→步行、TraditionalStrengthTraining/FunctionalStrengthTraining→力量训练且 isStrength=true），时长分钟、平均/最高心率、热量。",
          "把结果通过本空间的 saveHealthData action 回填（daily/sleep/workouts 三个数组，缺失字段用 null，日期 YYYY-MM-DD，用户时区 Asia/Shanghai）。即使没有新数据，也必须用空数组调用一次 saveHealthData，以更新最近同步时间。coverage 不完整的日期也在备注里说明，但照常保存已有数据。不要编造任何数值：Health 里没有的类型（体重、VO2max、血压等）不要写入。",
          "若 health-cli 读取失败：不要调用 saveHealthData，在任务结果里明确说明失败原因（不要编造数据、不要假装成功）。",
        ].join("\n"),
        { expectsAction: "saveHealthData", dedupeKey: "health-sync" },
      );
      if (!result.ok) {
        await db.batch([
          metaSet("sync_status", "error"),
          metaSet("sync_started_at", "0"),
        ]);
        return {
          started: false,
          status: "error" as const,
          lastHhmm: state.lastHhmm,
          message: "同步任务未能启动，点徽标可重试。",
        };
      }
      return {
        started: true,
        status: "syncing" as const,
        lastHhmm: state.lastHhmm,
        message: "正在同步，完成后页面会自动更新。",
      };
    },
  }),

  submitAcceptance: defineAction({
    description:
      "提交一次真机验收结果（7 条勾选、备注、探针统计、能力探针、首屏时间、界面版本、模式），追加保存到 acceptance_records 表，不覆盖历史提交。",
    request: acceptanceRecordSchema,
    response: submitAcceptanceResponse,
    async handler(ctx, args): Promise<z.infer<typeof submitAcceptanceResponse>> {
      const db = ctx.db<typeof schema>();
      const res = await db
        .insert(schema.acceptanceRecords)
        .values({ submittedAt: args.submittedAt, payload: JSON.stringify(args) })
        .returning({ id: schema.acceptanceRecords.id });
      ctx.invalidateQueries();
      return { ok: true as const, id: res[0]!.id, submittedAt: args.submittedAt };
    },
  }),

  listAcceptance: defineAction({
    description:
      "只读：按提交时间正序返回全部真机验收提交记录（acceptance_records 表），供 Atlas 读回核对。",
    request: z.object({}),
    response: listAcceptanceResponse,
    async handler(ctx): Promise<z.infer<typeof listAcceptanceResponse>> {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.acceptanceRecords)
        .orderBy(asc(schema.acceptanceRecords.id));
      return {
        records: rows.map((r) => ({
          id: r.id,
          submittedAt: r.submittedAt,
          record: acceptanceRecordSchema.parse(JSON.parse(r.payload)),
        })),
      };
    },
  }),

  exportData: defineAction({
    description: "导出本空间全部数据为 JSON 文本（健康序列、档案、打卡、习惯、目标、体检、报告、设置、真机验收记录）。",
    request: z.object({}),
    response: z.object({ json: z.string(), filename: z.string() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const data = {
        exportedAt: new Date().toISOString(),
        source: "个人健康管理中心（数据来自 Apple Health 与本空间内录入）",
        dailyMetrics: await db.select().from(schema.dailyMetrics),
        sleepNights: await db.select().from(schema.sleepNights),
        workouts: await db.select().from(schema.workouts),
        profile: await db.select().from(schema.profile),
        checkins: await db.select().from(schema.checkins),
        habits: await db.select().from(schema.habits),
        habitLogs: await db.select().from(schema.habitLogs),
        goals: await db.select().from(schema.goals),
        topicSettings: await db.select().from(schema.topicSettings),
        weeklyPlan: await db.select().from(schema.weeklyPlan),
        labReports: await db.select().from(schema.labReports),
        nutritionChecks: await db.select().from(schema.nutritionChecks),
        reports: await db.select().from(schema.reports),
        acceptanceRecords: await db.select().from(schema.acceptanceRecords),
      };
      return {
        json: JSON.stringify(data, null, 2),
        filename: "health-center-export.json",
      };
    },
  }),

  clearAllData: defineAction({
    description: "一键清空本空间全部数据（健康序列与所有用户录入），不可恢复，需前端二次确认后调用。",
    request: z.object({ confirm: z.literal(true) }),
    response: okResponse,
    async handler(ctx): Promise<z.infer<typeof okResponse>> {
      const db = ctx.db<typeof schema>();
      const tables = [
        schema.dailyMetrics,
        schema.sleepNights,
        schema.workouts,
        schema.profile,
        schema.checkins,
        schema.suggestionDone,
        schema.habits,
        schema.habitLogs,
        schema.goals,
        schema.topicSettings,
        schema.weeklyPlan,
        schema.labReports,
        schema.nutritionChecks,
        schema.reports,
        schema.acceptanceRecords,
        schema.meta,
      ];
      const stmts: BatchItem<"sqlite">[] = tables.map((t) => db.delete(t));
      // 留下 cleared 标记：防止种子逻辑在清空后自动恢复数据。
      stmts.push(
        db.insert(schema.meta).values({ key: "cleared", value: "1" }),
      );
      const [first, ...rest] = stmts;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),
} satisfies ActionsModule;
