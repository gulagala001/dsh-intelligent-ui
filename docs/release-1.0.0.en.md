# DSH Intelligent UI 1.0.0

[中文](release-1.0.0.md) · **English** · [README](../README_EN.md) · [Usage guide](usage.en.md)

IUI **1.0.0** is the first official release of the standalone DSH Intelligent UI plugin, including the complete feature set developed through the internal 1.7 iteration. It brings interactive answers into your existing DSH conversations: adjust inputs, compare data, check off plans, fill out forms, and explore simulations and small games. It uses DSH's native models, sessions, skills, tools, and artifact tabs. **OMD is optional.**

## What you can do

- Start an intelligent chat through **Chat**, revealed inside the right edge of the New Session row on hover or keyboard focus. Use `/intelligent-ui` in a regular agent when needed.
- Combine ordinary prose with 28 answer components and progressive rendering.
- Change calculator inputs and see results update locally without another model request.
- Sort tables, select chart data, filter categories and series, and switch between explicitly labeled unit groups.
- Use simulations and games with editable parameters, Play/Pause, Restart that preserves parameters, and Reset that restores defaults.
- Operate native game action cards with a click, Tab and Enter/Space, or author-defined letter/digit shortcuts scoped to the artifact.
- Enlarge graphics to their original size, or expand an answer into a native artifact tab with shared settings and playback.
- Save and restore settings after refreshing, reopening, or restarting; handle save conflicts and export the source with current settings.
- Read and edit older component formats 1–3 while new artifacts use format 4.

See the [feature tour](../README_EN.md#showcase) for screenshots and example prompts, and the [usage guide](usage.en.md) for controls and recovery.

## Choose your host build

The full package version is **`<full DSH version>.iui.1.0.0`**. Install the build matching your exact host version:

| DSH host | Complete plugin version | Package |
| --- | --- | --- |
| `0.2.0-rc.2` | `0.2.0-rc.2.iui.1.0.0` | [Download](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.0-rc.2.iui.1.0.0/dsh-intelligent-ui-0.2.0-rc.2.iui.1.0.0.tgz) |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.iui.1.0.0` | [Download](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-alpha.1.iui.1.0.0/dsh-intelligent-ui-0.2.1-alpha.1.iui.1.0.0.tgz) |
| `0.2.1-alpha.2` | `0.2.1-alpha.2.iui.1.0.0` | [Download](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-alpha.2.iui.1.0.0/dsh-intelligent-ui-0.2.1-alpha.2.iui.1.0.0.tgz) |

The SDK and dependencies are pinned separately for each host. Follow the [installation commands](../README_EN.md#installation), restart the selected profile, and refresh the browser. Keep the same DSH data directory during updates to retain saved artifacts.

## Validation scope

The feature set carried into this release completed native CLI/Web validation on **macOS arm64** for all three hosts above, including installation, native tools, local interactions, restoration, enable/disable, restart, and removal.

OMD coexistence was validated for **DSH `0.2.1-alpha.2` with the local OMD `0.2.1-alpha.2.omd.0.15.1` candidate**. Both installation orders, both plugins' enable/disable and restart paths, and both removal orders were exercised with OMD's default enhancements enabled. This does not establish other OMD combinations as tested.

Real generation checks used **GPT-6.1-Sol with high reasoning** on DSH `0.2.1-alpha.2`. A light-switching game, plan comparison, bill splitter, and checklist passed interaction checks directly after generation. An acceleration simulation passed through replay of its unchanged original model output after correcting a test's label matching. These five cases demonstrate the checked scenarios; they do not guarantee every answer or model.

The dinner-plan showcase uses fixed sample data rendered through real plugin components, with an AI-generated food illustration. Other showcased scenarios use actual generated outputs and native screenshots; some chart images and the simulation use replay of the unchanged original output. Screenshots use a Chinese interface. See [image notes](images/showcase-notes.en.md) for their sources.

Cross-platform CI uses Node 24 across nine combinations of macOS, Linux, Windows, and the three hosts above. It exercises packaged installation, native tools, Web interactions, saved-state restoration, enable/disable, restart, and removal. Results are available in [GitHub Actions](https://github.com/gulagala001/dsh-intelligent-ui/actions/workflows/ci.yml). Local real-model screenshots were captured on macOS arm64. The working-directory scenario runs on alpha.2; each other host retains its native capabilities.

## Data and execution

Local interactions use controlled components and bounded expressions. Generated content cannot run arbitrary JavaScript or automatically launch tools or a model turn. Explicit submission or Repair continues through the original DSH session.

Exports include source, current JSON settings, and format versions; running the artifact requires this plugin and a compatible host. Removing the plugin preserves conversation content and saved settings in the DSH data directory. External images remain dependent on their source.

For problems or suggestions, open an [Issue](https://github.com/gulagala001/dsh-intelligent-ui/issues) with the full host and plugin versions, entry point, a minimal shareable prompt or source, and expected versus actual behavior. Remove private data before sharing.
