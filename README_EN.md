# DSH Intelligent UI

<div align="center">
  <strong>Turn answers into interfaces you can use</strong><br /><br />
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img alt="DSH Web plugin" src="https://img.shields.io/badge/DSH-Web-4d6bfe" /></a>
  <a href="https://nodejs.org/"><img alt="Node.js ≥ 22.19" src="https://img.shields.io/badge/Node.js-%E2%89%A522.19-43853d" /></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-yellow.svg" /></a>
  <br /><br />
  Adjust parameters, check off plans, explore charts, fill out forms, and try simulations and games—all in your conversation.<br />
  Use your existing DSH models and sessions, with interactions built into the answer.
  <br /><br />
  🌏 <a href="./README.md">中文</a> · <a href="./README_EN.md"><strong>English</strong></a>
</div>

<br />

![A dinner plan with adjustable headcount, linked grocery quantities, and a preparation checklist](docs/images/iui-1.0-plan.png)

<p align="center"><sub>A fixed example rendered with the plugin's actual components. The food image is AI-generated; the screenshot uses a Chinese interface.</sub></p>

**DSH Intelligent UI is a standalone plugin installed directly in [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness).** This repository maintains its installation, usage, and updates; Oh My DSH (OMD) is optional. Models, sessions, tools, and skills use DSH's native capabilities.

**IUI 1.0.10** provides separate builds for DSH **0.2.1-rc.1 / rc.2**. Each build pins its host SDK, Cordis 4.0.5, and Schemastery 3.18.5. Answer quality depends on the selected model.

## 📑 Contents

