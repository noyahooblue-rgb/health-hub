// 个人健康管理中心的数据表。
// 健康序列按日期存行（daily_metrics / sleep_nights / workouts），
// 其余为用户在本空间内录入的数据（档案、打卡、习惯、目标、体检、设置）。

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dailyMetrics = sqliteTable("daily_metrics", {
  date: text("date").primaryKey(), // YYYY-MM-DD，用户时区
  steps: integer("steps"),
  activeEnergyKcal: real("active_energy_kcal"),
  exerciseMin: real("exercise_min"),
  standMin: real("stand_min"),
  restingHr: real("resting_hr"),
  hrvMs: real("hrv_ms"),
  spo2Pct: real("spo2_pct"),
  respiratoryRate: real("respiratory_rate"),
  wristTempC: real("wrist_temp_c"),
  walkingHr: real("walking_hr"),
  distanceM: real("distance_m"),
  waterMl: real("water_ml"),
  headphoneDb: real("headphone_db"),
});

export const sleepNights = sqliteTable("sleep_nights", {
  date: text("date").primaryKey(), // 起床日 YYYY-MM-DD
  startDatetime: text("start_datetime"),
  endDatetime: text("end_datetime"),
  totalMin: real("total_min"),
  coreMin: real("core_min"),
  deepMin: real("deep_min"),
  remMin: real("rem_min"),
  awakeMin: real("awake_min"),
  efficiency: real("efficiency"),
  qualityScore: real("quality_score"),
  awakenings: integer("awakenings"),
});

export const workouts = sqliteTable("workouts", {
  id: text("id").primaryKey(),
  startDatetime: text("start_datetime").notNull(),
  workoutType: text("workout_type").notNull(),
  durationMin: real("duration_min"),
  hrAvg: real("hr_avg"),
  hrMax: real("hr_max"),
  energyKcal: real("energy_kcal"),
  isStrength: integer("is_strength").notNull().default(0),
});

export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey(),
  age: integer("age"),
  sex: text("sex"),
  heightCm: real("height_cm"),
  workPattern: text("work_pattern"),
  exerciseHabit: text("exercise_habit"),
  goalPrimary: text("goal_primary"),
  goalSecondary: text("goal_secondary"),
  doctorNotes: text("doctor_notes"),
  updatedAt: integer("updated_at"),
});

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  energy: integer("energy").notNull(),
  mood: integer("mood").notNull(),
  stress: integer("stress").notNull(),
  note: text("note"),
  tags: text("tags"), // JSON 数组：生活标签（饮酒/咖啡因/身体不适…），设计版打卡新增
  redFlag: integer("red_flag").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const suggestionDone = sqliteTable("suggestion_done", {
  date: text("date").notNull(),
  idx: integer("idx").notNull(),
});

export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topic: text("topic").notNull(),
  name: text("name").notNull(),
  minVersion: text("min_version"),
  active: integer("active").notNull().default(1),
  sort: integer("sort").notNull().default(0),
});

export const habitLogs = sqliteTable("habit_logs", {
  habitId: integer("habit_id").notNull(),
  date: text("date").notNull(),
});

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topic: text("topic").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  status: text("status", {
    enum: ["draft", "active", "paused", "done"],
  })
    .notNull()
    .default("draft"),
  tier: text("tier"),
  createdAt: integer("created_at").notNull(),
});

export const topicSettings = sqliteTable("topic_settings", {
  topic: text("topic").primaryKey(),
  mode: text("mode", { enum: ["active", "monitor"] })
    .notNull()
    .default("monitor"),
  tier: text("tier").notNull().default("基础达标"),
});

export const weeklyPlan = sqliteTable("weekly_plan", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  weekday: integer("weekday").notNull(), // 1=周一 … 7=周日
  kind: text("kind").notNull().default("灵活"),
  label: text("label"),
});

export const labReports = sqliteTable("lab_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  payload: text("payload").notNull(), // JSON: 指标名 -> 数值/文本
  createdAt: integer("created_at").notNull(),
});

export const nutritionChecks = sqliteTable("nutrition_checks", {
  date: text("date").notNull(),
  item: text("item").notNull(),
});

export const reports = sqliteTable("reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // weekly | monthly | quarterly
  periodLabel: text("period_label").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// 真机验收提交记录（2026-11-17 新增）：每次提交一行、只追加不覆盖。
// payload 为整条提交的 JSON（7 条勾选 / 备注 / 探针统计 / 能力探针 / 首屏时间 /
// 提交时间 / 界面版本 / 模式）。与健康数据集合分开计数，不混入健康数据口径。
export const acceptanceRecords = sqliteTable("acceptance_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  submittedAt: text("submitted_at").notNull(), // ISO 时间（提交时刻）
  payload: text("payload").notNull(), // JSON: 完整提交记录
});
