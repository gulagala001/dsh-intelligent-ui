<a id="showcase"></a>

# Interactive examples

These screenshots show the plugin in DSH with a **Chinese interface**. The example prompts below are English translations you can try; they are not presented as the original model's English output.

### Play a small game inside the answer

> Make a playable light-switching game: click light 1, then 2, then 3 to score a point. A wrong click resets progress; completing the sequence starts the next round. Support clicks and keyboard controls with a compact layout.

![A generated light-switching game with native action cards and progress](images/iui-1.0-game.png)

Click the action cards or focus them with Tab and press Enter/Space. Score, progress, and feedback update locally. Cards can show selected and disabled states without relying on a drawing alone.

### Compare options on a meaningful scale

> Compare three fictional plans: Light costs 29 per month for 100 GB, Standard costs 59 for 500 GB, and Pro costs 99 for 2000 GB. Give me tabs for a sortable plan table and a monthly-fee bar chart with data selection and series controls.

![Generated plan comparison with a sortable table and chart metric selection](images/iui-1.0-chart.png)

Switch between monthly fee and capacity, filter series or categories, and select chart data. When the author explicitly labels units, series with the same unit share a view. The plugin does not infer units or convert values.

### Change the inputs, see the answer update

> Make an adjustable bill-splitting tool: split a 387 yuan bill among 5 people with an 8% service charge. Label the inputs Bill amount, Service charge percentage, and Headcount, and show each person's share to two decimal places.

![A generated bill-splitting tool with adjustable amount, headcount, and service charge](images/iui-1.0-calculator.png)

The initial result is 83.59 yuan per person. Changing the inputs to 250 yuan, 12%, and 4 people gives 70.00 yuan per person, without another model request.

### Turn a plan into a checklist

> Make a weekend checklist with only four tasks: a morning walk, organizing the desk, shopping for dinner, and reading for half an hour. Show the completed count and let me check and uncheck items.

![A generated four-item weekend checklist with completion progress](images/iui-1.0-checklist.png)

Check or uncheck tasks to update progress. Settings remain available when you reopen the conversation.

### Explore a simulation through its parameters

> Make an acceleration simulation with an initial position of 20, initial velocity of 30, and acceleration of 10. Let me adjust velocity and acceleration, play, pause, and reset it. Position and velocity should follow the acceleration formulas.

![A generated acceleration simulation with parameters, playback, and live readings](images/iui-1.0-motion.png)

Change parameters, then choose Play. **Restart** keeps the current parameters and restarts progress; **Reset** returns all settings to their initial values. Editing parameters pauses playback, and reopening restores the state in a paused condition.

The scenes show GPT-6.1-Sol answers rendered by IUI. See the [image credits](images/showcase-notes.en.md).

<details>
<summary><strong>Expand the answer and use dark mode</strong></summary>

![An interactive answer expanded into DSH's native artifact tab](images/iui-1.0-expanded.png)

The inline answer and expanded artifact share settings and playback. Closing the expanded artifact returns focus to its entry point.

![An interactive answer in DSH's dark theme](images/iui-1.0-dark.png)

</details>

More scenarios you can build by combining components:

| | |
| --- | --- |
| **🧮 Meal planning and bill splitting**<br />Adjust guests to update ingredient quantities, or compare how much each person pays. | **📊 Budgets and option comparisons**<br />Combine metrics, charts, sortable tables, and tabs to explore your data. |
| **✅ Checklists and parameter controls**<br />Check off tasks, change options, and move sliders. Results update and save within the answer. | **📝 Forms and follow-up conversations**<br />Enter a destination, duration, and preferences. An explicit submission sends your choices to the original session to continue planning. |
| **🎮 Diagrams, simulations, and games**<br />Select nodes to read explanations, use action cards, or explore graphics through parameters and keyboard controls. | **↗️ Artifacts, restoration, and export**<br />Expand the answer, restore saved settings, copy the source, or export artifact data. |
