# IUI 1.0.11 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-1011) | [English](#en-1011)

<a id="zh-1011"></a>

## 中文

### 其他变更

- 更新中英文产品、安装与使用文档，整理交互组件展示。
- 源码主线保留构建输入，正式安装使用精确匹配宿主的固定工件；移除过期宿主的当前构建锁。

<a id="en-1011"></a>

## English

### Other Changes

- Updates Chinese and English product, installation and usage documentation and interactive component examples.
- Keeps build inputs on the source branch and supplies fixed artifacts for the exact host version; removes obsolete host build locks from current targets.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.1 | [IUI 1.0.11](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.1.iui.1.0.11/dsh-intelligent-ui-0.2.1-rc.1.iui.1.0.11.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.1.iui.1.0.11/SHA256SUMS) |
| 0.2.1-rc.2 | [IUI 1.0.11](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.11/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.11.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.11/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-intelligent-ui/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-intelligent-ui/blob/main/docs/install_EN.md)

---

# 变更记录

## 1.0.10 · 2026-10-20

- 交互作品跟随 DSH 原生明暗配色、主题色、字体与正文字号。
- 新建智能聊天入口采用宿主原生按钮与图标；作品面板的关闭、重试复用原生按钮。
- 分别提供 DSH `0.2.1-rc.1`、`0.2.1-rc.2` 精确匹配包，作品格式与保存路径不变。

## 1.0.9 · 2026-10-17

- 分别提供 DSH `0.2.1-rc.1`、`0.2.1-rc.2` 构建，精确匹配 Cordis `4.0.5`、Schemastery `3.18.5` 与冻结锁。
- 修复并发会话与同作品多视图提交、保存回执、空状态与恢复过程中的竞态。
- 改进数字输入步长与小数精度、默认选择和表格选择的稳定身份处理。
- 为场景求值、渲染与恢复增加有界处理，保留现有作品、技能与组件格式。
- 更新中英文安装说明、固定下载入口和源码／安装包公开文件门禁。

## 1.0.0

首个公开版本，提供智能聊天、按需技能、28 个交互组件、图表、表单、模拟与游戏，以及作品展开、保存恢复和导出。

旧构建及下载见 [1.0.0 发行说明](docs/release-1.0.0.md)。
