# Triage Labels

The skills speak in terms of five canonical triage roles. This repo tracks issues as markdown files, so there are no tracker labels — each role maps to a value on the `Status:` line near the top of the issue file. A sixth value, `done`, is local to this repo and has no counterpart upstream.

| Label in mattpocock/skills | `Status:` value in our issue files | Meaning                                  |
| -------------------------- | ---------------------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`                     | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`                       | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`                  | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`                  | Requires human implementation            |
| `wontfix`                  | `wontfix`                          | Will not be actioned                     |
| _(none — local)_           | `done`                             | Implemented, verified and committed      |

The five skill roles all describe work that still needs doing, so closing an implemented ticket had nowhere to go: `wontfix` says nobody will build it, which is the opposite. Write `Status: done` once the work is committed and its checklist items are ticked.

Every issue file carries a `Status:` line from the moment it is created until it is deleted. A file with no line has been overlooked, not finished — treat it as `needs-triage` and triage it.

To list open work, grep for `^Status:` and drop the `done` and `wontfix` rows:

```sh
grep -rn "^Status:" .scratch/*/issues/ | grep -Ev "done|wontfix"
```

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), write the corresponding value to the issue file's `Status:` line, replacing whatever was there. An issue carries one status at a time.

Example:

```markdown
# 03 - Debounce the shopping list sync

Status: ready-for-agent

...
```

Edit the right-hand column to match whatever vocabulary you actually use.
