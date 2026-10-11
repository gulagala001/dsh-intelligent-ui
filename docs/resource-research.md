# Intelligent UI 资源调查

产品目标是借鉴 ChatGPT Intelligent UI 的交互式回答：根据问题组合文字、视觉内容和操作控件，渐进显示，用户在回答内操作并继续对话。资源选择以这个目标、DSH 原生执行模型和 React 18 宿主约束为准。

## 官方体验与原理

[OpenAI 发行说明](https://openai.com/index/gpt-6-for-everyone/)和[用户提供的官方演示线程](https://x.com/OpenAI/status/2107894997538525580)明确了三类用途：日常问题的视觉回答、复杂概念的交互解释，以及计算器或小游戏等临时工具。官方说明使用原生可流式组件库和渐进处理界面的编译器，并训练模型选择布局和交互。

这里借鉴的是用户可见体验。公开资料没有提供该 ChatGPT 编译器或训练方法的可直接移植实现；生成质量需要在 DSH 实际选用的模型上验证。

## 开源资源与选择

| 资源 | 已核对基线 | 可复用部分 | 约束与本项目选择 |
| --- | --- | --- | --- |
| OpenUI | `@openuidev/lang-core`、`react-lang` 0.3.2；源码 `c4c0c90575facf824d3d8a64daa11947acc8a668`；MIT | 组件契约、提示词生成、流式解析、响应式状态及 React Renderer | React peer 接受现有宿主；采用低层解析与自己的有界求值、回答组件库；原生evaluator不满足本产品边界；不引入整套 AgentInterface、Cloud 或第二执行循环 |
| OpenAI Apps SDK UI | 0.2.2；MIT；React 18/19、Tailwind 4 | 接近 ChatGPT 的设计 token、按钮、输入、滑块、选择和布局基础 | 采用固定视觉tokens；Select/Popover实际React19，控件自建React18版本，CSS隔离到回答表面，避免污染 DSH；不依赖 ChatGPT 宿主 bridge |
| OpenAI Apps SDK examples | 官方公开示例 | inline 控件、地图、状态与宿主事件的具体参考 | 示例应用使用 React 19，按模块参考，不整应用复制；每项复制核对实际许可与资源来源 |
| Vercel json-render | v0.21.0，main `fc2a696a50a30cb30c878ab1eb65e102487eea0f`；Apache 2.0 | 混合文字和 JSONL patch 流、目录 schema、双向绑定及动作 | React renderer peer 要求 19.2.3，现成 shadcn 也依赖 React 19；作为协议与状态参考，不在 React 18 宿主硬装 |
| Google A2UI | `@a2ui/react`、`web_core` 0.12.0；源码 `03b77ae95a12f5040754f8cc48a8fa9ab761c377`；Apache 2.0 | JSONL surface 更新、组件目录、data model、绑定和客户端事件 | React 18/19 有明确声明与 React 18 测试脚本；依赖 web_core、Lit、signals、Zod 3，基础目录没有通用图表和游戏；保留作为替代和多端协议参考 |
| assistant-ui | react 0.15.25、react-generative-ui 0.0.24；源码 `0988bf60cbaf28ffb8795447c533780c985b7686`；MIT | ExternalStoreRuntime、部分结果渲染、宿主状态投影及交互 primitive | React 18/19；不引入 LocalRuntime 或 AI SDK 自动续跑；本项目已有 DSH UI，因此参考外部状态和错误恢复契约 |
| CopilotKit | react-core/react-ui 1.77.2；源码 `7477af105ba0ec4fd4698e06103e5372f90e9094` | MIT packages 的生成参数、执行、完成三态渲染 | 整 Runtime 会带入额外循环；`showcase/` 有独立 Source Available 许可，排除该目录 |
| OpenGenerativeUI | `457e60cdf7f63fb78004486e1dc7ba753194696d`；仓库 MIT | partial preview、最终视图和 frame 清理方法 | 应用 React 19/Next 16，frame 依赖 CDN，桥接可触发模型，iframe 本身不能证明 CPU 上限；仅参考生命周期，不直接采用自由 JS 执行轨道 |
| AG UI | core/client 1.0.2；源码 `7d14c417594ca29ce481c1cba7e3d652083223fb`；MIT | 类型化流事件和动作契约 | 协议不是 renderer；本地会话先复用 DSH，未来外部 agent 连接再考虑事件转换 |
| MCP Apps | ext-apps 2.0.3；MIT | host/component 双向消息和展示模式契约 | 当前产品不要求另建 MCP server；按需参考，避免增加第二套权限与传输 |
| ChatKit | chatkit-js 与官方 widgets 文档；Apache 2.0 | widget、表单、动作、渐进结果和线程表现 | 官方 JS 快速安装加载外部 CDN；服务端定制 SDK 主要是 Python，不作为本地 DSH 插件主运行时 |

采用 OpenUI 核心和官方设计系统，是由流式能力、React 18 兼容、轻量接入与视觉目标共同决定的。组件库、交互解释器、状态保存、宿主桥接和产品验收仍由本插件负责。

## 直接证据入口

- [OpenUI Renderer](https://www.openui.com/docs/openui-lang/renderer)、[组件定义](https://www.openui.com/docs/openui-lang/defining-components)、[固定源码](https://github.com/thesysdev/openui/tree/c4c0c90575facf824d3d8a64daa11947acc8a668)。
- [Apps SDK UI](https://github.com/openai/apps-sdk-ui)、[包声明](https://github.com/openai/apps-sdk-ui/blob/main/package.json)、[官方示例](https://github.com/openai/openai-apps-sdk-examples)。
- [json-render v0.21.0](https://github.com/vercel-labs/json-render/tree/v0.21.0)、[React peer 声明](https://github.com/vercel-labs/json-render/blob/v0.21.0/packages/react/package.json)。
- [A2UI React](https://github.com/a2ui-project/a2ui/tree/03b77ae95a12f5040754f8cc48a8fa9ab761c377/renderers/react)、[React 18 测试](https://github.com/a2ui-project/a2ui/blob/03b77ae95a12f5040754f8cc48a8fa9ab761c377/renderers/react/scripts/test-react18.sh)。
- [assistant-ui 外部状态接口](https://github.com/assistant-ui/assistant-ui/blob/0988bf60cbaf28ffb8795447c533780c985b7686/packages/core/src/runtimes/external-store/external-store-adapter.ts)、[Generative UI primitive](https://github.com/assistant-ui/assistant-ui/blob/0988bf60cbaf28ffb8795447c533780c985b7686/packages/core/src/react/primitives/generativeUI/GenerativeUI.tsx)。
- [CopilotKit 三态 renderer](https://github.com/CopilotKit/CopilotKit/blob/7477af105ba0ec4fd4698e06103e5372f90e9094/packages/react-core/src/v2/hooks/use-render-tool-call.tsx)、[showcase 独立许可](https://github.com/CopilotKit/CopilotKit/blob/7477af105ba0ec4fd4698e06103e5372f90e9094/showcase/LICENSE)。
- [OpenGenerativeUI renderer](https://github.com/CopilotKit/OpenGenerativeUI/blob/457e60cdf7f63fb78004486e1dc7ba753194696d/apps/app/src/components/generative-ui/open-generative-ui/renderer.tsx)、[frame CSP](https://github.com/CopilotKit/OpenGenerativeUI/blob/457e60cdf7f63fb78004486e1dc7ba753194696d/apps/app/src/components/generative-ui/open-generative-ui/frame-content.ts)。
- [AG UI 工具事件](https://github.com/ag-ui-protocol/ag-ui/blob/7d14c417594ca29ce481c1cba7e3d652083223fb/docs/spec/1.0/events/tool-calls.mdx)、[MCP Apps](https://github.com/modelcontextprotocol/ext-apps)。
- [ChatKit widgets](https://developers.openai.com/api/docs/guides/chatkit-widgets)、[chatkit-js](https://github.com/openai/chatkit-js)。

## 宿主调查结论

初始调查基线为 DSH 0.2.0-rc.2 与 0.2.1-alpha.1，以及对应的 OMD 0.10.0；当时的 OMD 源码分别固定在 `bb5afae4088183c09e349f98b6bc13a891412be3` 和 `de86711d2341e5239b2d95adde62bf48acf54cef`。这些版本、提交和下方发行链接保留为历史来源，不代表当前最新发行或本轮 OMD 共存验收结果。

当前构建配置分别对应 DSH 0.2.0-rc.2、0.2.1-alpha.1 和 0.2.1-alpha.2 三个完整版本，DSH SDK 与 peer 各自精确锁定。rc.2 对齐 Cordis 4.0.4 / Schemastery 3.18.4；两个 alpha 对齐 Cordis 4.0.5-alpha.1 / Schemastery 3.18.5-alpha.1。各构建不能互换，支持范围以实际验收为准。IUI 1.7.0 为本地构建，正式发布暂停；源码回归、原版宿主、OMD 共存和真实模型生成分别记录，不能互相替代。

宿主使用同一原生会话循环，产品的专用 chat 通过独立 preset 组成有限提示词和能力。preset 首回合后锁定，因此智能聊天入口创建新会话并在发送前选择 preset。初始“小＋”入口已更新为整格“新会话”右内侧悬停浮现的 Chat 图标；键盘聚焦时同样显示，触屏和折叠侧栏保留直接入口。点击格子其他位置继续按原生方式创建普通会话。普通 agent 通过原生 `skill({ name })` 读取详细规则，平时仅暴露短技能摘要；资源在原生文件读取能力支持下继续按需读。

上述宿主版本没有按代码块语言注册 renderer 或专用新会话入口的公开插槽。实现采用局部、可清理的 assistant-step 和入口呈现适配，保留普通 Markdown、附件、工具配对、取消与历史回放。原生右侧页签、模型选择、SessionFace.prompt、会话存储和认证路由可继续复用。

历史来源：[DSH alpha.1 官方预发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.1)、[OMD alpha.1 0.10.0 发行](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0)、[OMD rc.2 0.10.0 发行](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0)。桌面和跨平台支持以插件对应版本的实际验收为准。
