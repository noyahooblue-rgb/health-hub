// 数据层装配：按模式选实现。页面与 App 只通过 dataProvider 读 dashboard（方案 C）。
// 正式版 = realProvider（服务端真实数据库）；设计预览（?preview=1 / #preview）= mockProvider（虚构示例数据）。

import { api } from "../api";
import { mockProvider } from "./mock";
import { isPreviewMode, type HealthDataProvider } from "./provider";

export const realProvider: HealthDataProvider = {
  kind: "real",
  getDashboard: (args) => api.getDashboard(args),
};

export const dataProvider: HealthDataProvider = isPreviewMode() ? mockProvider : realProvider;

export { isPreviewMode };
export type { DashboardRequest, HealthDataProvider } from "./provider";
