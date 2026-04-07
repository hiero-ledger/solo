# Skill: Find failed test in a closed Trunk Merge PR

This is a quick reference for locating the *failed check/test* that caused a Trunk Merge pull request to close (typically in a batch bisection scenario).

## ✅ Quick answer (what you want)

1. Find the **commit SHA** used by the Trunk PR (look at `head.sha` in the PR JSON).
2. Get the **check runs** for that commit.
3. Find the check run whose **`conclusion` is `failure`** (or `cancelled` due to bisection).

***

## 🔍 Step-by-step (GitHub API / CLI)

### 1) Get the PR metadata (head SHA)

```sh
curl -s "https://api.github.com/repos/<owner>/<repo>/pulls/<PR_NUMBER>" | jq -r '.head.sha'
```

### 2) List check runs for that commit

```sh
curl -s "https://api.github.com/repos/<owner>/<repo>/commits/<SHA>/check-runs" | jq -r '.check_runs[] | "\(.name)\t\(.conclusion)\t\(.html_url)"'
```

### 3) Find the failing check

* Look for a line where the **second field is `failure`** (or `cancelled` if the bisection aborted after a failure elsewhere).
* Visit the `html_url` to inspect logs / failure details.

***

## 🧠 Context: Why this is needed for Trunk Merge PRs

Trunk Merge creates a temporary PR that combines multiple candidate changes. When one check fails, Trunk typically closes the PR and cancels remaining jobs (so you’ll often see many `cancelled` runs alongside one `failure`).

So the failing test is the *first* failed `check_run` (or the one with `failure` conclusion).

***

## 🛠️ Optional: Do it via the GitHub UI

1. Open the Trunk PR in the browser.
2. Click the **`Checks`** tab.
3. Expand the failing job to see logs.

***

## Notes

* If you can’t access the repo via the API (rate limits / auth), use the UI instead (the checks tab shows the same data).
* Trunk often uses `github-actions` check runs (these are the ones you’ll usually need to inspect).

***

## 📊 Batch: Aggregate failed tests for closed Trunk Merge PRs

If you have a list of closed Trunk Merge PRs (e.g., a page of PRs in the GitHub UI), you can automate finding the failing check run(s) per PR and produce a table of failed tests with links.

### 0) Scope: first page only, and only PRs from the last 48 hours

This is useful when you want to match the **first page** of the UI query `is:pr is:closed author:app/trunk-io` and focus on the most recent failures.

```sh
repo="<owner>/<repo>"
query="repo:$repo+is:pr+is:closed+author:app/trunk-io"

# 48h ago in ISO-8601 (UTC)
cutoff=$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)

# Get PRs from page=1 only, filter by closed_at >= cutoff
curl -s "https://api.github.com/search/issues?q=$query&per_page=100&page=1" \
  | jq -r --arg cutoff "$cutoff" '.items[] | select(.closed_at >= $cutoff) | .number'
```

### 1) Collect the PR numbers (example: trunk-merge PRs)

```sh
# Example: list recent closed PRs whose title contains "trunk-merge"
curl -s "https://api.github.com/repos/<owner>/<repo>/pulls?state=closed&per_page=100" \
  | jq -r '.[] | select(.title | test("trunk-merge"; "i")) | .number'
```

### 2) Scan each PR for failing checks and build a table (collect all log URLs)

This version collects **all example log URLs** for each failing test name (useful when the same test fails multiple times).

It also ignores log URLs that contain the message `The logs for this run have expired and are no longer available`.

```sh
repo="<owner>/<repo>"

# Gather PRs from page 1 and within the last 48h
cutoff=$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)
prs=$(curl -s "https://api.github.com/search/issues?q=repo:$repo+is:pr+is:closed+author:app/trunk-io&per_page=100&page=1" \
      | jq -r --arg cutoff "$cutoff" '.items[] | select(.closed_at >= $cutoff) | .number')

for pr in $prs; do
  sha=$(curl -s "https://api.github.com/repos/$repo/pulls/$pr" | jq -r '.head.sha')
  echo "\nPR #$pr (sha: $sha)"

  # Gather all failing check runs for this PR and record their log URLs.
  curl -s "https://api.github.com/repos/$repo/commits/$sha/check-runs" \
    | jq -r '.check_runs[] | select(.conclusion == "failure") | "\(.name)\t\(.html_url)"' \
    | while IFS=$'\t' read -r name url; do
        # Skip expired logs
        if curl -sL "$url" | grep -qi "The logs for this run have expired"; then
          continue
        fi
        echo "$name\t$url"
      done | sort | uniq

done
```

### 3) Create a compact table (Test / fails / log link)

```sh
repo="<owner>/<repo>"

# Optional: scope to page 1 + last 48 hours
cutoff=$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)
pr_list=$(curl -s "https://api.github.com/search/issues?q=repo:$repo+is:pr+is:closed+author:app/trunk-io&per_page=100&page=1" \
            | jq -r --arg cutoff "$cutoff" '.items[] | select(.closed_at >= $cutoff) | .number')

printf "PR\tTest name\tFailures\tLog URL\n"
for pr in $pr_list; do
  sha=$(curl -s "https://api.github.com/repos/$repo/pulls/$pr" | jq -r '.head.sha')

  curl -s "https://api.github.com/repos/$repo/commits/$sha/check-runs" \
    | jq -r --arg pr "$pr" '.check_runs[] | select(.conclusion == "failure") | "\($pr)\t\(.name)\t1\t\(.html_url)"'

done
```

