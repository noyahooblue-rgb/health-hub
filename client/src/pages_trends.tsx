// 趋势页（设计版）：四组图表（恢复与心血管 / 睡眠 / 活动 / 压力与情绪），
// 每图叠加个人基线带，按住横向拖动查数；锻炼按周聚合柱状图。统计口径全站统一：不完整日排除。

import { useState, type ReactNode } from "react";
import {
  addDays,
  baseline,
  bedtimeNorm,
  fmtClock,
  fmtMin,
  fullDaily,
  fullSleep,
  mean,
  sd,
  trendNote,
  weekStats,
  type Baseline,
  type Dashboard,
  type DailyRow,
} from "./lib";
import {
  Card,
  Chev,
  EmptyBox,
  LineChart,
  Seg,
  TtlHead,
  WeeklyBars,
  useNav,
  type ChartPt,
  type WeekBar,
} from "./ui";

function baseLabel(n: number): string {
  return n >= 28 ? "28 天基线带" : `观察期基线带（${n} 天，满 28 天转正式基线）`;
}
function shortBase(base: Baseline | null): string {
  if (!base) return "基线积累中";
  return base.n >= 28 ? `正式基线 · ${base.n} 天` : `观察期基线 · ${base.n} 天`;
}

interface ChartDef {
  title: string;
  colorVar: string;
  unit: string;
  dec?: number;
  points?: ChartPt[];
  weeks?: WeekBar[];
  base?: Baseline | null;
  baseLabel: string;
  note: string;
  goal?: { value: number; label: string };
  fmtVal?: (v: number) => string;
  fmtAxis?: (v: number) => string;
  nonNeg?: boolean;
  ySnap?: number;
  topic?: string;
  topicName?: string;
  empty?: boolean;
}

