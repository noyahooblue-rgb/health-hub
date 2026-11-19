// 计划页（设计版）：顶部分段「目标与计划 / 专题」；唯一目标登记卡（长期→阶段→提醒自动算）、
// 阶段目标（草案确认在建档完成前置灰）、每周计划（7 天胶囊 + 弹层编辑）、习惯（进行中最多 3 个 + 已暂停区）。

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";
import { api } from "./api";
import {
TOPICS,
bedtimeLongTerm,
bedtimeReminder,
bedtimeStage,
TOPIC_MAP,
patchDashboard,
restoreDashboard,
type Dashboard,
} from "./lib";
import { Card, Seg, TtlHead, useNav, useSheet, useToast } from "./ui";
import { HabitCheckRow, useHabitMenu } from "./habits";
import { GoalBox } from "./goals";
import { TopicsSection } from "./pages_topics";

// 表单输入上限一律取自服务端请求 schema（platformVersion 29）：与服务端校验同源，不手写。
const FIELDS = actionFields<typeof Actions>();

const WD = ["一", "二", "三", "四", "五", "六", "日"];
const KINDS = ["力量", "有氧", "轻活动", "灵活", "休息"];
const KIND_DOT: Record<string, string> = {
  力量: "var(--c-heart)",
  有氧: "var(--c-activity)",
  轻活动: "var(--c-mint)",
  灵活: "var(--bar-mid)",
  休息: "var(--track)",
};

