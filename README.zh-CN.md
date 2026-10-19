# Oracle

[English](README.md) · **中文**

一个可以把整个定居点交给 AI 打理的经营自动化游戏。它真的很好用，好用到你渐渐看不见真实的世界。

- 在浏览器里玩：https://victoryis.github.io/Oracle_dev/
- 当前阶段：P1，亲手经营的世界。你可以采集、建造，带着大家一天天过下去。神谕会在之后的阶段登场。

## 怎么玩（P1）

1. 点**新游戏**，再依次点**开始规划**和**开始白天**。只有白天时间才会流动。
2. 选中你自己或工灵（在地图上点它，或者点右侧列表），点**采集**，再点一棵树或一丛浆果。右键会对选中的单位下最顺手的命令。
3. **建造**打开建造菜单。先放一个工地，再让工灵去**施工**。
4. 黄昏时结算这一天：居民吃饭，劳动力产出。过完夜间就是下一天。
5. 视野外面都是雾。走进去，才能看见那里有什么。

快捷键：空格暂停，1/2/3 调速度，回车推进阶段，B 打开建造，? 列出所有快捷键。

## 语言

游戏跟随浏览器的语言，也可以在标题画面或顶栏切换。目前支持英文和简体中文；你的语言暂不支持时显示英文。

## 开发

需要 Node 22 以上。

```bash
npm ci
npm run dev          # 本地开发
npm run check        # 类型、lint、单测、引擎中立性、界面文案、剧本包校验
npm run build        # 生产构建（含首包体积预算）
npm run e2e          # 端到端测试：Chromium、Firefox 和手机尺寸（先 build）
npm run smoke        # 每个剧本包无头跑 30 天
npm run determinism  # 两次 100 天的运行和一次重放，必须逐日一致
npm run bench        # 30 个游戏日的耗时
```

## 剧本包

游戏内容都在 `scenarios/` 里，引擎不认识任何剧本专有名词。`scenarios/interpreter/` 是默认剧本"译者"。新剧本可以继承它，只写出不同的部分：

```yaml
# scenarios/my-story/scenario.yaml
id: my-story
version: 0.1.0
engine: "0"
extends: interpreter
title: "@scenario.title"
```

剧本包可以替换地图、开局、建筑、事件和所有文案。`tests/fixtures/scenarios/accept-mini/` 是一个换成 24×24 地图的小例子。也可以在游戏里从文件夹或 `.zip` 导入剧本包。

每个剧本包都要声明自己支持的语言（`languages: [en, zh-CN]`，第一个是回退语言），文案放在 `locale/<语言>.yaml`。`npm run validate` 会检查所有剧本包，报错时给出文件和字段，也包括某种语言缺了哪条文案。

## 许可证

MIT
