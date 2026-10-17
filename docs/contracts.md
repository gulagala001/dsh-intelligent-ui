# 模块契约

本文描述客户端组件、受控运行时和宿主状态服务之间的接口。

## 客户端组件

`src/client/components/index.jsx` 导出 `renderComponent(name, props, children, api)`；未知组件返回错误。React 18。组件只收到冻结的 JSON 数据，不获得 ctx、fetch、宿主或任意 JS。

`api` 为 `{ state, set(name,value), reset(name), action(action), evaluate(expression,locals), streaming, disabled, blockId }`。set/reset/action 都由插件受控运行时处理。`api.evaluate` 支持安全公式字符串，不接受 JavaScript；变量用名字或 `$name`。组件不得自行执行表达式。图表/模拟/游戏的定时器只在可见且非流式时运行，卸载清理，最高30fps。所有交互控件正确关联 label、键盘和错误状态。

当前API还提供默认组件的`widget/setWidget`、场景的`sceneView`以及按bind共享的`playback/playbackVersion`。未显式绑定的控件按稳定path保存私有状态，动态列表采用有类型的数据身份。源文更换后原API不能写入新作品；同一作品的内联与展开视图共享设置、播放器及拖拽归属。生成未完成时禁用展开，保留内联渐进预览。

复制、导出及源文位于本地更多disclosure；菜单不能启动模型回合。定位受visualViewport与祖先滚动裁剪边界限制，按空间上下翻转并限高；仅打开时监听resize/scroll/outside，关闭和卸载清理。显式选择/Escape回入口，外点和失焦不抢焦点。通用场景说明按需展开，业务提示保留。Tabs仅显式选中滚自身strip，恢复不滚页面。滑块thumb按编辑范围/step显示，数字展示原始状态且不写回归一值，连续场景读数不设置live区域。

FigureViewport为Chart/Diagram/Scene提供视图本地的原尺寸查看；默认随容器宽度，不引入内层纵向滚动。显式放大时区域允许有界滚动并可聚焦，SVG及交互节点不重挂，不写api/作品/播放状态。ResizeObserver或备用resize监听按组件生命周期清理。Scene非interactive mark为仅绘制层，不参与指针命中；interactive mark保留自身事件，透空处由SVG背景处理。点击和拖拽均使用当前SVG CTM映射，计入局部滚动与缩放。

`src/catalog.mjs` 导出 `catalog`，对象 key 为组件名，值 `{ group, description, args: ['field',...], schema: z.object(...), children?: 'field' }`。位置参数顺序就是OpenUI调用顺序。同步导出 `examples`（完整OpenUI源字符串列表），供真实宿主测试使用。至少覆盖Stack, Row, Grid, Card, Text, Heading, Divider, Image, Badge, Metric, Table, Chart, Button, Input, NumberInput, Select, Slider, Checkbox, Checklist, Form, Tabs, Calculator, Diagram, Simulation, Game。可以按真实需要添加，但保持目录紧凑。

布局组件children是数组；Image只接受受限制的公共https URL；交互组件通过字符串`bind`关联局部状态。Button action 是安全纯数据：`{type:'set',name,value}`、`{type:'reset',name}`、`{type:'submit',text,fields:[...]}`或同类数组，绝不任意脚本。Calculator使用fields和formula字符串；Simulation采用数据定义和公式；Game采用受控规则（例如井字棋/记忆配对/通用网格）而非生成JS。

Simulation与Game接受局部fields/metrics；Game在原scene/bind/title/instructions之后追加这两个可选参数，四参数旧调用保持原语义。编辑参数先暂停并取消拖拽。“重新开始”保留fields中的当前值，恢复其他初始字段与种子后执行既有reset步骤；“重置”还原全部初始字段与种子后执行reset步骤。sceneRestart仅为组件内部动作，不进入生成Button动作白名单。游戏指标在画布外显示并提供polite反馈；连续模拟指标不创建读屏live区域。

