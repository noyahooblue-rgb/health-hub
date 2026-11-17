// 共享 UI（设计版定版）：类别符号、卡片、玻璃弹层、分段控件、
// 1:1 像素渲染的拖动查数走势图（基线带 + 读数在标题区）、周柱状图、计数动画。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import { fmt, segmentAverage, type Baseline } from "./lib";
import { easeOutCubic, projectVelocity, rubberBand } from "./motion";

export type TabKey = "today" | "trends" | "plan" | "review" | "mine";
export type MineView =
  | "home" | "profile" | "labs" | "data" | "remind" | "display" | "export" | "about" | "accept";

export interface NavApi {
  goTab: (t: TabKey) => void;
  openTopic: (key: string) => void;
  openMine: (v: MineView) => void;
}
export const NavContext = createContext<NavApi>({
  goTab: () => {},
  openTopic: () => {},
  openMine: () => {},
});
export const useNav = () => useContext(NavContext);

// ---------- 基础 ----------

export function useDark(): boolean {
  const [dark, setDark] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return dark;
}

export function useReducedMotion(): boolean {
  const [reduced] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}

function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 入场动画：元素进入视口加 .inview（与提案 setupMotion 同规则，另有 1.2s 兜底）。 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add("reveal");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("inview");
      return;
    }
    let done = false;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting && !done) {
            done = true;
            el.classList.add("inview");
            io.disconnect();
          }
        }
      },
      { threshold: 0, rootMargin: "1200px 0px 1200px 0px" },
    );
    io.observe(el);
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        el.classList.add("inview");
        io.disconnect();
      }
    }, 1200);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);
  return ref;
}

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`card ${className}`} style={style}>
      {children}
    </section>
  );
}

export function Chev() {
  return (
    <svg
      viewBox="0 0 10 16"
      fill="none"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 2l6 6-6 6" />
    </svg>
  );
}

export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "ok" | "warn" | "danger" | "neutral";
  children: ReactNode;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function MRow({
  label,
  value,
  note,
  delta,
}: {
  label: string;
  value: string;
  note?: string;
  delta?: string;
}) {
  return (
    <div className="mrow">
      <div className="ml">
        <div className="t">{label}</div>
        {note ? <div className="n">{note}</div> : null}
      </div>
      <div className="mv">
        <div className="v">{value}</div>
        {delta ? <div className="d">{delta}</div> : null}
      </div>
    </div>
  );
}

export function EmptyBox({
  text,
  left = false,
}: {
  text: string;
  left?: boolean;
}) {
  return <div className={`empty${left ? " left" : ""}`}>{text}</div>;
}

export function Insufficient({ text = "数据不足" }: { text?: string }) {
  return <EmptyBox text={text} />;
}

export function TtlHead({
  label,
  right,
}: {
  label: string;
  right?: ReactNode;
}) {
  return (
    <div className="card-head">
      <span className="ttl">{label}</span>
      {right}
    </div>
  );
}

// ---------- 类别符号（白色瓦片 + 类别色渐变符号，上深下浅） ----------

