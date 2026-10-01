# Windows EPERM Cached-Manifest Issue — Investigation & Verification Summary (PR #6041)

## Context
During network deployment on Windows (`solo network deploy`), installing monitoring CRDs (Pod Logs CRDs and Prometheus Operator CRDs) concurrently triggered Windows file locking conflicts (`EPERM`) while reading/writing cached manifest files in `~/.solo/cache/`.

## Environment
- **OS**: Windows 11 (NT 10.0.26200.0)
- **Shell**: PowerShell 5.1
- **Node.js**: v24.15.0
- **Branch**: `fix/issue-6034` (PR #6041)

## Root Cause
In [`src/commands/network.ts`](file:///c:/Users/ASUS/Desktop/solo-6034/src/commands/network.ts), the `Install monitoring CRDs` task used `Listr2` with `concurrent: true`. On Windows, parallel execution caused concurrent access/write collisions on cached CRD manifests in the local cache directory.

## Implementation Details
1. **[`src/commands/network.ts`](file:///c:/Users/ASUS/Desktop/solo-6034/src/commands/network.ts)**:
   - Updated the `Install monitoring CRDs` task options to:
     ```ts
     return task.newListr(tasks, {
       concurrent: !OperatingSystem.isWin32(),
       rendererOptions: constants.LISTR_DEFAULT_RENDERER_OPTION,
     });
     ```
   - On Windows, the subtasks run sequentially (`concurrent: false`), preventing cached manifest file access conflicts.
   - On Linux/macOS, concurrent execution is preserved (`concurrent: true`).

2. **[`test/unit/commands/network.test.ts`](file:///c:/Users/ASUS/Desktop/solo-6034/test/unit/commands/network.test.ts)**:
   - Added unit test: `serializes monitoring CRD installation with concurrent: false on Windows`
   - Added unit test: `runs monitoring CRD installation with concurrent: true on non-Windows`

## Verification Results
Ran unit tests with mocha:
```powershell
npx mocha test/unit/commands/network.test.ts
```

**Result:**
- **13/13 tests passing** (824ms)
- Both Windows-specific serialization and non-Windows concurrency behavior verified.

## Note Regarding Console History
Original interactive terminal output containing the raw EPERM stack trace was not preserved in persistent session logs during initial reproduction. The full chronological command list, ACL inspection commands, and verified test results are documented in `windows-eperm-reproduction-console.txt`.
