// G 组发布前测试 · evidence-v14（v1.0.3 更正轮构建上重跑：打卡评分未选态改白底、
// 保存条改非 sticky 流内排布、表单上限改 schema 派生；脚本与 v13 同，仅 OUT 目录
// 更新，版本号/构建哈希从 version.ts 动态读取）
// 本地 harness：静态托管 client/dist 构建产物 + 预览模式（?preview=1，与正式版
// 同一份界面代码、示例数据、写动作走本机桩）。导航/弹层/看门狗/错误边界代码
// 路径与正式版一致；错误记录与验收记录的服务端往返已另行用
// artifact.invoke_action 对真实沙箱后端实测（reportError 写入成功、
// getErrorSummary 返回 count=1/latestAt 正确、8 条验收可提交、
// 旧 7 条 v1.0.1 真机记录正常读回）。
//
// 与 evidence-v6 的差异（返工单 A/B）：
// 1. G3a 故障注入改为「真实点击」验证：用 page.mouse.click 对导航按钮中心
//    坐标派发真实点击（不经 Playwright 元素定位的命中修正），并记录
//    elementsFromPoint 命中链；逐档 z=90/150/250/1000 各验一轮。
// 2. G3a 增设修复前对照：临时把 nav 与应用根的 z-index 压回 v1.0.1 形态
//    （nav=50、根层 auto），同法注入 z=250 浮层，真实点击应被拦截（复现
//    dbg-stack2 的命中顺序），恢复后同档点击应切换成功——对照同日志留证。
// 3. 6③ 量测口径修正：只量可见页（.page）内的分段控件，并以「滚动前后
//    位置位移 ≈ 滚动量」断言其随内容滚动（v6 的失败源于量到了预热副本
//    且宿主滚动容器口径错误，本版 scrollMid 同时驱动 window 与根容器）。
// 4. 全量日志由运行命令 tee 落盘 run.log（不截断），进程退出码随日志保存。
// 运行：node tests/g/run-g-tests.mjs（见 tests/README.md；playwright 经 tests/playwright-loader.mjs 解析）。
import { chromium } from "../playwright-loader.mjs";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DIST = process.env.HEALTH_HUB_DIST || path.join(REPO_ROOT, "client", "dist");
const OUT = process.env.HEALTH_HUB_TEST_OUT || path.join(REPO_ROOT, "tests", "output", "g");
fs.mkdirSync(OUT, { recursive: true });

const results = { startedAt: new Date().toISOString(), tests: [], pageErrors: [], notes: {} };
function check(name, ok, detail = "") {
  results.tests.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
async function newPage(extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    ...extra,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.pageErrors.push(String(e?.message ?? e)));
  await page.route("http://harness.local/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(DIST, p);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) await route.fulfill({ path: file });
    else await route.fulfill({ status: 200, contentType: "text/html", body: fs.readFileSync(path.join(DIST, "index.html")) });
  });
  await page.goto("http://harness.local/?preview=1");
  await page.waitForSelector("nav.tabs button", { timeout: 20000 });
  await sleep(600);
  return { ctx, page };
}
const tabBtn = (page, label) => page.locator(`nav.tabs button[aria-label="${label}"]`);
const TABS = ["今日", "趋势", "计划", "复盘", "我的"];
async function currentTab(page) {
  return page.evaluate(() => {
    const b = document.querySelector('nav.tabs button[aria-current="page"]');
    return b ? b.getAttribute("aria-label") : null;
  });
}
async function clickTab(page, label) {
  await tabBtn(page, label).click({ timeout: 8000 });
  await sleep(120);
  return (await currentTab(page)) === label;
}
// 真实点击：取按钮中心坐标，用 mouse.click 直接派发（命中谁就是谁，
// 不做任何元素级修正），返回命中链与点击后页签。
async function realClickTab(page, label) {
  const box = await tabBtn(page, label).boundingBox();
  if (!box) return { ok: false, hit: [], now: await currentTab(page), why: "no-box" };
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  const hit = await page.evaluate(
    ([hx, hy]) =>
      document
        .elementsFromPoint(hx, hy)
        .slice(0, 4)
        .map((e) => {
          const cls = typeof e.className === "string" ? e.className.split(" ").filter(Boolean).join(".") : "";
          return `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${cls ? "." + cls : ""}`;
        }),
    [x, y],
  );
  await page.mouse.click(x, y);
  await sleep(200);
  const now = await currentTab(page);
  return { ok: now === label, hit, now };
}
async function scrollMid(page) {
  const info = await page.evaluate(() => {
    const hatch = document.querySelector(".hatch-space-root");
    const gen = document.querySelector("[data-generated-space-root]");
    const se = document.scrollingElement;
    for (const el of [se, hatch, gen, document.documentElement, document.body]) {
      if (el) {
        try {
          el.scrollTop = 650;
        } catch {
          /* noop */
        }
      }
    }
    window.scrollTo(0, 650);
    return {
      seTop: se?.scrollTop ?? null,
      hatchTop: hatch?.scrollTop ?? null,
      genTop: gen?.scrollTop ?? null,
      winY: window.scrollY,
    };
  });
  await sleep(250);
  return info;
}

