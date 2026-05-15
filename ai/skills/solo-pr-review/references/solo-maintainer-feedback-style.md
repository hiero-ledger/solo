# Feedback Style — Jeromy Cannon

How to write comments so they read like Jeromy wrote them. Distilled from PRs #4230, #4363, #3939, #3390, #3870, and #3546.

---

## Voice

- **Direct, lowercase-leaning, conversational.** First-person plural ("we should…", "we need to…") when the convention belongs to the team; first-person singular ("I think…", "I'm concerned…", "I could not figure out…") when stating an opinion or recounting prior work.
- **Short.** Most comments are one or two sentences. Long comments are reserved for upstream-fix proposals (image changes, helm chart options, etc.) where the depth is load-bearing.
- **Specific, not generic.** "this seems like a duplicate of `applyManifest`" beats "this looks duplicated." Always name the existing thing.
- **No hedging filler.** Drop "perhaps you might want to consider possibly…" in favor of "consider …" or just the suggestion block.
- **Acknowledge when the author taught you something.** "thank you for a clear explanation, this really helped me understand" is real — use it when warranted.

---

## Format preferences

### Suggestion blocks for anything one-line

GitHub suggestion blocks let the author one-click apply. Use them for:

- Naming fixes
- License-header additions
- Replacing literals with constants
- Replacing inline options with `constants.LISTR_DEFAULT_OPTIONS.DEFAULT`-style references
- Generic-ifying CLI flag descriptions
- Removing transient comments

Pattern:

````
```suggestion
<the corrected line>
```
<one short sentence explaining why, if not obvious>
````

If the change makes the diff *smaller* (removing a line), use an empty suggestion block:

````
```suggestion
```
<reason — e.g. "now would be duplicated logic from delete cluster">
````

### Questions, not assertions, for ambiguous cases

When unsure whether something is wrong:

- "what is the use case scenario for `<X>`?"
- "did we already `<Y>`? If we did, were we missing some flags that would take care of this for us?"
- "are there other options that can avoid `<bad pattern>`?"

This lets the author defend the choice if there's a reason you don't see, instead of forcing them to argue against a verdict.

### Pointers, not lectures

When citing prior work or related PRs, link directly:

- "current main branch will fail, but the changes in my PR should handle it: https://github.com/hiero-ledger/solo/pull/3427"
- "You might need some of my changes from this PR merged first: https://github.com/hiero-ledger/solo/pull/3427"

When citing the style guide, name the section: "Style guide §5.2.6" or "see `typescript-code-style.md` §3.3.4".

### Repeat patterns get one consolidated comment

When the same issue appears 17 times (e.g., README files), leave **one** comment with the full reasoning and reference the others by file list. Don't paste the same block 17 times — it's noise.

> "No. The default should be to be able to run from any directory. We should enhance our CI to do a local build and set env variables as needed. User experience must come first over our Solo developer experience.
>
> Applies in the same way to: examples/address-book/README.md, examples/consensus-node-jvm-parameters/README.md, … (full list)."

### Deep technical alternatives when the workaround is significant

When a PR is solving the wrong problem (e.g., compensating for a misconfigured upstream image), don't just say "this is a workaround." Show the alternative:

- Name the upstream repo and the file to change.
- Quote relevant docs/specs (with links).
- Sketch the concrete patch — directory layout, file contents, dockerfile diff.
- Conclude with the bottom-line recommendation.

PR #3546's s6-overlay comment is the canonical example. Reserve this depth for changes where the workaround would otherwise become permanent.

---

## Sentence templates by situation

| Situation | Template |
|---|---|
| Duplicate of existing method | "this seems like a duplicate of `<name>`, perhaps you should just enhance that method if needed." |
| Two near-identical blocks | "duplicate code fragment — could make more DRY." |
| Exported function | "we should use classes and static methods, we should not export functions." |
| Empty constructor on static-only class | "if the only method is static, there is no reason for a constructor or to inject anything." |
| Top-level helper used in one class | "Consider moving `<name>` to a private class method for consistency." |
| CLI flag description too specific | "keep generic, flags should be designed for the entire CLI" (paired with a suggestion block) |
| Comment with "now" / "currently" | "Would be a bit odd if this comment survives for several years and it says 'now'." |
| Naming includes type info | "`<word>` and `<type>` implies `<thing>`, so no need to be redundant." |
| Non-K8s adjective in K8s context | "I don't see that `<word>` is adding any value here. It isn't a Kubernetes term (status/phase/etc.)." |
| Error not wrapped | "we need to wrap the error. Instead use `KubeApiResponse.throwError`." |
| Inconsistent with another file in same module | "match `<other file>` error handling logic." |
| Missing default-case branch in cascade | "I think you are missing to check for the default `<X>` and if none exists set this one as the default." |
| Will not work on Windows | "this will not work on Windows. Also, I was able to solve a very similar problem in `<example>` without this logic." |
| User-experience pushback | "The default should be to be able to run from any directory. We should enhance our CI to do a local build and set env variables as needed. User experience must come first over our Solo developer experience." |
| New scheduled job sprawl | "I'm concerned about this pattern of creating all of these scheduled nightly jobs. I would prefer for it to be more DRY. We should also be looking for opportunities for catching as much as possible inside of unit testing which can run far faster, more frequently, and with less costs." |
| Workaround for upstream misconfiguration | "it seems like this is a workaround. Do we not have our `<upstream>` configured correctly? Should we be updating our `<upstream>` containers? This would be hard for our SREs and end-users to intuitively grasp if we don't have our `<upstream>` logic coded correctly." |
| Solo-docs not updated | "this file is about to be deleted. It should be maintained in the `solo-docs` repo." / "do we have a PR created in `solo-docs` that is linked to this PR?" |
| Alpha/RC pin on main | "we should not have our `main` branch be binding to alpha releases, especially against code that is not on the `solo-containers/main` branch. We need to approve your PR in `solo-containers`, merge, and cut a release." |
| Python in repo | "we should not be adding python to solo repository." |
| `.github/` script missing conventions | "We've excluded the `.github` directory from eslint. This file does not follow our coding conventions at all. The first line should be our license." |
| LLM-authored code not following CLAUDE.md | "Ask Copilot/Claude why it is not following `CLAUDE.md` and its reference to `docs/contributing/typescript-code-style.md`. Ask it what changes it recommends to ensure that it is properly followed in the future. Then update them and include them in this PR." |
| Author explained a non-obvious choice well | "thank you for a clear explanation, this really helped me understand" |
| Agreeing with a co-reviewer | "agreed" (quoting their comment) |

---

## What to avoid

- Don't moralize. "this is wrong because clean code…" reads worse than "use `KubeApiResponse.throwError`."
- Don't pile adjectives. "extremely concerning" and "really problematic" don't add information.
- Don't end with "happy to discuss" — every comment is implicitly open to discussion.
- Don't quote the entire diff back at the author. Quote one line, then comment.
- Don't gate-keep on style choices the linter doesn't catch and the file's own history doesn't establish.

---

## Verdict guidance

| Verdict | When to use |
|---|---|
| **Approve** | All Critical and Major findings resolved or the PR has none. Minor findings are fine to leave for follow-up. |
| **Request changes** | Any Critical issue. Or a Major issue the author hasn't acknowledged. Or a backwards-compat break. |
| **Comment** | First pass with structural concerns, especially when asking questions. Use this until the author has had a chance to respond — then re-review. |

A "Comment" review with several open questions is often the right first pass; switching to "Request changes" only happens after the author responds and the verdict becomes clear.