Scene的可选`actions`最多32项，每项有独立非空`id`和必需`label`；可用`detail/symbol/selected/disabled/color`，label和这些显示值可由有界公式派生。symbol最多16字符；selected/disabled必须是布尔值，color沿用mark颜色白名单。动作以原生DOM按钮呈现，点击与按钮上的原生Enter/Space激活都发送同一个`click`和`event.id`，不重复发送激活key事件。局部shortcut仅一ASCII字母或数字，大小写折叠后不能重复；作品内显式shortcut优先于自定义key规则，重复按键和修改键组合不能重复激活动作。非激活键仍可交给自定义`events.key`。actions与marks共享bind状态，`marks:[]`且有actions时不显示空画布；selected/disabled只表达当前状态，不创建另一套模型循环。Game统一呈现标题、说明、指标与操作区，选择/匹配等非空间玩法可用操作卡，空间命中与拖拽继续使用marks。

Chart系列对象接受可选显式`unit`。非饼图按去掉首尾空白后的相同单位字符串分组，当前组内保留各系列筛选，单位组选择沿用作品本地状态；饼图仍选单个指标。未提供unit的旧系列仍属于原来的同一组，保留已有筛选与选择。单位不从label推断、不自动换算或归一；未知或失效的已存单位选择仅投影到当前首组，渲染时不修写状态。图例、选中说明和数据表使用作者标注的单位。

`src/client/styles/surface.css` 默认导出样式字符串（构建器处理CSS导入）。必须全部限定 `.iui-surface` 或专用shadow root，不带body/:root/*宿主全局重置。不直接使用SDK Select/Popover（实际React19）；采用其官方设计token数值，React18原生控件。Portal只能进入本surface。

## 协议和运行时

UI fence语言为 `openui`（同时读`intelligent-ui`），首行可选`// iui:1`。正常文字照常渲染。OpenUI root和变量赋值解析由lang-core执行，但全部求值由本插件有界解释器执行；不将生成文本交给原生unsafe renderer。禁Query/Mutation/Run，禁构造器/prototype访问，限深度/操作数/源长度/数组/节点。UI树由受控React组件渲染。

`compile(source,{streaming})` 返回文档 `{root, assignments, defaults, diagnostics, source}`。`evaluateDocument(document,state)` 返回验证过的元素树 `{name,props,children?}`；元素含稳定path身份。`splitResponse(text,{streaming})` 返回 `{kind:'text'|'ui',text,ordinal,complete,start}`。`safeEvaluate(expression,state,locals)` 支持白名单纯数学/数组函数。

新作品使用protocolVersion 1、componentsVersion 4；组件版本1、2和3继续读取、编辑并按原版本导出，未知版本拒绝且保留原文件。drag仅作用于交互图形，支持start/move/end/cancel和有界SVG坐标；取消或源文更换舍弃待发move，正常结束先提交最后move。恢复后的播放器默认暂停。

## 服务

认证 API 前缀`/intelligent-ui/api`。GET `/state?session=&block=`返回 `{revision, sourceRevision, state, source?, protocolVersion:1, componentsVersion}`；宿主已换源但磁盘仍保存旧源时，只读返回当前源、空状态、原revision及`persisted:false`，不改写磁盘。POST同路径body `{session,block,expectedRevision,sourceRevision,source,state}`；CAS冲突返回409，仅同源冲突附当前record，跨源冲突不泄露旧源及其状态。GET `/health`返回版本/host版本/feature能力，不含私密设置。

block身份为 session/turn/step/text-content-index/UI-ordinal；字符串用`turn:step:text:ordinal`，各数值非负整数。sourceRevision是SHA256或纯客户端稳定内容hash；只有文档完成后保存source。服务必须核验session存在且对应assistant原始text确有该block，源必须匹配宿主文本。GET不能凭任意session返回用户私密数据；复用宿主cookie认证和session资源权限。文件存储落宿主持久目录，原子写、大小限制、symlink拒绝、序列化写入。禁止将会话源投递到外部服务。

宿主模块导出`src/index.mjs`（服务apply/inject），`src/host/prompt.mjs`（专用preset提示接入），`skills/intelligent-ui/SKILL.md`和分组references，preset patch。专用preset沿用DSH native loop，适当文件/网页/skill工具，无全局更改；普通preset skill仅短索引。Prompt组装以catalog真实契约为准，不复制未实现功能。

客户端宿主适配保留原生 AssistantNodeView 行为，按响应文本渲染交互段。Chat 创建独立会话、选择智能聊天 preset 并打开会话。插槽、观察器、计时器和路由随插件生命周期清理。
