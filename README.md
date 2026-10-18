# Oracle

一个可以把整个定居点交给 AI 打理的经营自动化游戏。它真的很好用，好用到你渐渐看不见真实的世界。

- 在线版本：https://victoryis.github.io/Oracle_dev/
- 当前阶段：P0（工程地基）。还不能玩，只有骨架。

## 开发

需要 Node 22 以上。

```bash
npm ci
npm run dev      # 本地开发
npm run check    # 类型、lint、单测、引擎中立性、剧本包校验
npm run build    # 生产构建（含体积预算）
npm run e2e      # 端到端测试（先 build）
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

`npm run validate` 会检查所有剧本包，报错时给出文件名和字段。

## 许可证

MIT
