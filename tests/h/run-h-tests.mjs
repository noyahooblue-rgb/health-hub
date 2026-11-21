// H 组回归测试（health-ui v1.0.3）· evidence-v14（批复 btqajb62 更正轮重跑）
// H1–H5 与无页面错误共 20 项断言不变；H6 按新样式口径改写（见下方 H6 注释，
// 旧口径→新口径与依据登记于 DATA-PLAN「样式口径变更」节）；新增 H7 ——
// btqajb62 原缺陷回归：打开打卡状态为空且未选项为白底无填充，点选一项后
// 仅该项变实心（填充/白字/非颜色线索各断言一次）。
// 本地 harness：静态托管 client/dist 构建产物 + 正式模式（非预览），用
// Playwright route 拦截 POST ./actions，按场景编排 getDashboard 的返回：
//   H1 跨天（v1.0.3 原修复回归）：昨日缓存先行渲染 → 今日数据落地 → 表单全空。
//   H2 今日已保存：打开即显示已保存值（编辑今日记录）；标签选中态带「✓ 」。
//   H3 同日不打断（M12）：填一半 → 保存 → 值保留且转「更新今日打卡」。
//   H4 同步滞后（新增）：设备日期 = D、数据 latestDate = D-1（今日同步未到，
//      D-1 有打卡/习惯已勾/建议已完成）→ 断言表单为空、标题为 D 的日期、
//      习惯与建议为今日未完成；保存打卡写 D 不覆盖 D-1；勾习惯写 D 的日志。
//   H5 跨零点不刷新（新增，假时钟）：23:59 打开表单填一半不保存 → 时钟走
//      到次日 00:01 + 切后台再回来 → 内容不丢、标题明示所属日期（D）、保存
//      写 D；切走页签再回来才按新的一天（D+1）初始化（全空、标题为 D+1）。
// 日期按运行当日动态生成；数值均为测试夹具虚构值，不触达真实数据库。
// 运行：node tests/h/run-h-tests.mjs（见 tests/README.md；playwright 经 tests/playwright-loader.mjs 解析）。
import { chromium } from "../playwright-loader.mjs";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DIST = process.env.HEALTH_HUB_DIST || path.join(REPO_ROOT, "client", "dist");
const OUT = process.env.HEALTH_HUB_TEST_OUT || path.join(REPO_ROOT, "tests", "output", "h");
fs.mkdirSync(OUT, { recursive: true });

