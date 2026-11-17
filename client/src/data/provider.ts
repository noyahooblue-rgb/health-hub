// ═══ 数据层接口（方案 C，2026-11-17） ═══
// 页面组件只认这个接口，不直接区分数据来自哪里。两种实现：
// - realProvider（data/index.ts）：正式版，读服务端真实数据库；
// - mockProvider（data/mock.ts）：设计预览模式，返回全虚构的示例数据。
// 预览模式打开方式：在页面地址后加 ?preview=1（或 #preview）。预览模式下所有写动作
// 都被 api 层的预览桩接住，不会写入真实数据库。

import type { Dashboard } from "../lib";

export interface DashboardRequest {
  /** 明细窗口（天）：只返回最近 N 天明细 + 更早月份汇总（history）；不传 = 全量。 */
  detailDays?: number;
}

export interface HealthDataProvider {
  readonly kind: "real" | "mock";
  getDashboard(args: DashboardRequest): Promise<Dashboard>;
}

/** 设计预览模式判定：?preview=1 或地址含 #preview。 */
export function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("preview") === "1") return true;
  } catch {
    /* 忽略畸形地址 */
  }
  return window.location.hash.includes("preview");
}
