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

import { test, expect } from './fixtures';

function textOf(result: Awaited<ReturnType<import('@modelcontextprotocol/sdk/client/index.js').Client['callTool']>>): string {
  return (result.content as Array<{ text: string }>)[0].text;
}

test('should list instance tools', async ({ client }) => {
  const result = await client.listTools();
  const toolNames = result.tools.map(t => t.name);
  expect(toolNames).toContain('browser_instance_create');
  expect(toolNames).toContain('browser_instance_list');
  expect(toolNames).toContain('browser_instance_close');
});

test('should have instanceId parameter on regular tools', async ({ client }) => {
  const result = await client.listTools();
  const navigateTool = result.tools.find(t => t.name === 'browser_navigate');
  expect(navigateTool).toBeTruthy();
  const props = (navigateTool!.inputSchema as any).properties;
  expect(props.instanceId).toBeTruthy();
  expect(props.instanceId.type).toBe('string');
});

test('should list default instance', async ({ client }) => {
  const result = await client.callTool({
    name: 'browser_instance_list',
    arguments: {},
  });
  expect(textOf(result)).toContain('default');
});

test('should create and list a new instance', async ({ startClient }) => {
  const { client } = await startClient({ args: ['--isolated'] });

  const createResult = await client.callTool({
    name: 'browser_instance_create',
    arguments: { instanceId: 'agent-1' },
  });
  expect(textOf(createResult)).toContain('agent-1');

  const listResult = await client.callTool({
    name: 'browser_instance_list',
    arguments: {},
  });
  const text = textOf(listResult);
  expect(text).toContain('default');
  expect(text).toContain('agent-1');
});

test('should auto-generate instance id', async ({ startClient }) => {
  const { client } = await startClient({ args: ['--isolated'] });

  const result = await client.callTool({
    name: 'browser_instance_create',
    arguments: {},
  });
  expect(textOf(result)).toContain('instance-1');
});

test('should reject duplicate instance id', async ({ startClient }) => {
  const { client } = await startClient({ args: ['--isolated'] });

  await client.callTool({
    name: 'browser_instance_create',
    arguments: { instanceId: 'dup' },
  });

  const result = await client.callTool({
    name: 'browser_instance_create',
    arguments: { instanceId: 'dup' },
  });
  expect(textOf(result)).toContain('already exists');
  expect(result.isError).toBe(true);
});

test('should navigate in a specific instance', async ({ startClient, server }) => {
  const { client } = await startClient({ args: ['--isolated'] });

  // Create a new instance.
  await client.callTool({
    name: 'browser_instance_create',
    arguments: { instanceId: 'worker-1' },
  });

  // Navigate the new instance to a page.
  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX + '/hello-world',
      instanceId: 'worker-1',
    },
  });

  // The default instance should still be on about:blank.
  const defaultSnapshot = await client.callTool({
    name: 'browser_snapshot',
    arguments: {},
  });
  expect(textOf(defaultSnapshot)).not.toContain('Hello, world');

  // The worker-1 instance should be on hello-world.
  const workerSnapshot = await client.callTool({
    name: 'browser_snapshot',
    arguments: { instanceId: 'worker-1' },
  });
  expect(textOf(workerSnapshot)).toContain('Hello, world');
});

test('should close an instance', async ({ startClient }) => {
  const { client } = await startClient({ args: ['--isolated'] });

  await client.callTool({
    name: 'browser_instance_create',
    arguments: { instanceId: 'temp' },
  });

  const closeResult = await client.callTool({
    name: 'browser_instance_close',
    arguments: { instanceId: 'temp' },
  });
  expect(textOf(closeResult)).toContain('Closed');

  // Should no longer appear in list.
  const listResult = await client.callTool({
    name: 'browser_instance_list',
    arguments: {},
  });
  expect(textOf(listResult)).not.toContain('temp');
});

test('should not close default instance', async ({ client }) => {
  const result = await client.callTool({
    name: 'browser_instance_close',
    arguments: { instanceId: 'default' },
  });
  expect(textOf(result)).toContain('Cannot close the default instance');
  expect(result.isError).toBe(true);
});

test('should error on unknown instanceId', async ({ client }) => {
  const result = await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: 'about:blank',
      instanceId: 'nonexistent',
    },
  });
  expect(textOf(result)).toContain('not found');
  expect(result.isError).toBe(true);
});

test('instances should be fully isolated', async ({ startClient, server }) => {
  const { client } = await startClient({ args: ['--isolated'] });

  // Create two instances.
  await client.callTool({ name: 'browser_instance_create', arguments: { instanceId: 'a' } });
  await client.callTool({ name: 'browser_instance_create', arguments: { instanceId: 'b' } });

  // Navigate instance 'a' to one page.
  server.setContent('/page-a', '<title>Page A</title><body>Content A</body>', 'text/html');
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX + '/page-a', instanceId: 'a' },
  });

  // Navigate instance 'b' to a different page.
  server.setContent('/page-b', '<title>Page B</title><body>Content B</body>', 'text/html');
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX + '/page-b', instanceId: 'b' },
  });

  // Verify each instance sees its own content.
  const snapshotA = await client.callTool({
    name: 'browser_snapshot',
    arguments: { instanceId: 'a' },
  });
  expect(textOf(snapshotA)).toContain('Content A');
  expect(textOf(snapshotA)).not.toContain('Content B');

  const snapshotB = await client.callTool({
    name: 'browser_snapshot',
    arguments: { instanceId: 'b' },
  });
  expect(textOf(snapshotB)).toContain('Content B');
  expect(textOf(snapshotB)).not.toContain('Content A');

  // Default instance should be unaffected.
  const snapshotDefault = await client.callTool({
    name: 'browser_snapshot',
    arguments: {},
  });
  expect(textOf(snapshotDefault)).not.toContain('Content A');
  expect(textOf(snapshotDefault)).not.toContain('Content B');
});

test('browser_close on instance should not kill other instances', async ({ startClient, server }) => {
  const { client } = await startClient({ args: ['--isolated'] });

  // Create two instances.
  await client.callTool({ name: 'browser_instance_create', arguments: { instanceId: 'doomed' } });
  await client.callTool({ name: 'browser_instance_create', arguments: { instanceId: 'survivor' } });

  // Navigate the survivor to a page.
  server.setContent('/alive', '<title>Still Alive</title><body>I survived</body>', 'text/html');
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX + '/alive', instanceId: 'survivor' },
  });

  // Close the doomed instance via browser_close (not browser_instance_close).
  await client.callTool({
    name: 'browser_close',
    arguments: { instanceId: 'doomed' },
  });

  // The doomed instance should be gone.
  const listResult = await client.callTool({
    name: 'browser_instance_list',
    arguments: {},
  });
  expect(textOf(listResult)).not.toContain('doomed');

  // The survivor and default should still work.
  expect(textOf(listResult)).toContain('survivor');
  expect(textOf(listResult)).toContain('default');

  const snapshot = await client.callTool({
    name: 'browser_snapshot',
    arguments: { instanceId: 'survivor' },
  });
  expect(textOf(snapshot)).toContain('I survived');
});
