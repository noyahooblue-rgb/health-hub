import { spaceQueryClient } from "@hatch/space-sdk/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { flushErrorQueue, installGlobalErrorHooks, reportError } from "./errlog";
import "./tokens.css";
import "./theme.css";

// 错误上报兜底（v1.0.3 事故修复，2026-11-18）：钩子必须在渲染开始前安装——
// 只放在 Shell 的 useEffect 里时，首屏提交前崩溃没有任何记录（v16 真机空白、
// error_logs 0 条的盲区之一）。启动同时补发上次留队的待上报错误。
installGlobalErrorHooks();
flushErrorQueue();

/** 根级错误边界：App 之外再兜一层。根级渲染崩溃时不再整页空白，
 *  而是留下可见的恢复入口，并把崩溃记入错误记录。 */
class RootBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): Partial<{ failed: boolean }> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    reportError(
      "root-boundary",
      error instanceof Error ? error.message : String(error),
    );
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ padding: "64px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>页面打开时出了点问题</p>
        <p style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
          错误已经记下。点下面按钮重新加载一次；如果反复出现，请把情况告诉
          Atlas。
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 16,
            fontSize: 15,
            padding: "10px 22px",
            borderRadius: 999,
            border: "1px solid #bbb",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          重新加载
        </button>
      </div>
    );
  }
}

const rootEl = document.querySelector<HTMLElement>("[data-generated-space-root]");
if (!rootEl) {
  throw new Error("missing generated space root element");
}

// If you edit this file: keep `<QueryClientProvider client={spaceQueryClient}>`
// wrapping the app (every space shares the SDK's QueryClient), and keep
// BOTH the `hatch-space-root` class AND the `data-hatch-space-root`
// attribute on the outer div. The SDK styles select on
// `.hatch-space-root[data-hatch-space-root]` to apply mobile safe-area
// insets (notches, gesture bars, etc.), correct viewport sizing, and the
// hosting header/chrome offsets — dropping either breaks layout silently.
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={spaceQueryClient}>
      <div className="hatch-space-root" data-hatch-space-root>
        <RootBoundary>
          <App />
        </RootBoundary>
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
