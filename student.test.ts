import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCourses, viewCourse, deadlines, grades, notices } from './student.js';

const token = 'a'.repeat(32);
const now = Math.floor(Date.now() / 1000);
const day = 86400;
type FixtureResponse = Record<string, unknown> | unknown[];
type FixtureHandler = FixtureResponse | ((params: URLSearchParams) => FixtureResponse | Promise<FixtureResponse>);
function fixture(t: TestContext, handlers: Record<string, FixtureHandler> = {}) {
  const calls: { method: string; params: Record<string, string> }[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
    assert.ok(options?.body instanceof URLSearchParams);
    const body = options.body;
    const method = body.get('wsfunction');
    assert.ok(method);
    calls.push({ method, params: Object.fromEntries(body) });
    assert.doesNotMatch(method, /start|save|submit|process|view_forum/);
    assert.notEqual(method, 'mod_quiz_get_attempt_access_information', 'Deadline reads must not process attempt expiry.');
    const defaults: Record<string, FixtureHandler> = {
      core_webservice_get_site_info: { userid: 7 },
      core_enrol_get_users_courses: [{ id: 12, fullname: 'Algorithms', shortname: 'ALG' }],
      mod_assign_get_assignments: { courses: [], warnings: [] },
      mod_quiz_get_quizzes_by_courses: { quizzes: [], warnings: [] },
    };
    assert.ok(method in handlers || method in defaults, `Unexpected API: ${method}`);
    const value = handlers[method] ?? defaults[method];
    return new Response(JSON.stringify(typeof value === 'function' ? await value(body) : value));
  });
  return calls;
}

test('lists enrolled courses for the authenticated student, including empty enrollment', async (t) => {
  let empty = false;
  const calls = fixture(t, { core_enrol_get_users_courses: () => empty ? [] : [{ id: 12, fullname: 'Algorithms' }] });
  assert.equal((await listCourses(token)).courses[0].id, 12);
  assert.equal(calls[1].params.userid, '7');
  empty = true;
  assert.deepEqual((await listCourses(token)).courses, []);
});

test('course view retains sections, activities, resources and website links', async (t) => {
  fixture(t, { core_course_get_contents: [{ id: 1, name: 'Week 1', summary: '<p>Read this</p>',
    modules: [{ id: 9, name: 'Notes', modname: 'resource', url: 'https://courses.fit.hcmus.edu.vn/mod/resource/view.php?id=9', contents: [{ filename: 'notes.pdf' }] }] }] });
  const result = await viewCourse(token, 12);
  assert.equal(result.sections[0].summaryText, 'Read this');
  assert.equal(result.sections[0].modules[0].contents?.[0].filename, 'notes.pdf');
  assert.match(result.webUrl, /course\/view.php\?id=12$/);
});

test('deadlines use individual/group extensions, distinguish cutoff, and exclude submitted overdue work', async (t) => {
  fixture(t, {
    mod_assign_get_assignments: { courses: [{ id: 12, assignments: [
      { id: 1, name: 'Extended', duedate: now - day, cutoffdate: now + day * 4, cmid: 91 },
      { id: 2, name: 'Late', duedate: now - day },
      { id: 3, name: 'Submitted', duedate: now - day },
      { id: 4, name: 'No date', duedate: 0 },
      { id: 5, name: 'Group extended', duedate: now - day },
    ] }], warnings: [] },
    mod_assign_get_submission_status: (p) => ({ lastattempt: {
      extensionduedate: ['1', '5'].includes(p.get('assignid') ?? '') ? now + day * 2 : 0,
      submission: { status: p.get('assignid') === '3' ? 'submitted' : 'draft' },
      ...(p.get('assignid') === '5' ? { teamsubmission: { status: 'draft' }, submissiongroup: 30 } : {}),
    }, warnings: [] }),
  });
  const result = await deadlines(token, { courseId: 12, overdue: true });
  assert.deepEqual(result.deadlines.map((d) => d.id), [2, 1, 5]);
  const extended = result.deadlines.find((d) => d.id === 1);
  assert.ok(extended);
  assert.equal(extended.due, now + day * 2);
  assert.equal(extended.cutoff, now + day * 4);
  assert.match(extended.dueLocal ?? '', /Asia\/Ho_Chi_Minh/);
  assert.equal(result.deadlines[0].overdue, true);
});

test('deadline window defaults to 14 days and retains quiz close dates without processing attempts', async (t) => {
  const calls = fixture(t, {
    mod_quiz_get_quizzes_by_courses: { quizzes: [{ id: 20, course: 12, name: 'Quiz', timeclose: now + day * 20, attempts: 3 }] },
    mod_quiz_get_user_attempts: { attempts: [{ id: 21, state: 'inprogress', attempt: 1 }], warnings: [] },
  });
  const result = await deadlines(token, { courseId: 12 });
  assert.equal(result.deadlines.length, 0);
  assert.equal(result.warnings[0]?.item, 'quiz-attempt');
  assert.equal(result.warnings[0]?.itemid, 21);
  assert.match(result.warnings[0]?.message ?? '', /hạn chính xác.*chưa xác định/);
  const wider = await deadlines(token, { courseId: 12, days: 30 });
  const closing = wider.deadlines.find((d) => d.type === 'quiz');
  assert.ok(closing);
  assert.equal(closing.due, now + day * 20);
  assert.equal(closing.attemptsRemaining, 2);
  assert.equal(closing.state, 'inprogress');
  assert.equal(closing.deadlineComplete, false);
  assert.ok(calls.every((call) => call.method !== 'mod_quiz_get_attempt_access_information'));
});

