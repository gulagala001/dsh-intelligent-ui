# IUI 1.0.14 · DSH 0.2.1-rc.5

[中文](#zh-1014) | [English](#en-1014)

<a id="zh-1014"></a>

## 中文

本版适配与验收正在进行，尚未发布。

### 问题修复

- 修复 Chromium 返回零时区偏移时的发送失败，统一转换为宿主接受的 UTC；独立安装与共装均可使用。

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-1014"></a>

## English

This adaptation is under validation and has not been published.

### Bug Fixes

- Normalize Chromium’s zero-offset time zone to the host-supported UTC value, restoring message submission in standalone and shared installations.

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [IUI 1.0.14](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.5.iui.1.0.14/dsh-intelligent-ui-0.2.1-rc.5.iui.1.0.14.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.5.iui.1.0.14/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-intelligent-ui/blob/main/docs/install.md)

---

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
