// 今日页（设计版）：日期行 + 可点同步状态 / 红旗 / 恢复结论横幅（观察期只看信号）/
// 活动进度 / 昨晚睡眠 / 今天做这几件（进行中习惯 + 最多 1 条建议）/ 每日打卡（评分 + 生活标签）。

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
  LIFE_TAGS,
  asOfLabel,
  fmt,
  fmtMin,
  fullDaily,
  mean,
  patchDashboard,
  recovery,
  redFlags,
  restoreDashboard,
  suggestions,
  syncStaleness,
  todayStr,
  weekLabel,
  weekStats,
  type Dashboard,
} from "./lib";
import {
  Card,
  CatTopicBtn,
  CountUp,
  EmptyBox,
  MRow,
  Pill,
  TtlHead,
  useToast,
} from "./ui";
import { HabitCheckRow } from "./habits";

const STAGE_PARTS = [
  { label: "深睡", key: "deepMin", color: "var(--stage-deep)" },
  { label: "核心", key: "coreMin", color: "var(--stage-core)" },
  { label: "REM", key: "remMin", color: "var(--stage-rem)" },
  { label: "清醒", key: "awakeMin", color: "var(--stage-awake)" },
] as const;

function StageBar({ s }: { s: Dashboard["sleep"][number] }) {
  const parts = STAGE_PARTS.map((p) => ({
    ...p,
    min: s[p.key] as number | null,
  })).filter((p) => p.min != null && p.min > 0);
  const total = parts.reduce((a, p) => a + (p.min ?? 0), 0);
  if (total === 0) return null;
  return (
    <>
      <div className="stagebar" role="img" aria-label="昨夜睡眠结构">
        {parts.map((p) => (
          <div
            key={p.label}
            style={{ "--w": `${((p.min ?? 0) / total) * 100}%`, background: p.color } as CSSProperties}
          />
        ))}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <b>{fmtMin(p.min)}</b>
          </span>
        ))}
      </div>
    </>
  );
}

const RATE_DEFS = [
  { key: "energy", label: "精力", anchors: ["很累", "充沛"] },
  { key: "mood", label: "情绪", anchors: ["低落", "愉快"] },
  { key: "stress", label: "压力", anchors: ["很放松", "很紧绷"] },
] as const;

type RateKey = (typeof RATE_DEFS)[number]["key"];