const results = { startedAt: new Date().toISOString(), tests: [], pageErrors: [], calls: [] };
function check(name, ok, detail = "") {
  results.tests.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmt(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function labelCn(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}月${d}日`;
}
const now = new Date();
const TODAY = fmt(now);
const YDAY = fmt(new Date(now.getTime() - 86400000));
const YDAY2 = fmt(new Date(now.getTime() - 2 * 86400000));
const TOMORROW = fmt(new Date(now.getTime() + 86400000));

function dailyRow(date, steps) {
  return {
    date, steps, activeEnergyKcal: 300, exerciseMin: 20, standMin: 90,
    restingHr: 65, hrvMs: 45, spo2Pct: 96.2, respiratoryRate: 17.5,
    wristTempC: 35.6, walkingHr: 98, distanceM: 4000, waterMl: 1000, headphoneDb: 62,
  };
}
function sleepRow(date) {
  return {
    date, startDatetime: `${date} 00:30`, endDatetime: `${date} 07:00`,
    totalMin: 390, coreMin: 220, deepMin: 50, remMin: 100, awakeMin: 20,
    efficiency: 96, qualityScore: 60, awakenings: 3,
  };
}
function payload(latestDate, { checkins = [], habitLogs = [], suggestionDone = [] } = {}) {
  const days = [YDAY2, YDAY, TODAY, TOMORROW].filter((d) => d <= latestDate);
  return {
    seeded: true,
    latestDate,
    daily: days.map((d, i) => dailyRow(d, 5000 + i * 111)),
    sleep: days.map(sleepRow),
    workouts: [],
    checkins,
    habitLogs,
    habits: [
      { id: 1, topic: "sleep", name: "固定起床时间（±30 分钟内）", minVersion: "晚起也先下床", active: true },
      { id: 2, topic: "sleep", name: "睡前 45 分钟放下屏幕", minVersion: null, active: true },
      { id: 4, topic: "exercise", name: "按周计划完成运动时段", minVersion: null, active: true },
    ],
    goals: [],
    reports: [],
    labs: [],
    nutrition: [],
    suggestionDone,
    topicSettings: ["sleep", "exercise", "activity", "cardio", "weight", "nutrition", "stress", "desk", "prevention", "travel"]
      .map((topic) => ({ topic, mode: topic === "sleep" || topic === "exercise" ? "active" : "monitor", tier: "基础达标" })),
    weeklyPlan: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, kind: "灵活", label: null })),
    profile: null,
    settings: {
      bedtime_target: "23:15", bedtime_stage_target: "00:30", morning_on: "1",
      morning_time: "07:30", bedtime_remind_on: "1", travel_mode: "0", habit_cap_v1: "1",
    },
    sync: { status: "idle", lastAt: new Date().toISOString(), lastHhmm: "08:59" },
    history: { detailFrom: YDAY2, hasOlder: false, olderMonths: [], oldestDate: YDAY2 },
  };
}

const YDAY_CHECKIN = { date: YDAY, energy: 4, mood: 4, stress: 3, note: "昨天夹具备注", tags: ["饮酒", "熬夜加班"], redFlag: false };
const TODAY_CHECKIN = { date: TODAY, energy: 2, mood: 5, stress: 1, note: "今天夹具备注", tags: ["晚餐很晚"], redFlag: false };

const browser = await chromium.launch();
async function newPage({ cacheData = null, responder, fakeNowMs = null }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.pageErrors.push(String(e?.message ?? e)));
  if (fakeNowMs != null) {
    // 假时钟：替换 window.Date（todayStr 等设备日期口径都经 new Date() 取值）。
    await ctx.addInitScript((ms) => {
      const RealDate = window.Date;
      let fake = ms;
      class FakeDate extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : [fake]));
        }
        static now() { return fake; }
      }
      window.__setFakeNow = (v) => { fake = v; };
      window.Date = FakeDate;
    }, fakeNowMs);
  }
  if (cacheData) {
    await ctx.addInitScript((data) => {
      try {
        window.localStorage.setItem(
          "health-dash-cache-v1",
          JSON.stringify({ at: Date.now() - 10 * 60 * 1000, data }),
        );
      } catch { /* ignore */ }
    }, cacheData);
  }
  await page.route("http://harness.local/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "POST" && url.pathname.endsWith("/actions")) {
      let body = {};
      try { body = JSON.parse(req.postData() || "{}"); } catch { /* ignore */ }
      const data = responder(body.action, body.args ?? {});
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
      return;
    }
    const p = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(DIST, p);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) await route.fulfill({ path: file });
    else await route.fulfill({ status: 200, contentType: "text/html", body: fs.readFileSync(path.join(DIST, "index.html")) });
  });
  await page.goto("http://harness.local/");
  await page.waitForSelector("nav.tabs button", { timeout: 20000 });
  return { ctx, page };
}
const genericActions = (action, args) => {
  if (["saveCheckin", "toggleHabit", "toggleSuggestion", "toggleNutrition"].includes(action)) {
    results.calls.push({ action, args });
  }
  if (action === "getErrorSummary") return { count: 0, latestAt: null };
  if (action === "listAcceptance") return { records: [] };
  if (action === "saveCheckin") return { ok: true, redFlag: false };
  return { ok: true };
};
async function formState(page) {
  return page.evaluate(() => {
    const onRates = [...document.querySelectorAll(".page .rate-row")].map((row) => {
      const on = row.querySelector(".rs button.on");
      return on ? Number(on.textContent) : 0;
    });
    const onTags = [...document.querySelectorAll(".page button.chip.tog.on")].map((c) => c.textContent.trim());
    const offTags = [...document.querySelectorAll(".page button.chip.tog:not(.on)")].map((c) => c.textContent.trim());
    const note = document.querySelector('textarea[aria-label="打卡备注"]')?.value ?? null;
    const saveBtn = [...document.querySelectorAll(".page button.btn")].find((b) => /打卡/.test(b.textContent))?.textContent.trim() ?? null;
    const pill = document.body.innerText.includes("今日已打卡");
    const title = document.querySelector(".page .checkin-date")?.textContent.trim() ?? null;
    return { onRates, onTags, offTags, note, saveBtn, pill, title };
  });
}
async function habitChecked(page, name) {
  return page.evaluate((n) => {
    const el = document.querySelector(`input[aria-label="习惯打卡：${n}"]`);
    return el ? el.checked : null;
  }, name);
}
async function suggestionChecked(page) {
  return page.evaluate(() => {
    const el = document.querySelector('input[aria-label^="完成建议"]');
    return el ? el.checked : null;
  });
}

// ── H1 跨天：昨日缓存先行渲染 → 今日数据落地 → 表单必须全空 ──
{
  const payloadA = payload(YDAY, { checkins: [YDAY_CHECKIN], habitLogs: [`1:${YDAY}`] });
  const payloadB = payload(TODAY, { checkins: [YDAY_CHECKIN], habitLogs: [`1:${YDAY}`] });
  const { ctx, page } = await newPage({
    cacheData: payloadA,
    responder: (action) => (action === "getDashboard" ? payloadB : genericActions(action)),
  });
  let landed = false;
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const s = await formState(page);
    if (s.saveBtn === "保存打卡") { landed = true; break; }
  }
  const s = await formState(page);
  check("H1 跨天后今日数据已落地（按钮回到「保存打卡」）", landed, JSON.stringify(s));
  check(
    "H1 跨天后打卡表单全空（评分未选/标签未选/备注为空）",
    s.onRates.every((v) => v === 0) && s.onTags.length === 0 && s.note === "" && !s.pill,
    JSON.stringify(s),
  );
  check("H1 表单标题为今日打卡 · 设备今日日期", s.title === `今日打卡 · ${labelCn(TODAY)}`, `title=${s.title}`);
  const habitToday = await habitChecked(page, "固定起床时间（±30 分钟内）");
  check("H1 习惯今日勾选态未带出昨天（按日期键派生）", habitToday === false, `checked=${habitToday}`);
  await page.screenshot({ path: path.join(OUT, "h1-crossday-form.png") });
  await ctx.close();
}

// ── H2 今日已保存：打开即显示已保存值；选中标签带对勾、未选无对勾 ──
{
  const payloadC = payload(TODAY, { checkins: [TODAY_CHECKIN], habitLogs: [`1:${TODAY}`] });
  const { ctx, page } = await newPage({
    responder: (action) => (action === "getDashboard" ? payloadC : genericActions(action)),
  });
  await sleep(1200);
  const s = await formState(page);
  check(
    "H2 今日已保存打卡打开显示已保存值（2/5/1 + 晚餐很晚 + 备注）",
    s.onRates.join(",") === "2,5,1" && s.onTags.join(",") === "✓ 晚餐很晚" && s.note === "今天夹具备注" && s.saveBtn === "更新今日打卡" && s.pill,
    JSON.stringify(s),
  );
  check(
    "H2 标签对勾只出现在选中态（选中带「✓ 」、未选无对勾）",
    s.onTags.every((t) => t.startsWith("✓ ")) && s.offTags.length > 0 && s.offTags.every((t) => !t.includes("✓")),
    JSON.stringify({ on: s.onTags, off: s.offTags }),
  );
  check("H2 表单标题为今日打卡 · 设备今日日期", s.title === `今日打卡 · ${labelCn(TODAY)}`, `title=${s.title}`);
  await page.screenshot({ path: path.join(OUT, "h2-tag-checkmark.png") });
  await ctx.close();
}

// ── H3 同日不打断：填一半 → 保存 → 值保留且转「更新今日打卡」 ──
{
  const payloadB = payload(TODAY, { checkins: [], habitLogs: [] });
  const { ctx, page } = await newPage({
    responder: (action) => (action === "getDashboard" ? payloadB : genericActions(action)),
  });
  await sleep(1000);
  const s0 = await formState(page);
  check("H3 前置：今日无打卡时表单全空", s0.onRates.every((v) => v === 0) && s0.onTags.length === 0 && s0.note === "", JSON.stringify(s0));
  for (const [label, n] of [["精力", 3], ["情绪", 4], ["压力", 2]]) {
    await page.getByRole("radio", { name: `${label} ${n} 分` }).click();
  }
  await page.locator("button.chip.tog", { hasText: "饮酒" }).click();
  await page.locator('textarea[aria-label="打卡备注"]').fill("填一半的备注");
  await page.getByRole("button", { name: "保存打卡", exact: true }).click();
  await sleep(800);
  const s = await formState(page);
  check(
    "H3 保存后刚填的值原样保留（3/4/2 + ✓ 饮酒 + 备注）且转「更新今日打卡」",
    s.onRates.join(",") === "3,4,2" && s.onTags.join(",") === "✓ 饮酒" && s.note === "填一半的备注" && s.saveBtn === "更新今日打卡",
    JSON.stringify(s),
  );
  await ctx.close();
}

// ── H4 同步滞后：latestDate = D-1（D-1 有打卡/习惯已勾/建议已完成），设备日期 = D ──
{
  results.calls.length = 0;
  const payloadLag = payload(YDAY, {
    checkins: [YDAY_CHECKIN],
    habitLogs: [`1:${YDAY}`],
    suggestionDone: [`${YDAY}:0`],
  });
  const { ctx, page } = await newPage({
    responder: (action, args) => (action === "getDashboard" ? payloadLag : genericActions(action, args)),
  });
  await sleep(1200);
  const s = await formState(page);
  check("H4① 同步滞后时打卡表单为空（不带出 D-1 的 4/4/3）",
    s.onRates.every((v) => v === 0) && s.onTags.length === 0 && s.note === "" && !s.pill,
    JSON.stringify(s));
  check("H4② 打卡标题显示设备今日 D 的日期", s.title === `今日打卡 · ${labelCn(TODAY)}`, `title=${s.title} 期望=今日打卡 · ${labelCn(TODAY)}`);
  const hb = await habitChecked(page, "固定起床时间（±30 分钟内）");
  const sg = await suggestionChecked(page);
  check("H4③ 习惯显示今日未勾、建议为今日未完成（D-1 的完成不算今日）",
    hb === false && sg === false, `habit=${hb} suggestion=${sg}`);
  // ④ 保存打卡 → 写入 D，不覆盖 D-1
  for (const [label, n] of [["精力", 3], ["情绪", 3], ["压力", 3]]) {
    await page.getByRole("radio", { name: `${label} ${n} 分` }).click();
  }
  await page.getByRole("button", { name: "保存打卡", exact: true }).click();
  await sleep(800);
  const saveCalls = results.calls.filter((c) => c.action === "saveCheckin");
  check("H4④ 保存打卡写入设备今日 D（绝不写 D-1）",
    saveCalls.length === 1 && saveCalls[0].args.date === TODAY,
    JSON.stringify(saveCalls));
  // ⑤ 勾选习惯 → 写入 D 的日志
  await page.locator('.page input[aria-label="习惯打卡：固定起床时间（±30 分钟内）"]').click();
  await sleep(600);
  const habitCalls = results.calls.filter((c) => c.action === "toggleHabit");
  check("H4⑤ 勾选习惯写入设备今日 D 的日志（不写 D-1）",
    habitCalls.length >= 1 && habitCalls[habitCalls.length - 1].args.date === TODAY && habitCalls[habitCalls.length - 1].args.done === true,
    JSON.stringify(habitCalls));
  await page.screenshot({ path: path.join(OUT, "h4-sync-lag.png") });
  await ctx.close();
}

// ── H5 跨零点不刷新：23:59 填一半 → 00:01（切后台再回来）→ 不丢、标题明示 D、保存写 D；重开才按 D+1 初始化 ──
{
  results.calls.length = 0;
  const openMs = new Date(`${TODAY}T23:59:00`).getTime();
  const payloadD = payload(TODAY, { checkins: [], habitLogs: [] });
  const { ctx, page } = await newPage({
    fakeNowMs: openMs,
    responder: (action, args) => (action === "getDashboard" ? payloadD : genericActions(action, args)),
  });
  await sleep(1000);
  const s0 = await formState(page);
  check("H5 前置：23:59 打开表单为 D 的今日打卡且全空",
    s0.title === `今日打卡 · ${labelCn(TODAY)}` && s0.onRates.every((v) => v === 0),
    JSON.stringify(s0));
  for (const [label, n] of [["精力", 3], ["情绪", 4], ["压力", 2]]) {
    await page.getByRole("radio", { name: `${label} ${n} 分` }).click();
  }
  await page.locator("button.chip.tog", { hasText: "饮酒" }).click();
  await page.locator('textarea[aria-label="打卡备注"]').fill("跨零点填的备注");
  // 时钟走到次日 00:01，并模拟切后台再回来（visibilitychange + blur/focus）
  await page.evaluate((ms) => {
    window.__setFakeNow(ms);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  }, new Date(`${TOMORROW}T00:01:00`).getTime());
  await sleep(1200);
  const s = await formState(page);
  check("H5① 跨零点后已填内容不丢（3/4/2 + ✓ 饮酒 + 备注）",
    s.onRates.join(",") === "3,4,2" && s.onTags.join(",") === "✓ 饮酒" && s.note === "跨零点填的备注",
    JSON.stringify(s));
  check("H5② 标题明确显示这份打卡所属日期（D 的「X月X日的打卡」）",
    s.title === `${labelCn(TODAY)}的打卡`, `title=${s.title} 期望=${labelCn(TODAY)}的打卡`);
  await page.getByRole("button", { name: `保存${labelCn(TODAY)}的打卡`, exact: true }).click();
  await sleep(800);
  const saveCalls = results.calls.filter((c) => c.action === "saveCheckin");
  check("H5③ 保存写入标题所示日期 D（不写 D+1）",
    saveCalls.length === 1 && saveCalls[0].args.date === TODAY,
    JSON.stringify(saveCalls));
  await page.screenshot({ path: path.join(OUT, "h5-cross-midnight.png") });
  // ④ 切走页签再回来（关闭再打开）→ 按新的一天 D+1 初始化
  await page.getByRole("button", { name: "趋势", exact: true }).click();
  await sleep(600);
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await sleep(1000);
  const s2 = await formState(page);
  check("H5④ 关闭再打开才按新的一天初始化（全空、标题为 D+1）",
    s2.onRates.every((v) => v === 0) && s2.onTags.length === 0 && s2.note === "" && s2.title === `今日打卡 · ${labelCn(TOMORROW)}`,
    JSON.stringify(s2));
  await ctx.close();
}

// ── H6 样式口径（Claude 批复 btqajb62 更正；推翻 63u2muyg 的评分浅底）：
// 【样式口径变更】旧口径（evidence-v10…v13）：未选评分 = 薄荷浅底
// rgba(0,200,179,0.12) + 薄荷文字。新口径：未选评分 = 白底（rgb(255,255,255)）
// + 薄荷描边 + 薄荷文字，与标签未选态语言统一；选中评分除薄荷实底白字外，
// 另有非颜色线索（transform 放大 ≠ none、box-shadow 内描边 ≠ none）。
// 依据：用户真机反馈「所有选项都显示成已点击状态」+ 分类量测（状态为空、
// 未选个个带填充色，evidence-v14 measure-before）。标签断言不变（白底薄荷
// 文字 / 选中薄荷实底白字）；theme.css .chip.tog 与 .rs button 规则均不得
// 引用中性灰底色变量，.rs button 未选规则不得再引用 --mint-soft。
{
  const payloadC = payload(TODAY, { checkins: [TODAY_CHECKIN], habitLogs: [] });
  const { ctx, page } = await newPage({
    responder: (action) => (action === "getDashboard" ? payloadC : genericActions(action)),
  });
  await sleep(1200);
  const st = await page.evaluate(() => {
    const pick = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color, transform: s.transform, boxShadow: s.boxShadow };
    };
    return {
      offTag: pick(document.querySelector(".page button.chip.tog:not(.on)")),
      onTag: pick(document.querySelector(".page button.chip.tog.on")),
      offRate: pick(document.querySelector(".page .rate-row .rs button:not(.on)")),
      onRate: pick(document.querySelector(".page .rate-row .rs button.on")),
    };
  });
  const themeCss = fs.readFileSync(path.join(REPO_ROOT, "client", "src", "theme.css"), "utf8");
  const togRule = (themeCss.match(/button\.chip\.tog \{([^}]*)\}/) || [])[1] || "";
  const togOnRule = (themeCss.match(/button\.chip\.tog\.on \{([^}]*)\}/) || [])[1] || "";
  const rateRule = (themeCss.match(/\.rate-row \.rs button \{([^}]*)\}/) || [])[1] || "";
  const rateOnRule = (themeCss.match(/\.rate-row \.rs button\.on \{([^}]*)\}/) || [])[1] || "";
  const tokenOk =
    togRule.includes("var(--card)") && togRule.includes("var(--mint-t)") && togRule.includes("var(--mint)") &&
    !/var\(--fill\)|var\(--seg\)|var\(--track\)/.test(togRule) &&
    togOnRule.includes("var(--mint-t)") &&
    rateRule.includes("var(--card)") && !rateRule.includes("var(--mint-soft)") &&
    !/var\(--fill\)|var\(--seg\)|var\(--track\)/.test(rateRule) &&
    rateOnRule.includes("scale(1.08)") && rateOnRule.includes("inset");
  check(
    "H6 新口径：未选标签/评分均为白底无填充+薄荷文字、选中均薄荷实底白字且评分选中带非颜色线索（放大+内描边）；规则不引用灰底/浅底令牌",
    !!st.offTag && st.offTag.bg === "rgb(255, 255, 255)" && st.offTag.color === "rgb(0, 133, 117)" &&
      !!st.onTag && st.onTag.bg === "rgb(0, 133, 117)" && st.onTag.color === "rgb(255, 255, 255)" &&
      !!st.offRate && st.offRate.bg === "rgb(255, 255, 255)" && st.offRate.color === "rgb(0, 133, 117)" &&
      st.offRate.transform === "none" && st.offRate.boxShadow === "none" &&
      !!st.onRate && st.onRate.bg === "rgb(0, 133, 117)" && st.onRate.color === "rgb(255, 255, 255)" &&
      st.onRate.transform !== "none" && st.onRate.boxShadow !== "none" &&
      tokenOk,
    JSON.stringify({ ...st, togRule: togRule.trim(), rateRule: rateRule.trim() }),
  );
  await page.screenshot({ path: path.join(OUT, "h6-category-colors.png") });
  await ctx.close();
}

// ── H7 btqajb62 原缺陷回归：今日无打卡记录时打开表单——状态为空（三项分数
// 与标签全未选、保存按钮 disabled），且 15 个评分圆钮 + 6 个标签的未选计算
// 样式均为白底无填充（不得再出现「个个带填充色像已点击」）；点选「精力 3」
// 后仅该项变实心（实底+白字+放大），同组其余项与另外两组保持白底未选。
{
  const payloadE = payload(TODAY, { checkins: [YDAY_CHECKIN], habitLogs: [] });
  const { ctx, page } = await newPage({
    responder: (action) => (action === "getDashboard" ? payloadE : genericActions(action)),
  });
  await sleep(1200);
  const open = await page.evaluate(() => {
    const rates = [...document.querySelectorAll(".page .rate-row .rs button")];
    const tags = [...document.querySelectorAll(".page button.chip.tog")];
    const saveBtn = [...document.querySelectorAll(".page .checkin-actions button.btn")][0];
    return {
      ratesChecked: rates.filter((b) => b.getAttribute("aria-checked") === "true").length,
      tagsPressed: tags.filter((b) => b.getAttribute("aria-pressed") === "true").length,
      saveDisabled: saveBtn ? saveBtn.disabled : null,
      allRatesWhite: rates.every((b) => getComputedStyle(b).backgroundColor === "rgb(255, 255, 255)"),
      allTagsWhite: tags.every((b) => getComputedStyle(b).backgroundColor === "rgb(255, 255, 255)"),
    };
  });
  check(
    "H7① 打开打卡状态为空（分数/标签全未选、保存禁用）且未选项全为白底无填充",
    open.ratesChecked === 0 && open.tagsPressed === 0 && open.saveDisabled === true && open.allRatesWhite && open.allTagsWhite,
    JSON.stringify(open),
  );
  await page.evaluate(() => {
    const card = document.querySelector(".page .checkin-card");
    const sc = document.querySelector("[data-generated-space-root]");
    if (card && sc) sc.scrollTop += card.getBoundingClientRect().top - 8;
  });
  await sleep(500);
  await page.getByRole("radio", { name: "精力 3 分" }).click();
  await sleep(500);
  const after = await page.evaluate(() => {
    const rates = [...document.querySelectorAll(".page .rate-row .rs button")];
    const on = rates.filter((b) => b.classList.contains("on"));
    const onStyle = on.length === 1 ? getComputedStyle(on[0]) : null;
    return {
      onCount: on.length,
      onText: on.length === 1 ? on[0].textContent.trim() : null,
      onBg: onStyle?.backgroundColor ?? null,
      onColor: onStyle?.color ?? null,
      onTransform: onStyle?.transform ?? null,
      othersWhite: rates.filter((b) => !b.classList.contains("on")).every((b) => getComputedStyle(b).backgroundColor === "rgb(255, 255, 255)"),
    };
  });
  check(
    "H7② 点选一项后仅该项变实心（实底+白字+放大），其余 14 项保持白底未选",
    after.onCount === 1 && after.onText === "3" && after.onBg === "rgb(0, 133, 117)" &&
      after.onColor === "rgb(255, 255, 255)" && after.onTransform !== "none" && after.othersWhite,
    JSON.stringify(after),
  );
  await page.screenshot({ path: path.join(OUT, "h7-single-select.png") });
  await ctx.close();
}

check("H 组全程无页面错误", results.pageErrors.length === 0, results.pageErrors.slice(0, 3).join(" | "));

results.finishedAt = new Date().toISOString();
results.passed = results.tests.filter((t) => t.ok).length;
results.total = results.tests.length;
fs.writeFileSync(path.join(OUT, "results-h.json"), JSON.stringify(results, null, 2));
console.log(`\n══ H 组：${results.passed}/${results.total} 通过，pageErrors 合计 ${results.pageErrors.length} ══`);
await browser.close();
process.exit(results.passed === results.total ? 0 : 1);
