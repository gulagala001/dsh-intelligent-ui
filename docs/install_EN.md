# DSH Intelligent UI — Installation and maintenance

[简体中文](install.md) · [README](../README_EN.md#readme-install)

**DSH 0.2.1-rc.2 · Node.js ≥22.19 · IUI 1.0.10**

Requires a configured DSH model. Generation quality depends on the model. Interactions use controlled components and bounded expressions; submitting explicitly continues the model conversation.

## Install in the current instance

Open **Plugins → Add plugin** in the instance you actually use and paste this fixed release address:

```text
https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.10.tgz
```

Finish active tasks, follow the host’s activation/restart prompt, and keep your existing profile, DSH_HOME, model configuration and conversations.

Verify the archive with the release’s [SHA256SUMS](https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.10/SHA256SUMS).

### First success check

Hover over **New conversation** and choose **Chat**, or use `/intelligent-ui` in a regular conversation. Ask:

```text
Make an adjustable bill splitter: a bill of 387, an 8% service charge, split among 5 people. Make all three inputs editable.
```

The initial per-person total is 83.59. Changing inputs updates it locally without another model request.

<details>
<summary>Command-line installation</summary>

Use the CLI belonging to the same DSH instance; replace `web` with its actual profile.

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.2.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.10.tgz"
```

</details>

<details>
<summary>DSH 0.2.1-rc.1</summary>

Use its dedicated build; do not install the rc.2 archive.

```text
https://github.com/gulagala001/dsh-intelligent-ui/releases/download/v0.2.1-rc.1.iui.1.0.10/dsh-intelligent-ui-0.2.1-rc.1.iui.1.0.10.tgz
```

</details>

## Update, rollback and removal

Back up the existing profile and relevant data first. Update using a fixed release matching the host; do not replace or downgrade DSH to make a package install. If an update fails, keep the original data and preserve the first error. Use the previous matching archive only with its release-specific data guidance; restoring code alone does not undo data changes.

Remove from the current instance’s plugin page, or use:

```bash
dsh plugin --profile web remove dsh-intelligent-ui
```

Conversation source and artifact state under `DSH_HOME/intelligent-ui/state` remain and can be read by a matching reinstall.

Restart the same instance after removing the plugin. Report problems with the complete versions, profile type and a redacted first error.
