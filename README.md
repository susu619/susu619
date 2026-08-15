# Super Mario Suyi — Multiplayer Web Platformer Engine

[![Status](https://img.shields.io/badge/status-active%20development-2ea44f)](./ROADMAP.md)
[![Simulation](https://img.shields.io/badge/simulation-60%20Hz-0969da)](./docs/ARCHITECTURE.md)
[![Room](https://img.shields.io/badge/multiplayer-up%20to%207-orange)](./docs/ARCHITECTURE.md)
[![Maintenance](https://img.shields.io/badge/maintenance-continuous-8250df)](./docs/MAINTENANCE.md)

> 一个持续维护中的 HTML5 / Canvas 多人平台动作游戏与实时同步实验项目。重点不是复刻原作，而是研究 **60Hz 权威模拟、移动端触控、多人协作物理、确定性世界状态、A/B 发布与持续可玩性验证**。

## 项目状态

**Active Development / 持续维护中。**

当前公开仓库以经过维护审计的 `3.8.x` 引擎基线为起点；`3.9` 世界重制（天宫 / 地狱）仍处于开发阶段，**未达到可玩性标准前不会作为正式版本发布**。

- Maintainer / 维护者：**susu6019**
- GitHub account / GitHub 账号：**[@susu619](https://github.com/susu619)**
- ChatGPT account email / ChatGPT 账号邮箱：**待维护者填写准确的 ChatGPT 绑定邮箱后公开或提交申请**
- Maintenance mode：长期维护、持续回归、A/B Trial 后人工验收

> OpenAI 的 Codex for Open Source 申请要求填写与 ChatGPT 账号关联的真实邮箱；本仓库不会猜测或伪造该字段。

## 为什么做这个项目

这个项目从一个浏览器平台游戏逐步演化成一个完整的实时游戏工程实验场：

1. **60Hz 游戏模拟**：客户端保持 60FPS 目标，服务端权威模拟保持 60Hz。
2. **多人同步**：最多 7 人同房，包含远端插值、有限外推、输入 reconciliation、共享敌人权威和协作碰撞。
3. **移动端优先**：实体触控摇杆、可拖拽布局、UI 皮肤、触觉反馈与移动端合成预算。
4. **确定性与回滚**：固定点状态、状态哈希、网络快照、世界图指纹、A/B Trial/Promote/Rollback。
5. **持续可玩性门禁**：不仅检查 JSON 是否存在，还检查路线可达、奖励可拿、敌人有支撑面、管道出口安全、碰撞可见。
6. **实验玩法**：冰冻领域、重力机制、动态世界、多人踩头/叠罗汉、Boss 与区域事件。

## 核心特性

### 实时多人
- 服务端权威 60Hz simulation
- 7 人房间硬上限
- 共享玩家 / 敌人 / 载具状态
- 客户端远端插值与有限外推
- 本地输入 reconciliation（最多 24 条未确认输入）
- RTT / jitter / main-thread scheduling 诊断

### 移动端控制
- 实体触控摇杆与操作按钮
- 五套控制 UI 风格
- 控件大小与位置自定义
- 按压形变、回弹、触点 FX 与振动反馈
- 横屏沉浸模式与安全区适配

### 世界与玩法
- 多区域 World Graph
- 管道与区域转场
- 安全复活 / checkpoint
- 冰冻领域：冻结敌人仍保留实体 hitbox，可踩头、可攻击
- 龙坐骑（乌龟坐骑已从生产逻辑移除）
- 服务器权威 Boss / 敌人生命周期

## 架构概览

```text
Browser / Mobile
   │
   ├── Canvas2D / WebGL2 Renderer
   ├── Input + Reconciliation
   ├── Remote Avatar Interpolation
   │
Gateway API ───────── Realtime WebSocket
   │                         │
   └──── SQLite / Session    └── 60Hz RoomClock
                                  │
                                  ├── Shared Player Authority
                                  ├── Shared Enemy Authority
                                  ├── Dynamic World
                                  └── Deterministic Sim Core
```

详细见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 质量门禁

上传公开仓库前进行了一轮维护审计：

- 95 / 95 个当前环境可执行的独立门禁通过
- 双客户端 integration 连续多轮通过，P95 Tick 约 1.8–2.1ms（审计环境）
- 2400 Tick 确定性模拟通过
- 修复会话过期校验、重连 timer 复用、WebSocket URL 查询参数、握手超时竞态、坐骑拾取复活边界等维护 Bug

完整说明见 [docs/MAINTENANCE.md](./docs/MAINTENANCE.md)。

## 本地开发

```bash
npm ci
npm run start:local
```

核心测试：

```bash
npm run test:sim
npm run test:integration
npm run test:world-entry-continuity
npm run audit:collisions
npm run test:maintenance-audit
```

## 资产政策

本公开仓库**不分发许可不明确的 Nintendo / Mario / Luigi / Peach / Doraemon 等角色或音频素材**。CC0 或明确许可素材保留来源说明。

详见 [docs/ASSET_POLICY.md](./docs/ASSET_POLICY.md)。

## 路线图

当前重点不是堆版本号，而是把下一阶段的天宫 / 地狱做成真正值得发布的完整区域：关卡节奏、视觉层次、怪物生态、Boss、机关、无空气墙、无断路、真实跑图全部达标之后才发布。

见 [ROADMAP.md](./ROADMAP.md)。

## Codex for Open Source

计划使用这个仓库申请 OpenAI **Codex for Open Source**。申请材料不夸大使用量，也不伪造维护记录；重点展示真实的持续维护责任：代码审查、Issue triage、回归测试、发布管理、性能和兼容性治理。

申请准备见 [docs/CODEX_OSS_APPLICATION.md](./docs/CODEX_OSS_APPLICATION.md)。

## License

项目原创代码按 [LICENSE](./LICENSE) 许可。第三方内容与例外项以 [NOTICE.md](./NOTICE.md) 和各自来源文件为准。

---

**Maintained by susu6019 · Active Development**
