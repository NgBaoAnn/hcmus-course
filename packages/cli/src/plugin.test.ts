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
  const files = await readdir(pluginRoot);
  for (const expected of ['.claude-plugin', 'README.md', 'assets', 'package.json', 'plugin.json', 'skills', 'src']) {
    assert.ok(files.includes(expected), `Missing plugin file: ${expected}`);
  }
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

test('GitHub plugin manifests and OpenCode package share one version and skill set', async () => {
  const portable = JSON.parse(await readFile(new URL('plugin.json', pluginRoot), 'utf8'));
  const claude = JSON.parse(await readFile(new URL('.claude-plugin/plugin.json', pluginRoot), 'utf8'));
  const claudeMarketplace = JSON.parse(await readFile(new URL('.claude-plugin/marketplace.json', root), 'utf8'));
  const opencode = JSON.parse(await readFile(new URL('package.json', pluginRoot), 'utf8'));
  assert.equal(portable.version, '0.2.0');
  assert.equal(claude.version, portable.version);
  assert.equal(opencode.version, portable.version);
  assert.equal(claude.name, portable.name);
  assert.equal(claudeMarketplace.plugins[0].name, portable.name);
  assert.equal(claudeMarketplace.plugins[0].source, './plugins/hcmus-course');
  assert.equal(opencode.exports['.'], './src/index.ts');
  assert.equal(opencode.type, 'module');
  const code = await readFile(new URL('src/index.ts', pluginRoot), 'utf8');
  for (const skill of ['setup', 'using-course-cli', 'submitting-course-assignments', 'taking-course-quizzes']) {
    assert.match(code, new RegExp(skill));
  }
  const ui = portable.extensions['com.openai'].interface;
  assert.ok(ui.longDescription);
  assert.ok(ui.websiteURL);
  for (const field of ['composerIcon', 'logo']) {
    await access(new URL(ui[field], pluginRoot));
  }
});
