# DSH Intelligent UI — 安装与维护

[English](install_EN.md) · [返回首页](../README.md#readme-install)

**DSH 0.2.1-rc.5 · Node.js ≥22.19 · IUI 1.0.14**

需要可用的 DSH 模型。生成质量取决于模型；作品内交互使用受控组件与有界表达式，提交后才继续模型对话。

## 安装到当前实例

在实际使用的实例打开 **插件 → ＋ 添加插件**，粘贴固定发行地址：

```text
https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.5.iui.1.0.14/dsh-intelligent-ui-0.2.1-rc.5.iui.1.0.14.tgz
```

等当前任务结束后按宿主提示启用或重启，沿用原 profile、DSH_HOME、模型配置和会话。

下载后可核对同一发行版的 [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.5.iui.1.0.14/SHA256SUMS).

### 首次成功检查

悬停 **新会话**，点击 **Chat**；也可在普通会话输入 `/intelligent-ui`，随后提出：

```text
做一个可调整的分账工具：账单387元，加8%服务费，5人均分。人数、金额和服务费都能修改。
```

初始每人应付 83.59；修改参数后结果在作品内更新，不额外调用模型。

<details>
<summary>命令行安装</summary>

使用同一 DSH 实例对应的 CLI，将 `web` 换成实际 profile。

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.5.iui.1.0.14/dsh-intelligent-ui-0.2.1-rc.5.iui.1.0.14.tgz"
```

</details>

<details>
<summary>DSH 0.2.1-rc.1</summary>

使用对应独立构建，不混装 rc.2 包。

```text
https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.1.iui.1.0.12/dsh-intelligent-ui-0.2.1-rc.1.iui.1.0.12.tgz
```

</details>

## 升级、回退与卸载

先备份现有 profile 与相关数据，再安装匹配宿主的固定版本；不为安装插件自动替换或降级 DSH。更新失败保留原数据和第一处错误。回退时选择此前匹配包并核对对应数据说明；只恢复代码不等于撤销数据变更。

在当前实例插件页移除，或使用：

```bash
dsh plugin --profile web remove dsh-intelligent-ui
```

会话原文及 `DSH_HOME/intelligent-ui/state` 中的作品状态保留，重新安装匹配版本可继续读取。

移除后重启同一实例。反馈提供完整版本、profile 类型和脱敏后的第一处错误。
