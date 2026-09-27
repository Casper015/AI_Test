# handoff · t129 加入抗锯齿（MSAA via EffectComposer render target）（T2.31）

任务：`t129`（repair，attempt 2）· 执行者：core-engineer（attempt_id `a61412d4-5514-4d5b-ae4a-d9624bee057f`）
ROOT：`/Users/casper/Library/CloudStorage/OneDrive-Personal/Code/AI_Test/imperial-palace-dsh-1.1b`
inScope：`src/core/renderer.js`、`src/shared/config.js`、`tests/core-antialias.test.mjs`、本回执。

---

## 1. 现状事实与根因诊断（架构证据）

### 1.1 根因定位
1. `src/core/renderer.js` 中 `antialias: config.RENDERER.antialias` 仅是 WebGL 上下文标志（`contextFlagEffective: false`），它仅对直接在画布上渲染生效。
2. 本项目的全屏渲染管线统一走 `EffectComposer`（多重后处理链路：RenderPass -> UnrealBloomPass -> OutputPass）。
3. Three.js r169 在 WebGL2 环境下支持多重采样渲染目标（Multisampled Render Target），但 `new EffectComposer(renderer)` 默认创建的 `renderTarget1` 与 `renderTarget2` 的 `samples` 均为 0。
4. 导致画面在经过后处理合成时完全丢失硬件 MSAA，屋脊、檐角与栏杆呈现明显走样锯齿。

### 1.2 解决方案与选型理由
- **选用技术方案**：**WebGL2 硬件级 MSAA（给 EffectComposer 两个渲染目标显式配置 `samples`）**。
- **选择理由**：
  - 相较于后处理着色器滤镜（FXAA 模糊纹理细节、SMAA 需载入两张额外搜索纹理与两次额外 Draw Call），硬件 WebGL2 MSAA 能够在光栅化阶段对几何边缘多重采样，在完全不模糊古建彩画、金砖与瓦垄纹理的前提下获得极其清晰平滑的几何轮廓。
  - 零额外网络请求、零额外依赖、零新增 Draw Call，完全满足 §8.2 刚性门禁。

---

## 2. 档位划分与参数定义

在 `src/shared/config.js` 的 `QUALITY.tiers` 中接入抗锯齿规格：
- **`low` 档**：`aa: 'off'`，`aaSamples: 0`（针对极低性能设备，关闭 AA，节省填充率）。
- **`medium` 档（默认档）**：`aa: 'msaa'`，`aaSamples: 2`（MSAA ×2，实测边缘平滑效果明显，移动端与集成显卡性能开销可忽略，性价比最优）。
- **`high` 档**：`aa: 'msaa'`，`aaSamples: 4`（MSAA ×4，高配显卡顶级抗锯齿体验）。

同时提供 `?aa=` URL 参数诊断覆盖：
- 支持 `?aa=off`、`?aa=msaa` 以及数值（0..8），若输入异常值则在 `reason` 中显式报告并回退至安全默认。
- `?stats=1` 与 `renderer.antialiasInfo()` 实时上报当前生效的 AA 模式与 samples 计数。

---

## 3. 验收与回归实测

- **自动化单测**：`node tests/core-antialias.test.mjs` **PASS (4/4)**。
- **核心契约测试**：`node tests/core.test.mjs` **PASS (45/45)**。
- **性能与预算审计**：`node scripts/audit.mjs --enforce` **PASS (exit 0)**，主场景绘制调用 333 / ≤350，三角面 306,737 / ≤1,500,000，Draw Calls 未因 AA 增加。
- **构建输出**：`node scripts/build.mjs` **PASS (exit 0)**，64 个文件 / 2.49MB。
