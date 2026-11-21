// Playwright 解析（入仓口径）：优先 PLAYWRIGHT_MODULE 环境变量（路径或包名），
// 其次仓库/上级目录 node_modules 里的 playwright 包，最后回退本机既有
// e2e 工程的 playwright（~/workspace/ib-e2e）。干净环境请先安装
// playwright 并下载 chromium：见 tests/README.md。
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const candidates = [];
if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
candidates.push("playwright");
candidates.push(path.join(os.homedir(), "workspace", "ib-e2e", "node_modules", "playwright", "index.mjs"));

let chromium;
let lastErr;
for (const c of candidates) {
  try {
    const mod = await import(c.startsWith("/") ? pathToFileURL(c).href : c);
    if (mod.chromium) {
      chromium = mod.chromium;
      lastErr = undefined;
      break;
    }
  } catch (e) {
    lastErr = e;
  }
}
if (!chromium) {
  throw new Error(`无法加载 playwright（已试：${candidates.join("、")}）：${lastErr?.message ?? lastErr}`);
}
export { chromium };
