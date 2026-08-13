# Triage Labels

The skills speak in terms of five canonical triage roles. This repo tracks issues as markdown files, so there are no tracker labels — each role maps to a value on the `Status:` line near the top of the issue file. Implemented work carries no `Status:` line at all, matching the upstream convention where a closed issue wears no triage label.

| Label in mattpocock/skills | `Status:` value in our issue files | Meaning                                  |
| -------------------------- | ---------------------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`                     | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`                       | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`                  | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`                  | Requires human implementation            |
| `wontfix`                  | `wontfix`                          | Will not be actioned                     |
| _(none)_                   | _(no `Status:` line)_              | Implemented, verified and committed      |

The five skill roles all describe work that still needs doing, so closing an implemented ticket had nowhere to go: `wontfix` says nobody will build it, which is the opposite. Delete the `Status:` line once the work is committed and its checklist items are ticked.

A file that has not been triaged yet carries `Status: needs-triage`, so a missing line means finished rather than overlooked. Anything scanning the tracker should read an absent `Status:` as done — grepping for `^Status:` lists open work only, which is usually what you want.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), write the corresponding value to the issue file's `Status:` line, replacing whatever was there. An issue carries one status at a time.

Example:

```markdown
# 03 - Debounce the shopping list sync

Status: ready-for-agent

...
```

Edit the right-hand column to match whatever vocabulary you actually use.
