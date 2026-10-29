import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const scheme = 'coursecli';
const desktopId = 'course-cli-spike-auth.desktop';
const bundleId = 'edu.hcmus.course-cli.protocol-handler';
const registryLabel = 'URL:Course CLI Moodle Login';
type Runner = (command: string, args: string[]) => Promise<{ stdout: string }>;
export interface ProtocolOptions {
  platform?: NodeJS.Platform; home?: string; configHome?: string; dataHome?: string;
  node?: string; entry?: string; configDir?: string; run?: Runner;
}
function defaults(options: ProtocolOptions) {
  const home = options.home ?? homedir();
  return {
    platform: options.platform ?? process.platform, home,
    configHome: options.configHome ?? process.env.XDG_CONFIG_HOME ?? join(home, '.config'),
    dataHome: options.dataHome ?? process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'),
    node: options.node ?? process.execPath,
    entry: options.entry ?? fileURLToPath(new URL('./course.js', import.meta.url)),
    configDir: options.configDir ?? join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'course-cli-spike'),
    run: options.run ?? (async (command, args) => {
      const { stdout } = await execFile(command, args, { encoding: 'utf8', windowsHide: true });
      return { stdout };
    }),
  };
}
function missing(error: unknown) { return (error as NodeJS.ErrnoException)?.code === 'ENOENT'; }
async function query(run: Runner, command: string, args: string[]) {
  try { return (await run(command, args)).stdout.trim(); }
  catch (error) {
    if (missing(error)) throw error;
    return '';
  }
}
function desktopQuote(value: string) {
  return `"${value.replace(/[%\\"`$]/g, character => character === '%' ? '%%' : `\\${character}`)}"`;
}
function removeMimeDefault(contents: string) {
  let inDefaults = false;
  return contents.split(/\r?\n/).filter(line => {
    if (/^\[.*\]$/.test(line)) inDefaults = line === '[Default Applications]';
    return !(inDefaults && line.startsWith(`x-scheme-handler/${scheme}=`));
  }).join('\n').replace(/\n+$/, '\n');
}
function appleString(value: string) { return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }

