import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const token = 'a'.repeat(32);
async function cliWithDirectory(directory: string, args: string[], preload: string) {
  try {
    return { ...await run(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`,
      new URL('./course.js', import.meta.url).pathname, ...args],
    { env: { ...process.env, XDG_CONFIG_HOME: directory } }), code: 0 };
  } catch (error) {
    const result = error as Error & { stdout: string; stderr: string; code: number };
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  }
}
async function cli(t: TestContext, args: string[], responses: Record<string, unknown> = {}, authenticated = false) {
  const directory = await mkdtemp(join(tmpdir(), 'course-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  if (authenticated) {
    await mkdir(join(directory, 'course-cli-spike'));
    await writeFile(join(directory, 'course-cli-spike', 'auth.json'), JSON.stringify({ token }), { mode: 0o600 });
  }
  // Only the external network is replaced: argument parsing, token IO and all modules run normally.
  const preload = `const responses = ${JSON.stringify(responses)};
    globalThis.fetch = async (_url, options) => {
      const name = options?.body instanceof URLSearchParams ? options.body.get('wsfunction') : 'publicConfig';
      if (!(name in responses)) { console.error('UNEXPECTED_API:' + name); throw new Error('Unexpected API'); }
      return new Response(JSON.stringify(responses[name]), { headers: { date: 'Thu, 29 Oct 2026 00:00:00 GMT' } });
    };`;
  try {
    const result = await run(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`,
      new URL('./course.js', import.meta.url).pathname, ...args], { env: { ...process.env, XDG_CONFIG_HOME: directory } });
    return { ...result, code: 0 };
  } catch (error) {
    const result = error as Error & { stdout: string; stderr: string; code: number };
    return { stdout: result.stdout, stderr: result.stderr, code: result.code };
  }
}
const user = { userid: 7, fullname: 'Fixture Student' };
const courses = [{ id: 12, fullname: 'Algorithms' }];
const assignment = { id: 4, cmid: 40, name: 'Essay', duedate: 1793332800, cutoffdate: 0,
  allowsubmissionsfromdate: 0, submissiondrafts: 1, teamsubmission: 0, timelimit: 0,
  configs: [{ plugin: 'custom', subtype: 'assignsubmission', name: 'enabled', value: '1' }] };
const quiz = { id: 6, course: 12, coursemodule: 60, name: 'Quiz', preferredbehaviour: 'deferredfeedback',
  navmethod: 'free', overduehandling: 'autosubmit', browsersecurity: '-', hasquestions: 1 };
const access = { canattempt: true, activerulenames: [], accessrules: [], preventaccessreasons: [], warnings: [] };

// A missing router branch breaks these without relying on a user's saved credentials.
test('CLI help includes auth status and every command group without reading auth', async t => {
  for (const args of [[], ['--help']]) {
    const result = await cli(t, args);
    assert.equal(result.code, 0); assert.equal(result.stderr, '');
    for (const text of ['auth status', 'assignment submit', 'quiz resume', 'deadlines', 'grades', 'notices']) assert.ok(result.stdout.includes(text), text);
  }
});
test('CLI auth status verifies the saved token without returning credentials', async t => {
  const result = await cli(t, ['auth', 'status'], { core_webservice_get_site_info: user }, true);
  assert.equal(result.code, 0); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { authenticated: true, userid: 7, fullname: 'Fixture Student' });
  assert.ok(!result.stdout.includes(token));
});

test('human assignment lists use readable cards and local dates instead of Unix timestamps', async t => {
  const result = await cli(t, ['assignment', 'list'], {
    core_webservice_get_site_info: user,
    core_enrol_get_users_courses: courses,
    mod_assign_get_assignments: { courses: [{ id: 12, fullname: 'Algorithms', assignments: [assignment] }], warnings: [] },
  }, true);
  assert.equal(result.code, 0); assert.equal(result.stderr, '');
  assert.match(result.stdout, /Bài tập/);
  assert.match(result.stdout, /Essay/);
  assert.match(result.stdout, /Algorithms \(12\)/);
  assert.match(result.stdout, /Hạn: 30\/10\/2026 11:00/);
  assert.doesNotMatch(result.stdout, /1793332800|\t/);
});

test('human quiz reviews retain question slots, answers, and the Moodle review link', async t => {
  const attempt = { id: 8, quiz: 6, userid: 7, uniqueid: 91, attempt: 1, state: 'finished', currentpage: 0,
    timestart: 1793232000, timemodified: 1793232100, timefinish: 1793232200 };
  const result = await cli(t, ['quiz', 'review', '8'], {
    mod_quiz_get_quizzes_by_courses: { quizzes: [quiz], warnings: [] },
    mod_quiz_get_user_attempts: { attempts: [attempt], warnings: [] },
    mod_quiz_get_attempt_review: { attempt, questions: [{ slot: 1, html: '<p>Prompt</p>', response: 'A', rightanswer: 'B', status: 'incorrect' }], grade: '5/10', warnings: [] },
  }, true);
  assert.equal(result.code, 0); assert.equal(result.stderr, '');
  assert.match(result.stdout, /Câu 1/);
  assert.match(result.stdout, /Trạng thái: Chưa đúng/);
  assert.match(result.stdout, /response: A/);
  assert.match(result.stdout, /rightanswer: B/);
  assert.match(result.stdout, /review\.php\?attempt=8/);
});

