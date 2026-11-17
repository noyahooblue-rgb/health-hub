// ═══ 动效模块（Motion）· health-ui 唯一动效源 ═══
// 方案 C（2026-11-17）：弹簧曲线、橡皮筋、速度投射、按下反馈集中于此，组件统一引用。
// 弹簧的 CSS 侧同值定义在 tokens.css（--spring / --spring-soft / --spring-pop），改一处须同步另一处。
// 设计师资产库的 motion.js 与本文件保持一致，以本文件为准。

import { useEffect, useRef, useState } from "react";

/** 弹簧分级（与 tokens.css 同值）：标准位移 / 柔和过冲（导航滑块、弹层） / 弹跳强调（图标、连续天数）。 */
export const SPRING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const SPRING_SOFT = "cubic-bezier(0.3, 1.18, 0.36, 1)";
export const SPRING_POP = "cubic-bezier(0.34, 1.45, 0.44, 1)";

/** 常用时长（ms）：按下反馈 / 淡入 / 页面与弹层位移。 */
export const DURATION = { press: 180, fade: 300, move: 450, moveSoft: 550 } as const;

/** easeOutCubic 数值版（与 CSS 弹簧同族的减速曲线），供 rAF 补间使用。 */
export function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/**
 * 橡皮筋阻尼（iOS UIScrollView 同式）：超出边界的拖动距离按维度衰减，越拉越沉。
 * overshoot 为越界距离（px），dimension 为容器对应维度尺寸（px）。
 */
export function rubberBand(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot <= 0 || dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * overshoot);
}

/**
 * 速度投射（iOS 减速投影）：以当前速度（px/s）与减速率估算手势松手后的落点偏移（px）。
 * decelerationRate 默认 0.998（UIScrollView normal）。
 */
export function projectVelocity(velocityPerSec: number, decelerationRate = 0.998): number {
  return (velocityPerSec / 1000) * (decelerationRate / (1 - decelerationRate));
}

/** 按下反馈：对元素施加一次弹簧缩放回弹（与 theme.css 中 button:active 的 0.96 同规范，JS 驱动版）。 */
export function applyPressFeedback(el: HTMLElement, scale = 0.96): void {
  el.animate(
    [{ transform: `scale(${scale})` }, { transform: "scale(1)" }],
    { duration: DURATION.press + 140, easing: SPRING },
  );
}

/**
 * 数字补间：值变化时从旧值平滑过渡到新值（刷新只更新数字、且变化带过渡动画的统一实现）。
 * reducedMotion 时直接跳变。返回当前应显示的数值。
 * M28（清单 v2）：补间时长 ≤0.4s（默认 400ms）；显示侧须配 tabular-nums 等宽数字，容器宽度不跳动。
 */
export function useTweenedNumber(value: number, durationMs = 400): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) {
      setDisplay(value);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    let t0: number | null = null;
    const step = (ts: number) => {
      if (t0 == null) t0 = ts;
      const p = Math.min((ts - t0) / durationMs, 1);
      const v = from + (value - from) * easeOutCubic(p);
      fromRef.current = v;
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);
  return display;
}
