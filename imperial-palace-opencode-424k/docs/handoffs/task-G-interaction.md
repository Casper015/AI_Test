# G 交互与 UI · 回执

任务 ID / Agent：`G-interaction-ui`

已读版本：layout-v1 / style-baseline-v1 / CONTRACTS api-v1；可写：`src/interaction/*`、`src/ui/*`

交付内容：

- `interaction/collision.js`：可行走面/障碍/水面模型与第一人称行走器（台阶阈值、贴墙滑动、水面阻挡、阻挡原因回报）
- `interaction/selection.js`：实例化网格射线拾取（instanceId → buildingId）、金色选中框与青色悬停框
- `interaction/tour.js`：中轴 8 个讲解点，暂停/继续/上一站/下一站/退出，用户接管相机时暂停
- `ui/hud.js` + `ui.css`：视角切换器（1–8）、分区跳转（7 项）、时辰（3）、质量（3）、建筑信息面板（含“建筑近景/进入内景/走到附近”）、悬停提示、导览条与讲解文字、加载进度与错误重试、性能行
- `ui/minimap.js`：宫墙/分区/水面/院落/建筑/中轴与当前位置绘制，点击定位分区

验收：`1–8`、按钮、`F`、`Esc` 行为一致（同一事件）；第一人称与导览互斥；进入与退出第一人称恢复原机位；主路线 31/31、侧苑 35/35 实测

已知问题：headless 环境 pointer lock 不可用（已 try/catch + 拖动转视角兜底）；触屏仅保证鸟瞰/点选与第一人称虚拟摇杆（双指缩放依赖 OrbitControls），窄屏信息面板宽度 220 px 实测可读
