# Usage guide

[中文](usage.md) · **English** · [Back to README](../README_EN.md)

## Start an intelligent chat

Hover over the whole **New Session** row to reveal the **Chat** bubble inside its right edge. Clicking Chat creates a new session, selects intelligent chat, and inherits your current model. Clicking elsewhere in the row creates a regular session. Keyboard focus also reveals Chat; use Tab to reach it and Enter to activate it. The entry appears directly in coarse-pointer layouts and a collapsed sidebar; physical touch devices have not been tested for this release.

Ask naturally—for example, “Make a dinner plan with adjustable headcount,” “Explain photosynthesis with an interactive diagram,” or “Give me a bill-splitting tool.” The model chooses suitable text and controls. Questions best answered in prose can still receive ordinary text.

Completed portions appear progressively during generation. Controls become available after the current generation step settles and saved settings have loaded.

## Use a regular agent

Enter `/intelligent-ui`, or use DSH's native `skill({name:"intelligent-ui"})`. The skill provides the basics and loads chart, form, interaction, and scene documentation as needed. Installing the plugin keeps the regular agent's model, main prompt, and tool loop under DSH's control.

## Interact and restore

Numbers, selections, checkboxes, chart filters, and game controls run locally. An explicit submission sends the selected fields and action description to the original session, using DSH's native queue, cancellation, and recovery.

Settings save automatically. Refreshing, reopening the conversation, or restarting the host restores them. Check the save status below the answer before closing. After restoration, simulation playback is paused until you choose Play.

The inline answer and expanded artifact share settings. If multiple browser tabs conflict, your current edits remain available. Choosing to keep and save your settings merges remote fields that you have not changed. A save or load error offers its corresponding retry action.

### Charts and tables

Click chart graphics or the data rows below them to select data. With a graphic focused, use arrow keys to move, Enter or Space to select, and Escape to clear the selection. Pie charts can switch metrics and hide categories; their legend shows values and percentages.

Table sorting and chart filters remain available after expansion, closing the expanded view, and refreshing. Completely identical rows, or rows whose identity is too long, retain selection only within the current view.

When an author explicitly labels series with `unit`, bar, line, area, and scatter charts group series with the same unit. For example, choose monthly fee in yuan or capacity in GB through the metric selector, then filter individual series within that group. Pie charts continue to show one metric at a time. Older charts without unit labels keep their existing behavior. Units are not inferred from names, and values are not automatically converted or normalized.

### View graphics at their original size

Charts, diagrams, and scenes offer an enlarge control when shown in a narrow answer. It displays graphics at their original size, with an independently scrollable region that can receive keyboard focus. Choose Fit to width to return to the overview.

Enlargement affects the current view only. Data, selection, and playback remain intact; a reopened view starts fitted to its width.

### Simulations and games

The inline answer and expanded view share a simulation's Play/Pause state. Closing one view leaves the other able to continue. Playback pauses when every view is offscreen or the browser goes into the background; reopened artifacts start paused.

Simulations and games with parameters provide two ways to start over:

- **Restart** (`重新开始`) keeps your current parameters and restarts the running progress.
- **Reset** (`重置`) restores all initial settings.

Editing parameters pauses playback and ends any active drag. Games group their title, instructions, score, and progress above the graphics and controls.

Selection, matching, and sequence games can use native **action cards**. Click a card, or focus it with Tab and press Enter/Space to trigger the same local action. Cards can indicate selection and disable unavailable choices. If a card displays a letter or digit shortcut, focus the artifact and use that key; shortcuts apply only inside that artifact. Cards can appear alongside a drawing or on their own. Spatial selection and dragging continue to use the graphics.

Scenes with drag rules accept pointer input from a mouse, pen, or touch handler. Dragging pauses playback; releasing saves the final position. Going offscreen, losing focus, or closing the view cancels the drag. Follow the scene's instructions for keyboard controls. Physical pen and touch devices remain untested for this release.

Expand the operation help when you need general scene controls; scenario-specific instructions stay beside the scene. Sliders display the actual numeric state. Their thumb reflects the editable range and step, while the displayed number remains accurate if a running value exceeds that range.

### Changed content and older artifacts

Replacing the answer's source starts a separate artifact state; settings from the previous content are not applied to the new content. Retrying a load for the same artifact preserves your edits.

New artifacts use component format **4**. Component formats **1, 2, and 3** remain readable and editable and keep their format when exported. Unknown formats are rejected while the original file is preserved.

If backing up the previous draft fails, the page temporarily keeps the most recent previous settings and offers **Export previous draft** (`导出旧草稿`). Keep the page open until you export them.

## Expand and export

**Expand** (`展开`, ↗) opens DSH's native artifact tab. **More actions (⋯)** offers Copy source, Export, and View source. The menu supports mouse and keyboard input, chooses its direction according to available space, and closes with Escape while returning focus to the entry.

An export contains the protocol version, component format version, source, and current JSON settings. It preserves data for reproduction; running the interactions still requires this plugin and a compatible DSH host. An external image may become unavailable if its source stops serving it.

Explicit expansion moves focus into the artifact. Closing it returns focus to the expand entry. Switching sessions or tabs, or restoring an artifact, preserves your current interaction position.

Unknown components and invalid expressions show diagnostics, and their source can still be copied. The plugin does not start a repair turn automatically. Explicitly choose **Repair** (`修复`) or send a request for the original session's model to correct the content.

## Install, update, and remove

IUI **1.0.0** has separate builds for DSH `0.2.0-rc.2`, `0.2.1-alpha.1`, and `0.2.1-alpha.2`. Each build pins its host SDK, peer dependencies, and package version. See the [installation commands](../README_EN.md#installation).

When changing hosts, install the matching build and keep the same DSH data directory to retain your artifacts. Merely changing a package's version declaration does not establish support for another host.

Settings live under `intelligent-ui/state` in the DSH data directory. To remove the plugin:

```sh
dsh plugin --profile web remove dsh-intelligent-ui
```

Replace `web` with your profile name and restart it afterward. Original conversation content and saved settings remain available for a later reinstall.

This release's host workflows were validated on macOS arm64. OMD coexistence was validated only with DSH `0.2.1-alpha.2` and the local OMD `0.2.1-alpha.2.omd.0.15.1` candidate. Current Windows/Linux, native desktop client, physical touch, and multiple-display behavior remain untested. See the [compatibility table](../README_EN.md#compatibility).
