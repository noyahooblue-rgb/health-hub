// 「我的」页（设计版）：iOS 设置式分组列表首页 + 详情视图。
// 档案（建档问卷 / 体检记录 / 数据盘点）与设置（提醒与同步 / 外观与导航 / 目标登记跳转）
// 并入一页；设置即改即存（24 小时制）；导出 JSON/CSV 与清空数据都在「数据与关于」。

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";
import { api } from "./api";
import { BUILD_HASH, UI_VERSION } from "./version";
import { ACCEPT_ITEMS } from "./pages_accept";
import {
GOAL_OPTIONS,
LAB_FIELDS,
bedtimeLongTerm,
bedtimeReminder,
bedtimeStage,
fmt,
patchDashboard,
type Dashboard,
} from "./lib";
import {
Card,
Chev,
Pill,
Switch,
Sym,
TtlHead,
useNav,
type MineView,
} from "./ui";
import { AcceptanceView } from "./pages_accept";

// 表单输入上限一律取自服务端请求 schema（platformVersion 29）：与服务端校验同源，不手写。
const FIELDS = actionFields<typeof Actions>();

function BackBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="back-btn" onClick={onClick}>
      <Chev />
      {label}
    </button>
  );
}

function Row({
  icon,
  label,
  value,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  value?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button type="button" className={`set-row${danger ? " danger" : ""}`} onClick={onClick}>
      <Sym icon={icon} />
      <span>{label}</span>
      {value && <span className="sv">{value}</span>}
      <span className="chev">
        <Chev />
      </span>
    </button>
  );
}

