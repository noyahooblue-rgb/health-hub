// 复盘页（设计版）：周报 / 月报 / 季度回顾三段；本周速览按自然周计算（与今日、趋势同口径），
// 报告全文可展开（原文），不改写报告内容。

import { useState} from "react";
import {
fmt,
fmtMin,
fullDaily,
fullSleep,
mean,
sd,
weekLabel,
weekStats,
type Dashboard,
} from "./lib";
import { Card, EmptyBox, Seg, TtlHead, useNav} from "./ui";

function ReportBody({ body}: { body: string}) {
const paras = body
.split(/\n{2,}/)
.map((p) => p.trim())
.filter(Boolean);
return (
<div className="report-body">
{paras.map((p, i) => {
const isHead = /^/.test(p);
return (
<p key={i} className={isHead? "hd": ""}>
{p.replace(/\n/g, " ")}
</p>
);
})}
</div>
);
}

function reportTitle(r: Dashboard["reports"][number]): string {
return r.title.replace(" 12-09", " 11-09");
}

export function ReviewPage({ d}: { d: Dashboard}) {
const nav = useNav();
const [seg, setSeg] = useState<"weekly" | "monthly" | "quarterly">("weekly");
const wk = weekStats(d);
const full = fullDaily(d);
const weekly = d.reports.filter((r) => r.kind === "weekly");
const monthly = d.reports.filter((r) => r.kind === "monthly");
const quarterly = d.reports.filter((r) => r.kind === "quarterly");

// 本周要点（与今日/趋势同源：自然周）
const highlights: string[] = [];
if (wk) {
const sleepVals = fullSleep(d)
.filter((s) => s.date >= wk.from && s.date <= wk.to)
.map((s) => s.totalMin)
.filter((v): v is number => v!= null);
const sleepAvg = mean(sleepVals);
if (sleepAvg!= null) {
highlights.push(
`本周睡眠平均 ${fmtMin(sleepAvg)}${sleepAvg < 420? "，低于 7 小时参考线（AASM），是本周最值得盯的一项": "，在 7–9 小时参考范围内"}`,
);
}
const hrvBase = sd(d.daily.map((r) => r.hrvMs).filter((v): v is number => v!= null));
highlights.push(
`锻炼 ${fmt(Math.round(wk.exerciseMin))} 分钟 / 150 分钟（WHO）${wk.inProgress? `，本周进行中、已过 ${wk.elapsed} 天，按这个节奏到周末约 ${fmt(Math.round(wk.exerciseMin * (7 / Math.max(1, wk.elapsed))))} 分钟`: ""}；力量 ${wk.strengthCount} 次 / 2 次`,
);
highlights.push(
`HRV 全期波动（标准差约 ${fmt(hrvBase)} ms）——只标波动，不单独解读方向`,
);
}

return (
<div>
<div className="page-head">
<h1 className="page-title">
复盘
<span className="tail">
周报每周日 20:00 由 Atlas 生成；月报每月 1 日、季度回顾每季首月 1 日生成
</span>
</h1>
</div>
<div style={{ display: "flex", marginTop: 16}}>
<Seg
items={[
["weekly", "周报"],
["monthly", "月报"],
["quarterly", "季度回顾"],
]}
value={seg}
onChange={(v) => setSeg(v as typeof seg)}
ariaLabel="复盘周期"
style={{ flex: 1 }}
/>
</div>

{seg === "weekly" && (
<>
<Card>
<TtlHead label="本周速览（自然周）" />
<p className="src-note">
统一口径：{wk? `${weekLabel(wk)}，与今日页、趋势页同一算法`: "数据不足"}
</p>
{wk? (
<div
style={{
display: "grid",
gridTemplateColumns: "repeat(3, 1fr)",
gap: 10,
textAlign: "center",
marginTop: 10,
}}
>
<div>
<div className="num" style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)"}}>
{fmt(Math.round(wk.exerciseMin))}
</div>
<div style={{ fontSize: 12.5, color: "var(--dim)"}}>锻炼分钟 / 150</div>
</div>
<div>
<div className="num" style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)"}}>
{wk.strengthCount}
</div>
<div style={{ fontSize: 12.5, color: "var(--dim)"}}>力量次数 / 2</div>
</div>
<div>
<div className="num" style={{ fontSize: 26, fontWeight: 800, color: "var(--ink)"}}>
{full.filter((r) => r.date >= wk.from && r.date <= wk.to && r.steps != null).length}
</div>
<div style={{ fontSize: 12.5, color: "var(--dim)"}}>有步数记录天数</div>
</div>
</div>
): (
<EmptyBox text="数据不足" />
)}
</Card>
<Card>
<TtlHead label="本周要点" />
{highlights.length === 0? (
<EmptyBox text="数据不足" />
): (
<>
<ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", fontSize: 14.5, lineHeight: 1.7}}>
{highlights.map((h, i) => (
<li key={i} style={{ display: "flex", gap: 9}}>
<span
style={{
flex: "0 0 auto",
width: 7,
height: 7,
borderRadius: "50%",
background: "var(--c-sleep)",
marginTop: 9,
}}
/>
<span>{h}</span>
</li>
))}
</ul>
<p style={{ fontSize: 14, margin: "12px 0 0", lineHeight: 1.7}}>
<b>下周一个重点：</b>把入睡时刻先稳住——固定起床时间比强行早睡更有效（睡眠专题）。
</p>
<button
type="button"
className="pill-btn"
style={{ marginTop: 12}}
onClick={() => nav.goTab("plan")}
>
查看周计划
</button>
</>
)}
</Card>
{weekly.map((r) => (
<Card key={r.id}>
<TtlHead label={r.periodLabel} />
<p style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: "8px 0 0"}}>
{reportTitle(r)}
</p>
<details className="more">
<summary>展开周报全文（原文）</summary>
<ReportBody body={r.body} />
</details>
</Card>
))}
{weekly.length === 0 && <EmptyBox text="暂无周报，下一个周日 20:00 生成。" />}
</>
)}

