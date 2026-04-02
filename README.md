# Playwright MCP — Parallel Instances (Unofficial Fork)

> **Disclaimer:** This is an **unofficial, modified fork** of [Microsoft Playwright](https://github.com/microsoft/playwright). It is not affiliated with, endorsed by, or maintained by Microsoft. Use at your own risk.

## Why This Fork Exists

The official Playwright MCP server runs a single shared browser context — all tool calls share one set of tabs, cookies, and state. This makes it impossible for multiple AI agents (or sub-agents) to browse the web in parallel without stepping on each other.

This fork is a **workaround** that adds browser instance isolation so each agent gets its own independent session through the same MCP server. It's a pragmatic hack, not a polished product — if/when upstream Playwright adds native parallel support, this repo becomes obsolete.

## What's Changed

Three new tools and one new parameter on all existing tools:

| Addition | What it does |
|----------|-------------|
| `browser_instance_create` | Spin up a new isolated browser instance (own tabs, cookies, storage) |
| `browser_instance_list` | List active instances with tab counts and current URLs |
| `browser_instance_close` | Tear down an instance by ID |
| `instanceId` param | Added to every standard tool — targets a specific instance |

When `instanceId` is omitted, tools operate on the **default instance** (fully backward-compatible with standard Playwright MCP).

## Quick Start

### Prerequisites

- Node.js ≥ 18
- Chromium/Chrome (auto-installed by Playwright if needed)

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

**Shortcut:**

```bash
npm start
# → node packages/playwright-core/lib/tools/mcp/cli-stub.js --isolated --port 3000
```

## VS Code / Copilot Configuration

Add to your VS Code `settings.json`:

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

Each agent creates its own instance, uses it, then cleans up:

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

Tools called **without** `instanceId` hit the default instance — works exactly like upstream.

## CLI Flags

| Flag | Description |
|------|-------------|
| `--isolated` | Isolated browser contexts (required for instance support) |
| `--port <n>` | HTTP/SSE server on given port (omit for stdio) |
| `--browser <name>` | `chromium` (default), `firefox`, `webkit` |
| `--headless` | Headless mode |
| `--caps <list>` | Comma-separated: `core`, `tabs`, `pdf`, `history`, `wait`, `files`, `install`, `testing` |
| `--config <path>` | Path to config JSON |

## Development

```bash
npm run build                       # Full build
npm run ctest-mcp                   # Run all MCP tests (Chromium)
npm run ctest-mcp -- instance       # Instance isolation tests only
```

## License & Attribution

This project is a modified fork of [Microsoft Playwright](https://github.com/microsoft/playwright), which is licensed under the **Apache License 2.0**.

The original copyright and license terms are preserved in full — see [LICENSE](LICENSE). Per the Apache 2.0 license terms, this fork constitutes a derivative work. The modifications add browser instance isolation to the MCP server; all original Playwright functionality remains intact and is the work of Microsoft and the Playwright contributors.

**This project is not an official Microsoft product.**
