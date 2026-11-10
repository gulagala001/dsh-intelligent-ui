# Intelligent UI usage

[中文](usage.md) · [Back to home](../README_EN.md)

The plugin interface is in Chinese. Button names below give the English meaning followed by the label you will see.

## Intelligent chat

Hover over the whole **New Session** row in the sidebar and a **Chat** bubble appears on its right. Clicking it creates a new session in intelligent chat mode, using your current model; clicking anywhere else in the row creates a regular session. With a keyboard, Tab to Chat and press Enter. On touch screens and with a collapsed sidebar, the button is always shown.

Just ask, for example "Make a dinner plan with adjustable headcount", "Explain photosynthesis with an interactive diagram" or "Give me a bill-splitting tool." The model picks suitable text and controls. Questions that only need text still get a text answer.

While the answer is generated, finished parts appear first. Controls become usable once that step is done and saved settings are loaded, so you never click buttons on a half-built artifact.

## In a regular conversation

Type `/intelligent-ui`, or have the model call `skill({name:"intelligent-ui"})`. The basic instructions load with the skill; material on charts, forms, interaction and scenes is read when needed. Installing the plugin does not change the prompts, model or tools of regular conversations.

## Interacting and saving

Numbers, selections, checkboxes, chart filters and mini games all run locally. Only the submit button inside an artifact sends your choices back to the conversation, after which DSH queues, cancels and resumes as usual.

- **Autosave**: your settings save automatically and come back after reloading, reopening or restarting DSH. Simulations come back paused; press play to continue. They also stop when you switch away, go to the background or close the view.
- **Synced views**: an artifact shares its settings between the answer and its expanded tab. If several tabs edit it at once and conflict, your current edits are kept, and non-conflicting fields from elsewhere are merged when you confirm the save. When something fails, check the save status at the bottom of the answer before retrying.
- **Merge failures**: if the combined settings cannot run, saving stops and explains why. Your current draft stays editable and survives a reload; adjust it, then confirm the save.
- **Replaced answers**: when the answer content changes, old settings never leak into the new artifact. If backing up the previous draft fails, the page keeps a copy and offers **Export previous draft** (`导出旧草稿`). Keep the page open until you export it.

## Charts

- Click a shape or a data row below the chart. After focusing the chart, move with the arrow keys, select with Enter or Space, and cancel with Escape.
- Pie charts can switch metrics and hide categories, and the legend shows values and percentages.
- Table sorting and chart filters persist through expanding, collapsing and reloading.
- Bar, line, area and scatter charts whose series declare a `unit` are grouped by unit, for example currency and GB, switched with **Show metric** (`显示指标`). Series without units are never guessed from their names or converted.
- In a narrow answer, charts, diagrams and scenes offer **Enlarge** (`放大图形`) to view labels at full size in a separately scrolling area. **Fit to width** (`适应宽度`) returns to the overview. Enlarging only affects the current view.

## Simulations and mini games

- The same simulation shares playback between the answer and the expanded tab; closing one leaves the other running. It pauses when no view is visible and reopens paused.
- **Restart** (`重新开始`) keeps the current parameters and resets progress. **Reset** (`重置`) restores every initial setting. Changing a parameter pauses playback and ends any drag in progress.
- Selection, matching and ordering games can use action cards: click a card, or Tab to it and press Enter or Space. Cards labeled with a letter or digit shortcut respond to that key once the artifact is focused, and only inside that artifact.
- Scenes that support dragging work with a mouse, stylus or finger. Dragging pauses playback, releasing saves the position, and switching away or losing focus cancels it.
- The instructions panel lists the general controls. The number beside a slider shows the real current value, even when it runs outside the editable range.

## Expand and export

**Expand** (`展开`, ↗) opens the artifact in its own DSH tab and moves focus into it; its close button returns you to where you were. **More actions (⋯)** offers copying the source, exporting the version, source or current JSON settings, and viewing the source. Escape closes the menu.

An export lets you reproduce the artifact's data, but further interaction still needs DSH with a matching version of this plugin. External images may stop displaying if their source goes offline.

## When something goes wrong

Unknown components or invalid expressions show diagnostics, and the source can still be copied. The plugin never asks the model to redo the answer on its own; click **Repair** (`修复`) or send a request yourself so the original conversation's model fixes it.

New artifacts use component format 4. Artifacts in formats 1, 2 and 3 can still be opened, edited and exported in their original format. Unknown formats keep the original file and show diagnostics.

## Updating

Install the new package over the old one and keep your DSH data directory, and your artifacts carry on working. See the [installation guide](install_EN.md).
