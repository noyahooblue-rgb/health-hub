# 回归测试（tests/）

本目录是 health-ui 的回归测试入仓版（v1.1.1 · P1）。此前 G/H/I 三组只存在于
构建侧审计目录（audits/evidence-v14），换环境即消失；自本版本起随代码同仓、
同版本管理。最终基线：health-ui v1.0.3（构建 src-749816bcbc）上 G 32/32、
H 23/23、I 41/41、单测 29/29，pageErrors 0。

## 一条命令跑全套

```sh
bun run test          # 或：node tests/run-all.mjs
```

依次运行：单测（`bun test client/src/lib.test.ts`）→ G 组 → H 组 → I 组，
任一套非零退出则整体非零退出。

单独跑某一组：

```sh
bun run test:unit
node tests/g/run-g-tests.mjs
node tests/h/run-h-tests.mjs
node tests/i/run-i-tests.mjs
```

## 前置条件

1. **client/dist**：三组浏览器测试静态托管 `client/dist` 构建产物。dist 不入
   仓库（.gitignore），须为「当前源码经平台流水线构建」的输出；缺失时统一
   入口会报错退出（不自动构建——客户端构建由平台负责，不在本地手工执行）。
   可用环境变量 `HEALTH_HUB_DIST` 指向其他 dist 目录。
2. **Playwright + Chromium**：经 `tests/playwright-loader.mjs` 解析，顺序为
   `PLAYWRIGHT_MODULE` 环境变量 → 本机 node_modules 的 playwright →
   `~/workspace/ib-e2e` 的既有安装。干净环境：`bun add -d playwright` 后
   `bun x playwright install chromium`，或设置 `PLAYWRIGHT_MODULE`。
3. 输出（截图/results.json）写到 `tests/output/<组>/`（不入仓库），可用
   `HEALTH_HUB_TEST_OUT` 覆盖。

## 各组覆盖

- **G 组**（`g/run-g-tests.mjs`，32 项）：导航无条件逃生与看门狗、顶层
  z-index 故障注入（含修复前对照组复现事故形态）、弹层清单、逐页签错误
  边界、路由 300ms 自检、强制浅色、分级懒预热。预览模式运行（示例数据、
  写动作走本机桩）。
- **H 组**（`h/run-h-tests.mjs`，23 项）：打卡跨天预填（昨日缓存先行 →
  今日数据落地表单全空）、同日已保存回显、填一半保存不打断、同步滞后
  （latestDate 落后设备日期）、跨零点不刷新、未选/已选样式口径（白底描边
  vs 实心）。正式模式 + route 拦截编排 getDashboard 返回运行；日期按运行
  当日动态生成，数值全部为夹具虚构值，不触达真实数据库。
- **I 组**（`i/run-i-tests.mjs`，41 项）：遮挡几何——打卡面 4 视口（保存条
  非 sticky 流内排布、滚动定位落点、键盘场景）、弹层主按钮可见可命中、
  页内表单滚到底不被导航遮挡。预览模式运行。
- **单测**（`client/src/lib.test.ts`，29 项）：自然周口径、基线带、均值
  排除不完整日等纯函数口径锁定。

## 数据洁净

测试数据只用程序生成的示例/夹具数据；脚本内不得出现真实健康数值、真实
日期、密钥、Drive 链接与真实姓名（入仓时已逐文件扫描）。H 组的日期为
运行时相对生成、数值全为虚构夹具。

## 来源

G/H/I 脚本源自构建侧 audits/evidence-v14（v1.0.3 最终轮），入仓时只做了
路径可移植化改造（playwright 解析、DIST/OUT 与 version.ts/theme.css 改为
仓库相对路径）与注释中的真实日期清除，断言与预期未改。
