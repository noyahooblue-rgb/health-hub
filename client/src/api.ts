// Typed RPC client. Types come straight from `server/src/actions.ts` — no
// codegen. `createActionClient` returns a proxy that POSTs `{action, args}`
// to `./actions` and returns the typed response.
//
// `import type { Actions }` is type-only by design: the client bundle never
// pulls in any server runtime (bun:sqlite, file APIs, etc.). With
// `verbatimModuleSyntax: true`, dropping `type` is a compile error.
//
// 设计预览模式（方案 C）：地址带 ?preview=1 / #preview 时，api 整体换成预览桩——
// getDashboard 返回虚构示例数据，其余动作一律本地成功返回，绝不写入真实数据库。

import type { Actions } from "../../server/src/actions";
import { createActionClient } from "@hatch/space-sdk/client";
import { buildMockDashboard } from "./data/mock";
import { isPreviewMode } from "./data/provider";

const realApi = createActionClient<typeof Actions>();

// 预览模式的验收记录只存浏览器 localStorage（键 health-acceptance-preview-v1），
// 与正式版 acceptance_records 表同结构，但绝不触达服务端、绝不写真实数据。
const PREVIEW_ACCEPT_KEY = "health-acceptance-preview-v1";
interface PreviewAcceptRow {
  id: number;
  submittedAt: string;
  record: unknown;
}
function readPreviewAccept(): PreviewAcceptRow[] {
  try {
    const raw = window.localStorage.getItem(PREVIEW_ACCEPT_KEY);
    const parsed = raw ? (JSON.parse(raw) as PreviewAcceptRow[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createPreviewStub(): typeof realApi {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === "getDashboard") {
        return async () => buildMockDashboard();
      }
      if (prop === "submitAcceptance") {
        return async (args: { submittedAt: string }) => {
          const rows = readPreviewAccept();
          const id = rows.length + 1;
          rows.push({ id, submittedAt: args.submittedAt, record: args });
          try {
            window.localStorage.setItem(PREVIEW_ACCEPT_KEY, JSON.stringify(rows));
          } catch {
            /* 存储不可用时仅内存返回，不假装落盘到真实数据 */
          }
          return { ok: true as const, id, submittedAt: args.submittedAt };
        };
      }
      if (prop === "listAcceptance") {
        return async () => ({ records: readPreviewAccept() });
      }
      if (prop === "reportError") {
        // 预览模式错误记录走 errlog.ts 的本机预览存储，此处仅回成功保持类型完整。
        return async () => ({ ok: true as const });
      }
      if (prop === "getErrorSummary") {
        return async () => {
          try {
            const raw = window.localStorage.getItem("health-errorlog-preview-v1");
            const rows = raw ? (JSON.parse(raw) as { occurredAt: string }[]) : [];
            const list = Array.isArray(rows) ? rows : [];
            return {
              count: list.length,
              latestAt: list.length ? (list[list.length - 1]?.occurredAt ?? null) : null,
            };
          } catch {
            return { count: 0, latestAt: null };
          }
        };
      }
      if (prop === "exportData") {
        return async () => ({
          json: JSON.stringify({ preview: true, note: "设计预览模式：示例数据，不含真实健康数据" }, null, 2),
          filename: "health-preview-sample.json",
        });
      }
      // 其余动作（保存/勾选/同步等）在预览模式下只回成功，不触达服务端。
      return async () => ({ ok: true as const });
    },
  };
  return new Proxy({}, handler) as typeof realApi;
}

export const api: typeof realApi = isPreviewMode() ? createPreviewStub() : realApi;

// Re-exported for convenience so client code can do
//
//     import { api, type ApiResponse } from "./api";
//     type Article = ApiResponse<typeof api, "listArticles">["articles"][number];
//
// They are also available directly from "@hatch/space-sdk/client".
export type { ApiRequest, ApiResponse } from "@hatch/space-sdk/client";