export function PlanPage({
  d,
  sub,
  setSub,
  topicSel,
  setTopicSel,
}: {
  d: Dashboard;
  sub: "goals" | "topics";
  setSub: (v: "goals" | "topics") => void;
  topicSel: string | null;
  setTopicSel: (k: string | null) => void;
}) {
  const nav = useNav();
  const sheet = useSheet();
  const toast = useToast();
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["dashboard"] });
  const profileDone = d.profile != null;

  const longTerm = bedtimeLongTerm(d.settings);
  const stage = bedtimeStage(d.settings);
  const remind = bedtimeReminder(d.settings);
  const [regLong, setRegLong] = useState(longTerm);
  const [regStage, setRegStage] = useState(stage);
  const [regMsg, setRegMsg] = useState("");
  const regMut = useMutation({
    mutationFn: () =>
      api.saveSettings({ values: { bedtime_target: regLong, bedtime_stage_target: regStage } }),
    onSuccess: () => {
      patchDashboard(qc, (old) => ({
        ...old,
        settings: {
          ...old.settings,
          bedtime_target: regLong,
          bedtime_stage_target: regStage,
        },
      }));
      setRegMsg("已保存，三个时间全站同步（今日建议、睡眠专题、提醒设置都会用新时间）。");
    },
    // 弹层保持打开、输入原样保留：轻提示告知未保存，可直接再点「保存」重试。
    onError: () => toast.show("就寝目标没能保存，请再点一次「保存」重试"),
  });
  const openRegistry = () => {
    setRegLong(longTerm);
    setRegStage(stage);
    setRegMsg("");
    sheet.open(
      <div>
        <h3>修改就寝目标</h3>
        <p style={{ fontSize: 13.5, color: "var(--dim)", lineHeight: 1.65, margin: 0 }}>
          长期目标与当前阶段目标都在这里改；就寝提醒时间 = 阶段目标 − 45 分钟，自动计算，不用单独设。
        </p>
        <label className="field">
          <span className="fl">长期目标（就寝）</span>
          <input
            type="time"
            className="inp"
            value={regLong}
            onChange={(e) => setRegLong(e.target.value)}
            aria-label="长期目标就寝时间"
          />
        </label>
        <label className="field">
          <span className="fl">阶段目标（就寝）</span>
          <input
            type="time"
            className="inp"
            value={regStage}
            onChange={(e) => setRegStage(e.target.value)}
            aria-label="阶段目标就寝时间"
          />
        </label>
        <p style={{ fontSize: 13, color: "var(--dim)", margin: "10px 0 0" }}>
          就寝提醒：
          {bedtimeReminder({ ...d.settings, bedtime_stage_target: regStage })}
          （阶段目标前 45 分钟）
        </p>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 12 }}
          disabled={regMut.isPending}
          onClick={() => regMut.mutate()}
        >
          保存
        </button>
        {regMsg && <p className="save-msg">{regMsg}</p>}
      </div>,
    );
  };
  const openHowItWorks = () => {
    sheet.open(
      <div>
        <h3>三层目标是怎么运作的</h3>
        <div style={{ fontSize: 14.5, lineHeight: 1.75 }}>
          <p style={{ margin: "6px 0" }}>
            <b>长期目标</b>是最终想稳定做到的时间（就寝 {longTerm}）；<b>阶段目标</b>是这 4
            周先够得着的一档（{stage}），达成了再往前挪一档；<b>就寝提醒</b> = 阶段目标前 45
            分钟自动算出（{remind}），不用单独设。
          </p>
          <p style={{ margin: "6px 0" }}>
            <b>在哪里改：</b>只在「计划」页的就寝目标卡里改，今日建议、睡眠专题和「我的 ›
            设置 › 提醒」都按这里的时间来，不会再出现三个地方三个值。
          </p>
          <p style={{ margin: "6px 0" }}>
            <b>为什么不一步到位：</b>你最近一周入睡时刻波动很大，一次性提前一个多小时很难坚持；先把阶段目标做到连续
            2 周，再提前 15–30 分钟。
          </p>
          <p style={{ margin: "6px 0" }}>
            <b>阶段目标由你确认：</b>系统只给草案，你点「确认生效」后才算数，草案会一直保留到你确认或改掉它。
          </p>
        </div>
      </div>,
    );
  };

  // 阶段目标
  const drafts = d.goals.filter((g) => g.status === "draft");
  const actives = d.goals.filter((g) => g.status === "active" || g.status === "paused");
  const dones = d.goals.filter((g) => g.status === "done");
  const [gTopic, setGTopic] = useState("sleep");
  const [gTitle, setGTitle] = useState("");
  const [gDetail, setGDetail] = useState("");
  const goalMut = useMutation({
    mutationFn: () =>
      api.addGoal({
        topic: gTopic,
        title: gTitle.trim(),
        detail: gDetail.trim() ? gDetail.trim() : null,
        tier: d.topicSettings.find((t) => t.topic === gTopic)?.tier ?? "基础达标",
      }),
    onSuccess: () => {
      inv();
      setGTitle("");
      setGDetail("");
    },
    // 失败时标题/说明原样保留（表单状态未清），轻提示告知未保存可重试。
    onError: () => toast.show("目标草案没能保存，你填的内容都还在，请重试"),
  });

  // 每周计划
  const [selDay, setSelDay] = useState(1);
  const planMut = useMutation({
    mutationFn: (days: Dashboard["weeklyPlan"]) => api.saveWeeklyPlan({ days }),
    // 弹层保存后立即反映到胶囊与详情，不等全量重拉。
    onMutate: (days) => {
      const prev = patchDashboard(qc, (old) => ({ ...old, weeklyPlan: days }));
      return { prev };
    },
    // 回滚后给可见轻提示（M15），不静默回滚。
    onError: (_e, _v, c) => {
      restoreDashboard(qc, c?.prev);
      toast.show("每周计划没能保存，已恢复到之前的状态，请重试");
    },
  });
  const openDayEditor = (wd: number) => {
    const cur = d.weeklyPlan.find((p) => p.weekday === wd);
    let kind = cur?.kind ?? "灵活";
    let label = cur?.label ?? "";
    sheet.open(
      <div>
        <h3>周{WD[wd - 1]} · 计划</h3>
        <label className="field">
          <span className="fl">类型</span>
          <select
            className="inp"
            defaultValue={kind}
            aria-label="计划类型"
            onChange={(e) => {
              kind = e.target.value;
            }}
          >
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="fl">说明（时间窗、时长，可选）</span>
          <input
            {...FIELDS.saveWeeklyPlan.days.label}
            type="text"
            className="inp"
            defaultValue={label}
            placeholder="例如：晚上 20:00–21:00，30 分钟"
            aria-label="计划说明"
            onChange={(e) => {
              label = e.target.value;
            }}
          />
        </label>
        <p style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.6 }}>
          力量训练日与有氧日尽量错开（WHO 参考）。改完保存即生效。
        </p>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            const days = d.weeklyPlan.map((p) =>
              p.weekday === wd
                ? { ...p, kind, label: label.trim() ? label.trim() : null }
                : p,
            );
            planMut.mutate(days);
            sheet.close();
          }}
        >
          保存
        </button>
      </div>,
    );
  };
  const selPlan = d.weeklyPlan.find((p) => p.weekday === selDay);
  const strengthDays = d.weeklyPlan.filter((p) => p.kind === "力量").length;

  // 习惯
  const openMenu = useHabitMenu(d);
  const actH = d.habits.filter((h) => h.active);
  const pauH = d.habits.filter((h) => !h.active);
  const [hTopic, setHTopic] = useState("sleep");
  const [hName, setHName] = useState("");
  const [hMin, setHMin] = useState("");
  const [hMsg, setHMsg] = useState("");
  const habitMut = useMutation({
    mutationFn: () =>
      api.addHabit({ topic: hTopic, name: hName.trim(), minVersion: hMin.trim() || null }),
    onSuccess: (r) => {
      inv();
      setHName("");
      setHMin("");
      setHMsg(
        r.active
          ? "已添加并开始进行。"
          : "进行中的习惯已满 3 个，这个习惯先放入「已暂停」，等有空位再恢复。",
      );
    },
    // 失败时名称/最低版本原样保留（表单状态未清），轻提示告知未保存可重试。
    onError: () => toast.show("新习惯没能保存，你填的内容都还在，请重试"),
  });

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">
          计划
          <span className="tail">目标登记、阶段目标、每周计划与习惯都在这里；专题从这里进入</span>
        </h1>
      </div>
      <div style={{ display: "flex", marginTop: 16 }}>
        <Seg
          items={[
            ["goals", "目标与计划"],
            ["topics", "专题"],
          ]}
          value={sub}
          onChange={(v) => setSub(v as "goals" | "topics")}
          ariaLabel="计划页分段"
          style={{ flex: 1 }}
        />
      </div>

      {sub === "topics" ? (
        <TopicsSection d={d} sel={topicSel} setSel={setTopicSel} />
      ) : (
        <>
          {!profileDone && (
            <div className="warn-strip">
              <b>建档还没完成：</b>阶段目标草案的「确认生效」暂时置灰，先在「我的 ›
              建档问卷」完成建档，目标会按你的作息重新校准。
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn sm" onClick={() => nav.openMine("profile")}>
                  去建档
                </button>
              </div>
            </div>
          )}

          <Card>
            <TtlHead label="就寝目标" />
            <div className="reg-flow">
              <div className="rf">
                <div className="k">长期目标</div>
                <div className="v num">{longTerm}</div>
              </div>
              <div className="arr">→</div>
              <div className="rf">
                <div className="k">阶段目标</div>
                <div className="v num">{stage}</div>
              </div>
              <div className="arr-label">提前 45 分钟</div>
              <div className="rf">
                <div className="k">就寝提醒</div>
                <div className="v num">{remind}</div>
              </div>
            </div>
            <p className="src-note" style={{ marginTop: 12 }}>
              就寝提醒在阶段目标前 45 分钟，自动算好；今日建议、睡眠专题和提醒设置都按这里的时间来。
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button type="button" className="pill-btn" onClick={openHowItWorks}>
                三层目标是怎么运作的
              </button>
              <button type="button" className="pill-btn dim" onClick={openRegistry}>
                修改目标
              </button>
            </div>
          </Card>

          <Card>
            <TtlHead label="阶段目标" />
            <p className="src-note">
              草案由系统按你的数据生成（具体、可量化、有期限），确认后生效；观察期内先完成建档，目标会重新校准
            </p>
            {drafts.length === 0 && actives.length === 0 && (
              <p style={{ fontSize: 14, color: "var(--dim)", margin: "10px 0 0" }}>
                暂无阶段目标，可在下方添加自己的目标草案。
              </p>
            )}
            {drafts.map((g) => (
              <GoalBox key={g.id} d={d} g={g} />
            ))}
            {actives.map((g) => (
              <GoalBox key={g.id} d={d} g={g} />
            ))}
            {dones.length > 0 && (
              <details className="more">
                <summary>已完成的目标（{dones.length}）</summary>
                {dones.map((g) => (
                  <GoalBox key={g.id} d={d} g={g} />
                ))}
              </details>
            )}
            <details className="more">
              <summary>添加阶段目标草案</summary>
              <label className="field">
                <span className="fl">专题</span>
                <select
                  className="inp"
                  value={gTopic}
                  onChange={(e) => setGTopic(e.target.value)}
                  aria-label="目标专题"
                >
                  {TOPICS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="fl">目标（具体、可量化、有期限）</span>
                <input
                  {...FIELDS.addGoal.title}
                  className="inp"
                  value={gTitle}
                  onChange={(e) => setGTitle(e.target.value)}
                  placeholder={`例如：4 周内平均入睡在 ${stage} 之前`}
                  aria-label="目标标题"
                />
              </label>
              <label className="field">
                <span className="fl">说明（可选）</span>
                <input
                  {...FIELDS.addGoal.detail}
                  className="inp"
                  value={gDetail}
                  onChange={(e) => setGDetail(e.target.value)}
                  placeholder="判定标准与备注"
                  aria-label="目标说明"
                />
              </label>
              <button
                type="button"
                className="btn sm"
                style={{ marginTop: 12 }}
                disabled={!gTitle.trim() || goalMut.isPending}
                onClick={() => goalMut.mutate()}
              >
                保存为草案
              </button>
            </details>
          </Card>

          <Card>
            <TtlHead label="每周计划" />
            <p className="src-note">
              按 WHO 参考排布：力量 2 天、有氧 2 天、轻活动与休息穿插；点某一天查看或编辑
            </p>
            <div className="daycaps" role="tablist" aria-label="每周计划">
              {d.weeklyPlan.map((p) => (
                <button
                  key={p.weekday}
                  type="button"
                  role="tab"
                  aria-selected={selDay === p.weekday}
                  className={selDay === p.weekday ? "on" : ""}
                  onClick={() => setSelDay(p.weekday)}
                >
                  周{WD[p.weekday - 1]}
                  <i
                    style={{
                      background:
                        selDay === p.weekday
                          ? "#fff"
                          : (KIND_DOT[p.kind] ?? "var(--bar-mid)"),
                    }}
                  />
                </button>
              ))}
            </div>
            {selPlan && (
              <div style={{ borderTop: "1px solid var(--sep)", marginTop: 14, paddingTop: 12 }}>
                <p style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
                  周{WD[selPlan.weekday - 1]} · {selPlan.kind}
                </p>
                <p
                  style={{ fontSize: 13.5, color: "var(--dim)", margin: "4px 0 0", lineHeight: 1.6 }}
                >
                  {selPlan.label ?? "未填写说明"}
                </p>
                <button
                  type="button"
                  className="pill-btn dim"
                  style={{ marginTop: 10 }}
                  onClick={() => openDayEditor(selPlan.weekday)}
                >
                  编辑这一天
                </button>
              </div>
            )}
            {strengthDays < 2 && (
              <p className="src-note" style={{ marginTop: 10 }}>
                提示：当前力量训练只有 {strengthDays} 天，低于 WHO 建议的每周 2 次，可把某天改成力量日。
              </p>
            )}
          </Card>

          <Card>
            <TtlHead label="习惯（进行中最多 3 个）" />
            <p className="src-note">
              每个习惯都有「最低版本」：状态差的日子做最低版本也算完成；习惯行右侧按钮可暂停
            </p>
            {actH.length === 0 && (
              <p style={{ fontSize: 14, color: "var(--dim)", margin: "10px 0 0" }}>
                暂无进行中的习惯，可在下方添加（最多同时进行 3 个）。
              </p>
            )}
            {actH.map((hb) => (
              <HabitCheckRow key={hb.id} d={d} hb={hb} showMenu />
            ))}
            {pauH.length > 0 && (
              <>
                <div className="group-sub" style={{ margin: "16px 0 2px" }}>
                  已暂停
                </div>
                {pauH.map((hb) => (
                  <div className="check-row" key={hb.id}>
                    <div className="ct" style={{ flex: 1 }}>
                      <div className="t">{hb.name}</div>
                      <div className="n">
                        {TOPIC_MAP[hb.topic]?.name ?? hb.topic} · 已暂停，打卡记录保留
                      </div>
                    </div>
                    <button type="button" className="pill-btn" onClick={() => openMenu(hb)}>
                      恢复…
                    </button>
                  </div>
                ))}
              </>
            )}
            <details className="more">
              <summary>添加习惯</summary>
              <label className="field">
                <span className="fl">专题</span>
                <select
                  className="inp"
                  value={hTopic}
                  onChange={(e) => setHTopic(e.target.value)}
                  aria-label="习惯专题"
                >
                  {TOPICS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="fl">习惯名称</span>
                <input
                  {...FIELDS.addHabit.name}
                  className="inp"
                  value={hName}
                  onChange={(e) => setHName(e.target.value)}
                  placeholder="例如：睡前 30 分钟放下屏幕"
                  aria-label="习惯名称"
                />
              </label>
              <label className="field">
                <span className="fl">最低版本（状态差时做到什么程度也算完成）</span>
                <input
                  {...FIELDS.addHabit.minVersion}
                  className="inp"
                  value={hMin}
                  onChange={(e) => setHMin(e.target.value)}
                  placeholder="例如：哪怕只提前 5 分钟"
                  aria-label="习惯最低版本"
                />
              </label>
              <button
                type="button"
                className="btn sm"
                style={{ marginTop: 12 }}
                disabled={!hName.trim() || habitMut.isPending}
                onClick={() => habitMut.mutate()}
              >
                添加习惯
              </button>
              {hMsg && <p className="save-msg">{hMsg}</p>}
            </details>
          </Card>

          <p className="src-note" style={{ padding: "0 4px" }}>
            当前阶段目标入睡 {stage}，登记提醒 {remind}
            {d.settings["bedtime_remind_on"] === "1" ? "，提醒已开启" : "，提醒已关闭"}。
          </p>
        </>
      )}
    </div>
  );
}
