<a name="readme-top"></a>

<h1 align="center">DSH Intelligent UI</h1>

<p align="center"><strong>Turn answers into interactive tools you can adjust and use.</strong><br>DeepSeek Harness plugin</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-intelligent-ui/releases/tag/v0.2.1-rc.2.iui.1.0.11"><img alt="IUI 1.0.11" src="https://img.shields.io/badge/release-IUI%201.0.11-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-intelligent-ui/releases"><img alt="GitHub total downloads" src="https://img.shields.io/github/downloads/gulagala001/dsh-intelligent-ui/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-intelligent-ui/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-intelligent-ui?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>Get started</strong></a> · <a href="docs/usage.en.md">Docs</a> · <a href="https://github.com/gulagala001/dsh-intelligent-ui/issues">Report an issue</a></p>

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

## Quick start

**Required environment：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

Requires a configured DSH model. Generation quality depends on the model. Interactions use controlled components and bounded expressions; submitting explicitly continues the model conversation.

### 1. Install

Open **Plugins → Add plugin** in the DSH instance you use, then paste:

```text
https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.11/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.11.tgz
```

Wait for active tasks to finish, then follow the host’s activation/restart prompt. Keep your existing profile and data. See the [installation guide](docs/install_EN.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.11/SHA256SUMS).

### 2. Try this first

Hover over **New conversation** and choose **Chat**, or use `/intelligent-ui` in a regular conversation. Ask:

```text
Make an adjustable bill splitter: a bill of 387, an 8% service charge, split among 5 people. Make all three inputs editable.
```

**Success looks like：** The initial per-person total is 83.59. Changing inputs updates it locally without another model request.

## Interact directly with an answer

- **28 components**: text, images, cards, metrics, tables, charts, number inputs, selectors, sliders, checklists and forms can appear alongside ordinary prose.
- **Local interaction**: change amounts, participants, filters or game state without another model call. Only explicit submission continues the conversation.
- **Persistence and delivery**: settings are saved per conversation and message. Inline and expanded native artifact views share state; copy source or export data.

### Change inputs and see the result

![Bill splitter](docs/images/iui-1.0-calculator.png)

Other examples include plan comparisons, checklists, meal planning, visual simulations and small games. Charts group values by their declared units; clicks, keys and dragging follow the artifact’s scene definition. [More examples](docs/examples_EN.md)

## Scope and data

| Scenario | Behavior |
| --- | --- |
| Light/dark, narrow layouts and keyboard use | Uses native DSH colors, fonts and controls. Complete interaction requires the plugin. |
| Refresh, reopening and host restart | Restores saved state per conversation/message; save failures and conflicts are reported. |
| Export | Retains source and JSON state. Further interaction requires a compatible host and plugin. |
| Generated content | Uses controlled components, bounded expressions and the Scene protocol. It cannot run arbitrary JavaScript or access host files, credentials or network capabilities. |

Artifact state lives under `DSH_HOME/intelligent-ui/state`. Conversation source and saved state remain after uninstalling; reinstalling a matching build can read them again. DSH rc.1 and rc.2 have separate builds; do not mix SDKs or packages.

## FAQ

<details>
<summary>Where is the Chat entry?</summary>

Hover over or keyboard-focus the full New conversation row and choose its Chat bubble. Touch and collapsed-sidebar layouts display it directly. If missing, check the active profile’s plugin state and restart.

</details>

<details>
<summary>Why did the model return only text, or an artifact with a parse error?</summary>

Use Chat or `/intelligent-ui` and describe what should be adjustable or selectable. Inspect diagnostics and source for an invalid artifact, then explicitly ask the original conversation to fix it. There is no automatic model-consuming repair loop.

</details>

<details>
<summary>Are input changes sent to the model?</summary>

Ordinary local interactions are not. Relevant fields enter a request only when you explicitly submit or continue. External image availability still depends on its source.

</details>

## Development and license

[Architecture](docs/architecture.md) · [Components and protocol](docs/contracts.md) · [Usage](docs/usage.en.md)

Licensed under [MIT](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the OpenUI parser, Apps SDK UI tokens and other sources.

## Documentation and support

| I want to | Where to go |
| --- | --- |
| Install, update or remove | [Installation guide](docs/install_EN.md) |
| Learn the features and limits | [Documentation](docs/usage.en.md) |
| Read release changes | [Releases](https://github.com/gulagala001/dsh-intelligent-ui/releases) |
| Report a problem | [Issues](https://github.com/gulagala001/dsh-intelligent-ui/issues) |

For a bug report, include the full DSH and plugin versions, the entry point, minimal reproduction steps, and expected versus actual behavior. Remove private data before sharing logs or screenshots.

<p align="center"><a href="#readme-top">Back to top</a> · <a href="https://github.com/gulagala001/dsh-intelligent-ui/releases">Versions and downloads</a> · <a href="https://github.com/gulagala001/dsh-intelligent-ui/issues">Feedback</a></p>

[Documentation structure and contributing](docs/documentation.md)