> Tip: To keep all log URLs for the same test name, pipe the output through `sort | uniq -c` (which will count duplicate lines) or `awk` to aggregate per test.

***

## 📌 Output each failure URL separately (one row per URL)

If you want a true table where every failed run is its own row (so **all URLs appear separately**), use this variant (no URL deduplication or collapse). It also **skips expired logs** (containing “The logs for this run have expired and are no longer available”).

```sh
printf "PR\tTest name\tLog URL\n"
cat /tmp/trunk-failures-page1.txt | tail -n +2 | while IFS=$'\t' read -r pr test url; do
  if curl -sL "$url" | grep -qi "The logs for this run have expired"; then
    continue
  fi
  printf "%s\t%s\t%s\n" "$pr" "$test" "$url"
done
```

Or, if you are running the query fresh:

```sh
repo="<owner>/<repo>"
cutoff=$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)

printf "PR\tTest name\tLog URL\n"
for pr in $(curl -s "https://api.github.com/search/issues?q=repo:$repo+is:pr+is:closed+author:app/trunk-io&per_page=100&page=1" \
             | jq -r --arg cutoff "$cutoff" '.items[] | select(.closed_at >= $cutoff) | .number'); do
  sha=$(curl -s "https://api.github.com/repos/$repo/pulls/$pr" | jq -r '.head.sha')

  curl -s "https://api.github.com/repos/$repo/commits/$sha/check-runs" \
    | jq -r --arg pr "$pr" '.check_runs[] | select(.conclusion == "failure") | "\($pr)\t\(.name)\t\(.html_url)"' \
    | while IFS=$'\t' read -r _testName _url; do
        if curl -sL "$_url" | grep -qi "The logs for this run have expired"; then
          continue
        fi
        printf "%s\t%s\t%s\n" "$pr" "$_testName" "$_url"
      done
done
```

> Tip: Pipe through `column -t -s $'\t'` to render as a pretty aligned table in the terminal.

> Tip: If you want to count repeated failures across PRs, pipe the output through `sort | uniq -c` and then format as a table.

***

## 📋 Generate a markdown table file (and show its URL)

When you want the final output in **Markdown table format**, run this and it will write a file you can open in any editor (or paste into a PR comment):

> **Important:** Print the header row **before** piping data through `sort`, otherwise `sort` will alphabetically shuffle the header into the middle of the table.
>
> Also filter out infrastructure/CI-metadata noise checks that are not real test failures:
>
> * `Title Check` — validates PR title format, always fails on Trunk Merge PRs
> * `StepSecurity Required Checks` / `StepSecurity Harden-Runner` — security scanning metadata

```sh
out="/tmp/trunk-failures-page1.md"

# Print header first, then sort only the data rows (prevents sort from scrambling the header)
{
  printf "| Test name | Failures | Log URLs |\n|---|:---:|---|\n"
  tail -n +2 /tmp/trunk-failures-page1.txt | \
    awk -F"\t" '
      $2 != "Title Check" &&
      $2 != "StepSecurity Required Checks" &&
      $2 != "StepSecurity Harden-Runner" {
        cnt[$2]++; urls[$2]=urls[$2]?urls[$2]"<br>"$3:$3
      }
      END {
        for (t in cnt) print "| " t " | " cnt[t] " | " urls[t] " |"
      }
    ' | sort
} > "$out"

printf "Markdown table written to: %s\n" "$out"
```

Then open it (in VS Code):

```sh
code /tmp/trunk-failures-page1.md
```

***

## �🔎 Using the same query as the GitHub PR list (pagination / page down)

The GitHub UI query `is:pr is:closed author:app/trunk-io` can be reproduced via the Search API.

### 1) List PRs for a specific “page” (as shown in the UI)

```sh
repo="<owner>/<repo>"
query="repo:$repo+is:pr+is:closed+author:app/trunk-io"

# First page (same as scroll to top)
curl -s "https://api.github.com/search/issues?q=$query&per_page=100&page=1" | jq -r '.items[].number'

# Next page (page down)
curl -s "https://api.github.com/search/issues?q=$query&per_page=100&page=2" | jq -r '.items[].number'
```

### 2) Handle rate limits (use a token)

GitHub limits unauthenticated API requests (you may see `API rate limit exceeded`). If that happens, set:

```sh
export GITHUB_TOKEN="<your token>"
```

and add `-H "Authorization: token $GITHUB_TOKEN"` to each `curl` call.

### 3) Combine it into a single “failures table” run

```sh
repo="<owner>/<repo>"
query="repo:$repo+is:pr+is:closed+author:app/trunk-io"

# Use page=1 for the first page, or loop pages to walk through the full list.
page=1

echo "PR	Test name	Failures	Log URL"
for pr in $(curl -s "https://api.github.com/search/issues?q=$query&per_page=100&page=$page" \
             | jq -r '.items[].number'); do
  sha=$(curl -s "https://api.github.com/repos/$repo/pulls/$pr" | jq -r '.head.sha')

  curl -s "https://api.github.com/repos/$repo/commits/$sha/check-runs" \
    | jq -r --arg pr "$pr" '.check_runs[] | select(.conclusion == "failure") | "\($pr)\t\(.name)\t1\t\(.html_url)"'

done
```

> Note: If you want to scan “page down” results, bump `page` (e.g., `page=2`).