async function registerWindows(o: ReturnType<typeof defaults>) {
  const key = 'HKCU\\Software\\Classes\\coursecli';
  const current = await query(o.run, 'reg.exe', ['query', `HKCR\\${scheme}`, '/s']);
  if (current && !current.includes(registryLabel)) throw new Error('Đã có ứng dụng khác đăng ký coursecli://; CLI không ghi đè handler hiện tại.');
  await o.run('reg.exe', ['add', key, '/ve', '/d', registryLabel, '/f']);
  await o.run('reg.exe', ['add', key, '/v', 'URL Protocol', '/d', '', '/f']);
  await o.run('reg.exe', ['add', `${key}\\shell\\open\\command`, '/ve', '/d', `"${o.node}" "${o.entry}" auth callback --config-dir "${o.configDir}" "%1"`, '/f']);
}
async function unregisterWindows(o: ReturnType<typeof defaults>) {
  const key = 'HKCU\\Software\\Classes\\coursecli';
  const current = await query(o.run, 'reg.exe', ['query', key, '/s']);
  if (current.includes(registryLabel)) await o.run('reg.exe', ['delete', key, '/f']);
}
async function registerLinux(o: ReturnType<typeof defaults>) {
  const current = await query(o.run, 'xdg-mime', ['query', 'default', `x-scheme-handler/${scheme}`]);
  if (current && current !== desktopId) throw new Error('Đã có ứng dụng khác đăng ký coursecli://; CLI không ghi đè handler hiện tại.');
  const applications = join(o.dataHome, 'applications');
  const desktop = join(applications, desktopId);
  await mkdir(applications, { recursive: true, mode: 0o700 });
  const contents = `[Desktop Entry]\nType=Application\nName=Course CLI Moodle Login\nNoDisplay=true\nTerminal=false\nMimeType=x-scheme-handler/${scheme};\nExec=${desktopQuote(o.node)} ${desktopQuote(o.entry)} auth callback --config-dir ${desktopQuote(o.configDir)} %u\n`;
  await writeFile(desktop, contents, { mode: 0o700 });
  await chmod(desktop, 0o700);
  await o.run('xdg-mime', ['default', desktopId, `x-scheme-handler/${scheme}`]);
}
async function unregisterLinux(o: ReturnType<typeof defaults>) {
  const current = await query(o.run, 'xdg-mime', ['query', 'default', `x-scheme-handler/${scheme}`]);
  if (current !== desktopId) return;
  for (const path of [join(o.configHome, 'mimeapps.list'), join(o.dataHome, 'applications', 'mimeapps.list')]) {
    try { await writeFile(path, removeMimeDefault(await readFile(path, 'utf8')), { mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  await rm(join(o.dataHome, 'applications', desktopId), { force: true });
}
const macHandlers = (output: string) => (output.match(/^        \{[\s\S]*?^    \},/gm) ?? []).filter(block => block.includes(`LSHandlerURLScheme = ${scheme};`));
const macBundle = (o: ReturnType<typeof defaults>) => join(o.home, 'Library', 'Application Support', 'course-cli-spike', 'Course CLI URL Handler.app');
async function macHandlerListing(o: ReturnType<typeof defaults>) {
  return query(o.run, 'defaults', ['read', 'com.apple.LaunchServices/com.apple.launchservices.secure', 'LSHandlers']);
}
async function registerMac(o: ReturnType<typeof defaults>) {
  const listing = macHandlers(await macHandlerListing(o));
  const app = macBundle(o);
  if (listing.length && !listing.some(block => block.includes(bundleId))) {
    throw new Error('Đã có ứng dụng khác đăng ký coursecli://; CLI không ghi đè handler hiện tại.');
  }
  const parent = dirname(app); await mkdir(parent, { recursive: true, mode: 0o700 });
  await rm(app, { recursive: true, force: true });
  const source = join(parent, 'course-cli-url-handler.applescript');
  const script = `on open location this_URL\n  set nodePath to ${appleString(o.node)}\n  set cliPath to ${appleString(o.entry)}\n  set configPath to ${appleString(o.configDir)}\n  set commandLine to quoted form of nodePath & " " & quoted form of cliPath & " auth callback --config-dir " & quoted form of configPath & " " & quoted form of this_URL\n  try\n    do shell script commandLine\n  on error\n    return\n  end try\nend open location\n`;
  await writeFile(source, script, { mode: 0o600 });
  try {
    await o.run('osacompile', ['-o', app, source]);
  } finally { await rm(source, { force: true }); }
  const plist = join(app, 'Contents', 'Info.plist');
  const commands = [
    'Add :CFBundleIdentifier string ' + bundleId,
    'Add :CFBundleURLTypes array',
    'Add :CFBundleURLTypes:0 dict',
    'Add :CFBundleURLTypes:0:CFBundleURLName string Course CLI Moodle Login',
    'Add :CFBundleURLTypes:0:CFBundleURLSchemes array',
    `Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ${scheme}`,
    'Add :LSUIElement bool true',
  ];
  for (const command of commands) await o.run('/usr/libexec/PlistBuddy', ['-c', command, plist]);
  await o.run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app]);
}
async function unregisterMac(o: ReturnType<typeof defaults>) {
  const app = macBundle(o);
  const plist = join(app, 'Contents', 'Info.plist');
  const installedBundleId = await query(o.run, '/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist]);
  if (installedBundleId !== bundleId) return;
  await o.run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-u', app]);
  await rm(app, { recursive: true, force: true });
}

export async function registerProtocolHandler(options: ProtocolOptions = {}) {
  const o = defaults(options);
  if (o.platform === 'win32') return registerWindows(o);
  if (o.platform === 'linux') return registerLinux(o);
  if (o.platform === 'darwin') return registerMac(o);
  throw new Error(`Protocol handler chưa hỗ trợ hệ điều hành ${o.platform}.`);
}
export async function unregisterProtocolHandler(options: ProtocolOptions = {}) {
  const o = defaults(options);
  if (o.platform === 'win32') return unregisterWindows(o);
  if (o.platform === 'linux') return unregisterLinux(o);
  if (o.platform === 'darwin') return unregisterMac(o);
  throw new Error(`Protocol handler chưa hỗ trợ hệ điều hành ${o.platform}.`);
}
export async function openDefaultBrowser(url: string, options: Pick<ProtocolOptions, 'platform' | 'run'> = {}) {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? defaults({}).run;
  if (platform === 'darwin') return run('open', [url]);
  if (platform === 'win32') return run('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
  if (platform === 'linux') return run('xdg-open', [url]);
  throw new Error(`Không biết cách mở trình duyệt mặc định trên ${platform}.`);
}
