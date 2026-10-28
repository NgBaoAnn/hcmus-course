#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { api, decodeAppToken, publicConfig, SITE } from './moodle.mjs';
import { show } from './terminal.mjs';

const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'course-cli-spike');
const authFile = join(configDir, 'auth.json');
const print = (value) => show(value, { json: true });
const launchPath = '/admin/tool/mobile/launch.php';

async function login() {
  const config = await publicConfig();
  if (!config.enablewebservices || !config.enablemobilewebservice) {
    throw new Error('Trường chưa bật Moodle Mobile Web Services.');
  }
  const microsoft = config.identityproviders?.find((provider) => provider.name === 'Microsoft');
  if (!microsoft || new URL(microsoft.url).origin !== SITE) {
    throw new Error('Không tìm thấy cấu hình đăng nhập Microsoft của trường.');
  }
  const passport = randomBytes(32).toString('hex');
  const launch = new URL(launchPath, SITE);
  launch.search = new URLSearchParams({
    service: 'moodle_mobile_app', passport, urlscheme: 'coursecli', confirmed: '1',
    oauthsso: new URL(microsoft.url).searchParams.get('id'),
  });

  const { chromium } = await import('playwright-core');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: false });
  } catch {
    throw new Error('Không mở được Google Chrome. Bản thử cần cài Google Chrome trên máy.');
  }
  try {
    const page = await browser.newPage();
    console.error('Hãy đăng nhập Microsoft trong cửa sổ Chrome vừa mở (tối đa 10 phút).');
    console.error('CLI chỉ nhận token Moodle; không lưu mật khẩu hoặc cookie Microsoft.');
    let href;
    try {
      await page.goto(launch.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction(({ site, path }) =>
        location.origin === site && location.pathname === path && document.querySelector('#launchapp'),
      { site: SITE, path: launchPath }, { timeout: 600_000 });
      href = await page.locator('#launchapp').getAttribute('href');
    } catch {
      throw new Error('Đăng nhập chưa hoàn tất, cửa sổ đã đóng hoặc trường từ chối cấp token. Chạy lại auth login để thử lại.');
    }
    const token = decodeAppToken(href, passport);
    const info = await api(token, 'core_webservice_get_site_info');
    if (!Number.isSafeInteger(info.userid) || info.userid <= 0) {
      throw new Error('API không trả thông tin sinh viên hợp lệ; chưa lưu token.');
    }
    await mkdir(configDir, { recursive: true, mode: 0o700 });
    const temporary = `${authFile}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ token }), { mode: 0o600, flag: 'wx' });
      await rename(temporary, authFile);
    } finally {
      await rm(temporary, { force: true });
    }
    print({ authenticated: true, userid: info.userid, fullname: info.fullname, tokenFile: authFile });
  } finally {
    await browser.close();
  }
}

async function readToken() {
  let token;
  try {
    ({ token } = JSON.parse(await readFile(authFile, 'utf8')));
    if (!/^[a-f0-9]{32}$/.test(token)) throw new Error();
  } catch {
    throw new Error('Chưa có token hợp lệ. Chạy: node course.mjs auth login');
  }
  return token;
}

async function probe() {
  const token = await readToken();
  const info = await api(token, 'core_webservice_get_site_info');
  const names = new Set(info.functions?.map((fn) => fn.name));
  const capabilities = Object.fromEntries([
    'core_enrol_get_users_courses', 'mod_assign_get_assignments',
    'mod_assign_get_submission_status', 'mod_assign_save_submission', 'mod_assign_submit_for_grading',
  ].map((name) => [name, names.has(name)]));
  if (!capabilities.core_enrol_get_users_courses || !capabilities.mod_assign_get_assignments) {
    print({ userid: info.userid, capabilities });
    throw new Error('Token chưa được cấp đủ API để đọc môn học và bài tập.');
  }
  const courses = await api(token, 'core_enrol_get_users_courses', { userid: info.userid });
  if (!Array.isArray(courses)) throw new Error('Danh sách môn học trả về không hợp lệ.');
  // shortcut: probe reads all enrolled courses once, add course selection in the real CLI.
  const params = Object.fromEntries(courses.map((course, index) => [`courseids[${index}]`, course.id]));
  const result = courses.length ? await api(token, 'mod_assign_get_assignments', params) : { courses: [], warnings: [] };
  if (!Array.isArray(result.courses)) throw new Error('Danh sách bài tập trả về không hợp lệ.');
  const assignments = result.courses.flatMap((course) =>
    (course.assignments ?? []).map((assignment) => ({ ...assignment, courseid: course.id })));
  const sample = assignments.find((assignment) => assignment.intro || assignment.introattachments?.length) ?? assignments[0];
  print({
    user: { id: info.userid, fullname: info.fullname },
    capabilities,
    courses: courses.map(({ id, shortname, fullname }) => ({ id, shortname, fullname })),
    assignments: assignments.map(({ id, courseid, name, duedate, cutoffdate }) => ({ id, courseid, name, duedate, cutoffdate })),
    sampleAssignment: sample ? {
      id: sample.id, name: sample.name, introHtml: sample.intro,
      attachments: sample.introattachments?.map(({ filename, filesize }) => ({ filename, filesize })),
      webUrl: `${SITE}/mod/assign/view.php?id=${sample.cmid}`,
    } : null,
    warnings: result.warnings ?? [],
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.join(' ');
  if (command === 'doctor') {
    const config = await publicConfig();
    print({ site: SITE, name: config.sitename, webservices: config.enablewebservices,
      mobileWebservices: config.enablemobilewebservice,
      microsoft: config.identityproviders?.some((provider) => provider.name === 'Microsoft') });
  } else if (command === 'auth login') {
    await login();
  } else if (command === 'auth logout') {
    await rm(authFile, { force: true });
    console.log('Đã xóa token trên máy. Token phía Moodle chưa bị thu hồi.');
  } else if (command === 'probe') {
    await probe();
  } else {
    if (command && command !== '--help') throw new Error(`Lệnh không hợp lệ: ${command}`);
    console.log('Bản thử chỉ đọc dữ liệu:\n  course doctor\n  course auth login\n  course probe\n  course auth logout');
  }
}

main().catch((error) => {
  console.error(error.code ? `Lỗi hệ thống: ${error.code}` : error.message);
  process.exitCode = 1;
});
