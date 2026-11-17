// 阶段目标卡（计划页与专题详情共用）：状态胶囊 + 操作按钮；
// 建档未完成前「确认生效」置灰（用户已拍板的选择 a），确认/暂停/恢复/完成都走后端落盘。

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { TOPIC_MAP, patchDashboard, restoreDashboard, type Dashboard } from "./lib";
import { Pill, useToast } from "./ui";

export type Goal = Dashboard["goals"][number];

const TONE = { draft: "warn", active: "ok", paused: "neutral", done: "neutral" } as const;
const LABEL = {
  draft: "草案 · 待确认",
  active: "进行中",
  paused: "已暂停",
  done: "已完成",
} as const;

export function GoalBox({
  d,
  g,
  withTopic,
}: {
  d: Dashboard;
  g: Goal;
  withTopic?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const mut = useMutation({
    mutationFn: (status: "active" | "paused" | "done") =>
      api.setGoalStatus({ id: g.id, status }),
    // 状态按钮点击即变，保存异步落盘，失败回滚。
    onMutate: (status) => {
      const prev = patchDashboard(qc, (old) => ({
        ...old,
        goals: old.goals.map((x) => (x.id === g.id ? { ...x, status } : x)),
      }));
      return { prev };
    },
    // 回滚后给可见轻提示（M15），不静默回滚。
    onError: (_e, _v, c) => {
      restoreDashboard(qc, c?.prev);
      toast.show("目标状态没能保存，已恢复到之前的状态，请重试");
    },
  });
  const profileDone = d.profile != null;
  const status = g.status as keyof typeof LABEL;
  return (
    <div className="goalbox">
      {!withTopic && (
        <p style={{ fontSize: 12.5, color: "var(--dim)", margin: 0 }}>
          {TOPIC_MAP[g.topic]?.name ?? g.topic} · {g.tier}
        </p>
      )}
      <p className="gt-t">{g.title}</p>
      {g.detail && <p className="gt-d">{g.detail}</p>}
      <div className="gt-row">
        <Pill tone={TONE[status]}>{LABEL[status]}</Pill>
        {g.status === "draft" &&
          (profileDone ? (
            <button
              type="button"
              className="btn sm"
              onClick={() => mut.mutate("active")}
              disabled={mut.isPending}
            >
              确认生效
            </button>
          ) : (
            <>
              <button type="button" className="btn sm" disabled>
                确认生效
              </button>
              <span style={{ fontSize: 12.5, color: "var(--dim)" }}>完成建档后可确认</span>
            </>
          ))}
        {g.status === "active" && (
          <>
            <button type="button" className="mini-link dim" onClick={() => mut.mutate("paused")}>
              暂停
            </button>
            <button type="button" className="mini-link" onClick={() => mut.mutate("done")}>
              标记完成
            </button>
          </>
        )}
        {g.status === "paused" && (
          <button type="button" className="mini-link" onClick={() => mut.mutate("active")}>
            恢复进行
          </button>
        )}
      </div>
    </div>
  );
}
