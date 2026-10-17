# 架构与来源

IUI 使用 DSH 原生会话、模型、工具循环、技能和作品页签。Web 客户端使用 React 18；OpenUI lang-core 负责低层语法解析，插件的有界解释器执行表达式，受控组件渲染界面。Apps SDK UI 提供设计 token 参考。

客户端、宿主服务和数据接口见 [模块契约](contracts.md)，依赖版本、许可与来源见 [第三方声明](../THIRD_PARTY_NOTICES.md)。

DSH `0.2.1-rc.1` 与 `0.2.1-rc.2` 分别使用对应 SDK、冻结锁和完整版本安装包，不混用客户端构建。

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
pnpm run check:public
pnpm run package:host 0.2.1-rc.1
pnpm run package:host 0.2.1-rc.2
```

技能详细资料按需加载；本地参数操作不发起模型请求。保存按会话和消息隔离，通过 DSH 认证与资源权限核验，并采用版本冲突检测与原子写入。
