# Playwright MCP Parallel — Copilot Instructions

Unofficial fork of [Microsoft Playwright](https://github.com/microsoft/playwright) that adds **browser instance isolation** to the MCP server. Each agent gets its own independent session (tabs, cookies, storage) through a single MCP server. See [README.md](../README.md) for usage and motivation.

## What This Fork Changes

Three instance management tools + an `instanceId` parameter injected into all existing tools:

| Tool / Param | Purpose |
|--------------|---------|
| `browser_instance_create` | Spin up a new isolated browser instance |
| `browser_instance_list` | List active instances with tab counts |
| `browser_instance_close` | Tear down an instance by ID |
| `instanceId` (on all tools) | Target a specific instance (defaults to `'default'`) |

## Instance Architecture

```
BrowserBackend (orchestrator)
├── _instances: Map<string, InstanceEntry>
│   ├── 'default' → { context, browserContext, isDefault: true }
│   ├── 'agent-a' → { context, browserContext, isDefault: false }
│   └── 'agent-b' → { context, browserContext, isDefault: false }
└── callTool(name, args) → extract instanceId → _resolveContext → execute
```

Key files for the instance feature:

| File | Role |
|------|------|
| `packages/playwright-core/src/tools/backend/browserBackend.ts` | Instance manager, tool router |
| `packages/playwright-core/src/tools/backend/context.ts` | MCP Context class (wraps BrowserContext) |
| `packages/playwright-core/src/tools/backend/instance.ts` | Instance tool schemas (create/list/close) |
| `packages/playwright-core/src/tools/backend/tool.ts` | `defineTool()` / `defineTabTool()` helpers |
| `packages/playwright-core/src/tools/mcp/index.ts` | Injects `instanceId` param into all tools |
| `tests/mcp/instance.spec.ts` | Instance isolation tests |

## Upstream Architecture (preserved)

Playwright uses a **client → protocol → server** layered architecture, enforced by DEPS.list files.

| Layer | Location | Role |
|-------|----------|------|
| Client (public API) | `packages/playwright-core/src/client/` | `ChannelOwner` subclasses |
| Protocol (RPC) | `packages/protocol/src/protocol.yml` | Source of truth for RPC interfaces |
| Server | `packages/playwright-core/src/server/` | `SdkObject` subclasses; actual automation |
| Dispatchers | `packages/playwright-core/src/server/dispatchers/` | Bridge server objects to wire protocol |

**Client code NEVER imports server code and vice versa.** They communicate only through the protocol layer.

### DEPS System

`DEPS.list` files (~46 across the repo) declare allowed imports, enforced by `npm run check-deps`.

- When you create or move a file, update the relevant `DEPS.list`.
- Files in `[*]` sections get default imports; named sections like `[file.ts]` restrict specific files.

## Build & Run

```bash
npm run build          # Full build (generates channels.d.ts, types, bundles)
npm run watch          # Watch mode — assume this is running during development
npm start              # Start MCP server: --isolated --port 3000
```

Generated files are produced by the build/watch. Do not edit them by hand.

## Lint

```bash
npm run eslint         # ESLint (cached)
npm run tsc            # TypeScript compilation check
npm run check-deps     # Validate DEPS.list import boundaries
```

Run all three before committing.

## Test Commands

| Command | Scope |
|---------|-------|
| `npm run ctest-mcp <filter>` | Chromium MCP tests — **use this during development** |
| `npm run test-mcp <filter>` | All MCP tests (chromium + firefox + webkit) |

All tests live in `tests/mcp/`. Import pattern: `import { test, expect } from './fixtures'`.

### Filtering

```bash
npm run ctest-mcp instance                        # By file name part
npm run ctest-mcp tests/mcp/instance.spec.ts      # Specific file
npm run ctest-mcp -- --grep "should create"       # By test name
```

## Adding MCP Tools

Create `packages/playwright-core/src/tools/backend/<your-tool>.ts`:

```typescript
import { z } from '../../mcpBundle';
import { defineTabTool } from './tool';

const myTool = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_my_tool',   // browser_ prefix required
    title: 'My Tool',
    description: 'Does something',
    inputSchema: z.object({ ... }),
    type: 'action',            // 'action' | 'input' | 'readOnly' | 'assertion'
  },
  handle: async (tab, params, response) => {
    await tab.page.doSomething();
    response.addCode(`await page.doSomething();`);
    response.setIncludeSnapshot();
  },
});
export default [myTool];
```

- Use `defineTabTool` for most tools (auto-handles modal state).
- Use `defineTool` when you need full `Context` access.
- The `instanceId` param is injected automatically by `mcp/index.ts` — don't add it to individual tools.
- Register new tools in `packages/playwright-core/src/tools/backend/tools.ts`.

## Commit Convention

```
label(scope): description
```

Labels: `fix`, `feat`, `chore`, `docs`, `test`, `devops`. Branch naming: `fix-<issue-number>`.

## Key Pitfalls

- **Never import across the client/server boundary** — enforced by `DEPS.list` + `check-deps`.
- **Never edit generated files** — edit sources (`protocol.yml`, doc `.md` files) and rebuild.
- **Update `DEPS.list`** whenever you create, move, or rename a source file.
- **Default instance can't be closed** — `browser_instance_close` rejects attempts on the default.
- **`instanceId` is injected globally** — don't add it to individual tool schemas.

## Package Overview

| Package | Purpose |
|---------|---------|
| `playwright-core` | Browser automation engine + MCP tools/server |
| `playwright` | Test runner + browser automation |
| `playwright-test` | Test runner entry point |
| `protocol` | RPC protocol definitions |
| `html-reporter` | HTML test report viewer |
| `recorder` | Test recorder |
| `injected` | Scripts injected into browser pages |
| `trace` | Trace viewer |
| `dashboard` | MCP dashboard UI |
