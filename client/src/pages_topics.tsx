// 专题（嵌入「计划」页顶部分段）：十个专题统一结构 —— 为什么重要 / 关键指标 /
// 参考标准（标注来源机构）/ 当前档位与阶段目标 / 本周行动 / 趋势图 / 何时建议咨询医生。

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
NUTRITION_ITEMS,
TOPICS,
TOPIC_META,
baseline,
bedtimeNorm,
fmt,
fmtDelta,
fmtMin,
fullSleep,
loadRatio,
mean,
patchDashboard,
restoreDashboard,
sd,
todayStr,
weekStats,
type Dashboard,
type TopicDef,
} from "./lib";
import {
Card,
Chev,
EmptyBox,
LineChart,
MRow,
Pill,
Sym,
TtlHead,
useReveal,
useToast,
} from "./ui";
import { HabitCheckRow } from "./habits";
import { GoalBox } from "./goals";

const TIER_OPTIONS = ["数据不足", "待观察", "基础达标", "进阶", "保持"];

function TopicMetrics({ d, topicKey }: { d: Dashboard; topicKey: string }) {
  const today = d.daily[d.daily.length - 1];
  const lastNight = d.sleep[d.sleep.length - 1];
  const wk = weekStats(d);
  const latest = d.latestDate ?? undefined;
  if (!today) return <EmptyBox text="数据不足" />;
  switch (topicKey) {
    case "sleep": {
      const sleeps = fullSleep(d);
      const last7 = sleeps.slice(-7);
      const avg = mean(last7.map((s) => s.totalMin).filter((v): v is number => v != null));
      const beds = sleeps
        .map((s) => bedtimeNorm(s.startDatetime))
        .filter((v): v is number => v != null);
      const btSd = sd(beds);
      const weekend = sleeps.filter((s) => [0, 6].includes(new Date(`${s.date}T00:00:00`).getDay()));
      const weekday = sleeps.filter((s) => ![0, 6].includes(new Date(`${s.date}T00:00:00`).getDay()));
      const wAvg = mean(weekend.map((s) => s.totalMin).filter((v): v is number => v != null));
      const dAvg = mean(weekday.map((s) => s.totalMin).filter((v): v is number => v != null));
      return (
        <div>
          <MRow label="平均睡眠时长（近 7 晚）" value={fmtMin(avg)} note="参考 7–9 小时（AASM 与睡眠研究学会共识）" />
          <MRow
            label="入睡时刻波动"
            value={btSd != null ? `标准差约 ${fmt(btSd)} 分钟` : "—"}
            note={btSd != null ? (btSd > 45 ? "波动明显偏大，规律性差" : "规律性尚可") : "数据不足"}
          />
          <MRow
            label="周末与工作日差异"
            value={wAvg != null && dAvg != null ? `${fmtMin(wAvg)} vs ${fmtMin(dAvg)}` : "—"}
            note={wAvg != null && dAvg != null ? `周末平均多睡 ${fmt(Math.abs(wAvg - dAvg))} 分钟` : "数据不足"}
          />
          <MRow label="昨晚深睡 / REM" value={`${fmtMin(lastNight?.deepMin)} / ${fmtMin(lastNight?.remMin)}`} />
          <MRow
            label="睡眠呼吸频率"
            value={today.respiratoryRate != null ? `${fmt(today.respiratoryRate, 1)} 次/分` : "—"}
            delta={fmtDelta(today.respiratoryRate, baseline(d.daily, "respiratoryRate", latest), " 次/分", 1)}
          />
          <MRow label="睡眠腕温" value={today.wristTempC != null ? `${fmt(today.wristTempC, 2)} °C` : "—"} note="以相对个人基线的偏离看，不看绝对值" />
        </div>
      );
    }
    case "exercise": {
      const lr = loadRatio(d.daily);
      const recent = d.workouts.slice(-3).reverse();
      return (
        <div>
          <MRow label="本周锻炼分钟" value={`${fmt(wk ? Math.round(wk.exerciseMin) : null)} 分钟`} note="WHO 参考：每周 150–300 分钟中等强度有氧" />
          <MRow label="本周力量训练" value={`${wk?.strengthCount ?? 0} 次`} note="WHO 参考：每周 ≥2 次" />
          <MRow label="训练负荷比（7 天 / 28 天）" value={lr != null ? lr.toFixed(2) : "积累中"} note={lr == null ? "需要满 28 天数据才能计算" : lr > 1.3 ? "高于约 1.3，增量过快" : lr < 0.8 ? "低于约 0.8，可适当加量" : "在合理范围"} />
          <MRow label="VO2max" value="数据不足" note="暂无记录：戴表户外步行或跑步数次后，健康 App 会自动估算" />
          {recent.map((w) => (
            <MRow
              key={w.id}
              label={`${w.startDatetime.slice(5, 16)} ${w.workoutType}`}
              value={`${fmt(w.durationMin)} 分钟`}
              note={`平均心率 ${fmt(w.hrAvg)} · 最高 ${fmt(w.hrMax)} bpm · ${fmt(w.energyKcal)} kcal`}
            />
          ))}
        </div>
      );
    }
    case "activity": {
      const avgSteps = mean(
        d.daily
          .filter((r) => r.date !== d.latestDate)
          .map((r) => r.steps)
          .filter((v): v is number => v != null),
      );
      return (
        <div>
          <MRow label="今日步数" value={fmt(today.steps)} delta={fmtDelta(today.steps, baseline(d.daily, "steps", latest), " 步")} />
          <MRow label="平均步数（完整日）" value={fmt(avgSteps)} note="步数无 WHO 标准，以个人基线逐步增加为准" />
          <MRow label="今日站立时间" value={today.standMin != null ? `${fmt(today.standMin / 60, 1)} 小时` : "—"} />
          <MRow label="连续久坐时段" value="数据不足" note="当前通道只提供每日汇总，无法计算连续久坐时长；先按整点起身执行" />
        </div>
      );
    }
    case "cardio": {
      return (
        <div>
          <MRow label="静息心率" value={today.restingHr != null ? `${fmt(today.restingHr)} bpm` : "—"} note="以个人长期趋势为准" delta={fmtDelta(today.restingHr, baseline(d.daily, "restingHr", latest), " bpm", 1)} />
          <MRow label="HRV" value={today.hrvMs != null ? `${fmt(today.hrvMs, 1)} ms` : "—"} delta={fmtDelta(today.hrvMs, baseline(d.daily, "hrvMs", latest), " ms", 1)} />
          <MRow label="步行心率均值" value={today.walkingHr != null ? `${fmt(today.walkingHr, 1)} bpm` : "—"} />
          <MRow label="血压" value="数据不足" note="暂无记录：家用血压计测量后，可在「我的 · 档案」体检录入中保存" />
          <MRow label="心率过高/过低/房颤通知、心电图" value="数据不足" note="当前读取通道拿不到，请在 iPhone 健康 App 内查看；如收到通知请按红旗规则处理" />
        </div>
      );
    }
    case "weight": {
      const latestLab = d.labs[0];
      const w = latestLab?.payload["体重"];
      const waist = latestLab?.payload["腰围"];
      return (
        <div>
          <MRow label="体重（7 天移动平均）" value={w ? `${w}（来自 ${latestLab?.date} 录入）` : "数据不足"} note={w ? "单条录入暂不能算移动平均，规律称重后自动呈现" : "暂无任何记录：建议用可同步的体脂秤，或每周固定晨起称重后在档案页录入"} />
          <MRow label="BMI" value="数据不足" note="需要在档案页填写身高，并有体重记录后计算；标准见下方参考标准（WHO）" />
          <MRow label="腰围" value={waist ? `${waist}（来自 ${latestLab?.date} 录入）` : "数据不足"} note="建议每月量一次并录入" />
          <MRow label="体脂率" value="数据不足" note="体脂秤同步到健康 App 后会自动出现" />
        </div>
      );
    }
    case "nutrition": {
      return (
        <div>
          <MRow label="饮水记录（健康 App）" value={today.waterMl != null ? `${fmt(today.waterMl)} ml` : "数据不足"} note="其余营养明细（能量/蛋白质/咖啡因/酒精）暂无记录，用下方轻打卡代替" />
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", margin: "16px 0 0" }}>
            今日轻打卡（不称重、不算热量）
          </p>
          <NutritionChecks d={d} />
        </div>
      );
    }
    case "stress": {
      const recent = d.checkins.slice(-7);
      const avg = (k: "energy" | "mood" | "stress") => mean(recent.map((c) => c[k]));
      const todayCk = d.checkins.find((c) => c.date === todayStr());
      return (
        <div>
          <MRow label="今日打卡" value={todayCk ? `精力 ${todayCk.energy} · 情绪 ${todayCk.mood} · 压力 ${todayCk.stress}` : "尚未打卡"} note="在「今日」页完成 10 秒打卡" />
          <MRow label={`近 ${recent.length} 次平均`} value={recent.length ? `精力 ${fmt(avg("energy"), 1)} · 情绪 ${fmt(avg("mood"), 1)} · 压力 ${fmt(avg("stress"), 1)}` : "数据不足"} />
          <MRow label="HRV（与压力联动）" value={today.hrvMs != null ? `${fmt(today.hrvMs, 1)} ms` : "—"} note="压力打卡偏高又伴随 HRV 下降、睡眠变差时，优先减负" delta={fmtDelta(today.hrvMs, baseline(d.daily, "hrvMs", latest), " ms", 1)} />
          <MRow label="正念分钟" value="数据不足" note="健康 App 暂无记录；可用每日打卡中的呼吸练习习惯代替追踪" />
        </div>
      );
    }
    case "desk": {
      return (
        <div>
          <MRow label="耳机音量暴露（今日均值）" value={today.headphoneDb != null ? `${fmt(today.headphoneDb, 1)} dB` : "—"} note="WHO 安全聆听：80 分贝每周累计不超过 40 小时" />
          <MRow label="站立时间（起身代理指标）" value={today.standMin != null ? `${fmt(today.standMin)} 分钟` : "—"} note="每小时至少起身一次（WHO 久坐建议）" />
          <MRow label="颈肩拉伸打卡" value="" note="在下方「本周行动」里勾选拉伸习惯（可在计划页添加）" />
        </div>
      );
    }
    case "prevention": {
      const latestLab = d.labs[0];
      return (
        <div>
          <MRow label="体检记录" value={d.labs.length > 0 ? `${d.labs.length} 次` : "尚未录入"} note={latestLab ? `最近一次：${latestLab.date}，在「我的 · 档案」查看逐年对比` : "在「我的 · 档案」录入体检报告，按日期保存逐年对比"} />
          <MRow label="口腔检查" value="按牙医建议间隔" note="完成检查后可在档案页备注记录日期" />
          <MRow label="视力检查" value="按眼科医生建议" note="用眼遵循 20-20-20（美国眼科学会 AAO）" />
          <MRow label="疫苗记录" value="见档案页备注" note="接种情况可记在档案页的医生叮嘱/备注中" />
        </div>
      );
    }
    case "travel": {
      const on = d.settings["travel_mode"] === "1";
      return (
        <div>
          <MRow label="出差模式" value={on ? "已开启" : "未开启"} note="在下方开关或「我的 · 设置」开启；开启后只保留三项最低目标" />
          <MRow label="精简目标 1 · 睡眠时间窗" value="按当地时间固定起床" />
          <MRow label="精简目标 2 · 每日步数" value="保底步行，不追量" />
          <MRow label="精简目标 3 · 饮水" value="全天少量多次" />
          <MRow label="恢复期" value="回程后 3–5 天" note="恢复期内不计习惯打卡中断" />
        </div>
      );
    }
    default:
      return <EmptyBox text="数据不足" />;
  }
}

