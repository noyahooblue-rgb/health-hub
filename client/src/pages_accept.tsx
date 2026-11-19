// 真机验收页（我的 › 关于与免责 › 真机验收）：真机检查项逐条勾选（勾选 = 通过），
// 条数由 ITEMS 动态决定（v1.0.1 为 7 条，v1.0.2 新增第 8 条「中段切页签」共 8 条）。
// 底部总备注 + 提交。打开本页期间运行发布规范第 7 节探针（能力探针 + 交互响应日志），
// 提交时一并带走：全部勾选、备注、探针统计（条数/中位数/最大值）、能力探针结果、
// 首屏时间（本页打开到可用）、提交时间、界面版本、当前模式。
// 正式版：经 submitAcceptance 追加写入 acceptance_records 表（不覆盖历史），
// Atlas 经 listAcceptance 动作或数据导出读回；预览版：只存本机预览存储，绝不写真实数据。

import { useEffect, useRef, useState } from "react";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";
import { api } from "./api";
import { dataProvider } from "./data";
import { probeStats } from "./lib";
import {
runCapabilityProbe,
startInteractionProbe,
type CapabilityMap,
type InteractionProbe,
} from "./probe";
import { UI_VERSION } from "./version";
import { Card, TtlHead } from "./ui";

// 表单输入上限一律取自服务端请求 schema（platformVersion 29）：与服务端校验同源，不手写。
const FIELDS = actionFields<typeof Actions>();

const ITEMS: { codes: string; title: string; how: string; look: string }[] = [
  {
    codes: "M03、M04",
    title: "下滑时导航收窄，上滑时展开",
    how: "在今日页慢慢向下滑一段，再向上滑。",
    look: "下滑后底部导航变成只剩图标的窄条；上滑立刻变回带文字；停着不动看一会儿，它不会自己变回去。",
  },
  {
    codes: "M09",
    title: "点任意按钮，按下立即有反馈",
    how: "随便点几个按钮和行。",
    look: "按下的一瞬间就有缩放或变暗，不用等内容刷新。",
  },
  {
    codes: "M10",
    title: "在趋势图上拖动查数",
    how: "到趋势页，在图上按住左右拖动，然后松手。",
    look: "拖动时上方读数变成所指那天的值；松手后回到「平均 + 日期范围」。",
  },
  {
    codes: "M14",
    title: "勾选一个习惯，立刻变化",
    how: "在今日页点一个习惯的圆圈。",
    look: "同一瞬间就打上勾、连续天数随之变化，不转圈等待。",
  },
  {
    codes: "M08、M24",
    title: "打开一个弹层，再向下拖动关闭",
    how: "点任意卡片打开弹层，抓住弹层顶部把手向下拖。",
    look: "弹层跟着手指走；拖过一段松手就关掉；只拖一点点松手会弹回去。",
  },
  {
    codes: "M20",
    title: "从后台切回空间，内容立即显示",
    how: "切到别的 App，再切回来。",
    look: "内容立刻显示，不白屏、不从头加载。",
  },
  {
    codes: "M21",
    title: "打开系统「减少动态效果」后再看第 1 条",
    how: "打开 iPhone 设置 › 辅助功能 › 动态效果 › 减少动态效果，回到空间再下滑上滑一次。",
    look: "导航收窄和展开变成直接切换、没有弹簧动画，但功能都在。",
  },
  {
    codes: "v1.0.2 安全网",
    title: "在每个页签滑到中间，点其他 4 个页签，都能切过去",
    how: "逐个页签打开，每个都先向下滑到页面中间停住，再依次点底部导航的其他 4 个页签。",
    look: "每次点击都立刻切换到所点页签，没有点不动、要点两次或切错的情况；滑到中间时导航收窄成图标条也一样能点。",
  },
];

export const ACCEPT_ITEMS = ITEMS.length;

type AcceptRecord = Awaited<ReturnType<typeof api.listAcceptance>>["records"][number];

function fmtTime(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime())
    ? iso
    : t.toLocaleString("zh-CN", { hour12: false });
}

