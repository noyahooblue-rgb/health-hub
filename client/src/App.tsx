// 个人健康管理中心（设计版已上线）：五页签 —— 今日 / 趋势 / 计划（内含专题分段）/ 复盘 / 我的（档案+设置）。
// 导航为 React 单次声明式渲染（幂等，不会叠加第二套）；玻璃只用于悬浮层；
// 向下滚动自动收窄（下滚累计 ≥40px 且 y>150 触发，上滚/停留/弹层/键盘时展开或隐藏）。
// 首次打开写入经授权实查的 Apple Health 快照，之后所有页面只读数据库；所有编辑都走服务端动作真实落盘。
// health-ui v1.0.2 安全网：点页签先 resetTransientUi 无条件复位瞬态状态再切换并自检；
// 导航层独立层级（见 theme.css 文件头层级总表）；每页签错误边界；kbHidden 看门狗与全局手势复位。

import {
memo,
useCallback,
useEffect,
useMemo,
useRef,
useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "./api";
import { dataProvider } from "./data";
import type { Dashboard } from "./lib";
import {
GradientDefs,
NavContext,
NavIcons,
SheetProvider,
ToastProvider,
useSheet,
useReducedMotion,
type MineView,
type TabKey,
} from "./ui";
import { TodayPage } from "./pages_today";
import { TrendsPage } from "./pages_trends";
import { PlanPage } from "./pages_plan";
import { ReviewPage } from "./pages_review";
import { MinePage } from "./pages_mine";
import { TabBoundary } from "./ui";
import { installGlobalErrorHooks, reportError } from "./errlog";

declare global {
  interface Window {
    __appFirstScreenMs?: number;
  }
}

const TABS: { key: TabKey; label: string; icon: keyof typeof NavIcons }[] = [
  { key: "today", label: "今日", icon: "today" },
  { key: "trends", label: "趋势", icon: "trends" },
  { key: "plan", label: "计划", icon: "plan" },
  { key: "review", label: "复盘", icon: "review" },
  { key: "mine", label: "我的", icon: "mine" },
];

const TITLES: Record<TabKey, string> = {
  today: "今日",
  trends: "趋势",
  plan: "计划",
  review: "复盘",
  mine: "我的",
};

declare global {
  interface Window {
    __chartScrubbing?: boolean;
  }
}

// ── 先显示、后刷新（方案 C 等效实现条件 1）：上次 dashboard 存 localStorage，打开先用缓存渲染，
// 后台拉取回来后 React Query 结构共享只更新变化部分；刷新不重置滚动、不关弹层、不动未提交的表单状态。
const DASH_CACHE_KEY = "health-dash-cache-v1";
interface DashCache {
  at: number;
  data: unknown;
}
function readDashCache(): DashCache | null {
  if (dataProvider.kind !== "real") return null;
  try {
    const raw = window.localStorage.getItem(DASH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashCache;
    return parsed && typeof parsed.at === "number" && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}

export function App() {
  return (
    <ToastProvider>
      <SheetProvider>
        <Shell />
      </SheetProvider>
    </ToastProvider>
  );
}

/** 会唤起软键盘的输入元素（勾选框/单选/滑杆获焦不算键盘弹出，不能据此隐藏导航）。 */
function isTextEntry(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "hidden"].includes(
      el.type,
    );
  }
  return false;
}

function scrollTopBoth() {
  window.scrollTo({ top: 0 });
  const se = document.scrollingElement;
  if (se && se !== document.documentElement) se.scrollTop = 0;
}

// ── 页签预热（v1.0.2 改分级，事故第 7 条）：首屏渲染完成、浏览器空闲时先预热
// 轻页签（复盘 / 我的：无图表、节点少）；重页签（趋势 / 计划：含全部图表）推迟到
// 用户首次 pointerdown 之后才挂载——v1.1.0 事故中「进入变慢」的结构性来源正是
// 首屏后立刻全量渲染趋势页全部图表、占满主线程。容器 visibility:hidden + inert +
// 1px 高裁切：不可见、不可点、不进无障碍树；图表按容器真实宽度量测。
// 预热副本只读同一份 dashboard 数据，不发请求、不写数据（趋势页 onNeedFull 仅由
// 用户点选触发）。副本经 memo 冻结：比较函数只认 heavy 标志——heavy 翻开时重渲染
// 一次挂上重页签，其余时候（切页签、数据刷新、乐观更新）永不重演，否则预热反而
// 给每次交互加一遍渲染开销。每个副本页签另包 silent 错误边界，出错不拖垮真页。
const WarmTabs = memo(
  function WarmTabs({
    d,
    ensureFull,
    heavy,
  }: {
    d: Dashboard;
    ensureFull: () => void;
    heavy: boolean;
  }) {
    const [planSub, setPlanSub] = useState<"goals" | "topics">("goals");
    const [topicSel, setTopicSel] = useState<string | null>(null);
    const [mineView, setMineView] = useState<MineView>("home");
    return (
      <>
        {heavy && (
          <>
            <TabBoundary silent name="warm-trends">
              <TrendsPage d={d} onNeedFull={ensureFull} />
            </TabBoundary>
            <TabBoundary silent name="warm-plan">
              <PlanPage
                d={d}
                sub={planSub}
                setSub={setPlanSub}
                topicSel={topicSel}
                setTopicSel={setTopicSel}
              />
            </TabBoundary>
          </>
        )}
        <TabBoundary silent name="warm-review">
          <ReviewPage d={d} />
        </TabBoundary>
        <TabBoundary silent name="warm-mine">
          <MinePage d={d} view={mineView} setView={setMineView} />
        </TabBoundary>
      </>
    );
  },
  (prev, next) => prev.heavy === next.heavy,
);

function Shell() {
  const sheet = useSheet();
  const sheetOpen = sheet.isOpen;
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("today");
  const [planSub, setPlanSub] = useState<"goals" | "topics">("goals");
  const [topicSel, setTopicSel] = useState<string | null>(null);
  const [mineView, setMineView] = useState<MineView>("home");
  const [shrunk, setShrunk] = useState(false);
  const [topShow, setTopShow] = useState(false);
  const [kbHidden, setKbHidden] = useState(false);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  // 滚动状态镜像：只在值真正变化时才 setState，避免滚动期间整页重渲染拖慢点击响应。
  const shrunkRef = useRef(false);
  const topRef = useRef(false);
  const sheetOpenRef = useRef(false);
  const navEnabledRef = useRef(true);
  const lastY = useRef(0);
  const downAcc = useRef(0);
  const guardUntil = useRef(0);
  const reducedMotion = useReducedMotion();

  const applyShrunk = useCallback((v: boolean) => {
    if (shrunkRef.current !== v) {
      shrunkRef.current = v;
      setShrunk(v);
    }
  }, []);
  const applyTop = useCallback((v: boolean) => {
    if (topRef.current !== v) {
      topRef.current = v;
      setTopShow(v);
    }
  }, []);

  // 按需拉取（条件 2）：默认只取最近 90 天明细 + 更早月份汇总；趋势切到 90 天且存在更早数据时，
  // ensureFull 切到全量再取一次。fullRef 保持查询键恒为 ["dashboard"]，乐观更新（patchDashboard）不受影响。
  const fullRef = useRef(false);
  const [dashCache] = useState<DashCache | null>(() => readDashCache());
  const dash = useQuery({
    queryKey: ["dashboard"],
    queryFn: () =>
      dataProvider.getDashboard(fullRef.current ? {} : { detailDays: 90 }),
    // 先显示缓存、后刷新（条件 1）；5 分钟内切页签/重挂载不重新拉取（条件 4）。
    initialData: dashCache ? (dashCache.data as Dashboard) : undefined,
    initialDataUpdatedAt: dashCache?.at,
    staleTime: 5 * 60 * 1000,
    // 同步进行中时自动轮询：saveHealthData 回填后状态变回 idle，徽标时间随之更新，无需手动刷新页面。
    refetchInterval: (query) =>
      query.state.data?.sync.status === "syncing" ? 15000 : false,
  });
  useEffect(() => {
    if (dash.data && dataProvider.kind === "real") {
      try {
        window.localStorage.setItem(
          DASH_CACHE_KEY,
          JSON.stringify({ at: Date.now(), data: dash.data }),
        );
      } catch {
        /* 存储不可用时静默跳过，不影响使用 */
      }
    }
  }, [dash.data]);
  const ensureFull = useCallback(() => {
    if (!fullRef.current) {
      fullRef.current = true;
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    }
  }, [qc]);
  const seedTried = useRef(false);
  useEffect(() => {
    if (dataProvider.kind !== "real") return; // 预览模式不写库
    if (dash.data && !dash.data.seeded && !seedTried.current) {
      seedTried.current = true;
      void api
        .seedSnapshot({})
        .then(() => qc.invalidateQueries({ queryKey: ["dashboard"] }));
    }
  }, [dash.data, qc]);

  // 页签预热：数据就绪后等浏览器空闲（requestIdleCallback，兜底 900ms 定时器）再挂载预热副本，
  // 不与首屏渲染抢主线程。副本真实布局渲染约 1.5s（图表完成宽度量测）后转入 parked
  // （display:none）：焐热成果（JIT、布局与字体缓存）保留，但副本不再参与页面布局计算，
  // 不给正常浏览与切页签添帧开销。
  const [warm, setWarm] = useState(false);
  const [parked, setParked] = useState(false);
  // 重页签（趋势/计划）预热开关：首次 pointerdown 后才翻开（安全网第 7 条）。
  const [heavyWarm, setHeavyWarm] = useState(false);
  useEffect(() => {
    const onDown = () => setHeavyWarm(true);
    window.addEventListener("pointerdown", onDown, { once: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);
  useEffect(() => {
    if (!warm) return;
    const t = window.setTimeout(() => setParked(true), 1500);
    return () => window.clearTimeout(t);
  }, [warm]);
  // heavy 翻开时副本要真实布局一遍（图表量测）才焐热：临时解 parked，1.5s 后再停放。
  useEffect(() => {
    if (!heavyWarm || !warm) return;
    setParked(false);
    const t = window.setTimeout(() => setParked(true), 1500);
    return () => window.clearTimeout(t);
  }, [heavyWarm, warm]);

  // 首屏时间钩子（量测用）：Shell 首次渲染 → 数据就绪后首帧绘制完成的毫秒数，
  // 写入 window.__appFirstScreenMs 供发布量测读取（口径见 DATA-PLAN）。
  const shellT0 = useRef(performance.now());
  const firstScreenDone = useRef(false);
  useEffect(() => {
    if (!dash.data || firstScreenDone.current) return;
    firstScreenDone.current = true;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.__appFirstScreenMs = Math.max(
          0,
          Math.round(performance.now() - shellT0.current),
        );
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [dash.data]);

  // 全局错误钩子（安全网 F）：window.onerror / unhandledrejection → 错误记录。
  useEffect(() => {
    installGlobalErrorHooks();
  }, []);

  // 安全网 B：全局手势残留复位——任何 pointerup/pointercancel 收尾图表拖动锁；
  // 窗口失焦 / 切后台再回来清弹层拖动态与图表锁（按松手收尾），不让残留状态跨场景存活。
  useEffect(() => {
    const clearLocks = () => {
      window.__chartScrubbing = false;
    };
    const clearAll = () => {
      window.__chartScrubbing = false;
      document.body.classList.remove("sheet-dragging");
      if (!sheetOpenRef.current) document.body.style.removeProperty("--page-scale");
    };
    const onVis = () => {
      if (document.hidden) clearAll();
      else clearAll();
    };
    window.addEventListener("pointerup", clearLocks);
    window.addEventListener("pointercancel", clearLocks);
    window.addEventListener("blur", clearAll);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerup", clearLocks);
      window.removeEventListener("pointercancel", clearLocks);
      window.removeEventListener("blur", clearAll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // 安全网 B：kbHidden 看门狗——键盘隐藏导航的状态若因 focusout 丢失而卡死，
  // 1 秒轮询发现焦点已离开输入元素即恢复；焦点仍在输入上但状态持续 5 秒以上
  // 也硬逃生恢复（真实键盘场景下 5 秒足够完成一次输入焦点转移判定）。
  useEffect(() => {
    if (!kbHidden) return;
    const started = Date.now();
    const iv = window.setInterval(() => {
      if (!isTextEntry(document.activeElement) || Date.now() - started > 5000) {
        setKbHidden(false);
        document.body.style.removeProperty("--kb-h");
      }
    }, 1000);
    return () => window.clearInterval(iv);
  }, [kbHidden]);
  useEffect(() => {
    if (!dash.data || warm) return;
    let cancelled = false;
    const start = () => {
      if (!cancelled) setWarm(true);
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 2000 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    const t = window.setTimeout(start, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [dash.data, warm]);

  // 习惯收敛到定版 3 个：服务端一次性动作（meta 标记防重复），已执行则跳过。
  const capTried = useRef(false);
  useEffect(() => {
    if (dataProvider.kind !== "real") return; // 预览模式不写库
    if (
      dash.data?.seeded &&
      dash.data.settings["habit_cap_v1"] !== "1" &&
      !capTried.current
    ) {
      capTried.current = true;
      void api
        .enforceHabitCap({})
        .then(() => qc.invalidateQueries({ queryKey: ["dashboard"] }))
        .catch(() => {
          capTried.current = false;
        });
    }
  }, [dash.data, qc]);

  const d = dash.data;
  const navShrinkEnabled = (d?.settings["nav_shrink"] ?? "1") !== "0" && !reducedMotion;
  sheetOpenRef.current = sheetOpen;
  navEnabledRef.current = navShrinkEnabled;

  // ── 安全网 A：瞬态 UI 无条件复位 ──
  // 点页签（及一切编程式导航）先把所有可能卡死的瞬态状态一次清干净，再切换：
  // 关弹层、清键盘隐藏与 --kb-h、清弹层拖动残留（sheet-dragging / --page-scale）、
  // 清图表拖动锁、让输入失焦。这样无论此前哪一层状态卡死，点页签永远能切过去。
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const resetTransientUi = useCallback(() => {
    sheet.close();
    setKbHidden(false);
    document.body.style.removeProperty("--kb-h");
    document.body.classList.remove("sheet-dragging");
    if (!sheetOpenRef.current) document.body.style.removeProperty("--page-scale");
    window.__chartScrubbing = false;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && isTextEntry(ae)) ae.blur();
  }, [sheet]);

  // 页签自检（安全网 F）：切换后 300ms 路由仍未变 → 记一条 nav-stuck 错误记录，
  // 并再复位重切一次（第二次仍失败也不再循环，只留记录待查）。
  // 每次导航递增序号：自检触发时若已有更新的导航发生，说明用户已主动切走，
  // 旧检查直接作废——否则快速连点两个页签时，旧自检会把新页签误切回去。
  const navSeqRef = useRef(0);
  const selfCheckTab = useCallback(
    (t: TabKey) => {
      const seq = ++navSeqRef.current;
      window.setTimeout(() => {
        if (navSeqRef.current !== seq) return;
        if (tabRef.current !== t) {
          reportError("nav-stuck", `点页签后 300ms 仍未切换到 ${t}`, `stuck-at:${tabRef.current}`);
          resetTransientUi();
          setTab(t);
        }
      }, 300);
    },
    [resetTransientUi],
  );

  const goTab = useCallback(
    (t: TabKey) => {
      resetTransientUi();
      // 点页签同时清详情视图：计划回目标分段、专题选择清空、我的回根列表。
      setPlanSub("goals");
      setTopicSel(null);
      setMineView("home");
      setTab(t);
      scrollTopBoth();
      applyShrunk(false);
      downAcc.current = 0;
      guardUntil.current = Date.now() + 700;
      selfCheckTab(t);
    },
    [applyShrunk, resetTransientUi, selfCheckTab],
  );
  const openTopic = useCallback(
    (key: string) => {
      resetTransientUi();
      setTab("plan");
      setPlanSub("topics");
      setTopicSel(key);
      scrollTopBoth();
      applyShrunk(false);
      downAcc.current = 0;
      guardUntil.current = Date.now() + 700;
      selfCheckTab("plan");
    },
    [applyShrunk, resetTransientUi, selfCheckTab],
  );
  const openMine = useCallback(
    (v: MineView) => {
      resetTransientUi();
      setTab("mine");
      setMineView(v);
      scrollTopBoth();
      applyShrunk(false);
      downAcc.current = 0;
      guardUntil.current = Date.now() + 700;
      selfCheckTab("mine");
    },
    [applyShrunk, resetTransientUi, selfCheckTab],
  );
  const navApi = useMemo(
    () => ({ goTab, openTopic, openMine }),
    [goTab, openTopic, openMine],
  );

  // 导航滑块位置：只读按钮 offset（水平），上下由 CSS 固定（top/bottom: 5px），不写内联高度。
  useEffect(() => {
    const place = () => {
      const idx = TABS.findIndex((t) => t.key === tab);
      const btn = btnRefs.current[idx];
      const pill = pillRef.current;
      if (btn && pill) {
        pill.style.left = `${btn.offsetLeft}px`;
        pill.style.width = `${btn.offsetWidth}px`;
        pill.style.opacity = "1";
      }
    };
    place();
    const t1 = window.setTimeout(place, 120);
    const t2 = window.setTimeout(place, 620);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", place);
    };
  }, [tab, shrunk, sheetOpen, kbHidden]);

  // 滚动行为：与设计提案逐条对齐 —— rAF 节流；window 冒泡 + document 捕获双通道监听
  // （内层滚动容器滚动时 window 冒泡监听收不到事件，捕获通道兜底）；
  // ① 下滚累计 ≥40px 且 y>150 收窄 ② 上滚任意幅度立即展开 ③ y<60 或滑到底展开
  // ④ 内容不足一屏永不收窄 ⑤ 拖动图表查数时不触发 ⑥ 弹层打开时导航隐藏、顶部标题隐藏
  // ⑦ 键盘弹出（输入聚焦）时隐藏导航 ⑧ 刚切换页签 700ms 内不收窄。
  // M04（清单 v2）：已删除「停留约 1.1s 自动展开」——展开只保留 ②③ 三个触发，
  // 停留在页面中段静置时导航保持收窄、不自行展开。
  useEffect(() => {
    lastY.current = Math.max(
      window.scrollY || 0,
      document.scrollingElement?.scrollTop ?? 0,
    );
    let tick = false;
    // 实际滚动元素：壳内层滚动容器滚动时事件 target 是该元素，文档本身不滚；
    // 「可滚 / 到底」必须按这个元素量，否则会误判页面不可滚、收窄永不触发。
    const scrollerRef = { current: null as Element | null };
    const scrollYOf = (e: Event): number => {
      const t = e.target;
      if (t instanceof Element) {
        if (!t.closest(".sheet-wrap")) scrollerRef.current = t;
        return t.scrollTop;
      }
      return Math.max(window.scrollY || 0, document.scrollingElement?.scrollTop ?? 0);
    };
    const scrollerMetrics = () => {
      const el = scrollerRef.current;
      if (el && el !== document.documentElement && el !== document.body) {
        return { sh: el.scrollHeight, ch: el.clientHeight };
      }
      return {
        sh: Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight ?? 0,
        ),
        ch: window.innerHeight || 0,
      };
    };
    const pageScrollable = () => {
      const m = scrollerMetrics();
      return m.sh > m.ch + 8;
    };
    const atPageBottom = (y: number) => {
      const m = scrollerMetrics();
      return y + m.ch >= m.sh - 2;
    };
    const isTyping = () => isTextEntry(document.activeElement);
    const apply = (y: number) => {
      tick = false;
      const open = sheetOpenRef.current;
      applyTop(y > 120 && !open);
      const dy = y - lastY.current;
      if (
        !navEnabledRef.current ||
        open ||
        window.__chartScrubbing ||
        isTyping() ||
        Date.now() < guardUntil.current ||
        !pageScrollable()
      ) {
        applyShrunk(false);
        downAcc.current = 0;
      } else if (atPageBottom(y) || y < 60) {
        applyShrunk(false);
        downAcc.current = 0;
      } else if (dy < 0) {
        applyShrunk(false);
        downAcc.current = 0;
      } else if (dy > 0) {
        downAcc.current += dy;
        if (downAcc.current >= 40 && y > 150) applyShrunk(true);
      }
      lastY.current = y;
    };
    const onScroll = (e: Event) => {
      if (!tick) {
        tick = true;
        const y = scrollYOf(e);
        requestAnimationFrame(() => apply(y));
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [applyShrunk, applyTop]);

  // 键盘弹出时隐藏导航（提案 ⑦）+ 键盘避让（M25）：输入类元素聚焦即隐藏导航；
  // 键盘高度经 visualViewport 测得后写入 --kb-h（弹层底部留白随之抬高，主按钮不被挡），
  // 并把聚焦输入框滚入可视区；键盘收起（失焦且无其他输入聚焦）后清掉留白并回到原滚动位置。
  useEffect(() => {
    let savedY: number | null = null;
    const vv = window.visualViewport;
    const applyKb = () => {
      if (!vv) return;
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (kb > 80 && isTextEntry(document.activeElement)) {
        document.body.style.setProperty("--kb-h", `${Math.round(kb)}px`);
        const ae = document.activeElement as HTMLElement | null;
        window.setTimeout(() => {
          ae?.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 60);
      } else if (kb <= 80) {
        document.body.style.removeProperty("--kb-h");
      }
    };
    const onIn = (e: FocusEvent) => {
      if (!isTextEntry(e.target as Element | null)) return;
      setKbHidden(true);
      if (savedY == null) {
        savedY = Math.max(
          window.scrollY || 0,
          document.scrollingElement?.scrollTop ?? 0,
        );
      }
      applyKb();
    };
    const onOut = () => {
      window.setTimeout(() => {
        if (!isTextEntry(document.activeElement)) {
          setKbHidden(false);
          document.body.style.removeProperty("--kb-h");
          if (savedY != null) {
            window.scrollTo({ top: savedY });
            const se = document.scrollingElement;
            if (se && se !== document.documentElement) se.scrollTop = savedY;
            savedY = null;
          }
        }
      }, 150);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    vv?.addEventListener("resize", applyKb);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
      vv?.removeEventListener("resize", applyKb);
      document.body.style.removeProperty("--kb-h");
    };
  }, []);

  const navHidden = sheetOpen || kbHidden;
  const topVisible = topShow && !sheetOpen;

  return (
    <NavContext.Provider value={navApi}>
        <div className="min-h-screen">
          <SafeAreaTopScrim backgroundColor="var(--bg)" />
          <GradientDefs />
          <div id="topbar" className={topVisible ? "show" : ""} aria-hidden={!topVisible}>
            <span className="tb-title">{TITLES[tab]}</span>
          </div>
          <main className="wrap">
            {dataProvider.kind === "mock" && (
              <div
                role="note"
                style={{
                  marginTop: 14,
                  background: "var(--amber-soft)",
                  color: "var(--body)",
                  borderRadius: "var(--r-sm)",
                  padding: "10px 14px",
                  fontSize: 13.5,
                  lineHeight: 1.6,
                }}
              >
                <b style={{ color: "var(--ink)" }}>设计预览 · 示例数据</b>
                　本页所有数值与条目均为虚构，仅供设计交付与审查；操作不会写入真实数据。
              </div>
            )}
            {dash.isPending || (d && !d.seeded) ? (
              <div style={{ padding: "64px 0", textAlign: "center" }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
                  正在整理你的健康数据…
                </p>
                <p style={{ fontSize: 14, color: "var(--dim)", marginTop: 8 }}>
                  首次打开会写入已授权同步的 Apple Health 数据并完成数据盘点。
                </p>
              </div>
            ) : dash.error ? (
              <div style={{ padding: "64px 0", textAlign: "center" }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>数据读取失败</p>
                <p style={{ fontSize: 14, color: "var(--dim)", marginTop: 8 }}>
                  {String(dash.error)}
                </p>
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginTop: 16 }}
                  onClick={() => dash.refetch()}
                >
                  重试
                </button>
              </div>
            ) : d ? (
              <div key={tab} className="page">
                {tab === "today" && (
                  <TabBoundary name="tab-today">
                    <TodayPage d={d} />
                  </TabBoundary>
                )}
                {tab === "trends" && (
                  <TabBoundary name="tab-trends">
                    <TrendsPage d={d} onNeedFull={ensureFull} />
                  </TabBoundary>
                )}
                {tab === "plan" && (
                  <TabBoundary name="tab-plan">
                    <PlanPage
                      d={d}
                      sub={planSub}
                      setSub={setPlanSub}
                      topicSel={topicSel}
                      setTopicSel={setTopicSel}
                    />
                  </TabBoundary>
                )}
                {tab === "review" && (
                  <TabBoundary name="tab-review">
                    <ReviewPage d={d} />
                  </TabBoundary>
                )}
                {tab === "mine" && (
                  <TabBoundary name="tab-mine">
                    <MinePage d={d} view={mineView} setView={setMineView} />
                  </TabBoundary>
                )}
              </div>
            ) : null}
            {d && warm && (
              <div className={`tab-warm${parked ? " parked" : ""}`} aria-hidden="true" inert>
                <WarmTabs d={d} ensureFull={ensureFull} heavy={heavyWarm} />
              </div>
            )}
          </main>

          <nav
            aria-label="主导航"
            className={`tabs glass${shrunk && !navHidden ? " shrunk" : ""}${navHidden ? " nav-hidden" : ""}`}
          >
            <span className="nav-pill" ref={pillRef} aria-hidden="true" />
            {TABS.map((t, i) => (
              <button
                key={t.key}
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                type="button"
                aria-current={tab === t.key ? "page" : undefined}
                aria-label={t.label}
                className={tab === t.key ? "on" : ""}
                onClick={() => goTab(t.key)}
              >
                {NavIcons[t.icon]}
                <span className="nl">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
    </NavContext.Provider>
  );
}
