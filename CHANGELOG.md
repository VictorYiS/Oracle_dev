# Changelog

## P0 · 地基与验证

- 工程骨架：Vite + TypeScript + Preact，Vitest、Playwright、ESLint、Prettier；GitHub Actions 跑完整检查后部署到 GitHub Pages。
- 两条硬规则落地：`src/core` 无头（lint + 无 DOM 的类型检查），引擎代码不得出现剧本内容（`npm run check:neutral`），均有测试证明能拦住违规代码。
- 剧本包 Schema v0、加载器（`extends` 继承、按 id 覆盖与删除、文本引用检查）和校验器；默认剧本包"译者" v0。
- 种子随机数（xoshiro128**）和现实债账本（整数定点：祈问槽位、加班 ×(k+1)、复利、核验与亲手还债、失真概率、带冷却的催收、斋戒）。
- 经济模拟：抽象沙盘 + 三种策略机器人 + 参数搜索。推荐参数写回剧本包，见 `docs/reports/econ-sim-v0.md`。
- 设计调整：催收加入冷却期（`collection_cooldown_days`），祈问按槽位计费（`petition_slots`）。
- 验证：Artifact 渠道的自动检测项在 claude.ai 真机全部通过（`docs/spikes/A-artifact-channel.md`）；浏览器可直连 Anthropic API（`docs/spikes/B-byok.md`）。
- 代码审查：修复 9 条，剧本包按需加载转入 P1.6。验收报告：`docs/reports/P0.md`。
