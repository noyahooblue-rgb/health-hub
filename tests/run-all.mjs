// 全套回归统一入口：单测（bun test）+ G/H/I 三组（node + playwright）。
// 用法：node tests/run-all.mjs [--skip-build-check]
// 前置：client/dist 须为当前源码的构建产物（平台构建输出）；缺失时报错退出，
// 不自动构建（客户端构建由平台流水线负责，见 tests/README.md）。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const distIndex = path.join(ROOT, "client", "dist", "index.html");
if (!process.argv.includes("--skip-build-check") && !fs.existsSync(distIndex)) {
  console.error("缺少 client/dist：请先取得当前源码的构建产物（平台构建输出）后重试。见 tests/README.md。");
  process.exit(2);
}

const suites = [
  { name: "单测 lib.test.ts", cmd: "bun", args: ["test", "client/src/lib.test.ts"] },
  { name: "G 组（导航/弹层/看门狗/错误边界）", cmd: "node", args: ["tests/g/run-g-tests.mjs"] },
  { name: "H 组（打卡跨天/同日/同步滞后/跨零点）", cmd: "node", args: ["tests/h/run-h-tests.mjs"] },
  { name: "I 组（遮挡几何/弹层/页内表单）", cmd: "node", args: ["tests/i/run-i-tests.mjs"] },
];

let failed = 0;
for (const s of suites) {
  console.log(`\n===== ${s.name} =====`);
  const r = spawnSync(s.cmd, s.args, { cwd: ROOT, stdio: "inherit", env: process.env });
  const code = r.status ?? 1;
  console.log(`----- ${s.name}：exit ${code} -----`);
  if (code !== 0) failed++;
}
console.log(`\n===== 汇总：${suites.length - failed}/${suites.length} 套通过 =====`);
process.exit(failed ? 1 : 0);
