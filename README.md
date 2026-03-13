# Playwright MCP — Parallel Instances

A fork of [Microsoft Playwright](https://github.com/microsoft/playwright) MCP server that adds **parallel browser instance isolation**. Multiple AI agents (or sub-agents) can each operate their own isolated browser session through a single MCP server — no interference, no shared state.

## What's Different

The upstream Playwright MCP server provides one shared browser context for all tool calls. This fork adds:

- **`browser_instance_create`** — Spin up a new isolated browser instance (its own tabs, cookies, storage).
- **`browser_instance_list`** — List all active instances with their tab counts and URLs.
- **`browser_instance_close`** — Tear down an instance when done.
- **`instanceId` parameter** — Every existing tool (`browser_navigate`, `browser_click`, etc.) accepts an optional `instanceId` to target a specific instance.

When `instanceId` is omitted, tools operate on the **default instance** (backward-compatible with standard Playwright MCP).

## Quick Start

### Prerequisites

- Node.js ≥ 18
- A Chromium/Chrome browser (installed automatically by Playwright if needed)

### Build from Source

```bash
git clone https://github.com/nicekid1/playwright-mcp-paral.git
cd playwright-mcp-paral
npm install
npm run build
```

### Install Browsers (first time only)

```bash
npx playwright install chromium
```

### Start the MCP Server

**HTTP/SSE (for networked agents):**

```bash
node packages/playwright-core/lib/tools/mcp/cli-stub.js --isolated --port 3000
```

**Stdio (for local MCP clients like VS Code):**

```bash
node packages/playwright-core/lib/tools/mcp/cli-stub.js --isolated
```

### npm start shortcut

```bash
npm start
# Equivalent to: node packages/playwright-core/lib/tools/mcp/cli-stub.js --isolated --port 3000
```

## VS Code / Copilot Configuration

Add to your VS Code `settings.json` to use this as an MCP server for Copilot:

```jsonc
{
  "mcp": {
    "servers": {
      "playwright": {
        "command": "node",
        "args": [
          "C:/absolute/path/to/playwright-mcp-paral/packages/playwright-core/lib/tools/mcp/cli-stub.js",
          "--isolated"
        ]
      }
    }
  }
}
```

Replace the path with your actual clone location.

## Usage — Parallel Agents

Each sub-agent creates its own instance, uses it, then cleans up:

```
Agent A                              Agent B
───────                              ───────
browser_instance_create              browser_instance_create
  → instanceId: "agent-a"             → instanceId: "agent-b"

browser_navigate                     browser_navigate
  url: "https://site-a.com"           url: "https://site-b.com"
  instanceId: "agent-a"               instanceId: "agent-b"

browser_snapshot                     browser_click
  instanceId: "agent-a"               element: "Submit"
                                       instanceId: "agent-b"

browser_instance_close               browser_instance_close
  instanceId: "agent-a"               instanceId: "agent-b"
```

Tools called **without** `instanceId` use the default instance (works exactly like upstream Playwright MCP).

## Instance Tools Reference

| Tool | Description |
|------|-------------|
| `browser_instance_create` | Create a new isolated instance. Optional `instanceId` param (auto-generated if omitted). |
| `browser_instance_list` | List all active instances with tab counts and URLs. |
| `browser_instance_close` | Close an instance by ID. Cannot close the default instance. |

All standard Playwright MCP tools (`browser_navigate`, `browser_click`, `browser_snapshot`, etc.) accept an optional `instanceId` string parameter to target a specific instance.

## CLI Flags

| Flag | Description |
|------|-------------|
| `--isolated` | Use isolated browser contexts (required for instance creation) |
| `--port <n>` | Start HTTP/SSE server on given port (omit for stdio) |
| `--browser <name>` | Browser to use: `chromium` (default), `firefox`, `webkit` |
| `--headless` | Run in headless mode |
| `--caps <list>` | Comma-separated capabilities: `core`, `tabs`, `pdf`, `history`, `wait`, `files`, `install`, `testing` |
| `--config <path>` | Path to Playwright MCP config JSON file |

## Development

```bash
npm run build                       # Full build
npm run ctest-mcp                   # Run all MCP tests (Chromium)
npm run ctest-mcp -- instance       # Run instance isolation tests only
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
