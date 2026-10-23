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
