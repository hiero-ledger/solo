# System Readiness

This page documents known configuration requirements and compatibility checks
that Solo validates before deploying network components.

## Docker Desktop on macOS (and Windows)

### "Use containerd for pulling and storing images" setting

**Symptom**

Relay (and occasionally other components) fail to start with an error similar to:

```
ImageInspectError: Failed to inspect image "ghcr.io/hiero-ledger/hiero-json-rpc-relay:x.y.z":
rpc error: code = Unavailable desc = connection error: desc = "transport: Error while dialing:
dial unix /run/containerd/containerd.sock: connect: connection refused"
```

**Cause**

Docker Desktop ships with an optional *containerd image store* that replaces the
classic image store.  When enabled, Docker Desktop uses
`/run/containerd/containerd.sock` as the image-inspection endpoint.  However,
that socket is **not reachable from inside the Kubernetes node** that Docker
Desktop manages, so any pod whose image must be inspected at start-up will
immediately fail with the error above.

The toggle is located at:

> **Docker Desktop → Settings → General → Use containerd for pulling and storing images**

**Fix**

1. Open **Docker Desktop**.
2. Navigate to **Settings → General**.
3. **Uncheck** "Use containerd for pulling and storing images".
4. Click **Apply & Restart**.

After Docker Desktop restarts, redeploy the affected component:

```sh
solo relay deploy  # or the component that failed
```

**Solo pre-flight check**

Solo automatically reads the Docker Desktop settings file (`~/.docker/settings-store.json`
or the legacy `~/Library/Group Containers/group.com.docker/settings.json`) before each
relay deploy and upgrade.  If the `useContainerdSnapshotter` key is `true`, Solo logs a
warning with the steps above so you can address the issue before the pod fails.

**Retry behaviour**

Even if the containerd socket is only briefly unavailable (a race condition during
Docker Desktop startup), Solo retries image-inspect failures up to five consecutive
times before surfacing the error.  This tolerance means a short transient outage
during startup will not abort your deploy.
