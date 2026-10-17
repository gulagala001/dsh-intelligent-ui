# IUI 1.0.0 发行说明

[中文](release-1.0.0.md) · [English](release-1.0.0.en.md)

IUI 1.0.0 是 DSH Intelligent UI 的首个正式版本，它直接安装到原版 DSH，在对话中提供交互回答；OMD 为可选共存插件。

## 安装包

使用与你的完整 DSH 版本一致的构建。各包分别锁定宿主 SDK、依赖与 peer，不通过修改版本声明跨宿主使用。

| 宿主 | 完整插件版本 | 安装包 |
| --- | --- | --- |
| `0.2.0-rc.2` | `0.2.0-rc.2.iui.1.0.0` | [下载](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.0-rc.2.iui.1.0.0/dsh-intelligent-ui-0.2.0-rc.2.iui.1.0.0.tgz) |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.iui.1.0.0` | [下载](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-alpha.1.iui.1.0.0/dsh-intelligent-ui-0.2.1-alpha.1.iui.1.0.0.tgz) |
| `0.2.1-alpha.2` | `0.2.1-alpha.2.iui.1.0.0` | [下载](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-alpha.2.iui.1.0.0/dsh-intelligent-ui-0.2.1-alpha.2.iui.1.0.0.tgz) |

发行标签为 `v<完整宿主版本>.iui.1.0.0`。安装、源码构建与卸载步骤见 [首页](../README.md#installation)，包来源与校验信息见各 [GitHub Release](https://github.com/gulagala001/dsh-intelligent-ui/releases) 的清单。

## 这一版可以做什么

- **智能聊天与按需技能**：悬停整格“新会话”后，右内侧显示 Chat 气泡；点击后创建智能聊天并继承当前模型。普通 agent 可用 `/intelligent-ui`，完整资料按需读取。
- **回答内交互**：28 个组件组合文字、图片、控件、指标、表格、图表、清单和表单。生成时渐进预览，当前步骤完成并恢复设置后启用操作。
- **图表与比较**：表格排序，图形或数据行点选，系列与分类筛选；作者标注 `unit` 后，不同单位按组展示，不自动换算或归一。
- **模拟与小游戏**：Scene 图形支持点击、指定键盘行为与拖拽；语义操作卡支持选择、匹配与顺序玩法。保留参数“重新开始”与完整“重置”分别提供，参数编辑自动暂停。
- **内联与展开**：共用作品设置和播放状态；窄回答中的图形可放大到原尺寸查看。明确展开后焦点进入作品，关闭回到入口。
- **保存与恢复**：自动保存设置，刷新、重开与宿主重启后恢复。模拟恢复后暂停；全部视图离屏、后台或关闭后暂停。并发冲突保留本地编辑供确认与重试。
- **源文与导出**：“更多操作”提供源文查看、复制和版本/源文/当前 JSON 设置导出。新作品使用组件版本 4；已有版本 1、2、3 作品继续读取、编辑并按原版本导出。
- **阅读与操作**：跟随明暗主题，支持窄屏排布、键盘与粗指针布局；触屏和折叠侧栏直接显示 Chat 入口。

控件操作与游戏在本地执行，不增加模型请求。表单提交、继续对话与模型修复由用户明确触发，沿用 DSH 原生工具循环、排队、取消与恢复。

## 更新与已知限制

更新时安装对应宿主构建、重启 profile，并继续使用原 DSH 数据目录。会话原文与 `intelligent-ui/state` 中的作品设置保留；卸载不删除这些数据。

生成内容仍可能包含未知组件、无效表达式或不适合的布局。诊断保留源文，模型修复需明确发起。无法确认稳定身份的重复数据行或超长行，其点选仅在当前视图保留。外部图片可能因来源不可用而无法显示；导出保存重现数据，完整交互仍需要本插件和兼容宿主。

交互通过受控组件、有界纯表达式与 Scene 数据协议运行，不执行任意 JavaScript，不获得宿主文件、凭据、网络或自动发起回合的权限。

操作细节见 [使用说明](usage.md)，依赖许可见 [第三方声明](../THIRD_PARTY_NOTICES.md)。问题请提交至 [Issues](https://github.com/gulagala001/dsh-intelligent-ui/issues)，附上完整宿主与插件版本、入口和最小可复现场景。
