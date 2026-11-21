// I 组回归测试（v1.0.3 遮挡）· evidence-v14（批复 t4k7cuj6：保存条改非 sticky 修法后重跑）
// 缺陷：每日打卡（今日页页内展开卡，非弹层）滚到自然填写位置时，悬浮导航压住
// 备注框、保存按钮与导航同带重叠或被屏幕下缘裁掉（用户真机
// 截图；修复前量测见 evidence-v13 measure-before）。evidence-v13 曾用 sticky
// 吸附修法，Claude 批复 t4k7cuj6 要求改用不依赖 sticky 的修法，本版改为：
// 保存条流内排布 + 内容底部足量留白（.sync-zone + .wrap 末尾 94px + 安全区）
// + 保存条/备注框 scroll-margin-bottom（含键盘高度 --kb-h）+ 键盘弹起时导航
// 按既有规则隐藏。本组 A 组断言按新机制重写（A1 静态定位断言 + 滚动定位
// 落点；A2 页面底部留白落点；A6 键盘高度下滚动定位落点），B/C 组与 v13 相同：
//   A 打卡面（4 视口）：保存条 computed position 为 static（非 sticky/fixed）；
//     scrollIntoView 定位后保存按钮完整在视口内、与导航不相交、命中落在本体；
//     滚到页面底部时保存按钮完整在视口内、与导航不相交；备注框滚动定位后
//     完整可见、与导航/保存条互不遮挡、命中落在本体；键盘场景（聚焦备注框）
//     导航隐藏、备注框完整可见；模拟键盘高度（--kb-h=300）时保存条经滚动
//     定位停在键盘区上方。
//   B 弹层（390×844）：就寝登记 / 周计划日编辑 / 习惯菜单 / 三层目标说明——
//     打开时导航隐藏（nav-hidden），弹层主按钮滚动到底后完整可见且可命中。
//   C 页内表单（390×844 + 440×773）：建档问卷 / 体检录入 / 验收提交 / 专题
//     档位保存——滚到底（或滚动定位）后主按钮完整在视口内、与导航不相交。
// 本地 harness：静态托管 client/dist + 预览模式（?preview=1，示例数据）。
// 运行：node tests/i/run-i-tests.mjs（见 tests/README.md；playwright 经 tests/playwright-loader.mjs 解析）。
import { chromium } from "../playwright-loader.mjs";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DIST = process.env.HEALTH_HUB_DIST || path.join(REPO_ROOT, "client", "dist");
const OUT = process.env.HEALTH_HUB_TEST_OUT || path.join(REPO_ROOT, "tests", "output", "i");
fs.mkdirSync(OUT, { recursive: true });
const results = { startedAt: new Date().toISOString(), tests: [], pageErrors: [] };
function check(name, ok, detail = "") {
  results.tests.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
async function newPage(viewport) {
  const ctx = await browser.newContext({
    viewport, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
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
  await sleep(700);
  return { ctx, page };
}
async function scrollCardTop(page) {
  await page.evaluate(() => {
    const card = document.querySelector(".page .checkin-card");
    const sc = document.querySelector("[data-generated-space-root]");
    if (card && sc) sc.scrollTop += card.getBoundingClientRect().top - 8;
  });
  await sleep(600);
}
async function scrollPageBottom(page) {
  await page.evaluate(() => {
    const sc = document.querySelector("[data-generated-space-root]");
    if (sc) sc.scrollTop = sc.scrollHeight;
  });
  await sleep(500);
}

// ── A 打卡面 · 四视口 ──
for (const vp of [{ width: 440, height: 956 }, { width: 440, height: 773 }, { width: 390, height: 844 }, { width: 360, height: 740 }]) {
  const tag = `${vp.width}x${vp.height}`;
  const { ctx, page } = await newPage(vp);
  await scrollCardTop(page);
  // A1（非 sticky 机制）：保存条为流内 static 排布；从自然填写位置把保存条
  // 滚动定位（scrollIntoView block=end，scroll-margin 含导航避让）后，保存
  // 按钮完整在视口内、与导航不相交、命中落在按钮本体。
  const m1 = await page.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const inter = (a, b) => (a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0);
    const actions = document.querySelector(".page .checkin-actions");
    const pos = actions ? getComputedStyle(actions).position : null;
    actions?.scrollIntoView({ block: "end" });
    return new Promise((res) => setTimeout(() => {
      const nav = R(document.querySelector("nav.tabs"));
      const save = document.querySelector(".page .checkin-actions button.btn");
      const saveR = R(save);
      let hitSave = null;
      if (save) {
        const els = document.elementsFromPoint((saveR.left + saveR.right) / 2, (saveR.top + saveR.bottom) / 2);
        hitSave = els.length ? els[0].tagName : null;
      }
      res({ pos, nav, saveR, interNS: inter(nav, saveR), saveIn: !!saveR && saveR.top >= 0 && saveR.bottom <= window.innerHeight, hitSave });
    }, 450));
  }).catch(() => null);
  check(`A1 保存条流内排布（非 sticky）且滚动定位后完整可见、不被导航压 [${tag}]`, !!(m1 && m1.pos === "static" && m1.saveIn && m1.interNS === 0), JSON.stringify(m1));
  check(`A2 保存按钮命中测试落在按钮本体 [${tag}]`, !!(m1 && /^BUTTON/.test(m1.hitSave ?? "")), m1?.hitSave ?? "");
  await page.screenshot({ path: path.join(OUT, `i-checkin-${tag}.png`) });
  // A2b（底部留白机制）：滚到页面底部，保存按钮完整在视口内、与导航不相交。
  await scrollPageBottom(page);
  const m1b = await page.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const inter = (a, b) => (a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0);
    const saveR = R(document.querySelector(".page .checkin-actions button.btn"));
    return { saveR, interNS: inter(R(document.querySelector("nav.tabs")), saveR), saveIn: !!saveR && saveR.top >= 0 && saveR.bottom <= window.innerHeight };
  });
  check(`A2b 滚到页面底部保存按钮完整可见、不被导航压（底部留白）[${tag}]`, !!(m1b.saveIn && m1b.interNS === 0), JSON.stringify(m1b));
  await scrollCardTop(page);

  const m2 = await page.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const inter = (a, b) => (a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0);
    const note = document.querySelector('textarea[aria-label="打卡备注"]');
    note.scrollIntoView({ block: "center" });
    return new Promise((res) => setTimeout(() => {
      const nav = R(document.querySelector("nav.tabs"));
      const save = R(document.querySelector(".page .checkin-actions button.btn"));
      const noteR = R(note);
      const els = document.elementsFromPoint((noteR.left + noteR.right) / 2, (noteR.top + noteR.bottom) / 2);
      res({
        noteR, interNN: inter(nav, noteR), interNSave: inter(save, noteR),
        noteIn: noteR.top >= 0 && noteR.bottom <= window.innerHeight,
        hitNote: els.length ? els[0].tagName : null,
      });
    }, 450));
  });
  check(`A3 备注框滚动定位后完整可见、与导航/保存条互不遮挡 [${tag}]`, !!(m2.noteIn && m2.interNN === 0 && m2.interNSave === 0), JSON.stringify(m2));
  check(`A4 备注框命中测试落在本体 [${tag}]`, m2.hitNote === "TEXTAREA", m2.hitNote ?? "");

  // 键盘场景：聚焦备注框 → 导航隐藏；模拟键盘高度 --kb-h=300 → 保存条抬升
  await page.focus('textarea[aria-label="打卡备注"]');
  await sleep(900);
  const m3 = await page.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const inter = (a, b) => (a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0);
    const nav = document.querySelector("nav.tabs");
    const noteR = R(document.querySelector('textarea[aria-label="打卡备注"]'));
    return {
      navHidden: nav.className.includes("nav-hidden"),
      interNN: inter(R(nav), noteR),
      noteIn: noteR.top >= 0 && noteR.bottom <= window.innerHeight,
    };
  });
  check(`A5 聚焦备注框（键盘弹起）导航隐藏且备注框完整可见 [${tag}]`, !!(m3.navHidden && m3.noteIn && m3.interNN === 0), JSON.stringify(m3));
  const m4 = await page.evaluate(() => {
    document.body.style.setProperty("--kb-h", "300px");
    document.querySelector(".page .checkin-actions")?.scrollIntoView({ block: "end" });
    return new Promise((res) => setTimeout(() => {
      const save = document.querySelector(".page .checkin-actions button.btn");
      const r = save.getBoundingClientRect();
      res({ saveBottom: Math.round(r.bottom), vh: window.innerHeight, saveIn: r.top >= 0 && r.bottom <= window.innerHeight });
    }, 450));
  });
  check(`A6 模拟键盘高度 300 时保存条滚动定位停在键盘区上方（scroll-margin 含 --kb-h）[${tag}]`, !!(m4.saveIn && m4.saveBottom <= m4.vh - 280), JSON.stringify(m4));
  await page.evaluate(() => document.body.style.removeProperty("--kb-h"));
  await page.screenshot({ path: path.join(OUT, `i-checkin-kb-${tag}.png`) });
  await ctx.close();
}

