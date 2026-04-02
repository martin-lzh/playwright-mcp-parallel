/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Context } from './context';
import { Response } from './response';
import { SessionLog } from './sessionLog';
import { instanceToolNames } from './instance';
import { debug } from '../../utilsBundle';

import type { ContextConfig } from './context';
import type * as playwright from '../../..';
import type { Tool } from './tool';
import type * as mcpServer from '../utils/mcp/server';
import type { ClientInfo, ServerBackend } from '../utils/mcp/server';

type InstanceEntry = {
  context: Context;
  browserContext: playwright.BrowserContext;
  isDefault: boolean;
};

export type BrowserBackendOptions = {
  browser?: playwright.Browser;
  contextOptions?: playwright.BrowserContextOptions;
};

export class BrowserBackend implements ServerBackend {
  private _tools: Tool[];
  private _instances = new Map<string, InstanceEntry>();
  private _sessionLog: SessionLog | undefined;
  private _config: ContextConfig;
  private _clientInfo: ClientInfo | undefined;
  private _browser: playwright.Browser | undefined;
  private _contextOptions: playwright.BrowserContextOptions | undefined;
  private _instanceCounter = 0;
  readonly browserContext: playwright.BrowserContext;

  constructor(config: ContextConfig, browserContext: playwright.BrowserContext, tools: Tool[], options?: BrowserBackendOptions) {
    this._config = config;
    this._tools = tools;
    this.browserContext = browserContext;
    this._browser = options?.browser;
    this._contextOptions = options?.contextOptions;
  }

  async initialize(clientInfo: ClientInfo): Promise<void> {
    this._clientInfo = clientInfo;
    this._sessionLog = this._config.saveSession ? await SessionLog.create(this._config, clientInfo.cwd) : undefined;
    const context = new Context(this.browserContext, {
      config: this._config,
      sessionLog: this._sessionLog,
      cwd: clientInfo.cwd,
    });
    this._instances.set('default', {
      context,
      browserContext: this.browserContext,
      isDefault: true,
    });
  }

  async dispose() {
    for (const [, entry] of this._instances) {
      await entry.context.dispose().catch(e => debug('pw:tools:error')(e));
      if (!entry.isDefault)
        await entry.browserContext.close().catch(e => debug('pw:tools:error')(e));
    }
    this._instances.clear();
  }

  private _resolveContext(instanceId: string | undefined): Context {
    const id = instanceId || 'default';
    const entry = this._instances.get(id);
    if (!entry)
      throw new Error(`Browser instance "${id}" not found. Use browser_instance_list to see available instances.`);
    return entry.context;
  }

  private async _handleInstanceCreate(rawArguments: Record<string, unknown>): Promise<mcpServer.CallToolResult> {
    if (!this._browser)
      throw new Error('Cannot create new instances: no browser reference available. Start the server with --isolated flag or use a browser that supports multiple contexts.');
    const requestedId = rawArguments?.instanceId as string | undefined;
    const instanceId = requestedId || `instance-${++this._instanceCounter}`;
    if (this._instances.has(instanceId))
      throw new Error(`Instance "${instanceId}" already exists.`);
    const browserContext = await this._browser.newContext(this._contextOptions || {});
    const context = new Context(browserContext, {
      config: this._config,
      sessionLog: this._sessionLog,
      cwd: this._clientInfo?.cwd || process.cwd(),
    });
    this._instances.set(instanceId, {
      context,
      browserContext,
      isDefault: false,
    });
    return {
      content: [{ type: 'text' as const, text: `### Result\nCreated browser instance "${instanceId}".\nPass \`instanceId: "${instanceId}"\` to other tools to use this instance.` }],
    };
  }

  private async _handleInstanceList(): Promise<mcpServer.CallToolResult> {
    const lines: string[] = [];
    for (const [id, entry] of this._instances) {
      const tabs = entry.context.tabs();
      const tabCount = tabs.length;
      const currentUrl = entry.context.currentTab()?.page.url() ?? 'no tabs';
      const isDefault = entry.isDefault ? ' (default)' : '';
      lines.push(`- ${id}${isDefault}: ${tabCount} tab(s), current: ${currentUrl}`);
    }
    return {
      content: [{ type: 'text' as const, text: `### Result\n${lines.join('\n') || 'No instances.'}` }],
    };
  }

  private async _handleInstanceClose(rawArguments: Record<string, unknown>): Promise<mcpServer.CallToolResult> {
    const instanceId = rawArguments?.instanceId as string;
    if (!instanceId)
      throw new Error('instanceId is required.');
    if (instanceId === 'default')
      throw new Error('Cannot close the default instance.');
    const entry = this._instances.get(instanceId);
    if (!entry)
      throw new Error(`Instance "${instanceId}" not found.`);
    await entry.context.dispose();
    await entry.browserContext.close();
    this._instances.delete(instanceId);
    return {
      content: [{ type: 'text' as const, text: `### Result\nClosed browser instance "${instanceId}".` }],
    };
  }

  async callTool(name: string, rawArguments: mcpServer.CallToolRequest['params']['arguments']) {
    // Handle instance management tools directly.
    if (instanceToolNames.has(name)) {
      try {
        if (name === 'browser_instance_create')
          return await this._handleInstanceCreate(rawArguments || {});
        if (name === 'browser_instance_list')
          return await this._handleInstanceList();
        if (name === 'browser_instance_close')
          return await this._handleInstanceClose(rawArguments || {});
      } catch (error: any) {
        return {
          content: [{ type: 'text' as const, text: `### Error\n${String(error)}` }],
          isError: true,
        };
      }
    }

    const tool = this._tools.find(tool => tool.schema.name === name)!;
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `### Error\nTool "${name}" not found` }],
        isError: true,
      };
    }

    // Extract instanceId before parsing tool-specific arguments.
    const instanceId = rawArguments?.instanceId as string | undefined;
    const toolArguments = { ...rawArguments };
    delete toolArguments?.instanceId;

    const parsedArguments = tool.schema.inputSchema.parse(toolArguments || {}) as any;
    const cwd = rawArguments?._meta && typeof rawArguments?._meta === 'object' && (rawArguments._meta as any)?.cwd;

    let context: Context;
    try {
      context = this._resolveContext(instanceId);
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: `### Error\n${String(error)}` }],
        isError: true,
      };
    }

    const response = new Response(context, name, parsedArguments, cwd);
    context.setRunningTool(name);
    let responseObject: mcpServer.CallToolResult & { isClose?: boolean };
    try {
      await tool.handle(context, parsedArguments, response);
      responseObject = await response.serialize();
      this._sessionLog?.logResponse(name, parsedArguments, responseObject);
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: `### Error\n${String(error)}` }],
        isError: true,
      };
    } finally {
      context.setRunningTool(undefined);
    }

    // When a non-default instance signals close (e.g. browser_close or all tabs
    // closed), tear down only that instance instead of the entire backend.
    if (responseObject.isClose && instanceId && instanceId !== 'default') {
      const entry = this._instances.get(instanceId);
      if (entry) {
        this._instances.delete(instanceId);
        try {
          await entry.context.dispose();
          await entry.browserContext.close();
        } catch (e) {
          debug('pw:tools:error')(e);
        }
      }
      delete responseObject.isClose;
    }

    return responseObject;
  }
}
