// 真机验收探针（《设计版到正式版发布规范》第 7 节）：
// ① 能力探针——打开验收页时一次性采集设备/环境能力（减少动态效果、触摸、视口、安全区等）；
// ② 交互响应日志——验收页打开期间，监听全页 pointerdown，记录「按下 → 下一帧绘制完成」
//    的毫秒数作为按压反馈延迟样本（与 M09 的按下即时反馈验收对应）。
// 统计口径（条数/中位数/最大值）在 lib.probeStats，单测锁定。探针只读不写，不改任何界面状态。

export type CapabilityValue = string | number | boolean | null;
export type CapabilityMap = Record<string, CapabilityValue>;

function mq(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** 能力探针：键名稳定（提交记录与 Atlas 读回都按此结构），测不到的项记 null，不猜。 */
export function runCapabilityProbe(): CapabilityMap {
  const nav = window.navigator;
  let lsOk = false;
  try {
    const k = "__probe_ls__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    lsOk = true;
  } catch {
    lsOk = false;
  }
  const conn = (
    nav as Navigator & { connection?: { effectiveType?: string } }
  ).connection;
  const standalone =
    mq("(display-mode: standalone)") ||
    (nav as Navigator & { standalone?: boolean }).standalone === true;
  return {
    // 减少动态效果：验收第 7 条（M21）的判定依据
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    darkMode: mq("(prefers-color-scheme: dark)"),
    pointerEvents: "PointerEvent" in window,
    touchPoints: typeof nav.maxTouchPoints === "number" ? nav.maxTouchPoints : null,
    visualViewport: "visualViewport" in window,
    intersectionObserver: "IntersectionObserver" in window,
    localStorage: lsOk,
    devicePixelRatio:
      typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    standalone,
    connectionType: conn?.effectiveType ?? null,
    online: typeof nav.onLine === "boolean" ? nav.onLine : null,
    userAgent: nav.userAgent ?? null,
  };
}

export interface InteractionProbe {
  /** 当前已记录的样本数（供页面显示「探针运行中 · 已记录 N 条」） */
  count: () => number;
  /** 取全部样本（毫秒，未取整；统计在 lib.probeStats 统一处理） */
  samples: () => number[];
  /** 停止监听并释放 */
  stop: () => void;
}

const MAX_SAMPLES = 500;

/** 交互响应日志：pointerdown 时刻 → 下一帧 requestAnimationFrame 回调时刻的间隔。
 *  只在验收页打开期间运行（start/stop 配对），不落盘、不上传，提交时才随记录带走统计与样本数。 */
export function startInteractionProbe(): InteractionProbe {
  const samples: number[] = [];
  let stopped = false;
  const onDown = () => {
    if (stopped) return;
    const t0 = performance.now();
    requestAnimationFrame(() => {
      if (stopped) return;
      if (samples.length < MAX_SAMPLES) samples.push(performance.now() - t0);
    });
  };
  document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  return {
    count: () => samples.length,
    samples: () => [...samples],
    stop: () => {
      stopped = true;
      document.removeEventListener("pointerdown", onDown, { capture: true });
    },
  };
}