export function GradientDefs() {
  const grads: [string, string, string, string][] = [
    ["g-heart", "#e3003c", "#ff2d55", "#ff7d9c"],
    ["g-sleep", "#3f3dc0", "#5856d6", "#9d9bf5"],
    ["g-energy", "#ef6c00", "#ff8a00", "#ffb340"],
    ["g-activity", "#f07d00", "#ff9500", "#ffc04d"],
    ["g-hrv", "#8e36c4", "#af52de", "#d58bf5"],
    ["g-spo2", "#0059d6", "#007aff", "#5eb5ff"],
    ["g-green", "#1d9e46", "#34c759", "#7de79b"],
    ["g-mint", "#00a89f", "#00c7be", "#5fe3dd"],
    ["g-teal", "#00918f", "#00c7be", "#5fe3dd"],
    ["g-yellow", "#d18d00", "#ffcc00", "#ffe066"],
    ["g-sky", "#0a84ff", "#64d2ff", "#a8e4ff"],
  ];
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {grads.map(([id, a, b, c]) => (
          <linearGradient key={id} id={id} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset=".52" stopColor={b} />
            <stop offset="1" stopColor={c} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

export const GLYPHS: Record<string, ReactNode> = {
  moon: (
    <svg viewBox="0 0 24 24" fill="url(#g-sleep)" aria-hidden="true">
      <path d="M20.6 14.5A8.8 8.8 0 1 1 9.5 3.4a7.2 7.2 0 1 0 11.1 11.1z" />
    </svg>
  ),
  heart: (
    <svg viewBox="0 0 24 24" fill="url(#g-heart)" aria-hidden="true">
      <path d="M12 20.7C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.7 5c1.7 0 3.3.9 4.3 2.4C13 5.9 14.6 5 16.3 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.8z" />
    </svg>
  ),
  flame: (
    <svg viewBox="0 0 24 24" fill="url(#g-energy)" aria-hidden="true">
      <path d="M12.7 2.3c.9 2.9-.9 4.6-2 6-.8 1-1.4 1.9-1.4 3.2a4.7 4.7 0 0 0 9.4 0c0-1.6-.6-2.8-1.3-4-.4 1-1 1.8-1.8 2.3.2-2.9-1.3-6-3.9-7.5zM12 21.5a3.2 3.2 0 0 1-3.2-3.2c0-1.3.7-2.2 1.4-3.1.6-.8 1.2-1.5 1.8-2.7.6 1.2 1.2 1.9 1.8 2.7.7.9 1.4 1.8 1.4 3.1A3.2 3.2 0 0 1 12 21.5z" />
    </svg>
  ),
  wave: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-hrv)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12h4l2.5-6.5 4 13L15 12h7" />
    </svg>
  ),
  wind: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-spo2)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 8h8.5a2.5 2.5 0 1 0-2.4-3.2M2 12h13.5a2.5 2.5 0 1 1-2.4 3.2M3 16h6" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="url(#g-energy)" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11L9.8 22l8.7-11.5H12L13 2z" />
    </svg>
  ),
  steps: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-yellow)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 4.5a1.8 1.8 0 1 0 0-.01M10.2 8.2 7 12l2.6 2.2.9 4.3M10.2 8.2l2.9 1.6 2.9.7M10.2 8.2 13.1 9.8l.4 3.4 2.6 2.8M9.6 14.2l-2.9 1.6-1 3.2" />
    </svg>
  ),
  scale: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-teal)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 20a8 8 0 1 1 14 0" />
      <path d="M12 15l3.8-5.2" />
      <circle cx="12" cy="15" r="1.4" fill="url(#g-teal)" stroke="none" />
    </svg>
  ),
  leaf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-green)" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M19.5 4.5C11.5 5 5.5 11 5.5 18.5c7.5 0 13.5-6 14-14zM5.5 18.5C7 13 10.5 9 15 6.8" />
    </svg>
  ),
  desk: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-spo2)" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="11.5" rx="2" />
      <path d="M9.5 20h5M12 16v4" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-teal)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 2.6v5.6c0 4.6-3 7.8-7 9.3-4-1.5-7-4.7-7-9.3V5.6L12 3z" />
      <path d="M9 11.6l2.2 2.2 4-4.2" />
    </svg>
  ),
  plane: (
    <svg viewBox="0 0 24 24" fill="url(#g-sky)" aria-hidden="true">
      <path d="M21.5 3.5c-.7-.4-1.6.1-1.9.3L9 10.4 3.9 8.6c-.4-.1-.9 0-1.2.3l-.9 1c-.3.4-.2 1 .2 1.3l3.7 2.5-1.9 3.6-1.7-.7c-.4-.2-.9 0-1.1.4l-.5.9c-.2.5 0 1 .5 1.2l2.5 1 .9.4c.4.2.9 0 1.2-.3l1-1.1c.2-.2.3-.4.3-.7l.5-4.2 6.9-4.5c2.4-1.6 4.4-4.6 4.6-5.6.1-.5 0-1.2-.5-1.6z" transform="rotate(8 12 12)" />
    </svg>
  ),
  person: (
    <svg viewBox="0 0 24 24" fill="url(#g-heart)" aria-hidden="true">
      <circle cx="12" cy="8" r="3.7" />
      <path d="M4.3 20.2c.9-3.8 4-5.7 7.7-5.7s6.8 1.9 7.7 5.7a1.4 1.4 0 0 1-1.4 1.7H5.7a1.4 1.4 0 0 1-1.4-1.7z" />
    </svg>
  ),
  clipboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="4.8" width="12" height="15.7" rx="2" />
      <path d="M9.6 4.8a2.4 2.4 0 0 1 4.8 0" />
      <path d="M9.4 11.2h5.2M9.4 14.8h5.2" />
    </svg>
  ),
  database: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-spo2)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <ellipse cx="12" cy="5.8" rx="7" ry="2.8" />
      <path d="M5 5.8v12.4c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V5.8" />
      <path d="M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="url(#g-yellow)" aria-hidden="true">
      <path d="M12 3.4a5.6 5.6 0 0 1 5.6 5.6c0 3.4.8 4.8 1.7 5.9a.9.9 0 0 1-.7 1.5H5.4a.9.9 0 0 1-.7-1.5c.9-1.1 1.7-2.5 1.7-5.9A5.6 5.6 0 0 1 12 3.4z" />
      <circle cx="12" cy="19" r="1.9" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-sky)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12S6.1 5.6 12 5.6 21.5 12 21.5 12 17.9 18.4 12 18.4 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-energy)" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="4.7" />
      <circle cx="12" cy="12" r="1.5" fill="url(#g-energy)" stroke="none" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5v10.6M7.2 10.2 12 15l4.8-4.8" />
      <path d="M4.5 19.5h15" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-spo2)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11.2v4.8" />
      <circle cx="12" cy="7.9" r="1.35" fill="url(#g-spo2)" stroke="none" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-green)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.2 12.4l2.6 2.6 5-5.4" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="url(#g-heart)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 6.5h15M9.6 6.3V4.9a1.4 1.4 0 0 1 1.4-1.4h2a1.4 1.4 0 0 1 1.4 1.4v1.4" />
      <path d="M6.6 6.5l.8 11.9a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.8-11.9" />
      <path d="M10.1 10.4v5.8M13.9 10.4v5.8" />
    </svg>
  ),
};

