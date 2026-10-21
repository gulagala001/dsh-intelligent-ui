<a name="readme-top"></a>

<h1 align="center">DSH Intelligent UI</h1>

<p align="center"><strong>让回答变成可以调整、选择和操作的交互作品。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-intelligent-ui/releases/tag/v0.2.1-rc.2.iui.1.0.10"><img alt="IUI 1.0.10" src="https://img.shields.io/badge/release-IUI%201.0.10-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-intelligent-ui/releases"><img alt="GitHub 累计下载量" src="https://img.shields.io/github/downloads/gulagala001/dsh-intelligent-ui/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-intelligent-ui/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-intelligent-ui?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="docs/usage.md">完整文档</a> · <a href="https://github.com/gulagala001/dsh-intelligent-ui/issues">反馈</a></p>

<p align="center"><a href="docs/images/iui-1.0-plan.png"><img src="docs/images/iui-1.0-plan.png" alt="交互聚餐计划 / Interactive meal plan" width="880"></a></p>

<a id="installation"></a>
<a id="features"></a>
<a id="showcase"></a>
<a id="usage"></a>
<a id="updates"></a>
<a id="data"></a>
<a id="ecosystem"></a>
<a id="development"></a>
<a id="boundaries"></a>
<a id="limitations"></a>
<a id="compatibility"></a>
<a id="contributing"></a>
<a id="credits"></a>
<a name="readme-install"></a>

## 快速开始

**适用环境：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

需要可用的 DSH 模型。生成质量取决于模型；作品内交互使用受控组件与有界表达式，提交后才继续模型对话。

### 1. 安装

打开实际使用的 DSH 实例，在 **插件 → ＋ 添加插件** 中粘贴：

```text
https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.10.tgz
```

等当前任务结束后，按宿主提示启用或完整重启该实例，沿用原 profile 与数据。其他宿主、升级和卸载见[安装指南](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.10/SHA256SUMS).

### 2. 先试这一件事

悬停 **新会话**，点击 **Chat**；也可在普通会话输入 `/intelligent-ui`，随后提出：

```text
做一个可调整的分账工具：账单387元，加8%服务费，5人均分。人数、金额和服务费都能修改。
```

**成功标志：** 初始每人应付 83.59；修改参数后结果在作品内更新，不额外调用模型。

## 在回答里直接操作

- **28 个组件**：文字、图片、卡片、指标、表格、图表、数字输入、选择、滑块、清单与表单，可与普通文字混合呈现。
- **参数本地联动**：调整金额、人数、筛选条件或游戏状态，不增加模型调用；明确提交才继续对话。
- **保存与交付**：作品设置按会话和消息保存；内联与原生展开页签共享状态，可复制源文并导出数据。

### 调参数，立即看结果

![分账工具](docs/images/iui-1.0-calculator.png)

还可以生成套餐比较、可勾选清单、聚餐计划、图形模拟和小游戏。图表按标注的单位分组；点击、键盘与拖拽按作品声明的场景工作。[完整示例](docs/examples.md)

## 范围与数据

| 场景 | 行为 |
| --- | --- |
| 明暗、窄屏和键盘操作 | 跟随 DSH 原生配色、字体及控件；完整交互需要插件。 |
| 刷新、重开和宿主重启 | 按会话／消息恢复已保存状态；保存失败或冲突会提示。 |
| 导出 | 保留源文和 JSON 状态，继续交互仍需兼容插件与宿主。 |
| 生成内容 | 受控组件、有界表达式与 Scene 协议，不执行任意 JavaScript，不取得宿主文件、凭据或网络权限。 |

作品设置位于 `DSH_HOME/intelligent-ui/state`。卸载后会话原文与作品设置保留；重新安装匹配版本可继续读取。DSH rc.1／rc.2 分别提供独立构建，不混装 SDK 或包。

## 常见问题

<details>
<summary>看不到 Chat 入口？</summary>

悬停或键盘聚焦整格“新会话”，点击右内侧 Chat 气泡；触屏和折叠侧栏直接显示。若仍未出现，核对当前 profile 的插件启用状态并重启。

</details>

<details>
<summary>模型只输出文字，或者作品显示解析错误？</summary>

用 Chat 入口或 `/intelligent-ui`，明确说出希望调整、选择或操作的内容。错误作品可查看诊断与源文，再明确请求原会话模型修正；不会自动循环消耗模型用量。

</details>

<details>
<summary>修改参数会发送给模型吗？</summary>

普通本地交互不会。只有用户明确提交或继续对话时，相应字段才进入模型请求。外部图片仍取决于图片来源的可用性。

</details>

## 开发与许可

[架构](docs/architecture.md) · [组件与协议](docs/contracts.md) · [使用指南](docs/usage.md)

采用 [MIT](LICENSE)。OpenUI 低层解析、Apps SDK UI token 等来源与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 文档与支持

| 我想做什么 | 去哪里 |
| --- | --- |
| 安装、升级、卸载 | [安装指南](docs/install.md) |
| 了解使用方法与边界 | [使用文档](docs/usage.md) |
| 查看版本变化 | [Releases](https://github.com/gulagala001/dsh-intelligent-ui/releases) |
| 反馈问题 | [Issues](https://github.com/gulagala001/dsh-intelligent-ui/issues) |

反馈时请提供完整 DSH／插件版本、实际入口、最小复现步骤，以及预期和实际表现；日志与截图先移除私人数据。

<p align="center"><a href="#readme-top">返回顶部</a> · <a href="https://github.com/gulagala001/dsh-intelligent-ui/releases">版本与下载</a> · <a href="https://github.com/gulagala001/dsh-intelligent-ui/issues">反馈</a></p>