export function TrendsPage({ d, onNeedFull }: { d: Dashboard; onNeedFull?: () => void }) {
  const nav = useNav();
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const full = fullDaily(d);
  const sleeps = fullSleep(d);
  const latest = d.latestDate;

  const groups: { name: string; topic: string; defs: ChartDef[] }[] = [];

  const mkDaily = (
    title: string,
    key: keyof DailyRow,
    unit: string,
    higherBetter: boolean | null,
    colorVar: string,
    dec: number,
    topic: string,
    topicName: string,
  ): ChartDef => {
    const base = baseline(d.daily, key);
    const rows = full.slice(-range);
    return {
      title,
      colorVar,
      unit,
      dec,
      points: rows.map((r) => ({
        label: r.date.slice(5),
        value: (r[key] as number | null) ?? null,
        incomplete: r.date === latest,
      })),
      base,
      baseLabel: base ? baseLabel(base.n) : "基线积累中",
      note: trendNote(
        rows.map((r) => r[key] as number | null),
        { higherBetter, unit, label: title },
      ),
      topic,
      topicName,
    };
  };

  groups.push({
    name: "恢复与心血管",
    topic: "cardio",
    defs: [
      mkDaily("HRV", "hrvMs", " ms", true, "--c-hrv", 1, "stress", "压力与情绪"),
      mkDaily("静息心率", "restingHr", " bpm", false, "--c-heart", 0, "cardio", "心血管"),
      mkDaily("血氧", "spo2Pct", "%", null, "--c-breath", 1, "cardio", "心血管"),
      mkDaily("睡眠呼吸频率", "respiratoryRate", " 次/分", null, "--c-breath", 1, "cardio", "心血管"),
      mkDaily("步行心率均值", "walkingHr", " bpm", false, "--c-heart", 1, "cardio", "心血管"),
    ],
  });

  const sRows = sleeps.slice(-range);
  const sVals = sleeps.map((s) => s.totalMin).filter((v): v is number => v != null);
  const sMean = mean(sVals);
  const sSd = sd(sVals);
  const shortest = sleeps.reduce<Dashboard["sleep"][number] | null>(
    (acc, s) =>
      s.totalMin != null && (acc == null || s.totalMin < (acc.totalMin ?? Infinity))
        ? s
        : acc,
    null,
  );
  const bedVals = sleeps
    .map((s) => bedtimeNorm(s.startDatetime))
    .filter((v): v is number => v != null);
  const bedMean = mean(bedVals);
  const bedSd = sd(bedVals);
  groups.push({
    name: "睡眠",
    topic: "sleep",
    defs: [
      {
        title: "睡眠时长",
        colorVar: "--c-sleep",
        unit: " 分钟",
        dec: 0,
        nonNeg: true,
        goal: { value: 420, label: "参考下限 7 小时" },
        points: sRows.map((s) => ({
          label: s.date.slice(5),
          value: s.totalMin != null ? Math.round(s.totalMin) : null,
        })),
        base: sMean != null ? { mean: sMean, sd: sSd, n: sleeps.length } : null,
        baseLabel: baseLabel(sleeps.length),
        note:
          sleeps.length >= 3
            ? `近 ${sleeps.length} 晚平均约 ${Math.round(((sMean ?? 0) / 60) * 10) / 10} 小时，波动较大${shortest?.totalMin != null ? `，其中 ${shortest.date.slice(5)} 一晚仅睡约 ${Math.round(shortest.totalMin / 60 * 10) / 10} 小时` : ""}；时长本身之外，入睡时刻的规律性更值得关注。`
            : "数据不足，积累中。",
        fmtVal: (v) => fmtMin(v),
        fmtAxis: (v) => `${Math.round((v / 60) * 10) / 10}h`,
        topic: "sleep",
        topicName: "睡眠",
      },
      {
        title: "入睡时刻",
        colorVar: "--c-sleep",
        unit: "",
        dec: 0,
        ySnap: 60,
        goal: { value: 30, label: `阶段目标 ${d.settings["bedtime_stage_target"] || "00:30"}` },
        points: sRows.map((s) => {
          const v = bedtimeNorm(s.startDatetime);
          return { label: s.date.slice(5), value: v != null ? Math.round(v - 1440) : null };
        }),
        base: bedMean != null ? { mean: bedMean - 1440, sd: bedSd, n: bedVals.length } : null,
        baseLabel: baseLabel(bedVals.length),
        note:
          bedSd != null
            ? `近 ${bedVals.length} 晚入睡时刻平均 ${bedMean != null ? fmtClock(bedMean) : "—"}，标准差约 ${Math.round(bedSd)} 分钟，波动${bedSd > 45 ? "明显偏大，是当前睡眠专题的首要改进点" : "在可接受范围"}。`
            : "数据不足，积累中。",
        fmtVal: (v) => fmtClock(v + 1440),
        fmtAxis: (v) => fmtClock(v + 1440),
        topic: "sleep",
        topicName: "睡眠",
      },
    ],
  });

  // 活动：步数 / 锻炼（按周）/ 活动能量
  const wkMap = new Map<string, number>();
  for (const r of full) {
    const dow = (new Date(`${r.date}T00:00:00`).getDay() + 6) % 7;
    const mon = addDays(r.date, -dow);
    wkMap.set(mon, (wkMap.get(mon) ?? 0) + (r.exerciseMin ?? 0));
  }
  const wkNow = weekStats(d);
  const wkKeys = [...wkMap.keys()].sort();
  const exWeeks: WeekBar[] = wkKeys.map((mon, idx) => ({
    label: `${mon.slice(5)} 那周`,
    value: Math.round(wkMap.get(mon) ?? 0),
    progress:
      idx === wkKeys.length - 1 && wkNow?.inProgress
        ? `本周进行中 · 已过 ${wkNow.elapsed} 天`
        : undefined,
  }));
  const stepsDef = mkDaily("步数", "steps", " 步", true, "--c-activity", 0, "activity", "日常活动与久坐");
  stepsDef.nonNeg = true;
  const energyDef = mkDaily("活动能量", "activeEnergyKcal", " kcal", null, "--c-energy", 0, "activity", "日常活动与久坐");
  energyDef.nonNeg = true;
  groups.push({
    name: "活动",
    topic: "activity",
    defs: [
      stepsDef,
      {
        title: "锻炼分钟（按周）",
        colorVar: "--c-energy",
        unit: " 分钟",
        weeks: exWeeks,
        baseLabel: baseLabel(full.length),
        note: "锻炼按周看：WHO 的 150 分钟是周目标，单日折线容易误读成「今天没达标」。",
        topic: "exercise",
        topicName: "运动与体能",
      },
      energyDef,
    ],
  });

  const ckDefs: ChartDef[] =
    d.checkins.length === 0
      ? [
          {
            title: "精力 / 情绪 / 压力",
            colorVar: "--c-mint",
            unit: " 分",
            baseLabel: "暂无打卡记录",
            note: "",
            empty: true,
          },
        ]
      : (
          [
            ["energy", "精力", true],
            ["mood", "情绪", true],
            ["stress", "压力", false],
          ] as const
        ).map(([key, title, hb]) => {
          const rows = d.checkins.slice(-range);
          const vals = rows.map((c) => c[key]);
          const m = mean(vals);
          return {
            title,
            colorVar: "--c-mint",
            unit: " 分",
            dec: 0,
            points: rows.map((c) => ({ label: c.date.slice(5), value: c[key] })),
            base: m != null ? { mean: m, sd: sd(vals), n: vals.length } : null,
            baseLabel: m != null ? baseLabel(vals.length) : "暂无打卡记录",
            note:
              vals.length >= 3
                ? trendNote(vals, { higherBetter: hb, unit: " 分", label: title })
                : "打卡数据不足：在「今日」页完成每日打卡后，这里会与 HRV、睡眠联动展示。",
            topic: "stress",
            topicName: "压力与情绪",
          };
        });
  groups.push({ name: "压力与情绪（每日打卡）", topic: "stress", defs: ckDefs });

  const groupHead = (name: string, topic: string): ReactNode => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <h2 className="group-title" style={{ marginRight: "auto" }}>
        {name}
      </h2>
      <button
        type="button"
        onClick={() => nav.openTopic(topic)}
        style={{
          border: 0,
          background: "transparent",
          color: "var(--c-sleep)",
          fontFamily: "var(--sans)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          minHeight: 44,
          padding: "6px 4px",
          whiteSpace: "nowrap",
        }}
      >
        专题 ›
      </button>
    </div>
  );

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">
          趋势
          <span className="tail">
            每图叠加个人基线带（均值 ± 1 个标准差），按住图表左右拖动看每天数值
          </span>
        </h1>
      </div>
      <div className="warn-strip">
        <b>数据积累中：</b>现有 {full.length} 天完整记录（部分同步日已排除，全站同口径）。满 14 天给初步判断，满 28 天才下趋势结论；观察期内每张图只显示数值与常态范围，不解读方向。
        {range > full.length ? ` 当前所选 ${range} 天视图只画已有天数。` : ""}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "0 4px" }}>
        <Seg
          items={[
            ["7", "7 天"],
            ["30", "30 天"],
            ["90", "90 天"],
          ]}
          value={String(range)}
          onChange={(v) => {
            const next = Number(v) as 7 | 30 | 90;
            setRange(next);
            // 按需拉取：切到 90 天且窗口外还有更早数据时，再取全量（方案 C 等效实现条件 2）。
            if (next === 90 && d.history?.hasOlder) onNeedFull?.();
          }}
          ariaLabel="时间范围"
        />
      </div>

      {latest == null ? (
        <EmptyBox text="暂无健康数据。数据由 Atlas 每日从 Apple Health 同步回填。" />
      ) : (
        groups.map((g) => (
          <div key={g.name}>
            {groupHead(g.name, g.topic)}
            {g.defs.map((c) => (
              <Card key={c.title}>
                <TtlHead label={c.title} />
                <p style={{ fontSize: 12.5, color: "var(--dim)", margin: "3px 0 0" }}>
                  {shortBase(c.base ?? null)}
                </p>
                {c.empty ? (
                  <>
                    <EmptyBox text="尚无打卡记录：在「今日」页完成每日打卡后，这里会展示精力、情绪、压力与 HRV、睡眠的联动趋势。" />
                    <button
                      type="button"
                      className="btn sm"
                      style={{ marginTop: 12 }}
                      onClick={() => nav.goTab("today")}
                    >
                      去打卡
                    </button>
                  </>
                ) : c.weeks ? (
                  <WeeklyBars weeks={c.weeks} goal={150} colorVar={c.colorVar} title={c.title} />
                ) : (
                  <LineChart
                    points={c.points ?? []}
                    base={c.base ?? null}
                    unit={c.unit}
                    dec={c.dec ?? 0}
                    colorVar={c.colorVar}
                    title={c.title}
                    goal={c.goal}
                    fmtVal={c.fmtVal}
                    fmtAxis={c.fmtAxis}
                    nonNeg={c.nonNeg}
                    ySnap={c.ySnap}
                  />
                )}
                {c.note ? <p className="chart-note">{c.note}</p> : null}
                {c.topic && (
                  <div style={{ borderTop: ".5px solid var(--sep)", marginTop: 10, paddingTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => nav.openTopic(c.topic!)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        textAlign: "left",
                        background: "transparent",
                        border: 0,
                        padding: "9px 0 2px",
                        fontFamily: "var(--sans)",
                        cursor: "pointer",
                        minHeight: 44,
                      }}
                    >
                      <span style={{ fontSize: 15, color: "var(--ink)" }}>所属专题</span>
                      <span style={{ marginLeft: "auto", fontSize: 14.5, color: "var(--dim)" }}>
                        {c.topicName}
                      </span>
                      <span className="chev" style={{ marginLeft: 6, display: "inline-flex", width: 9, height: 14, stroke: "var(--dim)" }}>
                        <Chev />
                      </span>
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