// ═══ 主上下文 ═══
const { ctx, page } = await newPage();

// ── 7 WarmTabs 分级预热 + 首屏 ──
await sleep(1800); // 等空闲预热窗口（轻页签应已挂载，重页签不应）
const warmBefore = await page.evaluate(() => ({
  heavyCharts: document.querySelectorAll(".tab-warm svg.chart").length,
  warmMounted: !!document.querySelector(".tab-warm"),
  firstScreenMs: window.__appFirstScreenMs ?? null,
}));
check("7a 首屏后未预热趋势全部图表（重页签未挂载）", warmBefore.warmMounted && warmBefore.heavyCharts === 0, JSON.stringify(warmBefore));
results.notes.firstScreenMs_previewHarness = warmBefore.firstScreenMs;

// ── 6①② 计划页就寝目标卡 ──
check("矩阵前置：切到计划页", await clickTab(page, "计划"));
const planCard = await page.evaluate(() => {
  // 只看可见页（.page），排除 .tab-warm 预热副本里的同一张卡
  const t = document.querySelector(".page")?.innerText ?? "";
  return {
    hasNewTitle: t.includes("就寝目标"),
    hasInternal: t.includes("唯一登记表") || t.includes("读这张表") || t.includes("就寝目标登记（"),
    hasArrLabel: t.includes("提前 45 分钟"),
    arrows: document.querySelectorAll(".page .reg-flow .arr").length,
    arrLabels: document.querySelectorAll(".page .reg-flow .arr-label").length,
  };
});
check("6① 目标卡去掉内部话术", planCard.hasNewTitle && !planCard.hasInternal, JSON.stringify(planCard));
check("6② 第二个箭头改为「提前 45 分钟」标注", planCard.arrows === 1 && planCard.arrLabels >= 1 && planCard.hasArrLabel, JSON.stringify(planCard));
await page.screenshot({ path: path.join(OUT, "g-plan-registry.png") });

// ── G1 状态矩阵 ──
// 状态 1：顶部，五页签轮点
let matrixOk = true;
for (const t of ["趋势", "复盘", "我的", "今日", "计划"]) {
  if (!(await clickTab(page, t))) { matrixOk = false; break; }
}
check("G1-顶部：五页签轮点可切换", matrixOk);

// 状态 2：滚动中段，每页签滑到中间再点其余页签（全轮换 20 次）
matrixOk = true;
let midInfo = null;
for (const from of TABS) {
  await clickTab(page, from);
  midInfo = await scrollMid(page);
  for (const to of TABS) {
    if (to === from) continue;
    if (!(await clickTab(page, to))) { matrixOk = false; break; }
    await clickTab(page, from);
    await scrollMid(page);
  }
  if (!matrixOk) break;
}
check("G1-滚动中段：每页签中段点其他 4 页签可切换（20 次）", matrixOk, JSON.stringify(midInfo));

// 状态 3+4：弹层打开 → 关闭后切页签
await clickTab(page, "计划");
await page.getByRole("button", { name: "三层目标是怎么运作的" }).click();
await sleep(500);
const sheetOpen = await page.evaluate(() => !!document.querySelector(".sheet-wrap"));
check("G1-弹层打开：弹层出现", sheetOpen);
await page.locator(".sheet-bg").click({ position: { x: 30, y: 30 } });
await sleep(500);
const sheetClosed = await page.evaluate(() => !document.querySelector(".sheet-wrap"));
check("G1-弹层关闭后：可切页签", sheetClosed && (await clickTab(page, "趋势")) && (await clickTab(page, "今日")));