export function TodayPage({ d }: { d: Dashboard }) {
  const qc = useQueryClient();
  const toast = useToast();
  const latest = d.latestDate;
  const today = d.daily[d.daily.length - 1];
  const lastNight = d.sleep[d.sleep.length - 1];
  const rec = recovery(d);
  const flags = redFlags(d);
  const sugg = suggestions(d);
  const wk = weekStats(d);
  const full = fullDaily(d);
  const inObs = full.length < 14;
  const travel = d.settings["travel_mode"] === "1";
  // 实际最近同步时间（服务端 saveHealthData 落盘）；尚无记录时回退到晨间时间设置。
  const syncHhmm = d.sync.lastHhmm ?? (d.settings["morning_time"] || "07:30");

  const existing = d.checkins.find((c) => c.date === (latest ?? todayStr()));
  const [energy, setEnergy] = useState(0);
  const [mood, setMood] = useState(0);
  const [stress, setStress] = useState(0);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [savedMsg, setSavedMsg] = useState("");
  const [savedWarn, setSavedWarn] = useState(false);
  useEffect(() => {
    if (existing) {
      setEnergy(existing.energy);
      setMood(existing.mood);
      setStress(existing.stress);
      setNote(existing.note ?? "");
      setTags(existing.tags);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.date]);

  const checkinMut = useMutation({
    mutationFn: () =>
      api.saveCheckin({
        date: latest ?? todayStr(),
        energy,
        mood,
        stress,
        note: note.trim() ? note.trim() : null,
        tags,
      }),
    onSuccess: (r) => {
      // 只把刚保存的打卡并入本地缓存，不再全量重拉整个 dashboard。
      const date = latest ?? todayStr();
      patchDashboard(qc, (old) => {
        const entry = {
          date,
          energy,
          mood,
          stress,
          note: note.trim() ? note.trim() : null,
          tags: [...tags],
          redFlag: r.redFlag,
        };
        const has = old.checkins.some((c) => c.date === date);
        return {
          ...old,
          checkins: has
            ? old.checkins.map((c) => (c.date === date ? entry : c))
            : [...old.checkins, entry],
        };
      });
      setSavedWarn(r.redFlag);
      setSavedMsg(
        r.redFlag
          ? "已保存。你勾选了「身体不适」或在备注里提到了不适症状，如正在出现胸痛、晕厥或呼吸困难，请立即就医或拨打当地急救电话。"
          : "已保存，打卡会同步到「压力与情绪」专题与趋势页；生活标签攒满 28 天后可在复盘看它们与睡眠、HRV 的关联（相关不等于因果）。",
      );
    },
    // 打卡不是乐观更新：失败时表单原样保留（评分/标签/备注都在），按钮下方红字提示可直接重试。
    onError: () => {
      setSavedWarn(true);
      setSavedMsg("打卡没能保存，你填的内容都还在，请检查网络后点「保存打卡」重试。");
    },
  });
  const suggMut = useMutation({
    mutationFn: (v: { idx: number; done: boolean }) =>
      api.toggleSuggestion({ date: latest ?? todayStr(), idx: v.idx, done: v.done }),
    // 勾选即时变（本地缓存先行），保存异步落盘，失败回滚。
    onMutate: (v) => {
      const key = `${latest ?? todayStr()}:${v.idx}`;
      const prev = patchDashboard(qc, (old) => ({
        ...old,
        suggestionDone: v.done
          ? old.suggestionDone.includes(key)
            ? old.suggestionDone
            : [...old.suggestionDone, key]
          : old.suggestionDone.filter((x) => x !== key),
      }));
      return { prev };
    },
    // 勾选即时变（本地缓存先行），保存异步落盘，失败回滚并弹轻提示（M15）。
    onError: (_e, _v, c) => {
      restoreDashboard(qc, c?.prev);
      toast.show("建议勾选没能保存，已恢复到之前的状态，请重试");
    },
  });
  const syncMut = useMutation({ mutationFn: () => api.refreshHealthData({}) });
  const [syncNote, setSyncNote] = useState("");
  const [syncErr, setSyncErr] = useState(false);
  // 本次点击触发的同步：记录点击前的 lastAt，回填后 lastAt 变化即视为完成。
  const [pendingSync, setPendingSync] = useState(false);
  const pendingBase = useRef<string | null>(null);
  const serverSyncing = d.sync.status === "syncing";
  const syncing = serverSyncing || syncMut.isPending || pendingSync;
  const syncFailed = !syncing && (d.sync.status === "error" || syncErr);
  // M26：最近一次同步距今超过 24 小时 → 过期态（徽标显「X 天前」、结论区置灰 + 重试入口）；
  // 同步中/失败仍优先于过期态显示，同步成功回填后 lastAt 更新、自动恢复正常显示。
  const stale = syncStaleness(d.sync.lastAt, Date.now());
  const showStale = stale.stale && !syncing && !syncFailed;

  useEffect(() => {
    if (pendingSync && d.sync.lastAt && d.sync.lastAt !== pendingBase.current) {
      setPendingSync(false);
      setSyncErr(false);
      setSyncNote(`已同步 · 更新至 ${d.sync.lastHhmm ?? ""}`);
    }
  }, [d.sync.lastAt, d.sync.lastHhmm, pendingSync]);

  useEffect(() => {
    if (pendingSync && d.sync.status === "error") {
      setPendingSync(false);
      setSyncErr(true);
      setSyncNote("上次同步未完成，点徽标可重试。");
    }
  }, [d.sync.status, pendingSync]);

  const doSync = () => {
    if (syncing) return; // 进行中重复点击不重复触发
    setSyncErr(false);
    setSyncNote("正在发起同步…");
    pendingBase.current = d.sync.lastAt;
    syncMut.mutate(undefined, {
      onSuccess: (r) => {
        if (r.status === "error") {
          setSyncErr(true);
          setSyncNote(r.message);
          return;
        }
        // started 或服务端已在同步中：进入等待回填状态（App 层会轮询 dashboard）。
        setPendingSync(true);
        setSyncNote(r.message);
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
      },
      onError: () => {
        setSyncErr(true);
        setSyncNote("同步未能启动，点徽标可重试。");
      },
    });
  };

  if (!latest || !today) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-title">今日</h1>
        </div>
        <EmptyBox text="暂无健康数据。数据由 Atlas 在 07:00–23:00 每小时从 Apple Health 同步回填。" />
        <button type="button" className="btn" style={{ marginTop: 14 }} onClick={doSync} disabled={syncing}>
          {syncing ? "同步中…" : "立即同步一次"}
        </button>
        {syncNote && (
          <p className={`save-msg${syncErr ? " warn" : ""}`} style={{ textAlign: "center" }}>{syncNote}</p>
        )}
      </div>
    );
  }

  const prevSteps = mean(
    full
      .slice(0, -1)
      .slice(-7)
      .map((r) => r.steps)
      .filter((v): v is number => v != null),
  );
  const actHabits = d.habits.filter((h) => h.active);
  const shownHabits = actHabits.slice(0, 3);
  const s0 = sugg[0];
  const s0Done = s0 ? d.suggestionDone.includes(`${latest}:0`) : false;

  // 恢复横幅渐变跟随当天重点类别
  let focusGrad =
    "linear-gradient(128deg,#4644c4 0%,#5856d6 46%,#7d7aff 78%,#64d2ff 130%)";
  if (
    lastNight?.totalMin != null &&
    lastNight.totalMin >= 420 &&
    today.steps != null &&
    today.steps < 4500
  ) {
    focusGrad = "linear-gradient(128deg,#d35400 0%,#ff9500 52%,#ffb340 90%)";
  } else if (rec?.signals.some((sg) => sg.bad && sg.name !== "昨晚睡眠")) {
    focusGrad = "linear-gradient(128deg,#c40030 0%,#ff2d55 52%,#ff7d9c 95%)";
  }
  const headMap = {
    充分: "状态不错，可以按计划训练",
    一般: "状态一般，量力而行",
    偏低: "恢复偏低，今天以恢复为主",
  } as const;
  const toneMap = { 充分: "ok", 一般: "warn", 偏低: "danger" } as const;

  let recTitle = "三项信号都在常态范围内";
  if (rec?.observing) {
    const sleepPart = !lastNight
      ? ""
      : lastNight.totalMin != null && lastNight.totalMin < 360
        ? "睡得偏短"
        : lastNight.totalMin != null && lastNight.totalMin < 420
          ? "睡得略短"
          : "昨晚睡够了";
    const heartBad = rec.signals.filter((sg) => sg.bad && sg.name !== "昨晚睡眠");
    recTitle = heartBad.length
      ? `${sleepPart ? `${sleepPart}，` : ""}${heartBad.map((sg) => sg.name).join("、")}不在常态`
      : sleepPart
        ? `${sleepPart}，心脏指标都在常态`
        : "三项信号都在常态范围内";
  }

  const exPct = wk ? Math.min(100, Math.round((wk.exerciseMin / 150) * 100)) : 0;
  const stPct = wk ? Math.min(100, Math.round((wk.strengthCount / 2) * 100)) : 0;
  const rateVal: Record<RateKey, number> = { energy, mood, stress };
  const rateSet: Record<RateKey, (v: number) => void> = {
    energy: setEnergy,
    mood: setMood,
    stress: setStress,
  };

  return (
    <div>
      <div className="today-meta">
        <span className="d num">{latest}</span>
        {inObs && <Pill tone="neutral">观察期 · 基线建立中（{full.length} 天）</Pill>}
        {travel && <Pill tone="warn">出差模式中</Pill>}
        <span style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className={`sync-pill${syncing ? " syncing" : ""}${syncFailed ? " error" : ""}${showStale ? " stale" : ""}`}
            onClick={doSync}
            disabled={syncing}
            aria-label={
              syncing
                ? "正在同步 Apple Health 数据"
                : syncFailed
                  ? "上次同步失败，点击立即重试同步"
                  : showStale
                    ? `数据已 ${stale.days} 天未同步，点击立即刷新`
                    : "立即刷新 Apple Health 数据"
            }
          >
            {syncing
              ? "同步中…"
              : syncFailed
                ? "同步失败 · 点此重试"
                : showStale
                  ? `${stale.days} 天前同步 · 点此刷新`
                  : `${syncHhmm} 已同步`}
          </button>
        </span>
      </div>
      {syncNote && (
        <p
          className={`src-note${syncErr ? " err" : ""}`}
          style={{ textAlign: "right", paddingRight: 4 }}
        >
          {syncNote}
        </p>
      )}

      {flags.length > 0 && (
        <Card className="flag-card">
          <TtlHead label="异常提示" />
          <ul>
            {flags.map((f, i) => (
              <li key={i}>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showStale && (
        <div className="stale-strip" role="note">
          <span>
            数据已 {stale.days} 天未同步（上次同步 {syncHhmm}），下面的结论基于旧数据，可能不反映最新状态。
          </span>
          <button type="button" className="btn sm" onClick={doSync} disabled={syncing}>
            {syncing ? "同步中…" : "立即同步"}
          </button>
        </div>
      )}

      {/* 恢复状态：观察期内不给等级结论，只显示三个信号各自状态 */}
      {rec ? (
        <div
          className={`card verdict-card${showStale ? " stale" : ""}`}
          style={{ background: focusGrad }}
        >
          <div className="vcat">
            <span>恢复状态</span>
            {rec.observing ? (
              <Pill tone="neutral">观察期 · 只看信号</Pill>
            ) : (
              <Pill tone={toneMap[rec.level]}>{rec.level}</Pill>
            )}
          </div>
          <h2>{rec.observing ? recTitle : headMap[rec.level]}</h2>
          <ul>
            {rec.signals.map((sg) => (
              <li key={sg.name}>
                · {sg.name}
                {sg.text ? ` ${sg.text}` : ""} —— <b>{sg.state}</b>
              </li>
            ))}
          </ul>
          {rec.observing && (
            <details style={{ position: "relative", zIndex: 1, marginTop: 8 }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 13.5,
                  color: "rgba(255,255,255,.85)",
                  minHeight: 32,
                }}
              >
                查看与个人基线的小数对比（明细）
              </summary>
              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,.8)",
                  lineHeight: 1.65,
                  margin: "4px 0 0",
                }}
              >
                {rec.notes.join("；")}。常态范围内的小数差不单独解读。
              </p>
            </details>
          )}
          {rec.driver && (
            <p
              style={{
                position: "relative",
                zIndex: 1,
                margin: "8px 0 0",
                fontSize: 14,
                color: "rgba(255,255,255,.92)",
              }}
            >
              {rec.driver}。
            </p>
          )}
          {!rec.observing && rec.level === "偏低" && (
            <p
              style={{
                position: "relative",
                zIndex: 1,
                margin: "8px 0 0",
                fontSize: 14,
                color: "#ffd9a8",
              }}
            >
              建议当天轻量活动、早睡，不建议高强度训练。
            </p>
          )}
        </div>
      ) : (
        <Card>
          <TtlHead label="恢复状态" />
          <EmptyBox text="数据不足" />
        </Card>
      )}

      {/* 活动进度 */}
      <Card>
        <CatTopicBtn colorVar="--c-activity" icon="flame" label="活动进度" topic="activity" />
        <div className="act-nums">
          <div>
            <div className="v num">
              <CountUp value={today.steps ?? 0} comma />
            </div>
            <div className="k">今日步数 · {asOfLabel(syncHhmm)}</div>
          </div>
          <div>
            <div className="v num">
              <CountUp value={today.exerciseMin ?? 0} />
              <small> 分</small>
            </div>
            <div className="k">今日锻炼 · {asOfLabel(syncHhmm)}</div>
          </div>
          <div>
            <div className="v num">
              <CountUp value={today.activeEnergyKcal ?? 0} />
            </div>
            <div className="k">活动能量 kcal · {asOfLabel(syncHhmm)}</div>
          </div>
        </div>
        {prevSteps != null && (
          <p className="src-note" style={{ marginTop: 10 }}>
            参考：完整日日均步数 {fmt(prevSteps)}（不含今日与不完整日，与趋势页同口径）。
          </p>
        )}
        {wk && (
          <div style={{ borderTop: "1px solid var(--sep)", marginTop: 16, paddingTop: 6 }}>
            <p className="src-note">
              {weekLabel(wk)} · 对照 WHO《身体活动和久坐行为指南 2020》
            </p>
            <div className="prog p-ex" style={{ "--w": `${exPct}%` } as CSSProperties}>
              <div className="pr">
                <span>有氧/锻炼分钟</span>
                <span>
                  <b className="num">{fmt(Math.round(wk.exerciseMin))}</b> / 150 分钟（{exPct}%）
                </span>
              </div>
              <div className="track">
                <i />
              </div>
            </div>
            <div className="prog p-st" style={{ "--w": `${stPct}%` } as CSSProperties}>
              <div className="pr">
                <span>力量训练</span>
                <span>
                  <b className="num">{wk.strengthCount}</b> / 2 次（{stPct}%）
                </span>
              </div>
              <div className="track">
                <i />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 昨晚睡眠 */}
      <Card>
        <CatTopicBtn colorVar="--c-sleep" icon="moon" label="昨晚睡眠" topic="sleep" />
        {lastNight ? (
          <>
            <div className="sleep-big">
              <span className="v num">{fmtMin(lastNight.totalMin)}</span>
              <span className="w">
                {lastNight.startDatetime?.split(" ")[1]?.slice(0, 5)} 入睡 –{" "}
                {lastNight.endDatetime?.split(" ")[1]?.slice(0, 5)} 起床
                {lastNight.qualityScore != null && ` · 质量分 ${fmt(lastNight.qualityScore)}`}
              </span>
            </div>
            <StageBar s={lastNight} />
            <MRow
              label="睡眠效率 / 夜醒"
              value={`${fmt(lastNight.efficiency, 1)}% · ${fmt(lastNight.awakenings)} 次`}
              note="参考范围：成人每晚 7–9 小时（AASM 与睡眠研究学会共识）"
            />
          </>
        ) : (
          <EmptyBox text="暂无睡眠记录：睡觉时佩戴 Apple Watch 即可自动记录" />
        )}
      </Card>

      {/* 今天做这几件 */}
      <Card>
        <TtlHead label="今天做这几件" />
        <p className="src-note">
          来自当前进行中的习惯（最多 3 个，勾选直接计入习惯连续天数），另含最多 1 条按今日状态生成的建议
        </p>
        {actHabits.length === 0 && !s0 ? (
          <EmptyBox text="数据不足，暂不生成清单" />
        ) : (
          <>
            {shownHabits.map((hb) => (
              <HabitCheckRow key={hb.id} d={d} hb={hb} />
            ))}
            {s0 && (
              <div className="check-row">
                <input
                  type="checkbox"
                  checked={s0Done}
                  onChange={(e) => suggMut.mutate({ idx: 0, done: e.target.checked })}
                  aria-label={`完成建议：${s0.title}`}
                />
                <div className="ct">
                  <div className={`t${s0Done ? " done" : ""}`}>
                    {s0.title}{" "}
                    <span style={{ fontSize: 12.5, color: "var(--dim)", fontWeight: 400 }}>
                      今日建议
                    </span>
                  </div>
                  <div className="n">{s0.basis}</div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* 每日打卡 */}
      <Card>
        <TtlHead
          label="每日打卡（10 秒）"
          right={existing ? <Pill tone="ok">今日已打卡</Pill> : undefined}
        />
        <p className="src-note">
          精力 / 情绪 / 压力各 1–5 分，会与 HRV、睡眠一起在「压力与情绪」专题联动展示
        </p>
        {RATE_DEFS.map((r) => (
          <div className="rate-row" key={r.key}>
            <span className="rl">
              {r.label}
              {r.key === "stress" && (
                <span style={{ fontSize: 12.5, color: "var(--dim)", fontWeight: 400 }}>
                  （数字越大压力越大）
                </span>
              )}
            </span>
            <span className="rs" role="radiogroup" aria-label={r.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rateVal[r.key] === n}
                  aria-label={`${r.label} ${n} 分`}
                  className={rateVal[r.key] === n ? "on" : ""}
                  onClick={() => rateSet[r.key](n)}
                >
                  {n}
                </button>
              ))}
            </span>
            <span className="rate-anchors">
              <span>{r.anchors[0]}</span>
              <span>{r.anchors[1]}</span>
            </span>
          </div>
        ))}
        <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500, margin: "14px 0 0" }}>
          生活标签（可多选）
        </p>
        <div className="chips" style={{ marginTop: 8 }}>
          {LIFE_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                className={`chip${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() =>
                  setTags((prev) =>
                    prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                  )
                }
              >
                {t}
              </button>
            );
          })}
        </div>
        {tags.includes("身体不适") && (
          <div className="warn-strip" style={{ border: "1.5px solid var(--alert)", marginTop: 12 }}>
            <b>你勾选了「身体不适」。</b>
            如正在出现胸痛、晕厥或呼吸困难，请立即就医或拨打当地急救电话；其余不适也建议尽快咨询医生。保存后本页会保留这条提示。
          </div>
        )}
        <label className="field">
          <span className="fl">备注（可选）</span>
          <textarea
            className="inp"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：今天肩颈有点紧"
            aria-label="打卡备注"
          />
        </label>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 14 }}
          disabled={energy === 0 || mood === 0 || stress === 0 || checkinMut.isPending}
          onClick={() => checkinMut.mutate()}
        >
          {checkinMut.isPending ? "保存中…" : existing ? "更新今日打卡" : "保存打卡"}
        </button>
        {savedMsg && <p className={`save-msg${savedWarn ? " warn" : ""}`}>{savedMsg}</p>}
      </Card>

      <div className="sync-zone">
        <p>
          Atlas 每天 07:00–23:00 每小时自动同步一次（清晨 07:00 那次同时定版昨夜睡眠）；点顶部「{syncHhmm} 已同步」徽标也可立即刷新一次。
        </p>
      </div>
    </div>
  );
}