// ── B 弹层 · 390×844 ──
{
  const { ctx, page } = await newPage({ width: 390, height: 844 });
  const sheetProbe = async (btnText) => page.evaluate((t) => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const nav = document.querySelector("nav.tabs");
    const sheet = document.querySelector(".sheet");
    if (sheet) sheet.scrollTop = sheet.scrollHeight;
    return new Promise((res) => setTimeout(() => {
      const btn = [...document.querySelectorAll(".sheet button.btn")].find((b) => b.textContent.trim() === t);
      const btnR = R(btn);
      let hitBtn = null;
      if (btn) {
        const els = document.elementsFromPoint((btnR.left + btnR.right) / 2, (btnR.top + btnR.bottom) / 2);
        hitBtn = els.length ? els[0].tagName : null;
      }
      res({
        navHidden: nav.className.includes("nav-hidden"),
        sheetIn: !!sheet && R(sheet).bottom <= window.innerHeight + 1,
        btnIn: !!btnR && btnR.top >= 0 && btnR.bottom <= window.innerHeight,
        hitBtn,
      });
    }, 450));
  }, btnText);
  const closeSheet = async () => { await page.click(".sheet-close"); await sleep(500); };

  await page.locator('nav.tabs button[aria-label="计划"]').click();
  await sleep(700);
  await page.getByRole("button", { name: "修改目标" }).click();
  await sleep(700);
  const b1 = await sheetProbe("保存");
  check("B1 就寝登记弹层：导航隐藏、保存按钮完整可见可命中", !!(b1.navHidden && b1.sheetIn && b1.btnIn && b1.hitBtn === "BUTTON"), JSON.stringify(b1));
  await page.screenshot({ path: path.join(OUT, "i-sheet-registry.png") });
  await closeSheet();

  await page.locator(".daycaps button").first().click();
  await sleep(300);
  await page.getByRole("button", { name: "编辑这一天" }).click();
  await sleep(700);
  const b2 = await sheetProbe("保存");
  check("B2 周计划日编辑弹层：导航隐藏、保存按钮完整可见可命中", !!(b2.navHidden && b2.sheetIn && b2.btnIn && b2.hitBtn === "BUTTON"), JSON.stringify(b2));
  await closeSheet();

  await page.getByRole("button", { name: "三层目标是怎么运作的" }).click();
  await sleep(700);
  const b3 = await page.evaluate(() => ({
    navHidden: document.querySelector("nav.tabs").className.includes("nav-hidden"),
    sheetOpen: !!document.querySelector(".sheet"),
  }));
  check("B3 说明弹层：打开时导航隐藏", !!(b3.navHidden && b3.sheetOpen), JSON.stringify(b3));
  await closeSheet();

  // 习惯 ⋯ 菜单只在计划页习惯行渲染（HabitCheckRow showMenu），从计划页打开。
  await page.locator(".page button[aria-label^=\"习惯操作\"]").first().click();
  await sleep(700);
  const b4 = await page.evaluate(() => {
    const sheet = document.querySelector(".sheet");
    const r = sheet?.getBoundingClientRect();
    return {
      navHidden: document.querySelector("nav.tabs").className.includes("nav-hidden"),
      sheetIn: !!r && r.bottom <= window.innerHeight + 1 && r.top >= 0,
    };
  });
  check("B4 习惯菜单弹层：导航隐藏、弹层完整在视口内", !!(b4.navHidden && b4.sheetIn), JSON.stringify(b4));
  await page.screenshot({ path: path.join(OUT, "i-sheet-habitmenu.png") });
  await closeSheet();
  await ctx.close();
}

