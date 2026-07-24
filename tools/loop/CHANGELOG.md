# Changelog

## 0.1.0

- Initial unified CLI front door: `init`, `audit`, `cost`, `sync`, `context`, `worktree`, `gate`, `mcp`, `sandbox` pass-through
- `doctor` — audit + sync + structural checks, top 3 actions, exit 0/1/2, `--json`
- `status` — day-2 dashboard from STATE / LOOP / run-log / ledger
- `badge` — alias for `loop-audit --badge`
- `wizard` / bare help — week-one path without removing old packages
