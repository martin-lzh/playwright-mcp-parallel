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

import { resolveConfig } from './config';
import { filteredTools } from '../backend/tools';
import { createBrowser } from './browserFactory';
import { BrowserBackend } from '../backend/browserBackend';
import { instanceToolSchemas } from '../backend/instance';
import { createServer } from '../utils/mcp/server';
import { z } from '../../mcpBundle';

import type { Browser, BrowserContext } from 'playwright';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ClientInfo, ServerBackendFactory } from '../utils/mcp/server';
import type { Config } from './config.d';

const packageJSON = require('../../../package.json');

export async function createConnection(userConfig: Config = {}, contextGetter?: () => Promise<BrowserContext>): Promise<Server> {
  const config = await resolveConfig(userConfig);
  const tools = filteredTools(config);

  // Add optional instanceId parameter to all tool schemas for parallel execution.
  const extendedToolSchemas = tools.map(tool => ({
    ...tool.schema,
    inputSchema: tool.schema.inputSchema.extend({
      instanceId: z.string().optional().describe('Instance ID for parallel execution. If omitted, uses the default instance. Create instances with browser_instance_create.'),
    }),
  }));

  const backendFactory: ServerBackendFactory = {
    name: 'api',
    nameInConfig: 'api',
    version: packageJSON.version,
    toolSchemas: [...extendedToolSchemas, ...instanceToolSchemas],
    create: async (clientInfo: ClientInfo) => {
      let browser: Browser | undefined;
      let context: BrowserContext;
      if (contextGetter) {
        context = await contextGetter();
      } else {
        browser = await createBrowser(config, clientInfo);
        context = config.browser.isolated ? await browser.newContext(config.browser.contextOptions) : browser.contexts()[0];
      }
      return new BrowserBackend(config, context, tools, {
        browser,
        contextOptions: config.browser.contextOptions,
      });
    },
    disposed: async () => { }
  };
  return createServer('api', packageJSON.version, backendFactory, false);
}