// ── C 页内表单 · 两视口 ──
for (const vp of [{ width: 390, height: 844 }, { width: 440, height: 773 }]) {
  const tag = `${vp.width}x${vp.height}`;
  const { ctx, page } = await newPage(vp);
  const btnProbe = async (text) => page.evaluate((t) => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const inter = (a, b) => (a && b ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) : 0);
    const btn = [...document.querySelectorAll(".page button.btn")].find((b) => b.textContent.trim() === t);
    const btnR = R(btn);
    return { found: !!btn, btnIn: !!btnR && btnR.top >= 0 && btnR.bottom <= window.innerHeight, interN: inter(R(document.querySelector("nav.tabs")), btnR) };
  }, text);

  await page.locator('nav.tabs button[aria-label="我的"]').click();
  await sleep(700);
  await page.getByRole("button", { name: /建档问卷/ }).click();
  await sleep(600);
  await scrollPageBottom(page);
  const c1 = await btnProbe("保存档案");
  check(`C1 建档问卷保存按钮滚到底完整可见、不被导航压 [${tag}]`, !!(c1.found && c1.btnIn && c1.interN === 0), JSON.stringify(c1));

  await page.locator('nav.tabs button[aria-label="我的"]').click();
  await sleep(600);
  await page.getByRole("button", { name: /体检记录/ }).click();
  await sleep(600);
  await scrollPageBottom(page);
  const c2 = await btnProbe("保存体检记录");
  check(`C2 体检录入保存按钮滚到底完整可见、不被导航压 [${tag}]`, !!(c2.found && c2.btnIn && c2.interN === 0), JSON.stringify(c2));

  await page.locator('nav.tabs button[aria-label="我的"]').click();
  await sleep(600);
  await page.getByRole("button", { name: /关于与免责/ }).click();
  await sleep(600);
  await page.getByRole("button", { name: /真机验收/ }).click();
  await sleep(600);
  await scrollPageBottom(page);
  const c3 = await btnProbe("提交结果");
  check(`C3 验收页提交按钮滚到底完整可见、不被导航压 [${tag}]`, !!(c3.found && c3.btnIn && c3.interN === 0), JSON.stringify(c3));
  if (vp.width === 390) await page.screenshot({ path: path.join(OUT, "i-accept-submit.png") });

  await page.locator('nav.tabs button[aria-label="计划"]').click();
  await sleep(700);
  await page.locator(".page").getByRole("button", { name: "专题", exact: true }).click();
  await sleep(600);
  await page.locator(".page .topic-row").first().click();
  await sleep(700);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".page button.btn")].find((b) => b.textContent.trim() === "保存档位");
    btn?.scrollIntoView({ block: "center" });
  });
  await sleep(500);
  const c4 = await btnProbe("保存档位");
  check(`C4 专题档位保存按钮滚动定位后完整可见、不被导航压 [${tag}]`, !!(c4.found && c4.btnIn && c4.interN === 0), JSON.stringify(c4));
  await ctx.close();
}

check("全程无页面错误", results.pageErrors.length === 0, results.pageErrors.slice(0, 3).join(" | "));
results.finishedAt = new Date().toISOString();
results.passed = results.tests.filter((t) => t.ok).length;
results.total = results.tests.length;
fs.writeFileSync(path.join(OUT, "results-i.json"), JSON.stringify(results, null, 2));
console.log(`I 组：${results.passed}/${results.total} 通过，pageErrors ${results.pageErrors.length}`);
await browser.close();
process.exit(results.passed === results.total ? 0 : 1);
