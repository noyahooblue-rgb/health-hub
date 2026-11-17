DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE daily_metrics (
  date TEXT PRIMARY KEY,
  steps INTEGER,
  active_energy_kcal REAL,
  exercise_min REAL,
  stand_min REAL,
  resting_hr REAL,
  hrv_ms REAL,
  spo2_pct REAL,
  respiratory_rate REAL,
  wrist_temp_c REAL,
  walking_hr REAL,
  distance_m REAL,
  water_ml REAL,
  headphone_db REAL
);
--> statement-breakpoint
CREATE TABLE sleep_nights (
  date TEXT PRIMARY KEY,
  start_datetime TEXT,
  end_datetime TEXT,
  total_min REAL,
  core_min REAL,
  deep_min REAL,
  rem_min REAL,
  awake_min REAL,
  efficiency REAL,
  quality_score REAL,
  awakenings INTEGER
);
--> statement-breakpoint
CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  start_datetime TEXT NOT NULL,
  workout_type TEXT NOT NULL,
  duration_min REAL,
  hr_avg REAL,
  hr_max REAL,
  energy_kcal REAL,
  is_strength INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE profile (
  id INTEGER PRIMARY KEY,
  age INTEGER,
  sex TEXT,
  height_cm REAL,
  work_pattern TEXT,
  exercise_habit TEXT,
  goal_primary TEXT,
  goal_secondary TEXT,
  doctor_notes TEXT,
  updated_at INTEGER
);
--> statement-breakpoint
CREATE TABLE checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  energy INTEGER NOT NULL,
  mood INTEGER NOT NULL,
  stress INTEGER NOT NULL,
  note TEXT,
  red_flag INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE suggestion_done (
  date TEXT NOT NULL,
  idx INTEGER NOT NULL,
  PRIMARY KEY (date, idx)
);
--> statement-breakpoint
CREATE TABLE habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  name TEXT NOT NULL,
  min_version TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE habit_logs (
  habit_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (habit_id, date)
);
--> statement-breakpoint
CREATE TABLE goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  tier TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE topic_settings (
  topic TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'monitor',
  tier TEXT NOT NULL DEFAULT '基础达标'
);
--> statement-breakpoint
CREATE TABLE weekly_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT '灵活',
  label TEXT
);
--> statement-breakpoint
CREATE TABLE lab_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE nutrition_checks (
  date TEXT NOT NULL,
  item TEXT NOT NULL,
  PRIMARY KEY (date, item)
);
--> statement-breakpoint
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  period_label TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