// 状态 5：详情页（我的 › 关于与免责）→ 点页签回根 + 切走
await clickTab(page, "我的");
await page.getByRole("button", { name: /关于与免责/ }).first().click();
await sleep(400);
const inAbout = await page.evaluate(() => document.body.innerText.includes("界面版本"));
check("G1-详情页：进入关于与免责", inAbout);
const aboutText = await page.evaluate(() => document.body.innerText);
const EXPECTED_HASH = (fs.readFileSync(path.join(REPO_ROOT, "client", "src", "version.ts"), "utf8").match(/BUILD_HASH = "([^"]+)"/) || [])[1];
check("10 关于页显示版本号+构建哈希", aboutText.includes("health-ui v1.0.3") && !!EXPECTED_HASH && aboutText.includes(EXPECTED_HASH), `expected=${EXPECTED_HASH}`);
check("9 决策记录已登记（含 v1.0.3 按日期键隔离 + 收尾小改追加 6 条）", aboutText.includes("左缘右滑返回暂缓") && aboutText.includes("health-hub") && aboutText.includes("只从打标签的提交发布") && aboutText.includes("按日期键隔离") && aboutText.includes("方案 A") && aboutText.includes("「档案」替换「趋势」") && aboutText.includes("心境") && aboutText.includes("只读取、不提供录入框") && aboutText.includes("自我实验") && aboutText.includes("07:00 / 12:00 / 18:00 / 22:00") && aboutText.includes("新芽绿"));
await page.screenshot({ path: path.join(OUT, "g-about.png") });
check("G1-详情页返回后：点其他页签可切换", (await clickTab(page, "今日")) && (await clickTab(page, "我的")));
const mineHome = await page.evaluate(() => document.body.innerText.includes("建档问卷"));
check("A 点页签清详情视图（我的回到根列表）", mineHome);

