# kanban-report

A CLI script that produces a snapshot of in-flight work for a GitHub repository: open assigned
issues ranked by age, recently-closed issues, and a per-developer summary. Designed to support
weekly team stand-ups and sprint reviews.

## What it reports

**Open issues** — every assigned, non-PR issue, sorted by *net days* (time assigned minus time
blocked). Stale issues (net days ≥ threshold) are highlighted. Currently-blocked issues and any
linked PRs are called out inline.

**Closed issues** — assigned issues closed within the last N days, sorted newest-first, with the
time they spent in flight.

**Developer summary** — one row per engineer showing open count, average net days, stale/blocked
counts, open PR count, and recently-closed count.

## Usage

```
npx tsx scripts/kanban-report/index.ts [options]
```

| Option | Default | Description |
|---|---|---|
| `--repo`, `-r <owner/repo>` | `hiero-ledger/solo` | Repository to report on |
| `--stale-days <N>` | `21` | Net days before an issue is flagged stale |
| `--closed-days <N>` | `14` | How many days back to include closed issues |
| `--no-closed` | — | Skip the closed-issues section |
| `--help`, `-h` | — | Show help |

### Examples

```bash
# Default: hiero-ledger/solo, last 14 days of closures
npx tsx scripts/kanban-report/index.ts

# Different repo, tighter stale threshold
npx tsx scripts/kanban-report/index.ts --repo hiero-ledger/hiero --stale-days 14

# Open issues only, 30-day closed window
npx tsx scripts/kanban-report/index.ts --no-closed

# Wider closed window
npx tsx scripts/kanban-report/index.ts --closed-days 30
```

## Authentication

The script tries three sources in order and uses the first one found:

1. `GITHUB_TOKEN` environment variable
2. `GH_TOKEN` environment variable
3. `gh auth token` (GitHub CLI)

Without a token the GitHub API allows 60 requests per hour (unauthenticated). A token raises the
limit to 5 000 requests per hour, which is necessary for repositories with many issues.

## Caching

API responses are cached at `~/.solo/kanban-cache.json` using HTTP ETags. On subsequent runs,
unchanged responses are served from cache (304 Not Modified) without consuming rate-limit quota.
Cache entries expire after 7 days and are pruned automatically on startup.

## Output columns

### Open / Closed issues table

| Column | Meaning |
|---|---|
| `#` | Issue number |
| `Title` | Issue title (truncated to 50 chars) |
| `Assignee` | GitHub login |
| `Assigned` | Days since the current assignment event |
| `Blocked` | Days the issue carried the `blocked` label during the assignment window |
| `Net` | `Assigned − Blocked`; the effective age used for stale detection |
| `PR` (open table) | Linked pull request number and its age in days |
| `Closed` (closed table) | How long ago the issue was closed |

### Developer summary table

| Column | Meaning |
|---|---|
| `Open` | Current open assigned issues |
| `Avg Net` | Mean net days across open issues |
| `Stale(>Nd)` | Open issues that exceed the stale threshold |
| `Blocked` | Open issues currently labelled `blocked` |
| `PRs Open` | Distinct open PRs linked from open issues |
| `Closed(Nd)` | Issues closed in the last N days |
