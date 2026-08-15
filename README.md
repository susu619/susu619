# Super Mario Suyi — Multiplayer Web Platformer Engine

[![Status](https://img.shields.io/badge/status-active%20development-2ea44f)](./ROADMAP.md)
[![Simulation](https://img.shields.io/badge/simulation-60%20Hz-0969da)](./docs/ARCHITECTURE.md)
[![Room](https://img.shields.io/badge/multiplayer-up%20to%207-orange)](./docs/ARCHITECTURE.md)
[![Maintenance](https://img.shields.io/badge/maintenance-continuous-8250df)](./docs/MAINTENANCE.md)

> 一个持续维护中的 HTML5 / Canvas 多人平台动作游戏与实时同步工程项目，重点研究高频权威模拟、移动端交互、多人协作物理、确定性世界状态、可靠发布和可玩性验证。

## 项目状态

**Active Development / 持续维护中。**

当前公开仓库以经过维护审计的 `3.8.x` 引擎基线为起点；`3.9` 世界重制仍处于开发阶段。天宫与地狱在关卡节奏、逻辑、视觉、怪物生态、Boss、机关和完整跑图没有达到发布标准之前，不进入正式 Release。

- Maintainer / 维护者：**susu6019**
- GitHub：**[@susu619](https://github.com/susu619)**
- Maintenance：长期维护、持续回归、人工验收、A/B Trial / Promote / Rollback

## 项目方向

这个项目已经从单机浏览器平台游戏逐步演化为一个完整的实时游戏工程实验场：

1. **60Hz 权威模拟** — 服务端固定步长更新世界状态，客户端以 60FPS 为目标维持流畅呈现。
2. **多人同步** — 最多 7 人同房，包含远端插值、有限外推、本地输入 reconciliation、共享敌人权威和玩家协作碰撞。
3. **移动端优先** — 实体触控摇杆、按钮布局、触觉反馈、安全区适配和移动端渲染预算。
4. **确定性世界** — 状态哈希、网络快照、世界图指纹与兼容性门禁用于发现不可重复或不可恢复的状态错误。
5. **安全发布** — A/B Trial、Promote、Rollback 和版本兼容策略降低在线更新风险。
6. **真实可玩性验证** — 不只验证数据文件存在，还验证路线可达、奖励可获取、碰撞可见、转场安全、敌人出生合理和完整物理跑图。

## 核心能力

### 实时多人

- 服务器权威 60Hz simulation
- 7 人房间硬上限
- 玩家、敌人、载具与动态世界共享状态
- 远端角色插值与有限外推
- 本地输入 reconciliation，限制未确认输入窗口
- RTT / jitter / main-thread scheduling 诊断
- 房间级协作碰撞、踩头与多人叠加玩法

### 移动端控制

- 实体触控摇杆与操作按钮
- 五套控制 UI 风格
- 控件大小和位置自定义
- 按压反馈、触点特效和振动反馈
- 横屏沉浸模式与安全区适配
- HUD 与渲染更新预算分离

### 世界与玩法

- 多区域 World Graph
- 管道与区域转场
- checkpoint / 安全复活
- 冰冻领域与实体冻结碰撞
- 重力玩法与动态世界事件
- 服务器权威 Boss / 敌人生命周期
- 管理员世界规则与活动调度能力持续开发中

## 架构概览

```text
Browser / Mobile
   │
   ├── Renderer
   ├── Input + Reconciliation
   ├── Remote Avatar Interpolation
   │
Gateway API ───────── Realtime WebSocket
   │                         │
   └──── Session             └── 60Hz RoomClock
                                  │
                                  ├── Shared Player Authority
                                  ├── Shared Enemy Authority
                                  ├── Dynamic World
                                  └── Deterministic Sim Core
```

详细设计见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

## 当前质量基线

公开基线在上传前重新进行过维护审计，而不是直接复制旧压缩包：

- 95 / 95 个当前环境可执行的独立门禁通过
- 多轮双客户端 integration 满足服务器 Tick 预算
- 2400 Tick 确定性模拟通过
- 已修复会话过期校验、重连 timer 复用、WebSocket URL 参数拼接、握手超时竞态、坐骑复活边界等逻辑问题
- 对不可用的外部依赖测试明确标记环境限制，不把未执行测试写成通过

完整记录见 [docs/MAINTENANCE.md](./docs/MAINTENANCE.md)。

## 本地开发

```bash
npm ci
npm run start:local
```

常用验证：

```bash
npm run test:sim
npm run test:integration
npm run test:world-entry-continuity
npm run audit:collisions
npm run test:maintenance-audit
```

## 3.9 世界重制

下一阶段的核心不是继续增加版本号，而是把天宫与地狱做成真正完整的游戏区域。

发布前必须同时满足：

- 从正常入口开始能够完整物理跑通，不依赖测试传送或坐标改写
- 无断路、空气墙、错误坡面、不可达平台和异常转场
- 天宫与地狱拥有独立的地形语言、环境事件和战斗节奏
- 怪物拥有可辨认的行为逻辑，而不是单纯换皮追踪
- 机关状态、伤害预警、Boss 门禁和复活逻辑与视觉表现一致
- 实际运行画面达到完整关卡而非原型占位质量
- 移动端与多人模式回归不因世界扩展发生性能退化

详细计划见 [ROADMAP.md](./ROADMAP.md)。

## 贡献

欢迎针对以下方向提交可复现的问题、测试和改进：

- 网络同步与预测
- 确定性模拟
- 移动端性能
- 关卡可达性与碰撞
- 怪物 AI 与 Boss 逻辑
- 世界事件与多人协作玩法
- 构建、部署和回滚可靠性

贡献流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 资产与版权边界

公开仓库不分发许可不明确的商业角色图片、音频或私人研究素材。第三方素材只有在来源和许可明确时才进入公开树；新贡献优先使用原创、CC0、CC-BY 或其他允许再分发的资源。

详见 [docs/ASSET_POLICY.md](./docs/ASSET_POLICY.md) 和 [NOTICE.md](./NOTICE.md)。

## License

项目原创代码按 [LICENSE](./LICENSE) 许可。第三方内容与例外项以 [NOTICE.md](./NOTICE.md) 以及各资源目录中的来源说明为准。

---

**Maintained by susu6019 · Active Development**
