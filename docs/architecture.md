# 架构与来源

[中文首页](../README.md) · [组件与协议](contracts.md)

IUI 用 DSH 自带的会话、模型、工具循环、技能和作品页签，不另起一套。Web 客户端基于 React 18：OpenUI lang-core 负责解析语法，插件自己的受限解释器计算表达式，再由插件提供的组件渲染界面。设计变量参考 Apps SDK UI。

技能的详细资料按需加载，本地调参数不会发起模型请求。作品设置按会话和消息分开保存，读写都经过 DSH 的登录和资源权限检查，有版本冲突检测，写入是原子的。

客户端、服务端和数据接口见[组件与协议](contracts.md)，依赖的版本、许可和来源见[第三方声明](../THIRD_PARTY_NOTICES.md)。

## 构建

源码默认针对 DSH `0.2.2-rc.2`。`package.json` 里的完整版本决定目标 DSH，每个 DSH 版本使用各自的 SDK 和依赖锁，安装包不能混用。

```sh
node scripts/prepare-host-sdk.mjs
corepack pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
pnpm run check:public
pnpm run package:host 0.2.2-rc.2
```

其他宿主版本请使用对应发行的源码和依赖锁。
