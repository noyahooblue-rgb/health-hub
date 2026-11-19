// 错误记录（health-ui v1.0.2 安全网 F）：全局错误钩子、错误边界与页签自检
// 把异常追加写入服务端 error_logs 表（正式版）或本机预览存储（预览版，
// 键 health-errorlog-preview-v1，绝不触达服务端）。同 kind+message 10 秒内
// 去重、全局最快 2 秒一条节流。
//
// v1.0.3 事故修复（2026-11-18，v16 真机空白、error_logs 0 条）：
// 旧链路有三处盲区——①钩子只在 Shell 的 useEffect 里安装，首屏渲染提交前
// 崩溃（或 bundle 本身没跑起来）时钩子根本不存在；②正式版上报是单次
// fire-and-forget POST，失败即静默丢弃、无本地留痕、无重试；③资源加载
// 错误（script/link）不冒泡，旧的冒泡监听收不到。
// 本版改为：钩子由 main.tsx 在渲染开始前安装；正式版上报先写入本机队列
// （health-errorlog-queue-v1，本地留痕）再异步发送，发送成功才出队，失败
// 留队、下次启动或下次上报时重试（flushErrorQueue）；错误监听改捕获阶段，
// 资源加载失败以 resource-error 记录（只记文件名，不记完整地址）。

import { api } from "./api";
import { dataProvider } from "./data";

export interface ErrorLogRow {
  occurredAt: string;
  kind: string;
  message: string;
  detail?: string;
}

const PREVIEW_KEY = "health-errorlog-preview-v1";
const QUEUE_KEY = "health-errorlog-queue-v1";
const DEDUPE_MS = 10_000;
const THROTTLE_MS = 2_000;

let lastSentAt = 0;
const recent = new Map<string, number>();

export function readPreviewErrorLog(): ErrorLogRow[] {
  try {
    const raw = window.localStorage.getItem(PREVIEW_KEY);
    const parsed = raw ? (JSON.parse(raw) as ErrorLogRow[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readQueue(): ErrorLogRow[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ErrorLogRow[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(rows: ErrorLogRow[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-50)));
  } catch {
    /* 存储不可用时静默跳过 */
  }
}

let flushing = false;

/** 把本机队列里的待上报错误逐条发送，成功一条出队一条；遇失败即停（留队重试）。 */
export function flushErrorQueue(): void {
  if (dataProvider.kind === "mock" || flushing) return;
  if (readQueue().length === 0) return;
  flushing = true;
  void (async () => {
    try {
      for (const row of readQueue()) {
        try {
          await api.reportError(row);
        } catch {
          break; // 网络/服务端仍不可用：剩余留队，下次启动或下次上报时再试
        }
        const cur = readQueue();
        const i = cur.findIndex(
          (r) =>
            r.occurredAt === row.occurredAt &&
            r.kind === row.kind &&
            r.message === row.message,
        );
        if (i >= 0) {
          cur.splice(i, 1);
          writeQueue(cur);
        }
      }
    } finally {
      flushing = false;
    }
  })();
}

export function reportError(kind: string, message: string, detail?: string): void {
  try {
    const now = Date.now();
    const key = `${kind}|${message}`;
    const prev = recent.get(key);
    if (prev != null && now - prev < DEDUPE_MS) return;
    if (now - lastSentAt < THROTTLE_MS) return;
    recent.set(key, now);
    lastSentAt = now;
    const row: ErrorLogRow = {
      occurredAt: new Date(now).toISOString(),
      kind,
      message: message.slice(0, 2000),
      detail: detail?.slice(0, 4000),
    };
    if (dataProvider.kind === "mock") {
      const rows = readPreviewErrorLog();
      rows.push(row);
      try {
        window.localStorage.setItem(
          PREVIEW_KEY,
          JSON.stringify(rows.slice(-200)),
        );
      } catch {
        /* 存储不可用时静默跳过 */
      }
      return;
    }
    // 正式版：先本地留痕入队，再尝试发送（成功出队、失败留队重试）。
    const q = readQueue();
    q.push(row);
    writeQueue(q);
    flushErrorQueue();
  } catch {
    /* 静默 */
  }
}

let installed = false;

/** 安装全局错误钩子（main.tsx 在渲染前调用一次，重复调用无副作用）。 */
export function installGlobalErrorHooks(): void {
  if (installed) return;
  installed = true;
  // 捕获阶段监听：资源加载错误（script/link/img）不冒泡，只有捕获阶段收得到；
  // 运行时错误在捕获阶段同样经过 window，一并在此处理。
  window.addEventListener(
    "error",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        t !== (window as unknown as HTMLElement) &&
        typeof t.tagName === "string" &&
        ["SCRIPT", "LINK", "IMG"].includes(t.tagName)
      ) {
        const src =
          (t as HTMLScriptElement).src || (t as HTMLLinkElement).href || "";
        const base = src.split("/").pop() ?? src;
        reportError("resource-error", `${t.tagName} 资源加载失败：${base}`);
        return;
      }
      reportError("window-error", e.message || "未知错误");
    },
    true,
  );
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as unknown;
    reportError(
      "unhandledrejection",
      r instanceof Error ? r.message : String(r ?? "未知 rejection"),
    );
  });
}
