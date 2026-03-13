# Playwright Monorepo — Copilot Instructions

This is the **Microsoft Playwright** monorepo: a browser automation framework consisting of a TypeScript/Node.js library, a test runner, MCP tools, and browser distributions for Chromium, Firefox, and WebKit.

## Key Architecture

Playwright uses a **client → protocol → server** layered architecture, strictly enforced by the DEPS system.

| Layer | Location | Role |
|-------|----------|------|
| Client (public API) | `packages/playwright-core/src/client/` | `ChannelOwner` subclasses; what users import |
| Protocol (RPC) | `packages/protocol/src/protocol.yml` → generated `channels.d.ts` | Source of truth for all RPC interfaces |
| Server (browser automation) | `packages/playwright-core/src/server/` | `SdkObject` subclasses; performs actual automation |
| Dispatchers (bridge) | `packages/playwright-core/src/server/dispatchers/` | Connects server objects to the protocol wire |

**Critical rule: client code NEVER imports server code and vice versa.** They communicate only through the protocol layer.

## DEPS System (import boundaries)

`DEPS.list` files (52+ across the repo) declare allowed imports, enforced by `npm run flint`.

- When you create or move a file, update the relevant `DEPS.list`.
- Files marked `"strict"` can ONLY import what is explicitly listed.
- Violations are caught by `npm run flint` (not by tsc alone).

## Build

```bash
npm run build       # Full build
npm run watch       # Watch mode — assume this is running during development
```

Generated files (`channels.d.ts`, `validator.ts`, type definitions) are produced automatically by watch. Do not edit them by hand.

## Lint

```bash
npm run flint
```

Runs all checks in parallel: eslint, tsc, doclint, check-deps, generate_channels, generate_types, lint-tests, test-types, lint-packages, code-snippet linting.

**Always run `flint` before committing.** Do NOT use `tsc --noEmit` or individual lint commands.

## Test Commands

| Command | Scope |
|---------|-------|
| `npm run ctest <filter>` | Chromium library tests — **use this during development** |
| `npm run ttest <filter>` | Test runner tests (`tests/playwright-test/`) |
| `npm run ctest-mcp <filter>` | Chromium MCP tool tests (`tests/mcp/`) |
| `npm run test <filter> -- --project=<chromium\|firefox\|webkit>` | Cross-browser library |
| `npm run test-mcp <filter> -- --project=<chromium\|firefox\|webkit>` | Cross-browser MCP |

### Filtering

```bash
npm run ctest tests/page/locator-click.spec.ts    # Specific file
npm run ctest tests/page/locator-click.spec.ts:12 # Specific line
npm run ctest -- --grep "should click"            # By test name
npm run ctest-mcp snapshot                        # By file name part
```

### Choosing the Right Test Directory

| Directory | Import | Key Fixtures | Use When |
|-----------|--------|--------------|----------|
| `tests/page/` | `import { test, expect } from './pageTest'` | `page`, `server`, `browserName` | User interactions: click, fill, navigate, locators |
| `tests/library/` | `import { browserTest, expect } from '../config/browserTest'` | `browser`, `context`, `browserType` | Browser/context lifecycle, cookies, permissions |
| `tests/playwright-test/` | `import { test, expect } from './playwright-test-fixtures'` | test runner fixtures | Test runner behavior: reporters, config, annotations |
| `tests/mcp/` | `import { test, expect } from './fixtures'` | `client`, `server` | MCP tools via `client.callTool()` |

**Decision rule:** Needs `browser`/`context`/`browserType`? → `tests/library/`. Just needs `page` + `server`? → `tests/page/`.

## Adding or Modifying APIs (docs-first workflow)

1. **Define in docs** — `docs/src/api/class-xxx.md` is the source of truth for public TypeScript types. Watch auto-generates types from it.
2. **Implement client** — `packages/playwright-core/src/client/xxx.ts` (extends `ChannelOwner`).
3. **Define protocol** — add command/event to `packages/protocol/src/protocol.yml`.
4. **Add validator** — watch auto-generates `validator.ts`; add manual primitives only if needed.
5. **Implement server** — `packages/playwright-core/src/server/xxx.ts` (extends `SdkObject`).
6. **Add dispatcher** — `packages/playwright-core/src/server/dispatchers/xxxDispatcher.ts` (extends `Dispatcher`).
7. **Write tests** — choose the right test directory above.

Keep methods, events, and properties sorted alphabetically within doc files.

## Adding MCP Tools

Create `packages/playwright-core/src/tools/backend/<your-tool>.ts`.

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

Use `defineTabTool` for most tools (auto-handles modal state). Use `defineTool` when you need full `Context` access.

## Commit Convention

```
label(scope): description
```

Labels: `fix`, `feat`, `chore`, `docs`, `test`, `devops`

Branch naming for issue fixes: `fix-<issue-number>`

Never add `Co-Authored-By` agent lines to commit messages.

## Key Pitfalls

- **Never import across the client/server boundary** — caught by `DEPS.list` + `flint`.
- **Never edit generated files** — edit the source (`protocol.yml`, doc `.md` files) and let watch regenerate.
- **`docs/src/api/` is the source of truth** for public TypeScript types — define types there first.
- **Always run `npm run flint`** before committing, not just `tsc`.
- **Update `DEPS.list`** whenever you create, move, or rename a source file.
- Version numbers in docs use the package.json version without the `-next` suffix.

## Monorepo Package Overview

| Package | Purpose |
|---------|---------|
| `playwright-core` | Browser automation engine: client, server, dispatchers, protocol |
| `playwright` | Test runner + browser automation (public package) |
| `playwright-test` | Test runner entry point |
| `playwright-client` | Standalone client package |
| `protocol` | RPC protocol definitions |
| `html-reporter` | HTML test report viewer |
| `trace-viewer` | Trace viewer UI |
| `injected` | Scripts injected into browser pages |
| `recorder` | Test recorder |

## Detailed Skills (read when needed)

- `.claude/skills/playwright-dev/library.md` — client/server/dispatcher architecture, ChannelOwner/SdkObject/Dispatcher, DEPS rules, RPC flow
- `.claude/skills/playwright-dev/api.md` — full 6-step API development process with code patterns
- `.claude/skills/playwright-dev/tools.md` — MCP tools, CLI commands, `defineTool`/`defineTabTool`, config options, testing
- `.claude/skills/playwright-dev/vendor.md` — vendoring third-party npm packages into bundles
