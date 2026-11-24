# Solo TCK: first JS SDK lane

Development implementation of the Solo Technology Compatibility Kit. The `js-sdk` lane installs the candidate SDK
inside Solo, deploys CN and MN with Falcon, and uses the same SDK as a client. It reuses the package-identity and
account/transaction scenarios from [SDK pilot #4537](https://github.com/hiero-ledger/hiero-sdk-js/pull/4537).

This is separate from the SDK conformance TCK. No qualified kit release, supported Solo release, Linux acceptance,
or caller migration is claimed.
[Solo #6228](https://github.com/hiero-ledger/solo/pull/6228) fixes the operator-account ping exposed by the pilot.
The implementation is based on [co-release alignment #6235](https://github.com/hiero-ledger/solo/pull/6235)
and follows the merged [architecture #5165](https://github.com/hiero-ledger/solo/pull/5165).

The kit lives in Solo's `tck/` directory and uses Solo's version and release cycle. The action source shares the
CLI's `v*` release tag and commit. Consumers pin `hiero-ledger/solo/tck@<verified Solo release SHA>`, with the release
version in a comment. Solo's npm package excludes `tck/`; the action source is fetched from that Git ref.

## Run locally

Requirements: Node 22.x, npm, tar, Git, Docker, Kind and kubectl. Docker needs at least 6 CPUs and 12 GiB RAM; the
working filesystem needs 20 GiB free. Linux is the intended CI platform; macOS is useful for local validation.

Build the SDK and pack its three workspace packages in the SDK checkout:

```bash
task build
mkdir -p /tmp/sdk-candidate
for directory in packages/proto packages/cryptography .; do
  (cd "${directory}" && pnpm pack --pack-destination /tmp/sdk-candidate)
done
```

Then run from the Solo checkout, with the explicit full Solo source commit:

```bash
node tck/src/run.mjs --component js-sdk --candidate-packages /tmp/sdk-candidate \
  --solo-version 24dc1ffcd42d24876bdc422b1b459496afec220e
```

A commit input fetches exactly that SHA from `hiero-ledger/solo`, runs `npm ci`, compiles and packs Solo, then installs
the tarball in a fresh npm project. It imports no Solo source modules. Optional `--consensus-node-version` and
`--mirror-node-version` flags deliberately override companions; absent flags leave the defaults to Solo.

The normal path requires no existing `solo-cluster`. It never adopts an existing cluster. Every run has a fresh
`SOLO_HOME` and `KUBECONFIG`, deployment and namespace `solo-tck`, and fixed one-shot endpoints. Occupied one-shot
ports fail preflight. The existing shell's kubeconfig and Solo configuration are not used.

For local development beside an existing Solo cluster, `--cluster-name solo-tck-<unique-name>` creates a fresh named
Kind cluster before Falcon runs. It uses the installed Solo package's Kind configuration and `kindest/node:v1.31.9`.
Falcon reuses that isolated context; cleanup deletes only that newly created cluster. This local-only addition to the
design avoids the hardcoded `solo-cluster` name without changing Solo or adopting the developer's cluster.

To reuse a previously built Solo tarball locally, also pass `--solo-tarball /absolute/path/to/solo.tgz` with its full
`--solo-version` source SHA. The report records the tarball integrity and explicitly marks the source SHA as
caller-asserted, not independently verified. This option is not exposed by the composite action.

## Branch-built companions

`--companion-builds <manifest.json>` supplies built companions next to the candidate, using the schema version 1
manifest from design §4.1. The `js-sdk` lane deploys CN and MN, so it accepts those two companions:

| Component | Artifact fields | Falcon wiring |
| --- | --- | --- |
| `consensus-node` | `buildPath`: the built `data` folder with `apps/*.jar` and `lib/*.jar` | `setup` `--local-build-path`; `--consensus-node-version v<version>` |
| `mirror-node` | `image`: the prefix Solo expands; `archive`: a `docker save` of all six module images; `chartDir` | `mirrorNode` `--component-image`, `--component-image-archive`, `--mirror-node-chart-dir`; `--mirror-node-version v<version>` |

```json
{
  "schemaVersion": 1,
  "components": [
    {
      "component": "consensus-node",
      "source": {"repository": "hiero-ledger/hiero-consensus-node", "commit": "<full source commit SHA>"},
      "version": "0.80.0-tck.38712.1",
      "buildPath": "cn/data"
    }
  ]
}
```

Paths resolve relative to the manifest. Before any cluster exists, P1 rejects with exit 2: a schema version other
than 1; an unknown, duplicated or candidate component; a component the lane does not deploy; unknown fields, because
the manifest is not a passthrough for Helm values or CLI flags; a source that is not `owner/name` at a full commit
SHA; a version that is not semver; a missing artifact; an image tag that differs from `version`; an archive without
every image, which for MN is the full module set; and a version override for a component the manifest supplies.

`tck-result.json` records the manifest's sha256 and, per companion, the declared source (`sourceShaVerified: false`,
because build provenance belongs to the caller), the sha256 of every artifact (each CN jar, the archive, the chart
tree) and what ran after deployment. P3 requires every node pod's `data/apps` and `data/lib` jars to match
`buildPath` exactly, and every MN module except the disabled monitor to run from a Ready container with the supplied
image and `imagePullPolicy: Never`. A companion that is never observed running, including one replaced by another
tag of the same image, fails P3 with reason `unknown`. There is no release fallback.

## Action interface

`tck/action.yml` exposes `component`, `candidate-packages`, `solo-version`, the two companion overrides above and
`companion-builds`.
It selects Node 22, runs the lane, and uploads its evidence even when the run fails. It needs only `contents: read`
and no secrets. The caller builds its candidate and owns its 30-minute job deadline, build included.

The action's shared release identifies its source. `solo-versions.json` independently records the qualified default
and supported CLI releases, which can differ from the action version. Until a kit revision has completed release
verification, that file intentionally has no default and an empty `supported` list. An explicit full Solo SHA is
required. A released version cannot bypass this check. After the containing Solo fix is released, Linux verification
must pass before adding that release to the list and making it the default. Shared Solo release publication and the
SDK caller switch are separate changes.

## Contract and reports

See [the lane spec](specs/js-sdk.md) and [the SDK assumptions exercised](specs/js-sdk-assumptions.md).

* P1 validates the lane, packages, Solo selection and any companion-builds manifest.
* P3 proves one copy of each candidate package by tarball sha512 and both SDK resolutions from Solo's package. After
  deployment it proves that every supplied companion runs its supplied artifact.
* P2 uses `solo one-shot falcon deploy`, CN and MN only, pinger off, default resource limits, metrics server on.
* P7 creates an account through Solo, changes its key through Solo, and reads that key through the candidate SDK.
* P5 obtains SUCCESS receipts for a transfer, topic creation and topic message.
* P6 reads the exact transfer and message from Mirror REST, with a 120-second ingestion deadline.
* P8 submits 2,400 alternating transfers and topic messages over two minutes at 20 transactions per second, checks
  every receipt, then reads back the last transfer and message.
* P4 watches pods from deployment onward, rejects OOMs, crashes, definitive image failures, and any post-deploy
  restart/replacement or non-Ready pod. Container CPU/memory peaks are sampled every 15 seconds after deployment.
  Missing metrics are reported explicitly; CPU and memory ceilings remain report-only.

One 20-minute deadline covers the kit. Test stages stop by minute 17, reserving three minutes for diagnostics,
cleanup and results. Inner limits are setup/install 3 minutes, deploy 8, probes 3, load 3. Commands have absolute
deadlines and cancellation stops their process groups. Cleanup success is reported separately and does not change
the probe verdict, as proposed in the design.

`tck-result.json` carries `schemaVersion` 1; removing, renaming or changing the meaning of a field raises it. Its
`reportOnly` list names probes that run and are recorded but cannot fail the run; a report-only failure appears in
JUnit as skipped, never as passed.

The final `artifacts/` directory contains `tck-result.json`, `junit.xml`, `summary.md`, command logs, sanitized Solo
logs, and failure diagnostics. Results are written after cleanup and include requested inputs, observed package
identity, pod images/resource limits, recorded chart-version lines, probe times, load counts and resource peaks.
Generated account keys are kept in private working state outside that directory. Failure summaries include a draft
for manual issue triage; the kit never posts anything.

Exit codes are 0 pass, 1 candidate, 2 invalid input, 3 environment, 4 kit defect, 5 unknown, 6 Solo (reserved for
assertions about Solo's own behaviour; no probe assigns it yet). Every nonzero exit fails the action. A missing probe cannot pass. A startup error such as `NodeAccountId not recognized: 0.0.2` stays red with
reason `unknown`; it does not automatically blame the SDK. Backend pod failures in this SDK lane are likewise
`unknown`, except noncandidate image-pull errors, which are `environment`.

## Test

```bash
npm test --prefix tck
```

The suite requires no dependency install. It tests real temporary npm installs and tarballs, HTTP mirror responses,
child-process termination, CLI failure reports and pod-watch negative controls. The dedicated GitHub workflow runs
these checks on `tck/` changes. Real deployment validation additionally needs the Docker environment above; unit
tests are not proof that the full network lane passes.