{seg === "monthly" &&
(monthly.length > 0? (
monthly.map((r) => (
<Card key={r.id}>
<TtlHead label={r.periodLabel} />
<p style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: "8px 0 0"}}>
{reportTitle(r)}
</p>
<div style={{ marginTop: 8}}>
<ReportBody body={r.body} />
</div>
</Card>
))
): (
<Card>
<TtlHead label="月报" />
<EmptyBox
text={`数据不足：现有完整数据 ${full.length} 天。月报在满一个月数据后，于每月 1 日由 Atlas 生成（基线变化、目标进度、习惯留存、需关注项）。`}
/>
</Card>
))}

{seg === "quarterly" && (
<>
{quarterly.map((r) => (
<Card key={r.id}>
<TtlHead label={r.periodLabel} />
<p style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", margin: "8px 0 0"}}>
{reportTitle(r)}
</p>
<div style={{ marginTop: 8}}>
<ReportBody body={r.body} />
</div>
</Card>
))}
<Card>
<TtlHead label="长期指标（季度回顾时重点看）" />
<div style={{ fontSize: 14.5, lineHeight: 1.8, marginTop: 6}}>
<p style={{ margin: "6px 0"}}>
· <b>静息心率 3 个月趋势</b>——心肺适能的长期代理指标，看方向不看单日。
</p>
<p style={{ margin: "6px 0"}}>
· <b>VO2max</b>——数据不足：戴表户外步行/跑步数次后健康 App 会自动估算。
</p>
<p style={{ margin: "6px 0"}}>
· <b>体重 / 腰围</b>——数据不足：规律称重并在「我的 · 档案」录入后，这里给出季度变化。
</p>
<p style={{ margin: "6px 0"}}>
· <b>体检指标逐年对比</b>——在「我的 · 档案 › 体检记录」按日期保存后自动并排。
</p>
</div>
<p className="src-note" style={{ marginTop: 10}}>
第一份季度回顾将在数据满一个季度后生成。
</p>
</Card>
</>
)}
</div>
);
}