test('human quiz attempt lists retain the Moodle link', async t => {
  const result = await cli(t, ['quiz', 'attempts', '6'], {
    mod_quiz_get_quizzes_by_courses: { quizzes: [quiz], warnings: [] },
    mod_quiz_get_user_attempts: { attempts: [{ id: 8, quiz: 6, userid: 7, uniqueid: 91, attempt: 1,
      state: 'inprogress', currentpage: 0, timestart: 1793232000, timemodified: 1793232100, timefinish: 0 }], warnings: [] },
  }, true);
  assert.equal(result.code, 0); assert.equal(result.stderr, '');
  assert.match(result.stdout, /Lượt #8 · Đang làm/);
  assert.match(result.stdout, /mod\/quiz\/view\.php\?id=60/);
});

test('auth callback verifies the one-time passport and Moodle identity before saving the token', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'course-cli-callback-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = join(directory, 'course-cli-spike'); await mkdir(config);
  const loginId = 'b'.repeat(32); const passport = 'c'.repeat(64); const callbackToken = 'd'.repeat(32);
  await writeFile(join(config, 'pending-login.json'), JSON.stringify({ loginId, passport, expiresAt: Date.now() + 60_000 }), { mode: 0o600 });
  const siteId = createHash('md5').update('https://courses.fit.hcmus.edu.vn' + passport).digest('hex');
  const callback = `coursecli://token=${Buffer.from(`${siteId}:::${callbackToken}`).toString('base64')}`;
  const preload = `globalThis.fetch = async (_url, options) => {
    const name = options?.body instanceof URLSearchParams ? options.body.get('wsfunction') : '';
    if (name !== 'core_webservice_get_site_info') throw new Error('Unexpected API: ' + name);
    return new Response(JSON.stringify({ userid: 7, fullname: 'Fixture Student' }));
  };`;
  const result = await run(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`,
    new URL('./course.js', import.meta.url).pathname, 'auth', 'callback', '--config-dir', config, callback]);
  assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(await readFile(join(config, 'auth.json'), 'utf8')), { token: callbackToken });
  assert.equal((await stat(join(config, 'auth.json'))).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(join(config, `login-${loginId}.json`), 'utf8')),
    { authenticated: true, userid: 7, fullname: 'Fixture Student' });
  await assert.rejects(readFile(join(config, 'pending-login.json')));
  const replay = await cliWithDirectory(directory, ['auth', 'callback', '--config-dir', config, callback],
    `globalThis.fetch = async () => { console.error('UNEXPECTED_API'); throw new Error('Unexpected API'); };`);
  assert.equal(replay.code, 1); assert.match(replay.stderr, /không có lần đăng nhập|callback đã được dùng/i);
  assert.doesNotMatch(replay.stderr, /UNEXPECTED_API/);
  assert.deepEqual(JSON.parse(await readFile(join(config, 'auth.json'), 'utf8')), { token: callbackToken });
});

test('auth callback with another login passport never calls Moodle or replaces saved credentials', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'course-cli-callback-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = join(directory, 'course-cli-spike'); await mkdir(config);
  const previousToken = 'e'.repeat(32); const loginId = 'b'.repeat(32); const passport = 'c'.repeat(64);
  await writeFile(join(config, 'auth.json'), JSON.stringify({ token: previousToken }), { mode: 0o600 });
  await writeFile(join(config, 'pending-login.json'), JSON.stringify({ loginId, passport, expiresAt: Date.now() + 60_000 }), { mode: 0o600 });
  const wrongSiteId = createHash('md5').update('https://courses.fit.hcmus.edu.vn' + 'f'.repeat(64)).digest('hex');
  const callback = `coursecli://token=${Buffer.from(`${wrongSiteId}:::${'d'.repeat(32)}`).toString('base64')}`;
  const preload = `globalThis.fetch = async () => { console.error('UNEXPECTED_API'); throw new Error('Unexpected API'); };`;
  const result = await cliWithDirectory(directory, ['auth', 'callback', '--config-dir', config, callback], preload);
  assert.equal(result.code, 1); assert.match(result.stderr, /không hợp lệ|lần đăng nhập khác/);
  assert.doesNotMatch(result.stderr, /UNEXPECTED_API/);
  assert.deepEqual(JSON.parse(await readFile(join(config, 'auth.json'), 'utf8')), { token: previousToken });
  assert.equal((await readFile(join(config, 'pending-login.json'), 'utf8')).includes(passport), true);
});
test('CLI rejects invalid IDs, missing/extra arguments and unsafe flags before reading auth', async t => {
  for (const args of [
    ['view', '0'], ['view', '12', 'extra'], ['grades'], ['deadlines', '--days', '0'],
    ['assignment', 'view', '4x'], ['assignment', 'list', '--course', '-1'], ['assignment', 'status'],
    ['assignment', 'submit', '4', '--yes'], ['assignment', 'submit', '4', '--json'],
    ['quiz', 'start', '6', '--json'], ['quiz', 'resume', '0'], ['quiz', 'view', '6', 'extra'], ['unknown'],
  ]) {
    const result = await cli(t, args);
    assert.equal(result.code, 1, args.join(' ')); assert.equal(result.stdout, '');
    assert.ok(result.stderr); assert.doesNotMatch(result.stderr, /Chưa có token|UNEXPECTED_API/);
  }
});
test('CLI missing auth errors are stderr-only and never contact Moodle', async t => {
  for (const args of [['list', '--json'], ['auth', 'status'], ['assignment', 'status', '4'], ['quiz', 'attempts', '6']]) {
    const result = await cli(t, args);
    assert.equal(result.code, 1); assert.equal(result.stdout, '');
    assert.match(result.stderr, /course auth login/); assert.doesNotMatch(result.stderr, /UNEXPECTED_API/);
  }
});
test('CLI JSON retains IDs, timestamps and structured warnings while diagnostics use stderr', async t => {
  const warning = { warningcode: 'partial', message: 'Incomplete fixture data' };
  const result = await cli(t, ['assignment', 'list', '--course', '12', '--json'], {
    mod_assign_get_assignments: { courses: [{ id: 12, assignments: [assignment] }], warnings: [warning] },
  }, true);
  assert.equal(result.code, 0); assert.match(result.stderr, /Incomplete fixture data/);
  const data = JSON.parse(result.stdout);
  assert.equal(data.assignments[0].id, 4); assert.equal(data.assignments[0].duedate, 1793332800);
  assert.equal(data.assignments[0].webUrl, 'https://courses.fit.hcmus.edu.vn/mod/assign/view.php?id=40');
  assert.deepEqual(data.warnings, [warning]); assert.ok(!result.stdout.includes(token));
});
test('CLI reports Moodle grade denial on stderr without fabricating grades', async t => {
  const result = await cli(t, ['grades', '--course', '12', '--json'], {
    core_webservice_get_site_info: user,
    gradereport_user_get_grade_items: { exception: 'moodle_exception', errorcode: 'nopermissiontoviewgrades', message: token },
  }, true);
  assert.equal(result.code, 1); assert.equal(result.stdout, '');
  assert.match(result.stderr, /nopermissiontoviewgrades/); assert.ok(!result.stderr.includes(token));
});
test('CLI unsupported assignment plugin and timed assignment fail before upload', async t => {
  for (const a of [assignment, { ...assignment, timelimit: 60,
    configs: [{ plugin: 'file', subtype: 'assignsubmission', name: 'enabled', value: '1' }] }]) {
    const result = await cli(t, ['assignment', 'submit', '4', 'not-read.txt'], {
      core_webservice_get_site_info: user, core_enrol_get_users_courses: courses,
      mod_assign_get_assignments: { courses: [{ id: 12, assignments: [a] }], warnings: [] },
      mod_assign_get_submission_status: { lastattempt: { submissionsenabled: true, locked: false, canedit: true, caneditowner: true }, warnings: [] },
    }, true);
    assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /chưa hỗ trợ/);
    assert.match(result.stderr, /view.php\?id=40/); assert.doesNotMatch(result.stderr, /UNEXPECTED_API/);
  }
});
test('CLI rejects unsupported quiz behaviour and essay start without consuming an attempt', async t => {
  for (const q of [quiz, { ...quiz, preferredbehaviour: 'adaptive' }]) {
    const result = await cli(t, ['quiz', 'start', '6'], {
      mod_quiz_get_quizzes_by_courses: { quizzes: [q], warnings: [] }, mod_quiz_get_quiz_access_information: access,
      mod_quiz_get_quiz_required_qtypes: { questiontypes: ['essay'], warnings: [] },
    }, true);
    assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /chưa hỗ trợ/);
    assert.match(result.stderr, /view.php\?id=60/); assert.doesNotMatch(result.stderr, /UNEXPECTED_API/);
  }
});
test('CLI read-only quiz status preserves unknown timing and never calls expiry-sensitive APIs', async t => {
  const result = await cli(t, ['quiz', 'status', '8', '--json'], {
    mod_quiz_get_quizzes_by_courses: { quizzes: [quiz], warnings: [] },
    mod_quiz_get_user_attempts: { attempts: [{ id: 8, quiz: 6, state: 'inprogress' }], warnings: [] },
  }, true);
  assert.equal(result.code, 0); assert.match(result.stderr, /endtime/); assert.doesNotMatch(result.stderr, /UNEXPECTED_API/);
  const data = JSON.parse(result.stdout);
  assert.equal(data.attempt.id, 8); assert.equal(data.endtime, null); assert.equal(data.answeredQuestions, null);
});
