// 习惯行（今日 / 计划 / 专题共用）：圆形勾选 + 近 7 天点阵 + 连续天数 +「⋯」菜单（暂停/恢复走后端落盘）。

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import {
  addDays,
  habitResumePlan,
  habitStreak,
  patchDashboard,
  restoreDashboard,
  todayStr,
  type Dashboard,
} from "./lib";
import { useSheet, useToast } from "./ui";

export type Habit = Dashboard["habits"][number];

export function HabitDots({ d, habitId }: { d: Dashboard; habitId: number }) {
  const latest = d.latestDate;
  if (!latest) return null;
  const set = new Set(d.habitLogs);
  return (
    <span className="hdots below" aria-label="近 7 天完成情况">
      {[6, 5, 4, 3, 2, 1, 0].map((i) => (
        <i key={i} className={set.has(`${habitId}:${addDays(latest, -i)}`) ? "on" : ""} />
      ))}
    </span>
  );
}

export function useHabitToggle(d: Dashboard) {
  const qc = useQueryClient();
  const toast = useToast();
  const date = d.latestDate ?? todayStr();
  return useMutation({
    mutationFn: (v: { id: number; done: boolean }) =>
      api.toggleHabit({ habitId: v.id, date, done: v.done }),
    // 点击即时反馈：先改本地缓存（勾选/点阵/连续天数立刻变），保存异步落盘，失败回滚。
    onMutate: (v) => {
      const key = `${v.id}:${date}`;
      const prev = patchDashboard(qc, (old) => ({
        ...old,
        habitLogs: v.done
          ? old.habitLogs.includes(key)
            ? old.habitLogs
            : [...old.habitLogs, key]
          : old.habitLogs.filter((x) => x !== key),
      }));
      return { prev };
    },
    // 失败回滚后必须有可见提示（M14/M15）：回滚完成的同时弹轻提示，不再静默回滚。
    onError: (_e, _v, c) => {
      restoreDashboard(qc, c?.prev);
      toast.show("这次打卡没能保存，已恢复到之前的状态，请重试");
    },
  });
}

/** 「⋯」菜单弹层内容：暂停 / 恢复（恢复受同时进行上限 3 约束，后端校验作兜底）。
 *  M17（清单 v2）：恢复先走前端 habitResumePlan 判断——满 3 个时直接在菜单里让用户选一个
 *  进行中习惯暂停。满额换人【不做乐观更新】：菜单保持打开、按钮显示处理中，两次服务端
 *  调用都成功后才一次性更新缓存并关菜单；失败只提示并按服务端状态重拉对齐，界面状态
 *  从未变过——绝不出现「先乐观恢复 → 后端拒绝 → 回滚」的闪动路径。 */
