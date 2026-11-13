# Install DSH Intelligent UI

[简体中文](install.md) · [Back to README](../README_EN.md)

Requires DSH **0.2.2-rc.3** and Node.js **24.9.0+**.

## Install in DSH

Open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.2-rc.3.iui.1.0.18/dsh-intelligent-ui-0.2.2-rc.3.iui.1.0.18.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. Checksums: [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.2-rc.3.iui.1.0.18/SHA256SUMS).

## Install from the command line

Use the CLI that belongs to the same DSH, replacing `web` with your profile (`desktop` for the desktop app):

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.2-rc.3.iui.1.0.18/dsh-intelligent-ui-0.2.2-rc.3.iui.1.0.18.tgz"
```

You need a model configured in DSH; result quality depends mostly on the model. For other DSH versions, find the matching package on [Releases](https://github.com/gulagala001/dsh-intelligent-ui/releases); do not mix packages built for different versions.

## Try it

Hover over **New Session** in the sidebar, click the **Chat** button that appears, and ask:

```text
Make an adjustable bill-splitting tool: a 387 bill plus an 8% service charge, split between 5 people. Let me change the headcount, amount and service charge.
```

It starts at 83.59 per person and updates on the spot when you change the headcount or amount.

## Upgrade and roll back

Back up your profile and `DSH_HOME/intelligent-ui/state`, then install the new package over the old one. DSH itself does not need to change. If the upgrade fails, your data is untouched; send the first error to [Issues](https://github.com/gulagala001/dsh-intelligent-ui/issues).

To go back, install the previous package. Rolling back only replaces the code; data written by the newer version stays.

## Uninstall

Remove it on the Plugins page, or run:

```bash
dsh plugin --profile web remove dsh-intelligent-ui
```

Then restart DSH. Conversation text and the artifact settings in `DSH_HOME/intelligent-ui/state` stay, and reinstalling picks them up again.
