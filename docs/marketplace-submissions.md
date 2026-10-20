# 插件市场投稿 / Marketplace submissions

更新日期：2026-10-11。投稿对象为 **[gulagala001/dsh-intelligent-ui](https://github.com/gulagala001/dsh-intelligent-ui)**，首次正式版本 **IUI 1.0.0**。本页记录投稿回执；待审、待同步和已收录分开记录。

Updated 2026-10-11. These receipts refer to **gulagala001/dsh-intelligent-ui, IUI 1.0.0**. A submission or passing metadata check does not mean the plugin has been listed or independently runtime-verified by a marketplace.

## 2026-10-20 版本更新 / Release update

IUI **1.0.10**：DSH **0.2.1-rc.1 / rc.2** 精确构建，固定 GitHub Release 安装入口见 [安装指南](../README.md#installation) 与 [发行说明](release-1.0.10.md)。MIT；仓库归属及自动发现 topics 已核对。同名 npm 包不属于本项目，不用于发布或安装。

Awesome 原 PR [#7127](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7127) 已合并，属于旧版收录；coderPerseus 原 Issue [#47](https://github.com/coderPerseus/dsh-hub/issues/47) 仍待审；TYEclipse 原 Issue [#42](https://github.com/TYEclipse/dsh-plugins-hub/issues/42) 已关闭。新版索引同步尚未确认。其余历史回执保留原核对日期，不代表本轮重新核查或新版已上架。

IUI 1.0.10 provides two pinned host builds. The original Awesome PR is merged, coderPerseus #47 is open, and TYEclipse #42 is closed. These statuses do not establish synchronization of this release; other historical receipts retain their original check date.

## 2026-10-17 版本更新 / Release update

IUI **1.0.9** 分别提供 DSH **0.2.1-rc.1 / rc.2** 固定构建；[安装入口](../README.md#installation)及[发行说明](release-1.0.9.md)已同步。仓库归属仍为 `gulagala001/dsh-intelligent-ui`；同名 npm 包属于其他项目，不用于安装。许可为 MIT，运行于 DSH Web。

既有申请与自动发现 topics 沿用；本次未向外部投稿、追加消息或创建重复条目。下方状态保留 **2026-10-11** 的核对日期，不能视为新版本已被市场同步或外部审核已结束。

IUI 1.0.9 ships separate pinned packages for the two hosts. Existing receipts are retained with their original review date; this release does not establish marketplace synchronization. No new submission or message was sent.

## 发行材料 / Release material

- [中文介绍与真实场景](../README.md) · [English documentation and screenshots](../README_EN.md)
- [当前双宿主构建与安装方式](../README.md#installation)：DSH `0.2.1-rc.1`、`0.2.1-rc.2` 使用同前缀的 IUI `1.0.9` 包。旧申请的 alpha 构建保留于历史 Release。
- [rc.1 源码](https://github.com/gulagala001/dsh-intelligent-ui/tree/v0.2.1-rc.1.iui.1.0.9) · [rc.2 源码](https://github.com/gulagala001/dsh-intelligent-ui/tree/v0.2.1-rc.2.iui.1.0.9) · [MIT](../LICENSE) · [数据与执行边界](contracts.md)
- 安装渠道为本仓库的固定 GitHub Release `.tgz`。**同名 npm 包及 `yunyv/dsh-intelligent-ui` 属于其他项目**，不作为本插件的安装目标。Each host requires its matching GitHub release; the similarly named npm package and `yunyv` repository are separate projects.

## 已提交 / Submitted

以下 18 个独立目录均已取得正式回执；状态为本次核对时的状态，后续以链接中的审核结果为准。 最近复核：**2026-10-11 20:36（北京时间）**；Harness Registry 已确认进入线上目录，其余 16 个 GitHub 投稿仍待合并或处理；dsh-ai 回执恢复可读，状态仍为 queued。

| 市场／目录与规则入口 | 投稿回执 | 状态 / Status |
| --- | --- | --- |
| [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) | [PR #7127](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7127) | Submission gate 与完整检查均通过，待维护者合并；公开目录尚无本条目 / Checks passed, merge pending |
| [DSH Market](https://github.com/2BingLing/dsh-market) | [Issue #232](https://github.com/2BingLing/dsh-market/issues/232) | 机器人确认收件，等待每日收录管道 / Intake acknowledged, scheduled scan pending |
| [DSH Plugin Hub / dsh-plugin.org](https://github.com/dshplugin/dsh-plugin-hub) | [Issue #156](https://github.com/dshplugin/dsh-plugin-hub/issues/156) | 正式投稿待审 / Pending review |
| [52DSH Registry](https://github.com/tuofangzhe/dsh-plugins/blob/main/docs/plugin-author-guide.md) | [Issue #3](https://github.com/tuofangzhe/dsh-plugins/issues/3) | 固定源码与权限材料已提交 / Pending review |
| [DSH Hub](https://github.com/coderPerseus/dsh-hub/blob/main/.github/ISSUE_TEMPLATE/submit-plugin.yml) | [Issue #47](https://github.com/coderPerseus/dsh-hub/issues/47) | 正式投稿待审 / Pending review |
| [DSH Marketplace](https://github.com/DshMarketPlace/dshmarketplace#contributing) | [Issue #6](https://github.com/DshMarketPlace/dshmarketplace/issues/6) | Issue 仍待审；本次目录/API 不可访问，实际收录未核实 / Pending review; live listing unverified |
| [dsh-ai.org](https://dsh-ai.org/submit) | [表单状态回执](https://dsh-ai.org/api/submissions/a120018a-c9dc-4170-b999-24b602e5a737) | 回执接口已恢复，当前为 queued，尚无 plugin 条目 / Queued; no listed plugin yet |
| [DeepSeek Plugin Store](https://github.com/Ericwong5021/deepseek-plugin-store) | [Issue #297](https://github.com/Ericwong5021/deepseek-plugin-store/issues/297) → [自动生成 PR #298](https://github.com/Ericwong5021/deepseek-plugin-store/pull/298) | 录入检查与 validate 均通过，仍待合并 / Intake and validation passed, PR pending |
| [HackSing DSH Plugins](https://github.com/HackSing/dsh-plugins) | [Issue #314](https://github.com/HackSing/dsh-plugins/issues/314) | 正式投稿待审 / Pending review |
| [TYEclipse DSH Plugins Hub](https://github.com/TYEclipse/dsh-plugins-hub/blob/main/.github/ISSUE_TEMPLATE/plugin-submission.yml) | [Issue #42](https://github.com/TYEclipse/dsh-plugins-hub/issues/42) | 提交 Web／技能验收说明，待审 / Pending review |
| [1024Store](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) | [Issue #590](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/issues/590) | 已申请人工收录；目录校验器尚不接受多个 patch，npm 安装入口也不适用 / Manual intake requested |
| [dsh.pub](https://github.com/dsh-pub/dsh-pub) | [Issue #134](https://github.com/dsh-pub/dsh-pub/issues/134) | 已申请人工收录；目录校验器尚不接受多个 patch / Manual intake requested |
| [LivXue Plugin Shop](https://github.com/LivXue/dsh-plugin-shop) | [Issue #88](https://github.com/LivXue/dsh-plugin-shop/issues/88) | 已走 Plugin not listed 入口 / Missing-plugin request submitted |
| [losebird Plugin Market](https://github.com/losebird/dsh-plugin-market/blob/main/docs/SUBMIT.md) | [PR #38](https://github.com/losebird/dsh-plugin-market/pull/38) | 本地目录校验通过；远端工作流待维护者批准，PR 待审 / PR pending |
| [Sunrisepeak DSH Index](https://github.com/Sunrisepeak/dsh-index) | [Issue #52](https://github.com/Sunrisepeak/dsh-index/issues/52) | 已提名请求扫描／维护者纳入；未冒称 xlings 验证 / Nomination submitted |
| [DSH Suite](https://github.com/whyihaveyou/dsh-suite) | [Issue #61](https://github.com/whyihaveyou/dsh-suite/issues/61) | 正式投稿待审 / Pending review |
| [Harness Registry](https://github.com/majiayu000/dsh-plugin-registry/blob/main/docs/submission-review.md) | [Issue #73](https://github.com/majiayu000/dsh-plugin-registry/issues/73) | **已收录**：[PR #74](https://github.com/majiayu000/dsh-plugin-registry/pull/74) 已合并；[线上目录](https://plugin.dshdesk.com/data/plugins.json)已核对精确仓库与 alpha.2 固定 tgz；Issue 已完成 / Listed in production with the correct fixed install target |
| [WhaleHub](https://github.com/vvlife/whalehub-dsh) | [Issue #85](https://github.com/vvlife/whalehub-dsh/issues/85) | 已提交；固定 tgz 安装目标需人工处理 / Pending review of install target |

部分上游 Issue 模板引用的标签不存在或不允许外部作者添加。投稿正文保留原模板字段及完整材料，未创建上游标签，也未把标签权限问题写成已获审核。

## 同源市场 / Shared catalogs

- [dsh-market](https://github.com/dsh-market/dsh-market#submit-your-plugin)、[PetCT Marketplace](https://github.com/PetCT/dsh-plugin-marketplace) 和 Awesome 目录网站共用 Awesome DSH Plugin 上游，本次只投上游 PR。
- [dshplugin.io 同步脚本](https://github.com/tjsdyy/dshplugin/blob/main/scripts/sync-plugins.mjs)读取 Awesome 与 DSH Hub。本次向两个独立上游投稿，不向其下游重复开申请。
- WhaleHub 与 `vvlife/awesome-deepseek-harness-plugins` 共享来源，本次使用 WhaleHub 的正式投稿入口处理精确安装目标。

Shared consumers receive catalog entries through their upstream. They are not counted as separate submissions, and upstream acceptance does not prove downstream synchronization has finished.

## 自动发现、门槛与不可用入口 / Discovery and limitations

仓库已公开并配置 `dsh-plugin`、`deepseek-harness`、`deepseek-harness-plugin`、`dsh-bundle` 等适用 topics。

| 市场／入口 | 本次处理结果 |
| --- | --- |
| [chnjames Market](https://github.com/chnjames/dsh-plugin-market/blob/main/scripts/build-registry.mjs) | 按 `dsh-plugin` 自动扫描；入口条件已满足，核对快照未含精确仓库，待同步。 |
| [ZASENJC Store](https://github.com/ZASENJC/dsh-plugins-store#收录与验证) | `dsh-plugin` 与 `deepseek-harness` 交集扫描；条件已满足，公开 API 暂未含精确仓库。 |
| [NanmiCoder Market](https://github.com/NanmiCoder/dsh-plugin-market) | GitHub topics 自动扫描；条件已满足，当前目录快照暂未含精确仓库。 |
| [aust24lzy Hub](https://github.com/aust24lzy/dsh-plugin-hub/blob/main/scripts/sync.mjs) | topics 入口已满足；仅扫描 stars 排序前 1000 项，当前快照未含本仓库，未发现独立投稿入口。 |
| [DSHFind](https://github.com/hikariming/dshfind#submit-your-plugin) | 官方要求添加 topic，无需 Issue/PR；已满足。旧快照未含本仓库，在线 API 返回 403，当前收录未核实。 |
| [nanshan1995 Market](https://github.com/nanshan1995/dsh-plugin-market) | 实时 GitHub topic 浏览器，无独立目录投稿队列。 |
| [DSH Plugin Stars](https://github.com/ywsldxk/dsh-plugin-stars/blob/main/scripts/aggregate.mjs) | 自动榜单要求至少 25 stars；本仓库当前不满足，不提交不符合规则的申请。 |
| [DSHSeek](https://dshseek.com/about/) | 官方要求向 `cnhotfire/dshseek` 发 PR，但该仓库不可访问；未发现替代入口，投稿受阻。 |
| [Harness Flow Hub](https://github.com/Harzva/harness-flow-hub) | 当前为固定证据目录，未公开第三方投稿流程；未向普通问题队列投放广告。 |
| [vlln Plugin Registry](https://github.com/vlln/plugin-registry) | 已归档的本地插件管理控制台，不作为当前投稿目标。 |
| [DSH Marketplaces Nexus](https://github.com/TeaClearInkII/DSH-Marketplaces-Nexus#提交新市场) | 用于查找市场，本身仅接收市场级资源，不收单个插件。 |

Automatic discovery is configured, not guaranteed listing. Star thresholds, inaccessible submission repositories, and directories without public intake are recorded separately from successful submissions.

## 后续发布流程 / Future releases

1. 发布前复核市场维护状态、真实规则与现有条目，按独立目录去重；使用精确仓库身份查重，不能只匹配包名。
2. 发布后提交符合条件的市场，附固定版本、完整宿主版本、对应安装地址、许可、真实展示和必要权限说明；不得借用同名 npm 包。
3. 保存本页中的 Issue／PR／表单回执与日期。自动发现型市场核查 topics 和目录状态；待审不算已收录。
4. 后续版本维护原条目或原申请，复核各宿主构建、失效地址和分类；以市场规则决定是否需要更新 PR，避免重复投稿。
5. 收录后核对精确仓库与实际安装目标，再更新为已收录。人工准入、外部审核与权限限制保留真实状态。

For later releases, refresh existing listings and receipts, check host-specific install targets, and verify actual listing before marking a marketplace complete. Do not resubmit duplicates or replace a compatible fixed build with an unrelated npm package.