function NutritionChecks({ d }: { d: Dashboard }) {
  const qc = useQueryClient();
  const toast = useToast();
  // 「今日」以设备本地日期为准，不以 latestDate 为准（同步滞后时轻打卡仍记在今天）。
  const mut = useMutation({
    mutationFn: (v: { item: string; done: boolean }) =>
      api.toggleNutrition({ date: todayStr(), item: v.item, done: v.done }),
    // 勾选即时变，保存异步落盘，失败回滚并弹轻提示（M15）。
    onMutate: (v) => {
      const key = `${todayStr()}:${v.item}`;
      const prev = patchDashboard(qc, (old) => ({
        ...old,
        nutrition: v.done
          ? old.nutrition.includes(key)
            ? old.nutrition
            : [...old.nutrition, key]
          : old.nutrition.filter((x) => x !== key),
      }));
      return { prev };
    },
    onError: (_e, _v, c) => {
      restoreDashboard(qc, c?.prev);
      toast.show("饮食打卡没能保存，已恢复到之前的状态，请重试");
    },
  });
  const date = todayStr();
  return (
    <div>
      {NUTRITION_ITEMS.map((it) => {
        const done = d.nutrition.includes(`${date}:${it.key}`);
        return (
          <div className="check-row" key={it.key}>
            <input
              type="checkbox"
              checked={done}
              onChange={(e) => mut.mutate({ item: it.key, done: e.target.checked })}
              aria-label={it.label}
            />
            <div className="ct">
              <div className="t">{it.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopicTrend({ d, topicKey }: { d: Dashboard; topicKey: string }) {
  if (topicKey === "sleep" || topicKey === "travel") {
    const vals = d.sleep.map((s) => s.totalMin).filter((v): v is number => v != null);
    const m = mean(vals);
    return (
      <LineChart
        points={d.sleep.map((s) => ({ label: s.date.slice(5), value: s.totalMin }))}
        base={m != null ? { mean: m, sd: sd(vals), n: vals.length } : null}
        unit=" 分钟"
        colorVar="--c-sleep"
        title="睡眠时长趋势"
        fmtVal={(v) => fmtMin(v)}
        fmtAxis={(v) => `${Math.round((v / 60) * 10) / 10}h`}
      />
    );
  }
  const map: Record<string, { key: keyof Dashboard["daily"][number]; colorVar: string; unit: string }> = {
    exercise: { key: "exerciseMin", colorVar: "--c-energy", unit: " 分钟" },
    activity: { key: "steps", colorVar: "--c-activity", unit: " 步" },
    cardio: { key: "restingHr", colorVar: "--c-heart", unit: " bpm" },
    nutrition: { key: "waterMl", colorVar: "--c-breath", unit: " ml" },
    stress: { key: "hrvMs", colorVar: "--c-hrv", unit: " ms" },
    desk: { key: "headphoneDb", colorVar: "--c-breath", unit: " dB" },
  };
  const cfg = map[topicKey];
  if (!cfg) return <EmptyBox text="该专题以记录与提醒为主，暂无趋势图" />;
  return (
    <LineChart
      points={d.daily.map((r) => ({ label: r.date.slice(5), value: r[cfg.key] as number | null }))}
      base={baseline(d.daily, cfg.key)}
      unit={cfg.unit}
      colorVar={cfg.colorVar}
      title="趋势"
    />
  );
}

function TopicDetail({
  d,
  def,
  onBack,
}: {
  d: Dashboard;
  def: TopicDef;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const inv = () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  const setting = d.topicSettings.find((t) => t.topic === def.key);
  const [mode, setMode] = useState(setting?.mode ?? "monitor");
  const [tier, setTier] = useState(setting?.tier ?? "基础达标");
  const [msg, setMsg] = useState<{ text: string; warn: boolean } | null>(null);
  const setMut = useMutation({
    mutationFn: () =>
      api.setTopicSetting({ topic: def.key, mode: mode as "active" | "monitor", tier }),
    onSuccess: (r) => {
      if (!r.ok) setMsg({ text: r.error ?? "保存失败", warn: true });
      else {
        setMsg({ text: "已保存。", warn: false });
        inv();
      }
    },
    // 网络/服务端失败：表单原样保留，保存按钮下方红字提示可直接重试。
    onError: () => setMsg({ text: "没能保存，请检查网络后点「保存档位」重试。", warn: true }),
  });
  const travelMut = useMutation({
    mutationFn: (on: boolean) => api.saveSettings({ values: { travel_mode: on ? "1" : "0" } }),
    onMutate: (on) => {
      const prev = patchDashboard(qc, (old) => ({
        ...old,
        settings: { ...old.settings, travel_mode: on ? "1" : "0" },
      }));
      return { prev };
    },
    // 回滚后给可见轻提示（M15），不静默回滚。
    onError: (_e, _v, c) => {
      restoreDashboard(qc, c?.prev);
      toast.show("出差模式没能保存，已恢复到之前的状态，请重试");
    },
  });
  const goals = d.goals.filter((g) => g.topic === def.key);
  const travelOn = d.settings["travel_mode"] === "1";
  const meta = TOPIC_META[def.key];
  const habits = d.habits.filter((h) => h.topic === def.key && h.active);

  return (
    <div>
      <button type="button" className="back-btn" onClick={onBack}>
        <Chev />
        全部专题
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 4px 0" }}>
        {meta && <Sym icon={meta.icon} lg />}
        <h2
          className="page-title"
          style={{ fontSize: 26 }}
        >
          {def.name}
        </h2>
        <span style={{ marginLeft: "auto" }}>
          <Pill tone={setting?.mode === "active" ? "ok" : "neutral"}>
            {setting?.mode === "active" ? "主动改进" : "仅监测"} · {setting?.tier ?? "基础达标"}
          </Pill>
        </span>
      </div>
      {d.profile?.doctorNotes && (
        <div className="warn-strip" style={{ border: "1.5px solid var(--amber)" }}>
          <b>医生叮嘱：</b>
          {d.profile.doctorNotes}
        </div>
      )}
      <Card>
        <TtlHead label="为什么重要" />
        <p style={{ fontSize: 14.5, lineHeight: 1.75, margin: "8px 0 0" }}>{def.why}</p>
      </Card>
      <Card>
        <TtlHead label="关键指标" />
        <p className="src-note">数据截至 {d.latestDate ?? "—"}</p>
        <TopicMetrics d={d} topicKey={def.key} />
      </Card>
      <Card>
        <TtlHead label="参考标准" />
        <ul className="std-list">
          {def.standards.map((s, i) => (
            <li key={i}>
              {s.text}
              <span className="src">—— {s.source}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <TtlHead label="当前档位与阶段目标" />
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ flex: 1, minWidth: 130 }}>
            <span style={{ display: "block", fontSize: 12.5, color: "var(--dim)", marginBottom: 4 }}>
              专题模式
            </span>
            <select
              className="inp"
              aria-label="专题模式"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="active">主动改进</option>
              <option value="monitor">仅监测</option>
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 130 }}>
            <span style={{ display: "block", fontSize: 12.5, color: "var(--dim)", marginBottom: 4 }}>
              当前档位
            </span>
            <select
              className="inp"
              aria-label="当前档位"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="btn sm"
          style={{ marginTop: 12 }}
          onClick={() => setMut.mutate()}
          disabled={setMut.isPending}
        >
          保存档位
        </button>
        {msg && <p className={`save-msg${msg.warn ? " warn" : ""}`}>{msg.text}</p>}
        <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.65, margin: "12px 0 0" }}>
          规则：同时主动改进的专题最多 2 个；连续 4 周中 3 周完成可考虑升档，连续 2 周完成度低于 50% 时系统会建议降档（不批评）；每 4 周复核一次目标。
        </p>
        {def.key === "travel" && (
          <button
            type="button"
            className="btn"
            style={{ marginTop: 14, ...(travelOn ? { background: "var(--amber)" } : {}) }}
            onClick={() => travelMut.mutate(!travelOn)}
          >
            {travelOn ? "结束出差模式" : "开启出差模式"}
          </button>
        )}
        <div style={{ borderTop: "1px solid var(--sep)", marginTop: 16, paddingTop: 4 }}>
          {goals.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--dim)", margin: "10px 0 2px" }}>
              暂无阶段目标草案，可在「计划」页添加。
            </p>
          )}
          {goals.map((g) => (
            <GoalBox key={g.id} d={d} g={g} withTopic />
          ))}
        </div>
      </Card>
      <Card>
        <TtlHead label="本周行动" />
        <div className="chips">
          {def.actions.map((a) => (
            <span key={a} className="chip">
              {a}
            </span>
          ))}
        </div>
        {habits.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--dim)", margin: "6px 0 0" }}>
            暂无习惯打卡项，可在「计划」页添加。
          </p>
        ) : (
          habits.map((hb) => <HabitCheckRow key={hb.id} d={d} hb={hb} />)
        )}
      </Card>
      <Card>
        <TtlHead label="趋势" />
        <TopicTrend d={d} topicKey={def.key} />
      </Card>
      <Card className="note-card">
        <TtlHead label="何时建议咨询医生" />
        <p style={{ fontSize: 14.5, lineHeight: 1.75, margin: "8px 0 0" }}>{def.doctor}</p>
        <p style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.65, margin: "8px 0 0" }}>
          本空间不是医疗工具，不做诊断；出现红旗提示时统一文案为「这个变化建议尽快咨询医生」。
        </p>
      </Card>
    </div>
  );
}

