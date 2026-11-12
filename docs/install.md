# 安装 DSH Intelligent UI

[English](install_EN.md) · [返回首页](../README.md)

需要 DSH **0.2.2-rc.2** 和 Node.js **24.9.0+**。

## 在 DSH 里安装

打开 **插件 → ＋ 添加插件**，粘贴：

```text
https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.2-rc.2.iui.1.0.17/dsh-intelligent-ui-0.2.2-rc.2.iui.1.0.17.tgz
```

等手头的任务跑完，按提示启用或重启 DSH。校验文件：[SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.2-rc.2.iui.1.0.17/SHA256SUMS)。

## 用命令行安装

用同一个 DSH 自带的命令行，把 `web` 换成你的 profile（桌面版是 `desktop`）：

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.2-rc.2.iui.1.0.17/dsh-intelligent-ui-0.2.2-rc.2.iui.1.0.17.tgz"
```

需要一个在 DSH 里配好的模型，效果好不好主要看模型。其他 DSH 版本请到 [Releases](https://github.com/gulagala001/dsh-intelligent-ui/releases) 找对应的包，版本不一致的包不要混装。

## 装好后试一下

鼠标移到侧栏的 **新会话** 上，点右边出现的 **Chat**，然后问：

```text
做一个可调整的分账工具：账单387元，加8%服务费，5人均分。人数、金额和服务费都能修改。
```

一开始每人 83.59 元，改人数或金额后结果当场更新。

## 升级和回退

先备份 profile 和 `DSH_HOME/intelligent-ui/state`，再用新版安装包覆盖安装，DSH 本身不用动。升级失败时原有数据不受影响，把第一条报错发到 [Issues](https://github.com/gulagala001/dsh-intelligent-ui/issues)。

想回到旧版，就装回之前的安装包。回退只换代码，新版写入的数据不会自动撤销。

## 卸载

在插件页移除，或运行：

```bash
dsh plugin --profile web remove dsh-intelligent-ui
```

然后重启 DSH。会话原文和 `DSH_HOME/intelligent-ui/state` 里的作品设置都会留着，重新安装就能接着用。
