# docs/handoffs/TEMPLATE.md — 任务回执模板

> 复制本文件为 `docs/handoffs/<task-id>.md`（例如 `docs/handoffs/t6.md`）。
> **开工前**先写"开工回执"并发送给主理人；**完成后**在同一文件追加"交付回执"。
> 对应计划 §3.3（开工协议）与 §7.3（派发/完成条件）。未测内容必须明确写"未验证"，不得臆造数据。

---

## 开工回执（before implementation）

```text
任务 ID / Agent：
已读计划、风格与接口版本：
  - imperial-palace-plan.md（版本/日期）：
  - docs/STYLE_GUIDE.md：STYLE_BASELINE vX.Y.Z
  - docs/CONTRACTS.md：vX.Y.Z
  - src/shared/config.js：CONFIG_VERSION X.Y.Z
  - src/shared/layout.js：LAYOUT_VERSION X.Y.Z
  - 参考图 assets/reference/palace-layout.png：已读
可写文件 / 只读依赖：
区域边界 / 连接 ID / 使用的建筑 kit 与材质：
  - 区域 id 与 bounds：
  - 本人 owner 的连接 ID：
  - 使用的 kit 构件与材质 role：
要消费和返回的接口：
  - 消费：ctx.THREE/config/zoneLayout/kit/assets/rng/events
  - 返回：root/buildings/connectors/colliders/viewpoints/lightAnchors/update/dispose
验收方式 / 性能预算：
  - 自己的验证命令：
  - 本区绘制调用预算（B70/C50/D40/E40/F80）与实测：
依赖齐备情况 / 发现的冲突：
```

## 交付回执（after implementation）

```text
任务 ID / Agent：
基线版本：
文件清单（新增/修改，含行数或职责）：
接口（对外提供 / 消费）：
建筑注册（数量与 id 清单，与 layout.SLOTS 对照）：
院落 / 连接 / 道路（与 layout 对照）：
视角登记（zone / fp-spawn / interior 的 id 与坐标）：
碰撞数据（obstacles / walkable / ramps 条数）：
实际检查步骤与真实输出（原样粘贴命令与输出）：
性能实测（视口/DPR/质量档/GPU/浏览器、avgFps、p95FrameMs、drawCalls、visibleTriangles、transferMB）：
截图路径（1440×900、DPR1、时辰与质量档）：
未验证项 / 已知限制：
遗留风险与需要的上游支持：
```

## 纪律提醒

1. 只写本人负责文件；改他人文件先报告主理人（见 `docs/CONTRACTS.md` §2 文件归属表）。
2. 完成后必须自己跑通验证命令并粘贴真实输出；`node tests/run.mjs` 必须为绿。
3. 不得伪造性能或截图数据；无法验证的项写"未验证"。
4. 占位实现必须在交付前替换为真实依赖。