function TopicRow({
  d,
  t,
  onOpen,
}: {
  d: Dashboard;
  t: TopicDef;
  onOpen: (key: string) => void;
}) {
  const ref = useReveal<HTMLButtonElement>();
  const s = d.topicSettings.find((x) => x.topic === t.key);
  const mode = s?.mode ?? "monitor";
  const tier = s?.tier ?? "基础达标";
  const meta = TOPIC_META[t.key];
  const sub =
    t.key === "travel" && d.settings["travel_mode"] === "1"
      ? "出差模式已开启"
      : tier === "数据不足"
        ? "暂无数据，补齐方法见专题内"
        : t.actions.slice(0, 2).join(" · ");
  return (
    <button ref={ref} type="button" className="topic-row" onClick={() => onOpen(t.key)}>
      {meta && <Sym icon={meta.icon} lg />}
      <span className="tt">
        <span className="n">{t.name}</span>
        <span className="s">{sub}</span>
        <br />
        <Pill tone={mode === "active" ? "ok" : "neutral"}>
          {mode === "active" ? "主动改进" : "仅监测"} · {tier}
        </Pill>
      </span>
      <span className="chev">
        <Chev />
      </span>
    </button>
  );
}

export function TopicsSection({
  d,
  sel,
  setSel,
}: {
  d: Dashboard;
  sel: string | null;
  setSel: (k: string | null) => void;
}) {
  const def = TOPICS.find((t) => t.key === sel);
  if (def) {
    return <TopicDetail d={d} def={def} onBack={() => setSel(null)} />;
  }
  const tierOf = (key: string) =>
    d.topicSettings.find((x) => x.topic === key)?.tier ?? "基础达标";
  const modeOf = (key: string) =>
    d.topicSettings.find((x) => x.topic === key)?.mode ?? "monitor";
  const actT = TOPICS.filter((t) => modeOf(t.key) === "active");
  const monT = TOPICS.filter((t) => modeOf(t.key) !== "active" && tierOf(t.key) !== "数据不足");
  const nodT = TOPICS.filter((t) => modeOf(t.key) !== "active" && tierOf(t.key) === "数据不足");
  return (
    <div>
      <div className="page-head">
        <h2 className="page-title" style={{ fontSize: 22 }}>
          专题
          <span className="tail">
            十个专题统一结构：关键指标相对你的个人基线解读，参考标准统一采用国际标准并标注来源机构
          </span>
        </h2>
      </div>
      <p style={{ fontSize: 14, color: "var(--dim)", lineHeight: 1.65, margin: "12px 4px 2px" }}>
        同时主动改进的专题最多 2 个，其余仅监测；没有数据的专题如实标「数据不足」，不标达标。
      </p>
      {actT.length > 0 && (
        <>
          <div className="group-sub">主动改进</div>
          {actT.map((t) => (
            <TopicRow key={t.key} d={d} t={t} onOpen={setSel} />
          ))}
        </>
      )}
      {monT.length > 0 && (
        <>
          <div className="group-sub">仅监测</div>
          {monT.map((t) => (
            <TopicRow key={t.key} d={d} t={t} onOpen={setSel} />
          ))}
        </>
      )}
      {nodT.length > 0 && (
        <details className="more">
          <summary>数据不足（{nodT.length} 个，点击展开）</summary>
          {nodT.map((t) => (
            <TopicRow key={t.key} d={d} t={t} onOpen={setSel} />
          ))}
        </details>
      )}
    </div>
  );
}
