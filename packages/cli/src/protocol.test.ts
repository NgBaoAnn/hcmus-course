import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { openDefaultBrowser, registerProtocolHandler, unregisterProtocolHandler } from './protocol.js';

test('default browser opens through the operating system URL launcher', async () => {
  const calls: [string, string[]][] = [];
  await openDefaultBrowser('https://courses.fit.hcmus.edu.vn/login', {
    platform: 'linux', run: async (command, args) => { calls.push([command, args]); return { stdout: '' }; },
  });
  assert.deepEqual(calls, [['xdg-open', ['https://courses.fit.hcmus.edu.vn/login']]]);
});

test('Linux handler passes URLs as desktop-entry arguments and logout removes only its registration', async t => {
  const home = await mkdtemp(join(tmpdir(), 'course-cli-protocol-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const dataHome = join(home, 'data'); const configHome = join(home, 'config');
  const configDir = join(home, 'course-cli-config');
  const mimeapps = join(configHome, 'mimeapps.list');
  await mkdir(join(dataHome, 'applications'), { recursive: true }); await mkdir(configHome);
  await writeFile(mimeapps, '[Default Applications]\nx-scheme-handler/coursecli=course-cli-spike-auth.desktop;\ntext/plain=editor.desktop;\n\n[Added Associations]\nx-scheme-handler/coursecli=course-cli-spike-auth.desktop;\n');
  await writeFile(join(dataHome, 'applications', 'course-cli-spike-auth.desktop'), 'existing registration');
  const run = async (command: string, args: string[]) => ({ stdout: command === 'xdg-mime' && args[0] === 'query' ? 'course-cli-spike-auth.desktop' : '' });
  await unregisterProtocolHandler({ platform: 'linux', home, configHome, dataHome, run });
  const updated = await readFile(mimeapps, 'utf8');
  assert.doesNotMatch(updated.split('[Added Associations]')[0], /x-scheme-handler\/coursecli=course-cli-spike-auth\.desktop/);
  assert.match(updated, /text\/plain=editor\.desktop/);
  assert.match(updated, /\[Added Associations\]\nx-scheme-handler\/coursecli=course-cli-spike-auth\.desktop/);
  await assert.rejects(stat(join(dataHome, 'applications', 'course-cli-spike-auth.desktop')));

  await registerProtocolHandler({ platform: 'linux', home, configHome, dataHome, configDir, node: '/node with spaces/node', entry: '/cli with spaces/course.js',
    run: async () => ({ stdout: '' }) });
  const desktop = await readFile(join(dataHome, 'applications', 'course-cli-spike-auth.desktop'), 'utf8');
  assert.ok(desktop.includes(`auth callback --config-dir "${configDir}" %u`));
  assert.equal((await stat(join(dataHome, 'applications', 'course-cli-spike-auth.desktop'))).mode & 0o777, 0o700);
});

test('Windows handler is registered only in the current-user hive without invoking a shell', async () => {
  const calls: [string, string[]][] = [];
  await registerProtocolHandler({ platform: 'win32', node: 'C:\\Program Files\\node\\node.exe', entry: 'C:\\Users\\student\\cli\\course.js', configDir: 'C:\\Users\\student\\AppData\\Roaming\\course-cli',
    run: async (command, args) => { calls.push([command, args]); return { stdout: '' }; } });
  assert.deepEqual(calls[0], ['reg.exe', ['query', 'HKCR\\coursecli', '/s']]);
  assert.ok(calls.some(([command, args]) => command === 'reg.exe' && args.includes('HKCU\\Software\\Classes\\coursecli')));
  assert.ok(calls.some(([, args]) => args.includes('"C:\\Program Files\\node\\node.exe" "C:\\Users\\student\\cli\\course.js" auth callback --config-dir "C:\\Users\\student\\AppData\\Roaming\\course-cli" "%1"')));
});

test('existing handlers are not replaced', async t => {
  const home = await mkdtemp(join(tmpdir(), 'course-cli-protocol-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  await assert.rejects(registerProtocolHandler({ platform: 'linux', home, dataHome: join(home, 'data'),
    run: async () => ({ stdout: 'another-app.desktop' }) }), /không ghi đè/);
  await assert.rejects(stat(join(home, 'data', 'applications', 'course-cli-spike-auth.desktop')));
});
