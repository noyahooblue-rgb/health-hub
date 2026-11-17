// 首次种子：示例数据（程序生成，虚构）。
// 仅用于新安装的初始演示与结构占位，不含任何真实用户的健康数据。
// 数值之间保持内部自洽（分期之和≈总时长等），但不对应任何真实记录。

export const SEED_DAILY = [
{ date: "2025-03-03", steps: 5230, activeEnergyKcal: 246, exerciseMin: 18, standMin: 82, restingHr: 64, hrvMs: 36.4, spo2Pct: 96.8, respiratoryRate: null, wristTempC: null, walkingHr: 103.0, distanceM: 3310, waterMl: null, headphoneDb: null},
{ date: "2025-03-04", steps: 6105, activeEnergyKcal: 301, exerciseMin: 22, standMin: 96, restingHr: 63, hrvMs: 38.9, spo2Pct: 96.1, respiratoryRate: 17.9, wristTempC: 35.66, walkingHr: 100.0, distanceM: 3865, waterMl: null, headphoneDb: 60.4},
{ date: "2025-03-05", steps: 8940, activeEnergyKcal: 468, exerciseMin: 34, standMin: 118, restingHr: 66, hrvMs: 44.8, spo2Pct: 96.4, respiratoryRate: 17.2, wristTempC: null, walkingHr: 99.0, distanceM: 5740, waterMl: 400, headphoneDb: 58.7},
{ date: "2025-03-06", steps: 7215, activeEnergyKcal: 389, exerciseMin: 26, standMin: 104, restingHr: 67, hrvMs: 45.1, spo2Pct: 96.0, respiratoryRate: 16.9, wristTempC: 35.41, walkingHr: 98.5, distanceM: 4520, waterMl: 900, headphoneDb: 64.8},
{ date: "2025-03-07", steps: 11280, activeEnergyKcal: 845, exerciseMin: 92, standMin: 158, restingHr: 70, hrvMs: 41.5, spo2Pct: 96.3, respiratoryRate: 18.1, wristTempC: null, walkingHr: 104.5, distanceM: 6890, waterMl: 1500, headphoneDb: 62.5},
{ date: "2025-03-08", steps: 6845, activeEnergyKcal: 356, exerciseMin: 17, standMin: 88, restingHr: 66, hrvMs: 43.6, spo2Pct: 95.8, respiratoryRate: 17.6, wristTempC: 35.84, walkingHr: 97.5, distanceM: 4105, waterMl: 1300, headphoneDb: 71.3},
{ date: "2025-03-09", steps: 10360, activeEnergyKcal: 1095, exerciseMin: 141, standMin: 186, restingHr: 68, hrvMs: 47.9, spo2Pct: 95.7, respiratoryRate: 17.4, wristTempC: 35.52, walkingHr: 96.0, distanceM: 6210, waterMl: 1800, headphoneDb: 69.8},
{ date: "2025-03-10", steps: 3120, activeEnergyKcal: 168, exerciseMin: 8, standMin: 52, restingHr: 65, hrvMs: 44.2, spo2Pct: 95.9, respiratoryRate: 18.0, wristTempC: 35.71, walkingHr: 90.0, distanceM: 1985, waterMl: 1100, headphoneDb: 63.6},
] as const;

export const SEED_SLEEP = [
{ date: "2025-03-03", startDatetime: "2025-03-03 01:22", endDatetime: "2025-03-03 10:48", totalMin: 542, coreMin: 296, deepMin: 88, remMin: 158, awakeMin: 22, efficiency: 96.1, qualityScore: 86, awakenings: 6},
{ date: "2025-03-04", startDatetime: "2025-03-04 02:05", endDatetime: "2025-03-04 10:12", totalMin: 462, coreMin: 302, deepMin: 44, remMin: 102, awakeMin: 41, efficiency: 91.8, qualityScore: 79, awakenings: 11},
{ date: "2025-03-05", startDatetime: "2025-03-05 00:48", endDatetime: "2025-03-05 07:12", totalMin: 372, coreMin: 248, deepMin: 34, remMin: 84, awakeMin: 18, efficiency: 95.4, qualityScore: 58, awakenings: 9},
{ date: "2025-03-06", startDatetime: "2025-03-06 03:18", endDatetime: "2025-03-06 07:05", totalMin: 218, coreMin: 104, deepMin: 48, remMin: 57, awakeMin: 9, efficiency: 96.0, qualityScore: 52, awakenings: 3},
{ date: "2025-03-07", startDatetime: "2025-03-07 01:05", endDatetime: "2025-03-07 07:10", totalMin: 358, coreMin: 219, deepMin: 31, remMin: 102, awakeMin: 6, efficiency: 98.3, qualityScore: 57, awakenings: 3},
{ date: "2025-03-08", startDatetime: "2025-03-08 00:37", endDatetime: "2025-03-08 06:58", totalMin: 374, coreMin: 236, deepMin: 39, remMin: 92, awakeMin: 4, efficiency: 98.9, qualityScore: 60, awakenings: 4},
{ date: "2025-03-09", startDatetime: "2025-03-09 00:58", endDatetime: "2025-03-09 07:22", totalMin: 378, coreMin: 228, deepMin: 42, remMin: 101, awakeMin: 7, efficiency: 98.2, qualityScore: 66, awakenings: 2},
{ date: "2025-03-10", startDatetime: "2025-03-10 01:47", endDatetime: "2025-03-10 08:41", totalMin: 402, coreMin: 232, deepMin: 52, remMin: 112, awakeMin: 16, efficiency: 96.2, qualityScore: 62, awakenings: 5},
] as const;