test('deadlines never query attempt access, including possibly expired and overdue attempts', async (t) => {
  for (const [label, state, started] of [
    ['running', 'inprogress', now],
    ['possibly expired', 'inprogress', now - day],
    ['overdue', 'overdue', now - day],
  ] as const) {
    await t.test(label, async (t) => {
      const calls = fixture(t, {
        mod_quiz_get_quizzes_by_courses: { quizzes: [{ id: 20, course: 12, name: 'Quiz', timeclose: now - 60, timelimit: 60 }] },
        mod_quiz_get_user_attempts: { attempts: [{ id: 21, state, attempt: 1, timestart: started }], warnings: [] },
      });
      const result = await deadlines(token, { courseId: 12, overdue: true });
      assert.ok(calls.every((call) => call.method !== 'mod_quiz_get_attempt_access_information'));
      assert.equal(result.deadlines.some((deadline) => deadline.type === 'quiz-attempt'), false);
      assert.equal(result.deadlines[0]?.state, state);
      assert.equal(result.deadlines[0]?.deadlineComplete, false);
      assert.ok(result.warnings.some((warning) => warning.item === 'quiz-attempt' && warning.itemid === 21 &&
        /hạn chính xác.*chưa xác định/.test(warning.message)));
    });
  }
});

test('deadlines preserve partial warnings and flag unknown submission status', async (t) => {
  fixture(t, {
    mod_assign_get_assignments: { courses: [{ id: 12, assignments: [{ id: 1, name: 'Unknown', duedate: now + day }] }],
      warnings: [{ item: 'course', itemid: 13, warningcode: '1', message: 'No permission' }] },
    mod_assign_get_submission_status: { exception: 'moodle_exception', errorcode: 'nopermissions' },
    mod_quiz_get_quizzes_by_courses: { exception: 'moodle_exception', errorcode: 'nopermissions' },
  });
  const result = await deadlines(token, { courseId: 12 });
  assert.equal(result.deadlines[0].state, 'unknown');
  assert.equal(result.deadlines[0].deadlineComplete, false);
  assert.equal(result.warnings.length, 3);
});

test('grades retain Moodle hidden/ungraded/formatted values without recomputing', async (t) => {
  const items = [{ itemname: 'Essay', gradehiddenbydate: true, graderaw: null, gradeformatted: '-', rangeformatted: '0–10' },
    { itemname: 'Total', gradeformatted: '8,50', graderaw: 8.5 }];
  const calls = fixture(t, { gradereport_user_get_grade_items: { usergrades: [{ userid: 7, gradeitems: items }], warnings: [] } });
  const result = await grades(token, 12);
  assert.deepEqual(result.usergrades?.[0].gradeitems, items);
  assert.equal(calls.at(-1)?.params.userid, '7');
});

test('notices read only news forums and paginate announcement bodies and links', async (t) => {
  const calls = fixture(t, {
    mod_forum_get_forums_by_courses: [{ id: 5, type: 'news', name: 'Announcements' }, { id: 6, type: 'general' }],
    mod_forum_get_forum_discussions: (p) => ({ discussions: p.get('page') === '0'
      ? Array.from({ length: 50 }, (_, i) => ({ id: i + 100, discussion: i + 200, subject: `Notice ${i}`, message: '<p>Hello</p>' }))
      : [{ id: 150, discussion: 250, subject: 'Last', message: '<p>Bye</p>' }], warnings: [] }),
  });
  const result = await notices(token, 12);
  assert.equal(result.notices.length, 51);
  assert.equal(result.notices[0].messageText, 'Hello');
  assert.match(result.notices[0].webUrl, /discuss.php\?d=200/);
  assert.equal(calls.filter((c) => c.method === 'mod_forum_get_forum_discussions').length, 2);
});

test('empty deadlines and notices are explicit empty lists', async (t) => {
  fixture(t, { mod_forum_get_forums_by_courses: [] });
  assert.deepEqual((await deadlines(token, { courseId: 12 })).deadlines, []);
  assert.deepEqual((await notices(token, 12)).notices, []);
});

test('invalid IDs and day windows fail before any request', async (t) => {
  const calls = fixture(t);
  await assert.rejects(deadlines(token, { courseId: 12, days: 0 }), /nguyên dương/);
  await assert.rejects(viewCourse(token, -1), /ID/);
  await assert.rejects(grades(token, '1e2'), /ID/);
  await assert.rejects(notices(token, undefined), /ID/);
  assert.equal(calls.length, 0);
});

test('student CLI validates arguments and supports JSON and readable output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'course-student-'));
  try {
    await mkdir(join(directory, 'course-cli-spike'));
    await writeFile(join(directory, 'course-cli-spike', 'auth.json'), JSON.stringify({ token }));
    const preload = join(directory, 'fixture.js');
    await writeFile(preload, `globalThis.fetch = async (_url, {body}) => new Response(JSON.stringify(
      body.get('wsfunction') === 'core_webservice_get_site_info' ? {userid: 7} : [{id: 12, fullname: 'Algorithms'}]));`);
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', preload, 'course.js', ...args], {
      cwd: import.meta.dirname, env: { ...process.env, XDG_CONFIG_HOME: directory }, encoding: 'utf8',
    });
    const json = run('list', '--json');
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).courses[0].id, 12);
    assert.ok(!json.stdout.includes(token));
    const readable = run('list');
    assert.equal(readable.status, 0, readable.stderr);
    assert.match(readable.stdout, /12.*Algorithms/);
    assert.throws(() => JSON.parse(readable.stdout));
    for (const args of [['view', '0'], ['grades'], ['deadlines', '--days', '0'], ['list', '--course', '12'], ['view', '12', '13']]) {
      const invalid = run(...args);
      assert.equal(invalid.status, 1, `${args}: ${invalid.stdout}`);
      assert.ok(invalid.stderr.length > 0);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