export function Sym({ icon, lg = false }: { icon: string; lg?: boolean }) {
  return (
    <span className={`sym${lg ? " lg" : ""}`} aria-hidden="true">
      {GLYPHS[icon] ?? null}
    </span>
  );
}

export function CatHead({
  colorVar,
  icon,
  label,
  right,
}: {
  colorVar: string;
  icon: string;
  label: string;
  right?: ReactNode;
}) {
  return (
    <div className="card-head">
      <span className="cat" style={{ color: `var(${colorVar})` }}>
        <Sym icon={icon} />
        {label}
      </span>
      {right}
    </div>
  );
}

/** 卡片头「专题 ›」跳转按钮（跳到计划页的专题分段并打开该专题）。 */
export function CatTopicBtn({
  colorVar,
  icon,
  label,
  topic,
}: {
  colorVar: string;
  icon: string;
  label: string;
  topic: string;
}) {
  const nav = useNav();
  return (
    <div className="card-head">
      <button
        type="button"
        onClick={() => nav.openTopic(topic)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          background: "transparent",
          border: 0,
          padding: 0,
          minHeight: 44,
          cursor: "pointer",
          fontFamily: "var(--sans)",
        }}
      >
        <span
          className="cat"
          style={{ color: `var(${colorVar})`, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 600 }}
        >
          <Sym icon={icon} />
          {label}
        </span>
        <span style={{ color: "var(--dim)", fontSize: 13 }}>专题 ›</span>
      </button>
    </div>
  );
}

// ---------- 计数动画 ----------

