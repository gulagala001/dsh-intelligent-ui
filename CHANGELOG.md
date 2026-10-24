# IUI 1.0.13 · DSH 0.2.1-rc.3

[中文](#zh-1013) | [English](#en-1013)

<a id="zh-1013"></a>

## 中文

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-1013"></a>

## English

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [IUI 1.0.13](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.3.iui.1.0.13/dsh-intelligent-ui-0.2.1-rc.3.iui.1.0.13.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.3.iui.1.0.13/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-intelligent-ui/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-intelligent-ui/blob/main/docs/install_EN.md)

---

# IUI 1.0.12 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-1012) | [English](#en-1012)

<a id="zh-1012"></a>

## 中文

### 问题修复

- 保存与恢复按用户实际编辑意图合并，防止迟到回执、旧草稿和同值操作覆盖新编辑，避免对象键顺序导致误报冲突。
- 合并结果先校验再保存，无效结果保留可编辑草稿；真正的冲突继续要求明确选择，保存失败可以继续修改。

<a id="en-1012"></a>

## English

### Bug Fixes

- Merges saves and recovery according to actual edit intent, preventing late receipts, stale drafts and same-value edits from overwriting newer changes and avoiding false conflicts caused by object key order.
- Validates merged results before persistence and retains editable drafts for invalid results; real conflicts still require an explicit choice and failed saves remain editable.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [IUI 1.0.12](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.12/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.12.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.12/SHA256SUMS) |
| 0.2.1-rc.1 | [IUI 1.0.12](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.1.iui.1.0.12/dsh-intelligent-ui-0.2.1-rc.1.iui.1.0.12.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.1.iui.1.0.12/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-intelligent-ui/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-intelligent-ui/blob/main/docs/install_EN.md)

---

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
