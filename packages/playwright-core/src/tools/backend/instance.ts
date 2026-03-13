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

import { z } from '../../mcpBundle';

import type { ToolSchema } from '../utils/mcp/tool';

/**
 * Instance management tool schemas.
 * These tools are handled directly by BrowserBackend rather than through
 * the normal tool dispatch (since they manage the backend's own state).
 */

export const instanceCreateSchema: ToolSchema<any> = {
  name: 'browser_instance_create',
  title: 'Create browser instance',
  description: 'Create a new isolated browser instance with its own browser context, tabs, cookies, and state. Use this for parallel workflows where multiple agents need independent browser sessions. Returns an instanceId to pass to other tools.',
  inputSchema: z.object({
    instanceId: z.string().optional().describe('Custom instance ID. If omitted, an ID is auto-generated.'),
  }),
  type: 'action',
};

export const instanceListSchema: ToolSchema<any> = {
  name: 'browser_instance_list',
  title: 'List browser instances',
  description: 'List all active browser instances with their IDs, tab counts, and current URLs.',
  inputSchema: z.object({}),
  type: 'readOnly',
};

export const instanceCloseSchema: ToolSchema<any> = {
  name: 'browser_instance_close',
  title: 'Close browser instance',
  description: 'Close an isolated browser instance and all its tabs. Cannot close the default instance.',
  inputSchema: z.object({
    instanceId: z.string().describe('The instance ID to close.'),
  }),
  type: 'action',
};

export const instanceToolSchemas: ToolSchema<any>[] = [
  instanceCreateSchema,
  instanceListSchema,
  instanceCloseSchema,
];

export const instanceToolNames = new Set(instanceToolSchemas.map(s => s.name));