export function CountUp({
  value,
  dec = 0,
  comma = false,
}: {
  value: number;
  dec?: number;
  comma?: boolean;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState<number>(reduced ? value : 0);
  const first = useRef(true);
  const displayRef = useRef(display);
  displayRef.current = display;
  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    // 首次挂载从 0 滚入；之后每次数值变化（每小时刷新/手动同步回填）都从当前显示值补间到新值，
    // 只动数字、不重置任何界面状态（方案 C 第 6 条）。缓动统一走 motion 模块。
    const isFirst = first.current;
    const from = isFirst ? 0 : displayRef.current;
    first.current = false;
    if (from === value) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let t0: number | null = null;
    // M28：数字补间时长 ≤0.4s（首次 400ms、后续变化 350ms）。
    const dur = isFirst ? 400 : 350;
    const step = (ts: number) => {
      if (t0 == null) t0 = ts;
      const p = Math.min((ts - t0) / dur, 1);
      setDisplay(from + (value - from) * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  const s =
    dec > 0
      ? display.toFixed(dec)
      : String(Math.round(display));
  const text = comma
    ? (() => {
        const parts = s.split(".");
        const head = Number(parts[0]).toLocaleString("en-US");
        return parts.length > 1 ? `${head}.${parts[1]}` : head;
      })()
    : s;
  // M28：等宽数字（tabular-nums）+ 行内块容器，补间期间宽度不跳动。
  return <span className="countup-num">{text}</span>;
}

// ---------- 分段控件（滑块跟随） ----------

export function Seg<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  style,
}: {
  items: [T, string][];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const segRef = useRef<HTMLSpanElement | null>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const place = useCallback(() => {
    const btn = btnRefs.current.get(value);
    const thumb = thumbRef.current;
    if (btn && thumb) {
      thumb.style.left = `${btn.offsetLeft}px`;
      thumb.style.width = `${btn.offsetWidth}px`;
    }
  }, [value]);
  useLayoutEffect(place, [place]);
  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("load", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("load", place);
    };
  }, [place]);
  return (
    <span className="seg" role="group" aria-label={ariaLabel} style={style} ref={segRef}>
      <span className="seg-thumb" aria-hidden="true" ref={thumbRef} />
      {items.map(([v, label]) => (
        <button
          key={v}
          type="button"
          ref={(el) => {
            if (el) btnRefs.current.set(v, el);
            else btnRefs.current.delete(v);
          }}
          className={value === v ? "on" : ""}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

// ---------- iOS 开关 ----------

export function Switch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

// ---------- 轻提示（Toast） ----------
// B 类写操作失败回滚后的统一可见提示（发布规范第 2 节 / 清单 M14、M15）：
// 固定在底部导航上方居中，role="alert" 让读屏与自动化都能读到；3.6 秒后自动消失。
// 只负责「显示」，不改变乐观更新、离线队列与恢复网络自动补发的既有逻辑——
// 调用方在 mutation 的 onError（回滚之后）里调 show() 即可。

interface ToastApi {
  show: (msg: string) => void;
}
const ToastContext = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    window.clearTimeout(timer.current);
    setMsg(m);
    setSeq((s) => s + 1);
    timer.current = window.setTimeout(() => setMsg(null), 3600);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {msg && (
        <div key={seq} className="toast" role="alert">
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ---------- 底部弹层 ----------

interface SheetApi {
  open: (node: ReactNode) => void;
  close: () => void;
  isOpen: boolean;
}
const SheetContext = createContext<SheetApi>({
  open: () => {},
  close: () => {},
  isOpen: false,
});
export const useSheet = () => useContext(SheetContext);

export function SheetProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const isOpen = content != null;
  const returnFocus = useRef<Element | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);
  // M24 弹层手势：拖动跟手（把手/头部区域）、松手按速度投射定落点、两档吸附、
  // 背后页面缩放随拖动进度连续变化（--page-scale 内联变量覆盖 body.sheet-open 的定值）。
  const drag = useRef<{
    startY: number;
    startT: number;
    raw: number;
    samples: { t: number; y: number }[];
  } | null>(null);
  const restRef = useRef(0); // 当前吸附档位位移（0 = 全开）
  const detentsRef = useRef<number[]>([0]); // 吸附档位（升序，不含关闭位）
  const heightRef = useRef(0);
  const closeTimer = useRef<number | undefined>(undefined);

  const applyChrome = useCallback((ty: number) => {
    const H = heightRef.current || 1;
    const p = Math.min(Math.max(ty / H, 0), 1);
    document.body.style.setProperty("--page-scale", String(0.94 + 0.06 * p));
    if (bgRef.current) bgRef.current.style.opacity = String(1 - p * 0.9);
  }, []);
  const clearChrome = useCallback(() => {
    document.body.style.removeProperty("--page-scale");
    if (bgRef.current) bgRef.current.style.opacity = "";
  }, []);

  const close = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    drag.current = null;
    restRef.current = 0;
    clearChrome();
    document.body.classList.remove("sheet-dragging");
    setContent(null);
    const el = returnFocus.current as HTMLElement | null;
    if (el?.focus) el.focus();
    returnFocus.current = null;
  }, [clearChrome]);
  const open = useCallback(
    (node: ReactNode) => {
      window.clearTimeout(closeTimer.current);
      returnFocus.current = document.activeElement;
      restRef.current = 0;
      drag.current = null;
      clearChrome();
      const panel = panelRef.current;
      if (panel) {
        panel.style.transform = "";
        panel.style.transition = "";
        panel.style.animation = "";
      }
      setContent(node);
    },
    [clearChrome],
  );

  useEffect(() => {
    document.body.classList.toggle("sheet-open", isOpen);
    if (isOpen) {
      const t = setTimeout(() => closeBtnRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen]);

  // 打开（或换内容）后量弹层高度定档位：高于 62% 视口的弹层给两档（全开 / 半开），其余单档。
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const H = panel.offsetHeight;
      if (H > 0) heightRef.current = H;
      const vh = window.innerHeight || 1;
      detentsRef.current =
        H > vh * 0.62 ? [0, Math.round(H * 0.55)] : [0];
      restRef.current = 0;
    }, 40);
    return () => clearTimeout(t);
  }, [content, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [isOpen, close]);

  const onDragStart = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return; // 关闭按钮不触发拖动
    const panel = panelRef.current;
    if (!panel) return;
    if (!heightRef.current) heightRef.current = panel.offsetHeight;
    drag.current = {
      startY: e.clientY,
      startT: restRef.current,
      raw: restRef.current,
      samples: [{ t: performance.now(), y: e.clientY }],
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    panel.style.animation = "none"; // 入场动画的 fill 会压过内联 transform，拖动前先关掉
    panel.style.transition = "none";
    document.body.classList.add("sheet-dragging");
  };
  const onDragMove = (e: RPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    const panel = panelRef.current;
    if (!dr || !panel) return;
    const now = performance.now();
    dr.samples.push({ t: now, y: e.clientY });
    dr.samples = dr.samples.filter((s) => now - s.t < 120);
    const H = heightRef.current || panel.offsetHeight || 1;
    let raw = dr.startT + (e.clientY - dr.startY);
    if (raw < 0) raw = -rubberBand(-raw, H);
    else if (raw > H) raw = H + rubberBand(raw - H, H);
    dr.raw = raw;
    panel.style.transform = `translateY(${raw}px)`;
    applyChrome(raw);
  };
  const onDragEnd = () => {
    const dr = drag.current;
    const panel = panelRef.current;
    if (!dr) return;
    drag.current = null;
    document.body.classList.remove("sheet-dragging");
    if (!panel) return;
    const H = heightRef.current || panel.offsetHeight || 1;
    // 速度投射：最近 120ms 采样估速度（px/s），projectVelocity 给出松手后的滑行距离，
    // 投影落点吸附到最近的一档（全开 / 半开 / 关闭）。
    const s = dr.samples;
    let v = 0;
    if (s.length >= 2) {
      const first = s[0]!;
      const last = s[s.length - 1]!;
      const dt = last.t - first.t;
      if (dt > 0) v = ((last.y - first.y) / dt) * 1000;
    }
    const projected = dr.raw + projectVelocity(v);
    const stops = [...detentsRef.current, H + 24];
    let target = stops[0]!;
    for (const st of stops) {
      if (Math.abs(st - projected) < Math.abs(target - projected)) target = st;
    }
    panel.style.transition = "transform 0.45s var(--spring)";
    if (target >= H) {
      panel.style.transform = `translateY(${H}px)`;
      applyChrome(H);
      closeTimer.current = window.setTimeout(close, 170);
      return;
    }
    restRef.current = target;
    panel.style.transform = target === 0 ? "" : `translateY(${target}px)`;
    if (target === 0) clearChrome();
    else applyChrome(target);
  };

  return (
    <SheetContext.Provider value={{ open, close, isOpen }}>
      {children}
      {isOpen && (
        <div className="sheet-wrap">
          <div
            className="sheet-bg"
            onClick={close}
            role="presentation"
            ref={bgRef}
          />
          <div className="sheet" role="dialog" aria-modal="true" ref={panelRef}>
            <div
              className="sheet-toolbar"
              style={{ touchAction: "none" }}
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
            >
              <div className="grab" role="presentation" />
              <button
                type="button"
                className="sheet-close"
                aria-label="关闭弹层"
                onClick={close}
                ref={closeBtnRef}
              >
                ✕
              </button>
            </div>
            <div className="sheet-body">{content}</div>
          </div>
        </div>
      )}
    </SheetContext.Provider>
  );
}

// ---------- 走势图（基线带 + 拖动查数，1:1 像素渲染） ----------

export interface ChartPt {
  label: string;
  value: number | null;
  incomplete?: boolean;
}

export interface LineChartProps {
  points: ChartPt[];
  base?: Baseline | null;
  unit: string;
  dec?: number;
  colorVar: string;
  title: string;
  goal?: { value: number; label: string };
  fmtVal?: (v: number) => string;
  fmtAxis?: (v: number) => string;
  nonNeg?: boolean;
  ySnap?: number;
}

function useChartWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(328);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const cw = Math.round(el.clientWidth);
      if (cw >= 200) setW(cw);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export function LineChart(props: LineChartProps) {
  const { points, base, unit, dec = 0, colorVar, title, goal, fmtVal, fmtAxis, nonNeg, ySnap } = props;
  const dark = useDark();
  const { ref, w: W } = useChartWidth();
  const [sel, setSel] = useState(-1);
  const scrub = useRef<{
    pid: number;
    startX: number;
    startY: number;
    active: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const color = cssVar(colorVar) || "#5856d6";
  const grid = cssVar("--grid");
  const dim = cssVar("--dim");
  const ink = cssVar("--ink");
  const cardBg = cssVar("--card");
  void dark;

  if (vals.length < 2) {
    return (
      <div ref={ref}>
        <EmptyBox text="数据不足，积累中" />
      </div>
    );
  }

  const H = 170;
  const L = 14;
  const R = 46;
  const T = 16;
  const B = 28;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (base) {
    lo = Math.min(lo, base.mean - (base.sd ?? 0));
    hi = Math.max(hi, base.mean + (base.sd ?? 0));
  }
  if (goal) {
    lo = Math.min(lo, goal.value);
    hi = Math.max(hi, goal.value);
  }
  const pad = (hi - lo) * 0.18 || 1;
  lo -= pad;
  hi += pad;
  if (nonNeg) lo = 0;
  if (ySnap) {
    lo = Math.floor(lo / ySnap) * ySnap;
    hi = Math.ceil(hi / ySnap) * ySnap;
    if (((hi - lo) / 2) % ySnap !== 0) hi += ySnap;
  }
  const n = points.length;
  const X = (i: number) => L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1));
  const Y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));

  let lastIdx = -1;
  points.forEach((p, i) => {
    if (p.value != null) lastIdx = i;
  });
  const lastPt = points[lastIdx];
  // M10：静置读数 = 当前分段区间的平均（不含不完整日，口径在 lib.segmentAverage）+ 日期范围；
  // 不再默认选中最新一天，拖动时才换成所拖那天的值，松手即回平均。
  const avg = segmentAverage(points);
  const firstPt = points.find((p) => p.value != null);

  const relText = (v: number): string => {
    if (!base) return "";
    if (base.sd != null) {
      if (v > base.mean + base.sd) return "↑ 高于常态";
      if (v < base.mean - base.sd) return "↓ 低于常态";
      return "→ 常态范围内";
    }
    if (v > base.mean) return "↑ 高于基线均值";
    if (v < base.mean) return "↓ 低于基线均值";
    return "→ 与基线均值持平";
  };

  const fmtV = (v: number) => (fmtVal ? fmtVal(v) : fmt(v, dec));
  const selPt = sel >= 0 ? points[sel] : undefined;

  const nearest = (clientX: number, svg: SVGSVGElement): number => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) * W) / r.width;
    let best = lastIdx;
    let bd = Infinity;
    points.forEach((p, i) => {
      if (p.value == null) return;
      const dd = Math.abs(X(i) - x);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  };

  const begin = (e: RPointerEvent<SVGSVGElement>) => {
    const s = scrub.current;
    if (s) s.active = true;
    (window as unknown as { __chartScrubbing?: boolean }).__chartScrubbing = true;
    try {
      (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setSel(nearest(e.clientX, e.currentTarget));
  };
  const finish = () => {
    const s = scrub.current;
    if (s?.timer) clearTimeout(s.timer);
    if (s?.active) setSel(-1);
    (window as unknown as { __chartScrubbing?: boolean }).__chartScrubbing = false;
    scrub.current = null;
  };

  return (
    <div ref={ref}>
      <div className="readout" aria-live="polite">
        {selPt && selPt.value != null ? (
          <>
            {/* 拖动态：日期 · 数值 · 与基线带关系，直接替换、无补间/过渡 */}
            <div className="rk">
              {selPt.label}
              {selPt.incomplete ? " · 截至最近同步" : ""}
            </div>
            <div className="rv num">
              {fmtV(selPt.value)}
              {!fmtVal && <small>{unit.trim()}</small>}
            </div>
            <div className="rd">{relText(selPt.value) || "当天数值"}</div>
          </>
        ) : (
          <>
            <div className="rk">平均（不含不完整日）</div>
            <div className="rv num">
              {avg != null ? fmtV(avg) : "—"}
              {!fmtVal && avg != null && <small>{unit.trim()}</small>}
            </div>
            <div className="rd">
              {firstPt?.label ?? ""} – {lastPt?.label ?? ""}
            </div>
          </>
        )}
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        tabIndex={0}
        onPointerDown={(e) => {
          scrub.current = {
            pid: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            timer: null,
          };
          if (e.pointerType === "mouse") {
            begin(e);
            return;
          }
          const ev = e;
          scrub.current.timer = setTimeout(() => begin(ev), 180);
        }}
        onPointerMove={(e) => {
          const s = scrub.current;
          if (!s || e.pointerId !== s.pid) return;
          if (!s.active) {
            const dx = Math.abs(e.clientX - s.startX);
            const dy = Math.abs(e.clientY - s.startY);
            if (dx > 8 && dx > dy) {
              if (s.timer) clearTimeout(s.timer);
              begin(e);
            } else if (dy > 8 && s.timer) {
              clearTimeout(s.timer);
            }
            return;
          }
          setSel(nearest(e.clientX, e.currentTarget));
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const dir = e.key === "ArrowRight" ? 1 : -1;
            let nxt = sel < 0 ? lastIdx : Math.max(0, Math.min(n - 1, sel + dir));
            while (nxt >= 0 && nxt < n && points[nxt]?.value == null) nxt += dir;
            if (nxt >= 0 && nxt < n) setSel(nxt);
          } else if (e.key === "Escape") {
            setSel(-1);
          }
        }}
        onBlur={() => {
          if (scrub.current?.active) finish();
        }}
      >
        {[0, 1, 2].map((g) => {
          const gv = lo + ((hi - lo) * g) / 2;
          return (
            <g key={g}>
              <line x1={L} x2={W - R} y1={Y(gv)} y2={Y(gv)} stroke={grid} strokeWidth={1} />
              <text x={W - R + 9} y={Y(gv) + 4} textAnchor="start" fontSize={11.5} fill={dim}>
                {fmtAxis ? fmtAxis(gv) : fmt(gv, dec)}
              </text>
            </g>
          );
        })}
        {base?.sd != null && (
          <rect
            x={L}
            y={Y(base.mean + base.sd)}
            width={W - L - R}
            height={Math.max(Y(base.mean - base.sd) - Y(base.mean + base.sd), 2)}
            fill={color}
            fillOpacity={0.12}
            rx={3}
          />
        )}
        {base && (
          <line
            x1={L}
            x2={W - R}
            y1={Y(base.mean)}
            y2={Y(base.mean)}
            stroke={color}
            strokeWidth={1.3}
            strokeDasharray="5 5"
            strokeOpacity={0.65}
            className="fade-anim"
          />
        )}
        {goal && (
          <>
            <line
              x1={L}
              x2={W - R}
              y1={Y(goal.value)}
              y2={Y(goal.value)}
              stroke={ink}
              strokeWidth={1.2}
              strokeDasharray="2 4"
              strokeOpacity={0.55}
              className="fade-anim"
            />
            <text x={L + 2} y={Y(goal.value) - 7} textAnchor="start" fontSize={11} fill={ink} fontWeight={600}>
              {goal.label}
            </text>
          </>
        )}
        <polyline
          points={points
            .map((p, i) => (p.value != null ? `${X(i)},${Y(p.value)}` : null))
            .filter((s): s is string => s != null)
            .join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="fade-anim"
        />
        {sel >= 0 && selPt?.value != null && (
          <>
            <line
              x1={X(sel)}
              x2={X(sel)}
              y1={T}
              y2={H - B}
              stroke={dim}
              strokeWidth={1}
              strokeDasharray="3 4"
              strokeOpacity={0.45}
            />
            <circle cx={X(sel)} cy={Y(selPt.value)} r={11.5} fill={color} fillOpacity={0.18} stroke={color} strokeOpacity={0.55} strokeWidth={1.5} />
          </>
        )}
        {points.map((p, i) => {
          if (p.value == null) return null;
          const isSel = i === sel;
          const dimmed = sel >= 0 && !isSel;
          const r = p.incomplete ? 5.5 : i === lastIdx ? 5.5 : isSel ? 7 : 4.5;
          return (
            <circle
              key={i}
              cx={X(i)}
              cy={Y(p.value)}
              r={dimmed ? 4 : r}
              fill={p.incomplete ? cardBg : color}
              fillOpacity={dimmed ? 0.3 : 1}
              stroke={p.incomplete ? color : cardBg}
              strokeWidth={p.incomplete || isSel ? 2.5 : 2}
              className="dot-anim"
              style={{ animationDelay: `${140 + i * 70}ms` }}
            />
          );
        })}
        {points.map((p, i) => {
          if (n > 10 && i % Math.ceil(n / 6) !== 0 && i !== n - 1) return null;
          return (
            <text key={i} x={X(i)} y={H - 10} textAnchor="middle" fontSize={11.5} fill={dim}>
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- 周柱状图（锻炼按周计 + 目标线） ----------

export interface WeekBar {
  label: string;
  value: number;
  progress?: string;
}

export function WeeklyBars({
  weeks,
  goal,
  colorVar,
  title,
}: {
  weeks: WeekBar[];
  goal: number;
  colorVar: string;
  title: string;
}) {
  const { ref, w: W } = useChartWidth();
  const color = cssVar(colorVar) || "#ff7300";
  const grid = cssVar("--grid");
  const dim = cssVar("--dim");
  const ink = cssVar("--ink");
  if (weeks.length === 0) {
    return (
      <div ref={ref}>
        <EmptyBox text="数据不足，积累中" />
      </div>
    );
  }
  const H = 170;
  const L = 14;
  const R = 46;
  const T = 26;
  const B = 28;
  const hi = Math.max(goal, Math.max(...weeks.map((x) => x.value))) * 1.15;
  const Y = (v: number) => T + (H - T - B) * (1 - v / hi);
  const bw = Math.min(120, ((W - L - R) / weeks.length) * 0.52);
  const last = weeks[weeks.length - 1]!;
  return (
    <div ref={ref}>
      <div className="readout" aria-live="polite">
        <div className="rk">
          {last.value >= goal
            ? "本周已达周目标"
            : `本周距周目标还差 ${fmt(goal - last.value)} 分钟`}
        </div>
        <div className="rv num">
          {fmt(last.value)}
          <small>分钟 / 周</small>
        </div>
        <div className="rd">
          {last.label}
          {last.progress ? ` · ${last.progress}` : ""} · WHO 周有氧参考下限 150 分钟
        </div>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {[0, goal, Math.round(hi)].map((gv, gi) => (
          <g key={gi}>
            <line x1={L} x2={W - R} y1={Y(gv)} y2={Y(gv)} stroke={grid} strokeWidth={1} />
            <text x={W - R + 9} y={Y(gv) + 4} fontSize={11.5} fill={dim}>
              {fmt(gv)}
            </text>
          </g>
        ))}
        <line
          x1={L}
          x2={W - R}
          y1={Y(goal)}
          y2={Y(goal)}
          stroke={ink}
          strokeWidth={1.2}
          strokeDasharray="2 4"
          strokeOpacity={0.55}
        />
        <text x={L + 2} y={Y(goal) - 7} fontSize={11} fill={ink} fontWeight={600}>
          {`目标 ${goal} 分钟 / 周`}
        </text>
        {weeks.map((wk, i) => {
          const cx = L + (W - L - R) * ((i + 0.5) / weeks.length);
          return (
            <g key={i}>
              <rect
                x={cx - bw / 2}
                y={Y(wk.value)}
                width={bw}
                height={Math.max(H - B - Y(wk.value), 2)}
                rx={7}
                fill={color}
                fillOpacity={wk.value >= goal ? 1 : 0.4}
                className="bar-anim"
                style={{ animationDelay: `${i * 110}ms` }}
              />
              <text x={cx} y={Y(wk.value) - 8} textAnchor="middle" fontSize={13} fill={ink} fontWeight={700}>
                {`${fmt(wk.value)} 分`}
              </text>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={11.5} fill={dim}>
                {wk.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- 导航图标（线条，currentColor） ----------

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const NavIcons: Record<TabKey, ReactNode> = {
  today: (
    <NavIcon>
      <path d="M3 11.5 12 4l9 7.5 M5.5 10v9h13v-9" />
    </NavIcon>
  ),
  trends: (
    <NavIcon>
      <path d="M3 17.5 8.5 12l3.5 3.5L20.5 7 M15 7h5.5v5.5" />
    </NavIcon>
  ),
  plan: (
    <NavIcon>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" />
    </NavIcon>
  ),
  review: (
    <NavIcon>
      <path d="M5 4.5h14v15H5z M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </NavIcon>
  ),
  mine: (
    <NavIcon>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 19.5c1.4-3.2 4-4.8 7.2-4.8s5.8 1.6 7.2 4.8" />
    </NavIcon>
  ),
};

export const Icons = {
  sync: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 3.5V8h-4.5" />
    </svg>
  ),
};