// 状态 7：切后台再回来（visibilitychange 隐藏→恢复）后切页签
await page.evaluate(() => {
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await sleep(200);
check("G1-切后台再回来：可切页签", (await clickTab(page, "复盘")) && (await clickTab(page, "今日")));

// ── 第 8 条：验收页 8 条含新项 ──
await clickTab(page, "我的");
await page.getByRole("button", { name: /关于与免责/ }).first().click();
await sleep(300);
await page.getByRole("button", { name: /真机验收/ }).first().click();
await sleep(600);
const acc = await page.evaluate(() => ({
  items: document.querySelectorAll(".acc-item").length,
  hasNew: document.body.innerText.includes("点其他 4 个页签"),
}));
check("8 验收页新增第 8 条（中段切页签）", acc.items === 8 && acc.hasNew, JSON.stringify(acc));
await page.screenshot({ path: path.join(OUT, "g-acceptance.png") });
await clickTab(page, "今日");

// ── F 错误记录（预览侧 localStorage 通道） ──
await page.evaluate(() => {
  window.dispatchEvent(new ErrorEvent("error", { message: "harness-probe-error" }));
});
await sleep(400);
const errStored = await page.evaluate(() => {
  try {
    const rows = JSON.parse(window.localStorage.getItem("health-errorlog-preview-v1") || "[]");
    return rows.length;
  } catch { return -1; }
});
check("F 全局错误钩子写入错误记录（预览通道）", errStored >= 1, `rows=${errStored}`);
await clickTab(page, "我的");
await page.getByRole("button", { name: /关于与免责/ }).first().click();
await sleep(700);
const errLine = await page.evaluate(() => {
  const m = document.body.innerText.match(/错误记录：共 \d+ 条[^\n]*/);
  return m ? m[0] : null;
});
check("5 关于页可查看错误条数与最近一条时间", !!errLine && /最近一条/.test(errLine), errLine ?? "未找到");
await clickTab(page, "今日");

// ── G3 故障注入 ──
async function injectOverlay(z) {
  await page.evaluate((zz) => {
    document.getElementById("inj-overlay")?.remove();
    const div = document.createElement("div");
    div.id = "inj-overlay";
    div.className = "inj-overlay";
    div.style.cssText = `position:fixed;inset:0;z-index:${zz};background:rgba(0,0,0,0.06)`;
    document.querySelector(".hatch-space-root")?.appendChild(div);
  }, z);
}
async function removeOverlay() {
  await page.evaluate(() => document.getElementById("inj-overlay")?.remove());
}

// a0) 修复前对照：临时压回 v1.0.1 层级（nav z=50、应用根 z=auto），
// 注入 z=250 残留浮层，真实点击应被浮层拦截、页签不切换（复现事故形态与
// dbg-stack2 的命中顺序：DIV.inj-overlay 排在 NAV.tabs 之前）。
await page.evaluate(() => {
  const nav = document.querySelector("nav.tabs");
  if (nav) nav.style.zIndex = "50";
  const root = document.querySelector(".hatch-space-root");
  if (root) root.style.zIndex = "auto";
});
await injectOverlay(250);
const beforeFix = await realClickTab(page, "趋势");
check(
  "G3a-对照：旧层级（nav=50）下 z=250 残留浮层拦截真实点击（复现事故形态）",
  !beforeFix.ok && beforeFix.hit.some((h) => h.includes("inj-overlay")),
  JSON.stringify(beforeFix),
);
await removeOverlay();
await page.evaluate(() => {
  const nav = document.querySelector("nav.tabs");
  if (nav) nav.style.zIndex = "";
  const root = document.querySelector(".hatch-space-root");
  if (root) root.style.zIndex = "";
});
await sleep(200);
check("G3a-对照恢复：撤除对照后点页签可切换", await clickTab(page, "趋势"));
await clickTab(page, "今日");

// a) 修复后逐档：z=90/150/250/1000 残留浮层盖屏，真实点击仍可切换，
// 且命中链首位必须是导航内元素（浮层不得排在导航之前）。
for (const z of [90, 150, 250, 1000]) {
  await injectOverlay(z);
  const r1 = await realClickTab(page, "趋势");
  const r2 = await realClickTab(page, "今日");
  const hitOk = r1.hit.length > 0 && !r1.hit[0].includes("inj-overlay") && r1.hit.some((h) => h.startsWith("button") || h.startsWith("nav") || h.startsWith("svg") || h.startsWith("span"));
  check(
    `G3a 残留浮层 z=${z}：真实点击可切换且命中导航本体`,
    r1.ok && r2.ok && hitOk,
    JSON.stringify({ hit: r1.hit, now: r1.now }),
  );
  await removeOverlay();
}

// b) 图表拖动锁卡死为真，点页签仍可切换且锁被复位
await page.evaluate(() => { window.__chartScrubbing = true; });
const lockOk = await clickTab(page, "趋势");
const lockCleared = await page.evaluate(() => window.__chartScrubbing === false);
check("G3b 拖动锁卡死时点页签可切换且锁复位", lockOk && lockCleared);
await clickTab(page, "今日");

// c) 键盘隐藏导航卡死：聚焦输入框后把它隐藏（模拟键盘收起但 focusout 丢失），看门狗恢复导航
await page.locator('textarea[aria-label="打卡备注"]').scrollIntoViewIfNeeded();
await page.locator('textarea[aria-label="打卡备注"]').focus();
await sleep(400);
const navHidden1 = await page.evaluate(() => document.querySelector("nav.tabs")?.className.includes("nav-hidden"));
await page.evaluate(() => {
  const ta = document.querySelector('textarea[aria-label="打卡备注"]');
  if (ta) ta.style.display = "none";
});
let navBack = false;
for (let i = 0; i < 14; i++) {
  await sleep(500);
  navBack = await page.evaluate(() => !document.querySelector("nav.tabs")?.className.includes("nav-hidden"));
  if (navBack) break;
}
check("G3c 导航隐藏卡死被看门狗自动恢复（≤7s）", navHidden1 && navBack && (await clickTab(page, "计划")));
await clickTab(page, "今日");

// d) 手势残留组合卡死：sheet-dragging 类残留 + 图表锁置真 + 切后台再回来 →
// 全局复位清掉残留，页签可切换。
await page.evaluate(() => {
  document.body.classList.add("sheet-dragging");
  window.__chartScrubbing = true;
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
await sleep(200);
const residue = await page.evaluate(() => ({
  dragging: document.body.classList.contains("sheet-dragging"),
  scrubbing: window.__chartScrubbing === true,
}));
check("G3d 手势残留（拖动态+图表锁）切后台后被全局复位", !residue.dragging && !residue.scrubbing && (await clickTab(page, "趋势")) && (await clickTab(page, "今日")), JSON.stringify(residue));

// ── G2 随机操作 500 次 ──
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
let ops = 0;
let randFail = "";
const errBefore = results.pageErrors.length;
while (ops < 500 && !randFail) {
  const r = rnd();
  try {
    if (r < 0.5) {
      const t = TABS[Math.floor(rnd() * TABS.length)];
      // 弹层开着时先关（真实使用路径）
      const hasSheet = await page.evaluate(() => !!document.querySelector(".sheet-wrap"));
      if (hasSheet) { await page.locator(".sheet-bg").click({ position: { x: 25, y: 25 } }); await sleep(150); }
      if (!(await clickTab(page, t))) randFail = `op${ops}: 点页签 ${t} 未切换`;
    } else if (r < 0.72) {
      await page.evaluate(() => window.scrollTo(0, Math.floor(Math.random() * 900)));
      await sleep(30);
    } else if (r < 0.82) {
      await page.keyboard.press("Escape");
      await sleep(30);
    } else {
      // 安全按钮：分段/胶囊类（排除清空/删除/提交/导出）
      const btns = page.locator('.seg button, .daycaps button, button.chip');
      const n = await btns.count();
      if (n > 0) await btns.nth(Math.floor(rnd() * n)).click({ timeout: 3000 }).catch(() => {});
      await sleep(30);
    }
  } catch (e) {
    randFail = `op${ops}: ${String(e).slice(0, 160)}`;
  }
  ops++;
  if (ops % 100 === 0) {
    const okNow = await clickTab(page, "今日");
    if (!okNow) randFail = `op${ops}: 百次检查点切今日失败`;
    else console.log(`  …随机操作 ${ops}/500，页签仍可切换，pageErrors=${results.pageErrors.length - errBefore}`);
  }
}
check("G2 随机操作 500 次全程页签可切换", !randFail && ops === 500, randFail || `ops=${ops}`);
check("G2 随机操作期间无页面错误", results.pageErrors.length === errBefore, `newErrors=${results.pageErrors.length - errBefore}`);

// ── 7b 首次交互后重页签预热挂载 ──
const warmAfter = await page.evaluate(() => document.querySelectorAll(".tab-warm svg.chart").length);
check("7b 首次交互后趋势预热副本已挂载", warmAfter > 0, `heavyCharts=${warmAfter}`);
await ctx.close();

// ═══ 减少动态效果上下文（G1 状态 6） ═══
{
  const { ctx: c2, page: p2 } = await newPage({ reducedMotion: "reduce" });
  let ok = true;
  for (const t of ["趋势", "计划", "我的", "今日"]) if (!(await clickTab(p2, t))) { ok = false; break; }
  await scrollMid(p2);
  if (ok) ok = await clickTab(p2, "复盘");
  check("G1-减少动态效果：切页签正常", ok);
  await c2.close();
}

// ═══ 强制浅色：深色系统偏好下仍浅色（6④） ═══
{
  const { ctx: c3, page: p3 } = await newPage({ colorScheme: "dark" });
  const bg = await p3.evaluate(() => ({
    bodyBg: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    darkMq: window.matchMedia("(prefers-color-scheme: dark)").matches,
  }));
  check("6④ 系统深色下仍强制浅色外观", bg.darkMq && bg.bodyBg === "rgb(242, 242, 247)", JSON.stringify(bg));
  await p3.screenshot({ path: path.join(OUT, "g-force-light.png") });
  await c3.close();
}

// ── 6③ 分段控件不吸顶（普通流内）：只量可见页 .page 内的分段，
// 断言其位置随滚动同步位移（位移量 ≈ 滚动量），且 position 非 sticky/fixed ──
{
  const { ctx: c4, page: p4 } = await newPage();
  await clickTab(p4, "趋势");
  const before = await p4.evaluate(() => {
    const seg = document.querySelector(".page .seg");
    if (!seg) return null;
    return { top: Math.round(seg.getBoundingClientRect().top), position: getComputedStyle(seg).position };
  });
  const scrolled = await scrollMid(p4);
  const after = await p4.evaluate(() => {
    const seg = document.querySelector(".page .seg");
    if (!seg) return null;
    return { top: Math.round(seg.getBoundingClientRect().top), position: getComputedStyle(seg).position };
  });
  const effScroll = Math.max(scrolled.seTop ?? 0, scrolled.hatchTop ?? 0, scrolled.genTop ?? 0, scrolled.winY ?? 0);
  const moved = before && after ? before.top - after.top : -1;
  check(
    "6③ 趋势分段保持普通流内（不吸顶，随内容同步滚动）",
    !!before && !!after && after.position !== "sticky" && after.position !== "fixed" && effScroll >= 300 && Math.abs(moved - effScroll) <= 60,
    JSON.stringify({ before, after, effScroll, moved }),
  );
  await c4.close();
}

results.finishedAt = new Date().toISOString();
results.passed = results.tests.filter((t) => t.ok).length;
results.total = results.tests.length;
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n══ G 组：${results.passed}/${results.total} 通过，pageErrors 合计 ${results.pageErrors.length} ══`);
await browser.close();
process.exit(results.passed === results.total ? 0 : 1);