- [✨ Features](#features)
- [🚀 Installation](#installation)
- [🖼️ Feature tour](#showcase)
- [💡 Getting started](#usage)
- [🆕 Recent updates](#updates)
- [💾 Data, updates, and removal](#data)
- [🔌 DSH and the plugin ecosystem](#ecosystem)
- [🛠️ Development and builds](#development)
- [🔐 Execution boundaries](#boundaries) · [⚠️ Known limitations](#limitations) · [🖥️ Platforms and compatibility](#compatibility)
- [💬 Feedback and contributions](#contributing) · [🔗 Credits and related projects](#credits)

<a id="features"></a>

## ✨ Features

- **💬 Two ways to start**: hover over **New Session** to reveal the **Chat** bubble on its right, or use **`/intelligent-ui`** in a regular agent. Keyboard focus also reveals Chat.
- **🧩 28 answer components**: combine text, images, cards, metrics, tables, charts, numeric inputs, selectors, sliders, checklists, and forms in a single answer.
- **🧮 Instant calculations**: change a headcount, amount, or other parameter and see formulas and results update. Local interactions add no model requests.
- **📊 Interactive data views**: sort tables, select data, filter categories and series, and switch views. Explicit series units keep monthly fees and capacity on separate scales.
- **🎮 Simulations and games**: adjust parameters, start playback, and use clickable graphics or native action cards. Cards support Tab and Enter/Space; authors can add shortcuts scoped to the artifact.
- **🌊 Progressive answers**: ordinary text and multiple interactive sections appear together, rendering progressively during generation.
- **💾 Save and restore**: settings are saved by session and message and restored after refreshes, reopening, or host restarts, with visible save and conflict status. Older component formats 1–3 remain readable and editable.
- **↗️ Expand and export**: continue interacting in a native artifact tab, view graphics at their original size, copy the source, or export the source and current settings.
- **🌗 Fits your environment**: light and dark themes, responsive layouts, and keyboard interaction; regular agents load detailed component documentation on demand.

<a id="installation"></a>

## 🚀 Installation

**Prerequisites**: a working DSH Web interface, Node.js **≥ 22.19**, and a configured model.

Choose the package matching your **full DSH version**.

| DSH host | IUI package | SHA-256 |
| --- | --- | --- |
| `0.2.1-rc.1` | [0.2.1-rc.1.iui.1.0.10](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.1.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.1.iui.1.0.10.tgz) | [SHA-256](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.1.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.1.iui.1.0.10.tgz.sha256) |
| `0.2.1-rc.2` | [0.2.1-rc.2.iui.1.0.10](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.10.tgz) | [SHA-256](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.10.tgz.sha256) |

For DSH 0.2.1-rc.2:

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.10.tgz
```

Replace `web` with your profile name, then restart the profile and refresh the browser. You can also download the package and install it with `file:/absolute/path/package.tgz`. OMD is optional. Earlier builds remain in [Releases](https://github.com/gulagala001/dsh-intelligent-ui/releases).

<details>
<summary><strong>Build an installation package from source</strong></summary>

```sh
git clone https://github.com/gulagala001/dsh-intelligent-ui.git
cd dsh-intelligent-ui
corepack pnpm install --frozen-lockfile --ignore-scripts

# Choose your full host version
pnpm run package:host 0.2.1-rc.2
# Or
pnpm run package:host 0.2.1-rc.1
```

Packages are generated in `work/packages/`; install one using the `file:` command above. The build script pins the SDK, dependencies, and package version for the selected host.

</details>

<details>
<summary><strong>Troubleshooting</strong></summary>

| Symptom | What to check |
| --- | --- |
| No Chat entry or interactive answers after installation | Confirm installation in the current profile, restart it, refresh the browser, and check that the plugin is enabled. Hover over the whole New Session row to reveal Chat. |
| The host reports an incompatible plugin version | Check the full DSH version and select its matching package. |
| The model still responds with text only | Start an intelligent chat with Chat, or invoke `/intelligent-ui` in a regular agent, and describe the interaction you want. Plain text is still appropriate for some questions. |
| An artifact shows a parsing error | Read its diagnostics, copy the source, and explicitly choose Repair or ask the original session's model to correct it. |
| Changes do not survive reopening | Check the save status below the answer. Retry a failed save or resolve the displayed conflict before closing. |

</details>

<a id="showcase"></a>

## 🖼️ Feature tour

These screenshots show the plugin in DSH with a **Chinese interface**. The example prompts below are English translations you can try; they are not presented as the original model's English output.

### Play a small game inside the answer

> Make a playable light-switching game: click light 1, then 2, then 3 to score a point. A wrong click resets progress; completing the sequence starts the next round. Support clicks and keyboard controls with a compact layout.

![A generated light-switching game with native action cards and progress](docs/images/iui-1.0-game.png)

Click the action cards or focus them with Tab and press Enter/Space. Score, progress, and feedback update locally. Cards can show selected and disabled states without relying on a drawing alone.

### Compare options on a meaningful scale

> Compare three fictional plans: Light costs 29 per month for 100 GB, Standard costs 59 for 500 GB, and Pro costs 99 for 2000 GB. Give me tabs for a sortable plan table and a monthly-fee bar chart with data selection and series controls.

![Generated plan comparison with a sortable table and chart metric selection](docs/images/iui-1.0-chart.png)

Switch between monthly fee and capacity, filter series or categories, and select chart data. When the author explicitly labels units, series with the same unit share a view. The plugin does not infer units or convert values.

### Change the inputs, see the answer update

> Make an adjustable bill-splitting tool: split a 387 yuan bill among 5 people with an 8% service charge. Label the inputs Bill amount, Service charge percentage, and Headcount, and show each person's share to two decimal places.

![A generated bill-splitting tool with adjustable amount, headcount, and service charge](docs/images/iui-1.0-calculator.png)

The initial result is 83.59 yuan per person. Changing the inputs to 250 yuan, 12%, and 4 people gives 70.00 yuan per person, without another model request.

### Turn a plan into a checklist

> Make a weekend checklist with only four tasks: a morning walk, organizing the desk, shopping for dinner, and reading for half an hour. Show the completed count and let me check and uncheck items.

![A generated four-item weekend checklist with completion progress](docs/images/iui-1.0-checklist.png)

Check or uncheck tasks to update progress. Settings remain available when you reopen the conversation.

### Explore a simulation through its parameters

> Make an acceleration simulation with an initial position of 20, initial velocity of 30, and acceleration of 10. Let me adjust velocity and acceleration, play, pause, and reset it. Position and velocity should follow the acceleration formulas.

![A generated acceleration simulation with parameters, playback, and live readings](docs/images/iui-1.0-motion.png)

Change parameters, then choose Play. **Restart** keeps the current parameters and restarts progress; **Reset** returns all settings to their initial values. Editing parameters pauses playback, and reopening restores the state in a paused condition.

The scenes show GPT-6.1-Sol answers rendered by IUI. See the [image credits](docs/images/showcase-notes.en.md).

<details>
<summary><strong>Expand the answer and use dark mode</strong></summary>

![An interactive answer expanded into DSH's native artifact tab](docs/images/iui-1.0-expanded.png)

The inline answer and expanded artifact share settings and playback. Closing the expanded artifact returns focus to its entry point.

![An interactive answer in DSH's dark theme](docs/images/iui-1.0-dark.png)

</details>

More scenarios you can build by combining components:

| | |
| --- | --- |
| **🧮 Meal planning and bill splitting**<br />Adjust guests to update ingredient quantities, or compare how much each person pays. | **📊 Budgets and option comparisons**<br />Combine metrics, charts, sortable tables, and tabs to explore your data. |
| **✅ Checklists and parameter controls**<br />Check off tasks, change options, and move sliders. Results update and save within the answer. | **📝 Forms and follow-up conversations**<br />Enter a destination, duration, and preferences. An explicit submission sends your choices to the original session to continue planning. |
| **🎮 Diagrams, simulations, and games**<br />Select nodes to read explanations, use action cards, or explore graphics through parameters and keyboard controls. | **↗️ Artifacts, restoration, and export**<br />Expand the answer, restore saved settings, copy the source, or export artifact data. |

<a id="usage"></a>

## 💡 Getting started

1. **Create an intelligent chat**: hover over the whole **New Session** row and click the **Chat** bubble inside its right edge. It creates a new session, selects intelligent chat, and inherits your current model. Clicking elsewhere in the row creates a regular session.
2. **Or invoke the skill in a regular agent**: enter **`/intelligent-ui`** and describe the interactive content you want.
3. **Interact within the answer**: adjust numbers, select options, check items, or switch views to see local updates. Explicitly submit when you want the model to continue.
4. **Expand and keep your artifact**: choose Expand, or open **More actions (⋯)** to copy, export, or view the source.

![Chat entry revealed on the right of the New Session row](docs/images/new-session-hover.png)

Keyboard focus reveals Chat; use Tab and Enter to activate it. The entry is visible directly with coarse-pointer layouts and a collapsed sidebar.

Try prompts like these:

```text
Make a grocery plan for a dinner with 6 people, with ingredient quantities that change when I adjust the headcount.
Turn these expenses into charts and a sortable table so I can compare budget categories.
Make a travel form to collect the destination, number of days, and pace, then plan the itinerary after submission.
Explain a concept with a clickable diagram, and add a parameter simulation.
Make a matching game with keyboard-accessible action cards and visible feedback.
```

See the [usage guide](docs/usage.en.md) for controls, save conflicts, and export formats.

<a id="updates"></a>

## 🆕 Recent updates

**IUI 1.0.10 · DSH 0.2.1-rc.1 / rc.2**

- Artifacts follow native host colors, fonts, and body text size.
- Chat entry and artifact-pane actions use native DSH buttons and icons.
- Separate pinned builds retain existing artifact formats and saved data.

See [release notes](docs/release-1.0.10.en.md) and [CHANGELOG](CHANGELOG.md).

<a id="data"></a>

## 💾 Data, updates, and removal

Settings are stored in `intelligent-ui/state` within the DSH data directory, separated by session and original message. Save failures and concurrent conflicts display a status and preserve local edits for retry. Confirm that changes are saved before closing the page.

To update, install the new build matching your host, restart the profile, and keep using the same DSH data directory. Exports contain the protocol version, component format version, source, and current JSON settings; running the interactions again requires this plugin and a compatible DSH host.

New artifacts use component format **4**. Existing artifacts in formats **1, 2, and 3** remain readable and editable and retain their format on export. Replaced answer content starts with its own settings; the previous artifact's settings do not carry into a different source. If a previous draft cannot be backed up, a temporary **Export previous draft** action is available; keep the page open until you export it.

```sh
dsh plugin --profile web remove dsh-intelligent-ui
```

Restart the profile after removal. Original conversation content and existing artifact settings remain in the host data directory and can be read again after reinstalling.

<a id="ecosystem"></a>

## 🔌 DSH and the plugin ecosystem

The plugin uses DSH's native sessions, models, tool loop, skills, and artifact tabs. Chat provides a dedicated entry point; regular agents receive a short skill index and load detailed documentation on demand.

**OMD is an optional integration.** Install the matching OMD build for your host. IUI keeps its own package, version, and data lifecycle.

See [marketplace submission records](docs/marketplace-submissions.md) for receipts, review status, and shared catalog coverage.

<a id="development"></a>

## 🛠️ Development and builds

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
pnpm test
pnpm run test:host
```

The client uses React 18, OpenUI's low-level language parser, and Apps SDK UI design tokens. This plugin maintains its components, interaction execution, state persistence, and host integration. See [resources and technology choices](docs/architecture.md) and [module contracts](docs/contracts.md) for development details.

<a id="boundaries"></a>

## 🔐 Execution boundaries

Interactions run through controlled components, bounded pure expressions, and the Scene data protocol. Parameter changes and interface interactions update local state by default; submissions and follow-up conversations require an explicit user action.

Generated content does not execute arbitrary JavaScript. Host files, credentials, network access, and tool calls remain managed by DSH's native capabilities. The plugin requires no OpenUI Cloud, Thesys API, or additional agent service.

<a id="limitations"></a>

## ⚠️ Known limitations

- Models may generate unknown components, invalid expressions, or unsuitable layouts. Artifacts show diagnostics; repairs must be explicitly started.
- Exports contain source and state; full interaction depends on the plugin and matching host.
- External image availability depends on the source; generated content uses restricted image URLs.
- Persisted data selection requires distinguishable row identities. Completely identical rows or excessively long identities retain selection only within the current view.
- Unit grouping requires explicit unit labels from the author. The plugin does not infer units, normalize values, or perform automatic conversions.
- Each host version requires its matching build. Model output and device behavior can vary.

<a id="compatibility"></a>

## 🖥️ Platforms and compatibility

| Runtime | Requirement |
| --- | --- |
| DSH Web | `0.2.1-rc.1` or `0.2.1-rc.2`, using its matching package |
| Node.js | ≥ 22.19 |
| Platform | Web client with the DSH host; the package contains no native helper |
| Optional plugins | OMD and OpenCU use their own matching host builds |

<a id="contributing"></a>

## 💬 Feedback and contributions

Report problems or suggestions in [Issues](https://github.com/gulagala001/dsh-intelligent-ui/issues). Include the full DSH and plugin versions, entry point, a minimal prompt or shareable source, and expected versus actual behavior. Remove private data before sharing.

[Pull Requests](https://github.com/gulagala001/dsh-intelligent-ui/pulls) improving components, host compatibility, accessibility, documentation, and showcases are welcome. Implementations should continue using DSH's native capabilities and preserve the boundary between local interactions and explicit submissions.

<a id="credits"></a>

## 🔗 Credits and related projects

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): native host and plugin capabilities.
- [OpenUI](https://github.com/thesysdev/openui): low-level language parsing.
- [Apps SDK UI](https://github.com/openai/apps-sdk-ui): design token reference.
- [Oh My DSH](https://github.com/gulagala001/oh-my-dsh): optional coexistence and recommendation integration.

This project uses the [MIT License](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for dependency versions, licenses, and sources.