export const SEED_WORKOUTS = [
{ id: "sample_workout_20250303", startDatetime: "2025-03-03 19:05", workoutType: "室内步行", durationMin: 24.0, hrAvg: 101.2, hrMax: 138, energyKcal: 71.5, isStrength: 0},
{ id: "sample_workout_20250307", startDatetime: "2025-03-07 18:35", workoutType: "羽毛球", durationMin: 82.0, hrAvg: 126.4, hrMax: 164, energyKcal: 502.0, isStrength: 0},
{ id: "sample_workout_20250309", startDatetime: "2025-03-09 17:50", workoutType: "羽毛球", durationMin: 128.5, hrAvg: 129.1, hrMax: 172, energyKcal: 803.4, isStrength: 0},
] as const;

// 观察期默认习惯：来自两个建议优先专题（睡眠、运动与体能），每个都带最低版本。
// 设计版定版口径：同时进行中的习惯最多 3 个，其余以「已暂停」保留（与设计提案种子一致）。
export const SEED_HABITS = [
{ topic: "sleep", name: "固定起床时间（±30 分钟内）", minVersion: "晚起也先下床见光，午间不补长觉", sort: 1, active: 1},
{ topic: "sleep", name: "睡前 45 分钟放下屏幕", minVersion: "至少提前 15 分钟放下手机", sort: 2, active: 1},
{ topic: "exercise", name: "按周计划完成运动时段", minVersion: "没时间就快走 10 分钟", sort: 4, active: 1},
{ topic: "sleep", name: "起床后尽早接触日光", minVersion: "在窗边或阳台站 5 分钟", sort: 3, active: 0},
{ topic: "exercise", name: "饭后步行 10 分钟", minVersion: "在室内走动 3 分钟也可以", sort: 5, active: 0},
{ topic: "activity", name: "每坐约 1 小时起身活动", minVersion: "起身接杯水、站立 2 分钟", sort: 6, active: 0},
] as const;

export const SEED_GOALS = [
{
topic: "sleep",
title: "4 周内把平均入睡时刻提前到 00:30 前，平均睡眠时长提升约 30 分钟",
detail: "草案依据（示例）：近 8 晚入睡时刻波动较大，平均睡眠时长约 6.8 小时。相对个人基线的改进目标，不套用理想值；确认后生效，观察期内不计完成度。",
tier: "基础达标",
},
{
topic: "exercise",
title: "每周锻炼分钟稳定 ≥150 分钟，并加入 2 次力量训练",
detail: "草案依据（示例）：本周锻炼分钟合计约 358 分钟但分布不均（两天占大头），力量训练 0 次。WHO《身体活动和久坐行为指南 2020》建议每周 150–300 分钟中等强度有氧 + ≥2 天力量训练；每次加量不超过上周约 10%。",
tier: "基础达标",
},
] as const;

export const SEED_WEEKLY_PLAN = [
{ weekday: 1, kind: "有氧", label: "中等强度 30–40 分钟"},
{ weekday: 2, kind: "灵活", label: "步行与拉伸"},
{ weekday: 3, kind: "力量", label: "力量训练（草案，待确认后加入）"},
{ weekday: 4, kind: "有氧", label: "中等强度 30–40 分钟"},
{ weekday: 5, kind: "灵活", label: "羽毛球或步行"},
{ weekday: 6, kind: "有氧", label: "较长时段有氧"},
{ weekday: 7, kind: "恢复", label: "恢复日：散步、拉伸、早睡"},
] as const;

export const FIRST_WEEKLY_REPORT = {
kind: "weekly",
periodLabel: "2025-03-03 → 2025-03-10",
title: "首期周报 · 基线观察（观察期）",
body: [
"说明：以下为示例数据生成的示例周报，仅用于演示报告结构，不对应任何真实记录。数据仅 8 天，处于两周观察期，本报为基线观察，不设硬目标完成度。",
"",
"近 8 晚平均睡眠时长约 6.8 小时，低于 AASM 与睡眠研究学会共识的成人 7–9 小时参考范围；入睡时刻波动较大，规律性差。深睡与 REM 分期记录完整，睡眠效率整体尚可。下阶段重点不是强行延长，而是先稳住入睡与起床时间。",
"",
"本周锻炼分钟合计约 358 分钟，达到 WHO 指南的周有氧量下限，但分布很不均匀：两天占了大头，其余日子多在 20–30 分钟。力量训练 0 次，是与 WHO「每周 ≥2 天力量训练」之间最明显的差距。训练负荷比需要满 28 天数据才能计算，目前为「积累中」。",
"",
"日常活动：步数波动大，与运动日高度相关，非运动日久坐偏多。心血管：静息心率与 HRV 均在个人波动范围内，无心率类通知数据。体重与体成分：暂无任何记录，数据不足。饮食与营养：仅有饮水记录，其余营养明细缺失。压力与情绪：尚无打卡记录，从今天开始用每日打卡积累。伏案工作：耳机音量暴露均值在 WHO 安全聆听范围内，继续保持。预防与体检：尚无体检记录录入。出差模式：未开启。",
"",
"下周 1–3 个调整重点：1）先固定起床时间，入睡时间自然前移；2）把运动量摊到至少 3 天，避免单日过量；3）每天完成 10 秒打卡，开始积累主观感受数据。",
].join("\n"),
};