export function AcceptanceView() {
  const preview = dataProvider.kind === "mock";
  const [checks, setChecks] = useState<boolean[]>(() => ITEMS.map(() => false));
  const [note, setNote] = useState("");
  const [probeCount, setProbeCount] = useState(0);
  const [firstScreenMs, setFirstScreenMs] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState("");
  const [history, setHistory] = useState<AcceptRecord[]>([]);
  const probeRef = useRef<InteractionProbe | null>(null);
  const capsRef = useRef<CapabilityMap>({});
  const mountT0 = useRef(performance.now());

  useEffect(() => {
    capsRef.current = runCapabilityProbe();
    const probe = startInteractionProbe();
    probeRef.current = probe;
    // 首屏时间：本页挂载 → 首帧绘制完成（双 rAF）的毫秒数。
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setFirstScreenMs(Math.max(0, Math.round(performance.now() - mountT0.current)));
      });
    });
    const tick = window.setInterval(() => setProbeCount(probe.count()), 800);
    void api
      .listAcceptance({})
      .then((r) => setHistory(r.records))
      .catch(() => {
        /* 读不到历史不阻塞验收本身 */
      });
    return () => {
      probe.stop();
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearInterval(tick);
    };
  }, []);

  const passed = checks.filter(Boolean).length;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitErr("");
    const stats = probeStats(probeRef.current?.samples() ?? []);
    const mode: "正式版" | "预览版" = preview ? "预览版" : "正式版";
    try {
      const r = await api.submitAcceptance({
        checks: [...checks],
        note: note.trim(),
        probe: { count: stats.count, medianMs: stats.medianMs, maxMs: stats.maxMs },
        capabilities: capsRef.current,
        firstScreenMs: firstScreenMs ?? 0,
        submittedAt: new Date().toISOString(),
        uiVersion: UI_VERSION,
        mode,
      });
      setSubmittedAt(r.submittedAt);
      const list = await api.listAcceptance({});
      setHistory(list.records);
    } catch {
      setSubmitErr("提交没能保存，请检查网络后重试（勾选与备注都还在）。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Card>
        <TtlHead
          label={`真机验收（${ITEMS.length} 条）`}
          right={
            <span style={{ fontSize: 13, color: "var(--dim)" }}>
              已通过 {passed} / {ITEMS.length}
            </span>
          }
        />
        <p className="src-note">
          在 iPhone 上逐条照着做：做到、看到预期的样子就勾上（勾选 = 通过）；没做到或还没测的不要勾。全部做完后在页面底部写备注并提交。
        </p>
        {preview && (
          <div className="acc-preview" role="note">
            <b>当前是设计预览模式。</b>
            本页可以照常勾选与提交，但提交只保存在这台设备的预览存储里，
            <b>不会写入正式数据</b>；正式验收请从正式版打开本页提交。
          </div>
        )}
        {ITEMS.map((it, i) => (
          <div className="acc-item" key={it.codes}>
            <div className="ai-head">
              <span className="ai-t">
                {i + 1}. {it.title}（{it.codes}）
              </span>
              <input
                type="checkbox"
                checked={checks[i] ?? false}
                aria-label={`第 ${i + 1} 条验收通过：${it.title}`}
                onChange={(e) =>
                  setChecks((prev) =>
                    prev.map((c, j) => (j === i ? e.target.checked : c)),
                  )
                }
              />
            </div>
            <p className="ai-line">
              <b>怎么操作：</b>
              {it.how}
            </p>
            <p className="ai-line">
              <b>看什么：</b>
              {it.look}
            </p>
          </div>
        ))}
        <p className="acc-probe">
          探针运行中（本页打开期间）：已记录 {probeCount} 条交互响应 · 能力探针已采集{" "}
          {Object.keys(capsRef.current).length} 项 · 本页打开到可用约{" "}
          {firstScreenMs != null ? `${firstScreenMs} 毫秒` : "…"}。提交时这些数据会随记录一并保存。
        </p>
      </Card>

      <Card>
        <TtlHead label="总备注与提交" />
        <label className="field">
          <span className="fl">总备注（可选）</span>
          <textarea
            {...FIELDS.submitAcceptance.note}
            className="inp"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：哪一条没通过、当时是什么表现"
            aria-label="真机验收总备注"
          />
        </label>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 14 }}
          disabled={submitting}
          onClick={() => void submit()}
        >
          {submitting ? "提交中…" : "提交结果"}
        </button>
        {submittedAt && (
          <p className="save-msg">
            已提交 · {fmtTime(submittedAt)}（{preview ? "预览模式，仅存本机预览侧" : "已存入空间数据"}）
          </p>
        )}
        {submitErr && <p className="save-msg warn">{submitErr}</p>}
        {history.length > 0 && (
          <div style={{ borderTop: "1px solid var(--sep)", marginTop: 14, paddingTop: 10 }}>
            <p style={{ fontSize: 13.5, color: "var(--dim)", margin: "0 0 4px" }}>
              已有 {history.length} 次提交记录（每次都保留，不覆盖）：
            </p>
            {[...history].reverse().map((h) => (
              <p key={h.id} style={{ fontSize: 13.5, color: "var(--body)", margin: "3px 0" }}>
                {fmtTime(h.submittedAt)} · 通过 {h.record.checks.filter(Boolean).length} /{" "}
                {h.record.checks.length} · {h.record.mode}
              </p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
