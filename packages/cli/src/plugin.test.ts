import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = new URL('../../../', import.meta.url);
const pluginRoot = new URL('plugins/hcmus-course/', root);

test('skills-only local plugin points at this repository and requires local execution', async () => {
  const plugin = JSON.parse(await readFile(new URL('plugin.json', pluginRoot), 'utf8'));
  assert.equal(plugin.name, 'hcmus-course');
  assert.equal(plugin.extensions?.['com.openai']?.requires_local_executor, true);
  assert.equal(plugin.mcpServers, undefined);
  assert.deepEqual((await readdir(pluginRoot)).sort(), ['plugin.json', 'skills']);
  for (const skill of ['setup', 'using-course-cli', 'submitting-course-assignments', 'taking-course-quizzes']) {
    await access(new URL(`skills/${skill}/SKILL.md`, pluginRoot));
  }
  assert.equal(plugin.extensions?.['com.openai']?.onboardingSkill, './skills/setup/SKILL.md');
  const marketplace = JSON.parse(await readFile(new URL('.agents/plugins/marketplace.json', root), 'utf8'));
  assert.equal(marketplace.plugins[0].name, plugin.name);
  assert.equal(resolve(fileURLToPath(new URL(marketplace.plugins[0].source.path, root))), resolve(fileURLToPath(pluginRoot)));
  await assert.rejects(access(new URL('mcp.json', pluginRoot)), { code: 'ENOENT' });
  await assert.rejects(access(new URL('packages/mcp/package.json', root)), { code: 'ENOENT' });
});