/* ── 建档问卷 ── */
function ProfileForm({ d }: { d: Dashboard }) {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  const p = d.profile;
  const [age, setAge] = useState(p?.age != null ? String(p.age) : "");
  const [sex, setSex] = useState(p?.sex ?? "");
  const [height, setHeight] = useState(p?.heightCm != null ? String(p.heightCm) : "");
  const [work, setWork] = useState(p?.workPattern ?? "");
  const [habit, setHabit] = useState(p?.exerciseHabit ?? "");
  const [doctor, setDoctor] = useState(p?.doctorNotes ?? "");
  const [goalsSel, setGoalsSel] = useState<string[]>(
    [p?.goalPrimary, p?.goalSecondary].filter((v): v is string => !!v),
  );
  const [savedMsg, setSavedMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api.saveProfile({
        age: age.trim() ? Number(age) : null,
        sex: sex.trim() ? sex.trim() : null,
        heightCm: height.trim() ? Number(height) : null,
        workPattern: work.trim() ? work.trim() : null,
        exerciseHabit: habit.trim() ? habit.trim() : null,
        goalPrimary: goalsSel[0] ?? null,
        goalSecondary: goalsSel[1] ?? null,
        doctorNotes: doctor.trim() ? doctor.trim() : null,
      }),
    onSuccess: () => {
      inv();
      setErrMsg("");
      setSavedMsg("已保存。建档完成后，计划页的阶段目标草案即可确认生效，目标会按你的作息重新校准。");
    },
    // 失败时表单原样保留，按钮下方红字提示可直接重试。
    onError: () => setErrMsg("档案没能保存，你填的内容都还在，请检查网络后重试。"),
  });
  const toggleGoal = (g: string) =>
    setGoalsSel((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : prev.length < 2 ? [...prev, g] : prev,
    );
  return (
    <Card>
      <TtlHead label="建档问卷（全部可选填）" />
      <p className="src-note">
        填得越全，目标与建议越贴合；没填的项系统不会臆测。保存即完成建档。
      </p>
      <div className="form-grid">
        <label className="field">
          <span className="fl">年龄</span>
          <input {...FIELDS.saveProfile.age} className="inp" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="例如 32" aria-label="年龄" />
        </label>
        <label className="field">
          <span className="fl">性别</span>
          <input {...FIELDS.saveProfile.sex} className="inp" value={sex} onChange={(e) => setSex(e.target.value)} placeholder="男 / 女" aria-label="性别" />
        </label>
        <label className="field">
          <span className="fl">身高（cm）</span>
          <input {...FIELDS.saveProfile.heightCm} className="inp" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="例如 175" aria-label="身高" />
        </label>
      </div>
      <label className="field">
        <span className="fl">作息规律（工作日/周末、是否夜班）</span>
        <textarea {...FIELDS.saveProfile.workPattern} className="inp" rows={2} value={work} onChange={(e) => setWork(e.target.value)} placeholder="例如：工作日 9:00–18:00，周末晚起 1 小时" aria-label="作息规律" />
      </label>
      <label className="field">
        <span className="fl">当前运动习惯</span>
        <textarea {...FIELDS.saveProfile.exerciseHabit} className="inp" rows={2} value={habit} onChange={(e) => setHabit(e.target.value)} placeholder="例如：每周打羽毛球 1 次，平时走路通勤" aria-label="当前运动习惯" />
      </label>
      <div className="field">
        <span className="fl">主要健康目标（最多选 2 个）</span>
        <div className="goal-opts">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g}
              type="button"
              className={goalsSel.includes(g) ? "on" : ""}
              aria-pressed={goalsSel.includes(g)}
              onClick={() => toggleGoal(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="fl">医生叮嘱（原文照录，可选）</span>
        <textarea {...FIELDS.saveProfile.doctorNotes} className="inp" rows={3} value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="体检或就诊时医生特别叮嘱的事项" aria-label="医生叮嘱" />
      </label>
      <button type="button" className="btn" style={{ marginTop: 14 }} disabled={mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? "保存中…" : "保存档案"}
      </button>
      {savedMsg && <p className="save-msg">{savedMsg}</p>}
      {errMsg && <p className="save-msg warn">{errMsg}</p>}
    </Card>
  );
}

/* ── 体检记录 ── */
function LabsView({ d }: { d: Dashboard }) {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  const [date, setDate] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const addMut = useMutation({
    mutationFn: () =>
      api.addLabReport({
        date,
        payload: Object.fromEntries(
          Object.entries(vals).filter(([, v]) => v.trim() !== ""),
        ),
      }),
    onSuccess: () => {
      inv();
      setVals({});
      setErrMsg("");
      setMsg("体检记录已保存。");
    },
    // 失败时已填数值原样保留，红字提示可直接重试。
    onError: () => setErrMsg("体检记录没能保存，你填的数值都还在，请检查网络后重试。"),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => api.deleteLabReport({ id }),
    onSuccess: inv,
    onError: () => setErrMsg("删除没能完成，请检查网络后重试。"),
  });
  const filled = Object.values(vals).some((v) => v.trim() !== "");
  return (
    <>
      <Card>
        <TtlHead label="录入体检报告" />
        <p className="src-note">全部可选，只填报告里有的项；按日期保存，方便逐年对比。</p>
        <label className="field">
          <span className="fl">体检日期</span>
          <input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} aria-label="体检日期" />
        </label>
        <div className="form-grid">
          {LAB_FIELDS.map((f) => (
            <label key={f} className="field">
              <span className="fl">{f}</span>
              <input
                className="inp"
                value={vals[f] ?? ""}
                onChange={(e) => setVals((prev) => ({ ...prev, [f]: e.target.value }))}
                placeholder="数值"
                aria-label={f}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 14 }}
          disabled={!date || !filled || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          保存体检记录
        </button>
        {msg && <p className="save-msg">{msg}</p>}
        {errMsg && <p className="save-msg warn">{errMsg}</p>}
      </Card>
      <Card>
        <TtlHead label="体检历史（逐年对比）" />
        {d.labs.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--dim)", margin: "8px 0 0" }}>
            尚无体检记录。录入两次以上后，这里会并排对比同项指标的变化。
          </p>
        ) : (
          d.labs.map((l) => (
            <div key={l.id} style={{ padding: "10px 0", borderTop: "1px solid var(--sep)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="num" style={{ fontWeight: 700, color: "var(--ink)" }}>{l.date}</span>
                <span style={{ marginLeft: "auto" }}>
                  <button type="button" className="pill-btn dim" onClick={() => delMut.mutate(l.id)}>
                    删除
                  </button>
                </span>
              </div>
              <div className="lab-chips">
                {Object.entries(l.payload).map(([k, v]) => (
                  <span key={k}>
                    {k}：{v}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

/* ── 数据盘点 ── */
function DataView({ d }: { d: Dashboard }) {
  const present = [
    { name: "步数 / 活动能量 / 锻炼 / 站立", freq: "每日汇总", note: "观察期基线按完整日计算" },
    { name: "睡眠分期与效率", freq: "每晚", note: "含质量分、夜醒次数" },
    { name: "静息心率 / HRV / 血氧", freq: "每日", note: "HRV 为 SDNN 口径" },
    { name: "呼吸频率 / 睡眠腕温 / 步行心率", freq: "每日", note: "腕温看相对基线偏离" },
    { name: "训练记录（类型/心率/热量）", freq: "每次训练", note: "力量训练单独计数" },
    { name: "耳机音量暴露", freq: "每日均值", note: "对照 WHO 安全聆听" },
  ];
  const missing = [
    { name: "体重 / 体脂 / BMI", how: "用可同步的体脂秤，或在体检录入里记体重与腰围" },
    { name: "血压", how: "家用血压计测量后在体检录入保存（收缩/舒张）" },
    { name: "VO2max", how: "戴表户外步行或跑步数次，健康 App 自动估算" },
    { name: "血糖 / 血脂等化验", how: "体检后在「体检记录」录入，按年对比" },
    { name: "心电图 / 房颤与高低心率通知", how: "当前通道读不到，请在 iPhone 健康 App 查看" },
  ];
  return (
    <>
      <Card>
        <TtlHead label="已有数据类型" />
        {present.map((r) => (
          <div className="inv-row" key={r.name}>
            <div>
              <div className="n">{r.name}</div>
              <div className="f">{r.note}</div>
            </div>
            <span style={{ fontSize: 12.5, color: "var(--dim)", whiteSpace: "nowrap" }}>{r.freq}</span>
          </div>
        ))}
      </Card>
      <Card>
        <TtlHead label="暂无数据（附补齐方法）" />
        {missing.map((r) => (
          <div className="inv-row" key={r.name}>
            <div>
              <div className="n">{r.name}</div>
              <div className="f">补齐方法：{r.how}</div>
            </div>
            <Pill tone="warn">暂无数据</Pill>
          </div>
        ))}
      </Card>
      <Card>
        <TtlHead label="数据质量说明" />
        <p style={{ fontSize: 14.5, lineHeight: 1.75, margin: "8px 0 0" }}>
          数据覆盖自 {d.daily[0]?.date ?? "—"} 起；部分同步日数据不完整，已从全部统计中排除（全站同口径）。基线 = 个人均值 ± 1
          个标准差，满 28 天完整数据后转为正式基线，此前称「观察期基线」。
        </p>
      </Card>
    </>
  );
}

/* ── 提醒与同步 ── */
function RemindView({ d }: { d: Dashboard }) {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  const [msg, setMsg] = useState("");
  const [msgWarn, setMsgWarn] = useState(false);
  const msgTimer = useRef<number | undefined>(undefined);
  const [time, setTime] = useState(d.settings["morning_time"] || "07:30");
  useEffect(() => {
    setTime(d.settings["morning_time"] || "07:30");
  }, [d.settings]);
  const showMsg = (text: string, warn: boolean, holdMs: number) => {
    window.clearTimeout(msgTimer.current);
    setMsg(text);
    setMsgWarn(warn);
    msgTimer.current = window.setTimeout(() => setMsg(""), holdMs);
  };
  const save = (values: Record<string, string>, note?: string) => {
    // 开关点击即翻（本地缓存先行），保存异步落盘；失败全量重拉对齐（= 回滚）并红字提示，不再静默。
    patchDashboard(qc, (old) => ({
      ...old,
      settings: { ...old.settings, ...values },
    }));
    showMsg(note ?? "已保存", false, 2200);
    void api.saveSettings({ values }).catch(() => {
      inv();
      showMsg("没能保存，已恢复到之前保存的值，请检查网络后重试", true, 5000);
    });
  };
  const morningOn = d.settings["morning_on"] !== "0";
  const bedOn = d.settings["bedtime_remind_on"] !== "0";
  const travel = d.settings["travel_mode"] === "1";
  return (
    <>
      <Card>
        <TtlHead label="提醒与同步" />
        <div className="switch-row">
          <div className="sl">
            <div className="t">晨间简报</div>
            <div className="n">健康数据每天同步 4 次（07:00、12:00、18:00、22:00），晨间打开即是最新</div>
          </div>
          <Switch on={morningOn} onChange={(v) => save({ morning_on: v ? "1" : "0" })} label="晨间简报开关" />
        </div>
        <label className="field">
          <span className="fl">晨间简报时间（24 小时制）</span>
          <input
            type="text"
            className="inp num"
            value={time}
            inputMode="numeric"
            placeholder="07:30"
            aria-label="晨间简报时间"
            onChange={(e) => setTime(e.target.value)}
            onBlur={() => {
              if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) {
                save({ morning_time: time.trim() });
              } else {
                setTime(d.settings["morning_time"] || "07:30");
                setMsg("时间格式不对，已恢复为上次保存的值");
              }
            }}
          />
        </label>
        <p className="src-note">改完即存，不需要再点保存。</p>
        <div className="switch-row">
          <div className="sl">
            <div className="t">就寝提醒</div>
            <div className="n">
              {bedtimeReminder(d.settings)} 提醒（阶段目标 {bedtimeStage(d.settings)} 前 45 分钟，自动计算）
            </div>
          </div>
          <Switch on={bedOn} onChange={(v) => save({ bedtime_remind_on: v ? "1" : "0" })} label="就寝提醒开关" />
        </div>
        <div className="switch-row">
          <div className="sl">
            <div className="t">出差模式</div>
            <div className="n">开启后只保留睡眠时间窗、步数保底、饮水三项最低目标</div>
          </div>
          <Switch on={travel} onChange={(v) => save({ travel_mode: v ? "1" : "0" })} label="出差模式开关" />
        </div>
        {msg && <p className={`save-msg${msgWarn ? " warn" : ""}`}>{msg}</p>}
      </Card>
      <Card>
        <TtlHead label="就寝目标" />
        <div className="reg-flow">
          <div className="rf">
            <div className="k">长期目标</div>
            <div className="v num">{bedtimeLongTerm(d.settings)}</div>
          </div>
          <div className="arr">→</div>
          <div className="rf">
            <div className="k">阶段目标</div>
            <div className="v num">{bedtimeStage(d.settings)}</div>
          </div>
          <div className="arr-label">提前 45 分钟</div>
          <div className="rf">
            <div className="k">就寝提醒</div>
            <div className="v num">{bedtimeReminder(d.settings)}</div>
          </div>
        </div>
        <p className="src-note" style={{ marginTop: 10 }}>
          这三个时间只在「计划」页修改，这里只展示，避免多处修改互相覆盖。
        </p>
      </Card>
    </>
  );
}

/* ── 外观与导航 ── */
function DisplayView({ d }: { d: Dashboard }) {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  const [msg, setMsg] = useState("");
  const [msgWarn, setMsgWarn] = useState(false);
  const msgTimer = useRef<number | undefined>(undefined);
  const shrink = d.settings["nav_shrink"] !== "0";
  const save = (v: boolean) => {
    patchDashboard(qc, (old) => ({
      ...old,
      settings: { ...old.settings, nav_shrink: v ? "1" : "0" },
    }));
    window.clearTimeout(msgTimer.current);
    setMsg("已保存");
    setMsgWarn(false);
    msgTimer.current = window.setTimeout(() => setMsg(""), 2200);
    void api.saveSettings({ values: { nav_shrink: v ? "1" : "0" } }).catch(() => {
      // 失败：全量重拉对齐（开关回到之前状态）并红字提示，不再静默回滚。
      inv();
      window.clearTimeout(msgTimer.current);
      setMsg("没能保存，已恢复到之前保存的值，请检查网络后重试");
      setMsgWarn(true);
      msgTimer.current = window.setTimeout(() => setMsg(""), 5000);
    });
  };
  return (
    <Card>
      <TtlHead label="外观与导航" />
      <div className="switch-row">
        <div className="sl">
          <div className="t">导航栏自动收窄</div>
          <div className="n">向下滚动时底部导航收成只剩图标，往回滚、停下或打开弹层时展开</div>
        </div>
        <Switch on={shrink} onChange={save} label="导航栏自动收窄开关" />
      </div>
      <p className="src-note">
        本空间固定浅色外观，不跟随系统深色设置（v1.0.2 起）；系统开启「减少动态效果」时导航不收窄。
      </p>
      {msg && <p className={`save-msg${msgWarn ? " warn" : ""}`}>{msg}</p>}
    </Card>
  );
}

/* ── 数据与关于 ── */
function DataAboutView({ d, onAccept }: { d: Dashboard; onAccept: () => void }) {
  const qc = useQueryClient();
  // 错误记录每次进入本页现读（staleTime 0），显示总条数与最近一条时间。
  const errSummary = useQuery({
    queryKey: ["error-summary"],
    queryFn: () => api.getErrorSummary({}),
    staleTime: 0,
  });
  const [exportMsg, setExportMsg] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [clearMsg, setClearMsg] = useState("");
  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const doExport = async (kind: "json" | "csv") => {
    setExportMsg("正在生成…");
    if (kind === "json") {
      const r = await api.exportData({});
      download(r.json, r.filename, "application/json");
    } else {
      const head = "date,steps,activeEnergyKcal,exerciseMin,standMin,restingHr,hrvMs,spo2Pct,respiratoryRate,wristTempC,walkingHr,distanceM,waterMl,headphoneDb";
      const rows = d.daily.map((r) =>
        [
          r.date, r.steps, r.activeEnergyKcal, r.exerciseMin, r.standMin, r.restingHr,
          r.hrvMs, r.spo2Pct, r.respiratoryRate, r.wristTempC, r.walkingHr, r.distanceM,
          r.waterMl, r.headphoneDb,
        ]
          .map((v) => (v == null ? "" : String(v)))
          .join(","),
      );
      download([head, ...rows].join("\n"), "health-daily.csv", "text/csv");
    }
    setExportMsg("已生成下载。如浏览器拦截，请在系统浏览器中打开本页再导出。");
  };
  const clearMut = useMutation({
    mutationFn: () => api.clearAllData({ confirm: true }),
    onSuccess: () => {
      setClearMsg("已清空全部数据。页面将回到初始状态。");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: () => setClearMsg("没能清空，请检查网络后重试。"),
  });
  return (
    <>
      <Card>
        <TtlHead label="导出数据" />
        <p className="src-note">
          导出本空间全部数据（健康序列、档案、打卡、习惯、目标、体检、报告、设置、真机验收记录），文件只保存在你的设备上。
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn sm" onClick={() => void doExport("json")}>
            导出 JSON
          </button>
          <button type="button" className="btn sm plain" onClick={() => void doExport("csv")}>
            导出每日指标 CSV
          </button>
        </div>
        {exportMsg && <p className="save-msg">{exportMsg}</p>}
      </Card>
      <Card>
        <TtlHead label="关于与免责" />
        <div style={{ fontSize: 14.5, lineHeight: 1.8, marginTop: 6 }}>
          <p style={{ margin: "6px 0" }}>
            数据来源：Apple Health（经你授权读取），每天同步 4 次（07:00、12:00、18:00、22:00），也可以点今日页同步徽标立即刷新。所有结论基于个人基线与公开指南（WHO、AASM、AAO、EFSA 等），参考标准旁均标注来源机构。
          </p>
          <p style={{ margin: "6px 0" }}>
            本空间不是医疗工具，不做诊断、不替代医生意见。出现胸痛、晕厥、呼吸困难等情况，请立即就医或拨打当地急救电话。
          </p>
          <p style={{ margin: "6px 0", color: "var(--dim)", fontSize: 13.5 }}>
            已确认的产品决策：打开弹层时底部导航隐藏（2026-11-17）；不做横滑切页签，误触风险大于收益（2026-11-17）；空间图标为「新芽」（2026-11-17）；采用方案 C（一份 React 代码 + 示例数据预览）（2026-11-17）；左缘右滑返回暂缓（与 Muse App 左缘手势冲突风险高、无法完整自动测试，2026-11-18）；本项目代码自 2026-11-18 起存放在 GitHub 仓库 health-hub、只从打标签的提交发布；打卡等按日状态一律按日期键隔离初始值，跨天自动失效、昨日的记录与暂存绝不出现在今天（2026-11-18）；「今日」一律以设备本地日期为准、不以最新数据日为准，同步滞后时打卡、习惯、建议与饮食轻打卡都记在设备今天，打卡表单标题明示所属日期（2026-11-18）；定位重构拍板：页签采用方案 A——今日 / 计划 / 复盘 / 档案 / 我的，「档案」替换「趋势」，页签仍 5 个，本条取代此前「5 页签结构不动」的约定，v2.0 阶段实施（用户对《空间定位重构方案_v1》第 9 节回复「都按推荐」，2026-11-18）；心情记录留在空间的晚间打卡（精力 / 情绪 / 压力 / 标签一次填完），若能读到苹果「心境」当天记录则不再重复问情绪，待第 0 阶段核实（2026-11-18）；体重、血压在苹果健康里记录，空间只读取、不提供录入框（前提是核实能读到，读不到先回报不删）（2026-11-18）；自我实验排进路线图第 4 阶段（v2.3）（2026-11-18）；健康数据同步降频：定时同步由整点改为每天 4 次（07:00 / 12:00 / 18:00 / 22:00），任务计划已于 2026-11-18 生效，观察 2 天后对照 iPhone 读取次数再决定是否收窄数据类型（批复 ks4h7pge，2026-11-18）；配色原则（原型 v3 定版）：颜色代表类别、放在符号 / 标题 / 图表上，数字保持黑色，主色只有一个（新芽绿），不搞中性灰控件底色（2026-11-18）。
          </p>
          <p style={{ margin: "6px 0", color: "var(--dim)", fontSize: 13.5 }}>
            界面版本：{UI_VERSION}（预览版与正式版同版本号） · 构建哈希：{BUILD_HASH}
          </p>
          <p style={{ margin: "6px 0", color: "var(--dim)", fontSize: 13.5 }}>
            {errSummary.data
              ? errSummary.data.count > 0
                ? `错误记录：共 ${errSummary.data.count} 条 · 最近一条 ${
                    errSummary.data.latestAt
                      ? new Date(errSummary.data.latestAt).toLocaleString("zh-CN", { hour12: false })
                      : "—"
                  }（异常会自动记下，供排查时读回）`
                : "错误记录：共 0 条（异常会自动记下，供排查时读回）"
              : "错误记录：读取中…"}
          </p>
        </div>
      </Card>
      <Card>
        <TtlHead label="发布验收" />
        <p className="src-note">
          每次发布后在真机上逐条核对动效与交互（{ACCEPT_ITEMS} 条），结果单独保存、不混入健康数据。
        </p>
        <div className="set-group" style={{ marginTop: 10 }}>
          <Row icon="check" label="真机验收" value={`${ACCEPT_ITEMS} 条`} onClick={onAccept} />
        </div>
      </Card>
      <Card className="flag-card">
        <TtlHead label="清空数据（危险操作）" />
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: "8px 0 0" }}>
          清空本空间全部数据：健康序列、档案、打卡、习惯、目标、体检与报告都会删除，不可恢复。建议先导出一份备份。
        </p>
        <label className="field">
          <span className="fl">输入「清空」二字确认</span>
          <input
            className="inp"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="清空"
            aria-label="清空确认输入"
          />
        </label>
        <button
          type="button"
          className="btn danger"
          style={{ marginTop: 12 }}
          disabled={confirmText.trim() !== "清空" || clearMut.isPending}
          onClick={() => clearMut.mutate()}
        >
          清空全部数据
        </button>
        {clearMsg && <p className="save-msg warn">{clearMsg}</p>}
      </Card>
    </>
  );
}

export function MinePage({ d, view, setView }: { d: Dashboard; view: MineView; setView: (v: MineView) => void }) {
  const nav = useNav();
  const p = d.profile;
  const profileSummary = p
    ? [p.age ? `${p.age} 岁` : null, p.sex, p.heightCm ? `${fmt(p.heightCm)} cm` : null, p.goalPrimary]
        .filter(Boolean)
        .join(" · ") || "已建档"
    : "尚未建档 · 点此填写问卷";
  const back = () => setView("home");

  if (view === "profile") {
    return (
      <div>
        <BackBtn onClick={back} label="我的" />
        <ProfileForm d={d} />
      </div>
    );
  }
  if (view === "labs") {
    return (
      <div>
        <BackBtn onClick={back} label="我的" />
        <LabsView d={d} />
      </div>
    );
  }
  if (view === "data") {
    return (
      <div>
        <BackBtn onClick={back} label="我的" />
        <DataView d={d} />
      </div>
    );
  }
  if (view === "remind") {
    return (
      <div>
        <BackBtn onClick={back} label="我的" />
        <RemindView d={d} />
      </div>
    );
  }
  if (view === "display") {
    return (
      <div>
        <BackBtn onClick={back} label="我的" />
        <DisplayView d={d} />
      </div>
    );
  }
  if (view === "about") {
    return (
      <div>
        <BackBtn onClick={back} label="我的" />
        <DataAboutView d={d} onAccept={() => setView("accept")} />
      </div>
    );
  }
  if (view === "accept") {
    return (
      <div>
        <BackBtn onClick={() => setView("about")} label="关于与免责" />
        <AcceptanceView />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">
          我的
          <span className="tail">档案、设置与数据都在这里，点一行进入详情</span>
        </h1>
      </div>
      <button type="button" className="set-head" onClick={() => setView("profile")}>
        <span className="avatar">健</span>
        <span>
          <span className="sn">个人健康档案</span>
          <span className="ss">{profileSummary}</span>
        </span>
        <span className="chev">
          <Chev />
        </span>
      </button>

      <div className="group-label">档案</div>
      <div className="set-group">
        <Row icon="person" label="建档问卷" value={p ? "已完成" : "未完成"} onClick={() => setView("profile")} />
        <Row icon="clipboard" label="体检记录" value={d.labs.length ? `${d.labs.length} 次` : "未录入"} onClick={() => setView("labs")} />
        <Row icon="database" label="数据来源与盘点" value={`${d.daily.length} 天数据`} onClick={() => setView("data")} />
      </div>

      <div className="group-label">设置</div>
      <div className="set-group">
        <Row icon="bell" label="提醒与同步" value="每天 4 次" onClick={() => setView("remind")} />
        <Row icon="eye" label="外观与导航" value={d.settings["nav_shrink"] === "0" ? "不收窄" : "自动收窄"} onClick={() => setView("display")} />
        <Row icon="target" label="目标登记" value={`阶段 ${bedtimeStage(d.settings)}`} onClick={() => nav.goTab("plan")} />
      </div>

      <div className="group-label">数据与关于</div>
      <div className="set-group">
        <Row icon="download" label="导出数据" onClick={() => setView("about")} />
        <Row icon="info" label="关于与免责" onClick={() => setView("about")} />
        <Row icon="trash" label="清空数据" danger onClick={() => setView("about")} />
      </div>

      <footer className="foot-note">
        数据来自 Apple Health，经你授权读取；本空间的结论基于个人基线与公开指南，不替代医生意见。
      </footer>
    </div>
  );
}
