# 模块契约

主模型负责本契约、协议和解释器。实现协作者不得修改别人的目录。

## 客户端组件

`src/client/components/index.jsx` 导出 `renderComponent(name, props, children, api)`；未知组件返回错误。React 18。组件只收到冻结的 JSON 数据，不获得 ctx、fetch、宿主或任意 JS。

`api` 为 `{ state, set(name,value), reset(name), action(action), evaluate(expression,locals), streaming, disabled, blockId }`。set/reset/action 都由主模型受控运行时处理。`api.evaluate` 支持安全公式字符串，不接受 JavaScript；变量用名字或 `$name`。组件不得自行执行表达式。图表/模拟/游戏的定时器只在可见且非流式时运行，卸载清理，最高30fps。所有交互控件正确关联 label、键盘和错误状态。

当前API还提供默认组件的`widget/setWidget`、场景的`sceneView`以及按bind共享的`playback/playbackVersion`。未显式绑定的控件按稳定path保存私有状态，动态列表采用有类型的数据身份。源文更换后原API不能写入新作品；同一作品的内联与展开视图共享设置、播放器及拖拽归属。生成未完成时禁用展开，保留内联渐进预览。

`src/catalog.mjs` 由组件 worker 创建：导出 `catalog`，对象 key 为组件名，值 `{ group, description, args: ['field',...], schema: z.object(...), children?: 'field' }`。位置参数顺序就是OpenUI调用顺序。`args` 最终由主模型核对。组件 worker 同步导出 `examples`（完整OpenUI源字符串列表），供真实宿主测试使用。至少覆盖Stack, Row, Grid, Card, Text, Heading, Divider, Image, Badge, Metric, Table, Chart, Button, Input, NumberInput, Select, Slider, Checkbox, Checklist, Form, Tabs, Calculator, Diagram, Simulation, Game。可以按真实需要添加，但保持目录紧凑。

布局组件children是数组；Image只接受经主模型验证的公共https URL；交互组件通过字符串`bind`关联局部状态。Button action 是安全纯数据：`{type:'set',name,value}`、`{type:'reset',name}`、`{type:'submit',text,fields:[...]}`或同类数组，绝不任意脚本。Calculator使用fields和formula字符串；Simulation采用数据定义和公式；Game采用受控规则（例如井字棋/记忆配对/通用网格）而非生成JS。

Simulation与Game接受局部fields/metrics；Game在原scene/bind/title/instructions之后追加这两个可选参数，四参数旧调用保持原语义。编辑参数先暂停并取消拖拽。“重新开始”保留fields中的当前值，恢复其他初始字段与种子后执行既有reset步骤；“重置”还原全部初始字段与种子后执行reset步骤。sceneRestart仅为组件内部动作，不进入生成Button动作白名单。游戏指标在画布外显示并提供polite反馈；连续模拟指标不创建读屏live区域。

`src/client/styles/surface.css` 默认导出样式字符串（构建器处理CSS导入）。必须全部限定 `.iui-surface` 或专用shadow root，不带body/:root/*宿主全局重置。不直接使用SDK Select/Popover（实际React19）；采用其官方设计token数值，React18原生控件。Portal只能进入本surface。

## 协议和运行时

UI fence语言为 `openui`（同时读`intelligent-ui`），首行可选`// iui:1`。正常文字照常渲染。OpenUI root和变量赋值解析由lang-core执行，但全部求值由本插件有界解释器执行；不将生成文本交给原生unsafe renderer。禁Query/Mutation/Run，禁构造器/prototype访问，限深度/操作数/源长度/数组/节点。UI树由受控React组件渲染。

`compile(source,{streaming})` 返回文档 `{root, assignments, defaults, diagnostics, source}`。`evaluateDocument(document,state)` 返回验证过的元素树 `{name,props,children?}`；元素含稳定path身份。`splitResponse(text,{streaming})` 返回 `{kind:'text'|'ui',text,ordinal,complete,start}`。`safeEvaluate(expression,state,locals)` 支持白名单纯数学/数组函数。组件worker需要前期占位时不要另写eval。

新作品使用protocolVersion 1、componentsVersion 3；组件版本1和2继续读取、编辑并按原版本导出，未知版本拒绝且保留原文件。drag仅作用于交互图形，支持start/move/end/cancel和有界SVG坐标；取消或源文更换舍弃待发move，正常结束先提交最后move。恢复后的播放器默认暂停。

## 服务

主模型和host worker协定 authenticated API 前缀`/intelligent-ui/api`。GET `/state?session=&block=`返回 `{revision, sourceRevision, state, source?, protocolVersion:1}`；POST同路径body `{session,block,expectedRevision,sourceRevision,source,state}`，CAS冲突409含当前record。GET `/health`返回版本/host版本/feature能力，不含私密设置。

block身份为 session/turn/step/text-content-index/UI-ordinal；字符串用`turn:step:text:ordinal`，各数值非负整数。sourceRevision是SHA256或纯客户端稳定内容hash；只有文档完成后保存source。服务必须核验session存在且对应assistant原始text确有该block，源必须匹配宿主文本。GET不能凭任意session返回用户私密数据；复用宿主cookie认证和session资源权限。文件存储落宿主持久目录，原子写、大小限制、symlink拒绝、序列化写入。禁止将会话源投递到外部服务。

host worker导出`src/index.mjs`（服务apply/inject），`src/host/prompt.mjs`（专用preset提示接入），`skills/intelligent-ui/SKILL.md`和分组references，preset patch。专用preset沿用DSH native loop，适当文件/网页/skill工具，无全局更改；普通preset skill仅短索引。Prompt组装以catalog真实契约为准，不复制未实现功能。英文文本变更记本地PROMPT_CHANGES.md。host worker自行查真实SDK source，不猜接口。

客户端宿主适配由主模型另外指定worker；使用完整原生AssistantNodeView行为，仅response text换分段渲染。小＋必须创建明确session、选preset、打开，再允许首提交；首提交失败不串入默认会话。保留原新会话按钮。清理所有插槽、观察器、计时器、路由。