function HabitMenuContent({ d, hb }: { d: Dashboard; hb: Habit }) {
  const sheet = useSheet();
  const toast = useToast();
  const qc = useQueryClient();
  const [swapErr, setSwapErr] = useState("");
  const mut = useMutation({
    mutationFn: (v: { id: number; active: boolean }) =>
      api.setHabitActive({ habitId: v.id, active: v.active }),
    // 暂停立即生效于本地；未满额的直接恢复同样乐观，失败回滚并在菜单内提示。
    onMutate: (v) => {
      const prev = patchDashboard(qc, (old) => ({
        ...old,
        habits: old.habits.map((h) => (h.id === v.id ? { ...h, active: v.active } : h)),
      }));
      return { prev };
    },
    onSuccess: (r, v, c) => {
      if (!r.ok) {
        if (c?.prev) restoreDashboard(qc, c.prev);
        // 恢复失败：菜单还开着，用菜单内红字（既有路径）；暂停失败：菜单已关，用轻提示。
        if (v.active) setSwapErr(r.error ?? "恢复没有完成，请重试。");
        else toast.show("暂停没能保存，已恢复到之前的状态，请重试");
      } else if (v.active) {
        sheet.close();
      }
    },
    onError: (_e, v, c) => {
      restoreDashboard(qc, c?.prev);
      if (v.active) setSwapErr("恢复没有完成，请检查网络后重试。");
      else toast.show("暂停没能保存，已恢复到之前的状态，请重试");
    },
  });
  // 满额换人：先暂停所选、再恢复目标，顺序执行；全程不预改本地状态。
  const swapMut = useMutation({
    mutationFn: async (v: { pauseId: number; resumeId: number }) => {
      const r1 = await api.setHabitActive({ habitId: v.pauseId, active: false });
      if (!r1.ok) return r1;
      return api.setHabitActive({ habitId: v.resumeId, active: true });
    },
    onSuccess: (r, v) => {
      if (r.ok) {
        patchDashboard(qc, (old) => ({
          ...old,
          habits: old.habits.map((h) =>
            h.id === v.pauseId
              ? { ...h, active: false }
              : h.id === v.resumeId
                ? { ...h, active: true }
                : h,
          ),
        }));
        sheet.close();
      } else {
        // 第一步可能已在服务端落盘：以服务端为准重拉对齐，本地显示状态未曾改动。
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
        setSwapErr(r.error ?? "换人没有完成，请重试。");
      }
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      setSwapErr("换人没有完成，请检查网络后重试。");
    },
  });
  const streak = habitStreak(d.habitLogs, hb.id, d.latestDate);
  const plan = habitResumePlan(d.habits, hb.id);
  const busy = swapMut.isPending || mut.isPending;
  return (
    <div>
      <h3>{hb.name}</h3>
      <p style={{ fontSize: 14, color: "var(--dim)", lineHeight: 1.6, margin: "0 0 6px" }}>
        连续 {streak} 天 · {hb.active ? "进行中" : "已暂停"}
      </p>
      {hb.active ? (
        <button
          type="button"
          className="btn plain"
          style={{ marginTop: 8 }}
          onClick={() => {
            mut.mutate({ id: hb.id, active: false });
            sheet.close();
          }}
        >
          暂停这个习惯
        </button>
      ) : plan.mode === "swap" ? (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.65, margin: "0 0 4px" }}>
            进行中的习惯已满 3 个。点下面任意一个，会先暂停它、再恢复这个习惯（一次完成，不用分两步）：
          </p>
          {plan.active.map((a) => (
            <button
              key={a.id}
              type="button"
              className="btn plain"
              style={{ marginTop: 8 }}
              disabled={busy}
              onClick={() => {
                setSwapErr("");
                swapMut.mutate({ pauseId: a.id, resumeId: hb.id });
              }}
            >
              {swapMut.isPending ? "正在换人…" : `暂停「${a.name}」并恢复这个`}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 8 }}
          disabled={busy}
          onClick={() => {
            setSwapErr("");
            mut.mutate({ id: hb.id, active: true });
          }}
        >
          {mut.isPending ? "正在恢复…" : "恢复这个习惯"}
        </button>
      )}
      {swapErr && (
        <p style={{ fontSize: 14, color: "var(--alert)", lineHeight: 1.6, marginTop: 10 }}>
          {swapErr}
        </p>
      )}
      <button
        type="button"
        className="btn plain"
        style={{ marginTop: 10 }}
        onClick={() => sheet.close()}
      >
        关闭
      </button>
    </div>
  );
}

export function useHabitMenu(d: Dashboard) {
  const sheet = useSheet();
  return (hb: Habit) => {
    sheet.open(<HabitMenuContent d={d} hb={hb} />);
  };
}

export function HabitCheckRow({
  d,
  hb,
  showTopic = false,
  showMenu = false,
  topicName,
}: {
  d: Dashboard;
  hb: Habit;
  showTopic?: boolean;
  showMenu?: boolean;
  topicName?: string;
}) {
  const toggle = useHabitToggle(d);
  const openMenu = useHabitMenu(d);
  const date = d.latestDate ?? todayStr();
  const done = d.habitLogs.includes(`${hb.id}:${date}`);
  const streak = habitStreak(d.habitLogs, hb.id, d.latestDate);
  return (
    <div className="check-row">
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => toggle.mutate({ id: hb.id, done: e.target.checked })}
        aria-label={`习惯打卡：${hb.name}`}
      />
      <div className="ct" style={{ flex: 1, minWidth: 0 }}>
        <div className="t">
          {hb.name}
          {showTopic && topicName ? (
            <span style={{ fontSize: 12.5, color: "var(--dim)", fontWeight: 400 }}>
              {" "}
              {topicName}
            </span>
          ) : null}
        </div>
        {hb.minVersion ? <div className="n">最低版本：{hb.minVersion}</div> : null}
        <HabitDots d={d} habitId={hb.id} />
      </div>
      <span className={`streak-num${done ? " pop" : ""}`}>{streak} 天</span>
      {showMenu && (
        <button
          type="button"
          className="habit-menu-btn"
          aria-label={`习惯操作：${hb.name}`}
          onClick={() => openMenu(hb)}
        >
          ⋯
        </button>
      )}
    </div>
  );
}
