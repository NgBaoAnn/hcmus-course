import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, writeFile, readFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listAssignments, viewAssignment, assignmentStatus, downloadAssignment, submitAssignment } from './assignments.js';

const token = 'a'.repeat(32);
const site = 'https://courses.fit.hcmus.edu.vn';
const config = (plugin: string, name: string, value: string) => ({ plugin, subtype: 'assignsubmission', name, value });
function assignment() {
  return { id: 4, cmid: 40, name: 'Essay', intro: '<p>Write carefully</p>', duedate: 0, cutoffdate: 0,
    allowsubmissionsfromdate: 0, submissiondrafts: 1, teamsubmission: 0, requireallteammemberssubmit: 0,
    requiresubmissionstatement: 0, timelimit: 0, introattachments: [] as { filename: string; filesize: number; fileurl: string }[],
    configs: [config('file', 'enabled', '1'), config('file', 'maxfilesubmissions', '2'),
      config('file', 'maxsubmissionsizebytes', '100'), config('file', 'filetypeslist', '.txt'), config('onlinetext', 'enabled', '1')] };
}
function status() {
  return { lastattempt: { submissionsenabled: true, locked: false, canedit: true, caneditowner: true, cansubmit: true,
    extensionduedate: 0 as number | null, usergroups: [8], submissiongroup: 8, submissiongroupmemberswhoneedtosubmit: [7, 9],
    submission: { id: 14, userid: 7, attemptnumber: 0, status: 'draft', timemodified: 1, plugins: [
      { type: 'file', fileareas: [{ area: 'submission_files', files: [{ filename: 'old.txt', filesize: 3, fileurl: site + '/webservice/pluginfile.php/old' }] }] },
      { type: 'onlinetext', editorfields: [{ name: 'onlinetext', text: 'Keep me', format: 2 }], fileareas: [] },
    ] } }, warnings: [] as { warningcode: string; message: string }[] };
}
async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'course-assign-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'new.txt');
  await writeFile(file, 'hello');
  const a = assignment();
  let s = status();
  const calls: { name: string; body: URLSearchParams | FormData }[] = [];
  const hooks: Record<string, () => unknown | Promise<unknown>> = {};
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    const body = options?.body;
    assert.ok(body instanceof URLSearchParams || body instanceof FormData);
    const name = body instanceof FormData ? 'upload' : body.get('wsfunction')!;
    calls.push({ name, body });
    assert.equal(options?.redirect, 'error');
    assert.ok(!String(url).includes(token));
    if (hooks[name]) return new Response(JSON.stringify(await hooks[name]()));
    let response: unknown;
    switch (name) {
      case 'core_webservice_get_site_info': response = { userid: 7, fullname: 'Student' }; break;
      case 'core_enrol_get_users_courses': response = [{ id: 12, fullname: 'Algorithms' }]; break;
      case 'mod_assign_get_assignments': response = { courses: [{ id: 12, fullname: 'Algorithms', assignments: [a] }], warnings: [] }; break;
      case 'mod_assign_get_submission_status': response = s; break;
      case 'upload': response = [{ itemid: 81, filename: (body.get('file_1') as File).name, filesize: (body.get('file_1') as File).size }]; break;
      case 'mod_assign_save_submission': {
        if (body.has('plugindata[files_filemanager]')) s.lastattempt.submission.plugins[0].fileareas![0].files = [{ filename: 'new.txt', filesize: 5, fileurl: site + '/webservice/pluginfile.php/new' }];
        if (body.has('plugindata[onlinetext_editor][text]')) s.lastattempt.submission.plugins[1].editorfields![0] = {
          name: 'onlinetext', text: String(body.get('plugindata[onlinetext_editor][text]')), format: Number(body.get('plugindata[onlinetext_editor][format]')) };
        s.lastattempt.submission.status = a.submissiondrafts ? 'draft' : 'submitted';
        s.lastattempt.submission.timemodified++;
        response = []; break;
      }
      case 'mod_assign_submit_for_grading': s.lastattempt.submission.status = 'submitted'; response = []; break;
      default: throw new Error('Unexpected ' + name);
    }
    return new Response(JSON.stringify(response));
  });
  return { directory, file, a, get s() { return s; }, set s(value) { s = value; }, calls, hooks };
}
const writes = (f: Awaited<ReturnType<typeof setup>>) => f.calls.filter(c => /upload|save|submit_for/.test(c.name));

test('assignment reads use assignment IDs, preserve warnings, and do not write', async t => {
  const f = await setup(t);
  assert.equal((await listAssignments(token, 12)).assignments[0].courseid, 12);
  const view = await viewAssignment(token, 4);
  assert.equal(view.introText, 'Write carefully');
  assert.equal(view.webUrl, site + '/mod/assign/view.php?id=40');
  assert.equal((await assignmentStatus(token, 4)).lastattempt?.submission?.status, 'draft');
  f.s.warnings.push({ warningcode: 'incomplete', message: 'Unavailable' });
  assert.equal((await assignmentStatus(token, 4)).warnings.length, 1);
  assert.equal(writes(f).length, 0);
});

test('refusal and EOF cancel before any upload', async t => {
  const f = await setup(t);
  await assert.rejects(submitAssignment(token, 4, { files: [f.file], confirm: async () => false }), /hủy/);
  await assert.rejects(submitAssignment(token, 4, { files: [f.file], confirm: async () => { throw new Error('EOF'); } }), /hủy/);
  assert.equal(writes(f).length, 0);
});

test('replacement preview and file upload/save/verify/finalize/verify preserve text', async t => {
  const f = await setup(t);
  const result = await submitAssignment(token, 4, { files: [f.file], confirm: async preview => {
    assert.match(preview, /old.txt/); assert.match(preview, /new.txt/); assert.match(preview, /Algorithms/); return true;
  } });
  assert.equal(result.state, 'submitted');
  const write = f.calls.find(c => c.name === 'mod_assign_save_submission')!.body;
  assert.equal(write.get('plugindata[files_filemanager]'), '81');
  assert.equal(write.get('plugindata[onlinetext_editor][text]'), 'Keep me');
  assert.equal(write.get('plugindata[onlinetext_editor][format]'), '2');
  const names = f.calls.map(c => c.name);
  const save = names.indexOf('mod_assign_save_submission');
  const finalize = names.indexOf('mod_assign_submit_for_grading');
  assert.ok(names.indexOf('upload') < save);
  assert.ok(names.slice(save + 1, finalize).includes('mod_assign_get_submission_status'));
  assert.equal(names.at(-1), 'mod_assign_get_submission_status');
});

test('text-only save preserves existing files and sends literal plain text', async t => {
  const f = await setup(t);
  await writeFile(f.file, '<b>literal</b>');
  const result = await submitAssignment(token, 4, { textFile: f.file, draft: true, confirm: async () => true });
  assert.equal(result.state, 'saved');
  const body = writes(f)[0].body;
  assert.equal(body.has('plugindata[files_filemanager]'), false);
  assert.equal(body.get('plugindata[onlinetext_editor][text]'), '<b>literal</b>');
  assert.equal(body.get('plugindata[onlinetext_editor][format]'), '2');
  assert.equal(writes(f).length, 1);
});

test('unsafe configurations and local files are rejected before upload', async t => {
  for (const kind of ['plugin', 'timed', 'locked', 'group', 'draft', 'count', 'size', 'type', 'duplicate', 'directory', 'embedded', 'statement', 'cutoff', 'warning']) {
    await t.test(kind, async t => {
      const f = await setup(t);
      let files = [f.file];
      if (kind === 'plugin') f.a.configs.push(config('custom', 'enabled', '1'));
      if (kind === 'timed') f.a.timelimit = 60;
      if (kind === 'locked') f.s.lastattempt.locked = true;
      if (kind === 'group') { f.a.teamsubmission = 1; f.s.lastattempt.submissiongroup = 0; }
      if (kind === 'draft') f.a.submissiondrafts = 0;
      if (kind === 'count') f.a.configs.find(c => c.name === 'maxfilesubmissions')!.value = '0';
      if (kind === 'size') f.a.configs.find(c => c.name === 'maxsubmissionsizebytes')!.value = '4';
      if (kind === 'type') f.a.configs.find(c => c.name === 'filetypeslist')!.value = '.pdf';
      if (kind === 'duplicate') files = [f.file, f.file];
      if (kind === 'directory') files = [f.directory];
      if (kind === 'embedded') f.s.lastattempt.submission.plugins[1].fileareas = [{ area: 'submissions_onlinetext', files: [{ filename: 'image.png', filesize: 2, fileurl: site + '/webservice/pluginfile.php/image' }] }];
      if (kind === 'statement') { f.a.requiresubmissionstatement = 1; }
      if (kind === 'cutoff') f.a.cutoffdate = 1;
      if (kind === 'warning') f.s.warnings.push({ warningcode: 'incomplete', message: 'Unavailable' });
      await assert.rejects(submitAssignment(token, 4, { files, draft: kind === 'draft', confirm: async () => true }));
      assert.equal(writes(f).length, 0);
    });
  }
});

test('concurrent modification after confirmation stops before save', async t => {
  const f = await setup(t);
  await assert.rejects(submitAssignment(token, 4, { files: [f.file], confirm: async () => { f.s.lastattempt.submission.attemptnumber++; return true; } }), /thay đổi/);
  assert.equal(f.calls.some(c => c.name === 'mod_assign_save_submission'), false);
});

test('save mismatch and save timeout never finalize or retry', async t => {
  for (const mode of ['mismatch', 'timeout']) await t.test(mode, async t => {
    const f = await setup(t);
    f.hooks.mod_assign_save_submission = () => { if (mode === 'timeout') throw new Error('timeout ' + token); return []; };
    const result = await submitAssignment(token, 4, { files: [f.file], confirm: async () => true });
    assert.equal(result.state, 'uncertain');
    assert.equal(f.calls.filter(c => c.name === 'mod_assign_save_submission').length, 1);
    assert.equal(f.calls.some(c => c.name === 'mod_assign_submit_for_grading'), false);
    assert.ok(!JSON.stringify(result).includes(token));
  });
});

test('successful save and failed finalize reports saved with observed server state', async t => {
  const f = await setup(t);
  f.hooks.mod_assign_submit_for_grading = () => { throw new Error('timeout'); };
  const result = await submitAssignment(token, 4, { files: [f.file], confirm: async () => true });
  assert.equal(result.state, 'saved');
  assert.equal(result.observed?.lastattempt?.submission?.status, 'draft');
  assert.equal(f.calls.filter(c => c.name === 'mod_assign_submit_for_grading').length, 1);
});

test('downloads reject traversal and duplicate filenames without writing', async t => {
  const f = await setup(t);
  for (const names of [['../escape'], ['a.txt', 'a.txt']]) {
    f.a.introattachments = names.map(filename => ({ filename, filesize: 1, fileurl: site + '/webservice/pluginfile.php/a' }));
    await assert.rejects(downloadAssignment(token, 4, join(f.directory, 'out')));
  }
});

test('failed download removes partial file and never follows credential redirects', async t => {
  const f = await setup(t);
  const out = join(f.directory, 'out');
  f.a.introattachments = [{ filename: 'a.txt', filesize: 5, fileurl: site + '/webservice/pluginfile.php/a' }];
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    if (!String(url).includes('pluginfile')) return original(url, options);
    assert.equal(options?.redirect, 'error');
    throw new Error('failure ' + token);
  });
  await assert.rejects(downloadAssignment(token, 4, out), error => !String(error).includes(token));
  assert.deepEqual(await readdir(out), []);
  await writeFile(join(out, 'a.txt'), 'existing');
  await assert.rejects(downloadAssignment(token, 4, out));
  assert.equal(await readFile(join(out, 'a.txt'), 'utf8'), 'existing');
});

test('mixed submission accepts statement and no-draft save finalizes without extra call', async t => {
  const f = await setup(t);
  const text = join(f.directory, 'body.txt');
  await writeFile(text, 'New answer');
  f.a.requiresubmissionstatement = 1;
  Object.assign(f.a, { submissionstatement: '<p>I wrote this myself.</p>' });
  const result = await submitAssignment(token, 4, { files: [f.file], textFile: text, confirm: async preview => {
    assert.match(preview, /I wrote this myself/); return true;
  } });
  assert.equal(result.state, 'submitted');
  assert.equal(f.calls.find(c => c.name === 'mod_assign_submit_for_grading')!.body.get('acceptsubmissionstatement'), '1');
  f.s = status(); f.a.requiresubmissionstatement = 0; f.a.submissiondrafts = 0; f.calls.length = 0;
  assert.equal((await submitAssignment(token, 4, { textFile: text, confirm: async () => true })).state, 'submitted');
  assert.equal(f.calls.some(c => c.name === 'mod_assign_submit_for_grading'), false);
});

test('team submission only confirms current member and reports pending members', async t => {
  const f = await setup(t);
  f.a.teamsubmission = 1; f.a.requireallteammemberssubmit = 1;
  Object.assign(f.s.lastattempt, { teamsubmission: { ...f.s.lastattempt.submission, userid: 0, groupid: 8 } });
  f.hooks.mod_assign_save_submission = () => [];
  f.hooks.mod_assign_submit_for_grading = () => { f.s.lastattempt.submissiongroupmemberswhoneedtosubmit = [9]; return []; };
  const text = join(f.directory, 'keep.txt'); await writeFile(text, 'Keep me');
  const result = await submitAssignment(token, 4, { textFile: text, confirm: async preview => { assert.match(preview, /nhóm 8/); return true; } });
  assert.equal(result.state, 'saved');
  assert.deepEqual(result.pendingMembers, [9]);
  assert.equal(f.calls.find(c => c.name === 'mod_assign_submit_for_grading')!.body.has('userid'), false);
});

test('upload timeout never saves or retries, including partial draft uploads', async t => {
  const f = await setup(t);
  f.hooks.upload = () => { throw new Error('timeout ' + token); };
  const result = await submitAssignment(token, 4, { files: [f.file], confirm: async () => true });
  assert.equal(result.state, 'uncertain'); assert.equal(writes(f).length, 1);
  assert.ok(!JSON.stringify(result).includes(token));
});

test('finalize timeout after server accepted submission is resolved by reading', async t => {
  const f = await setup(t);
  f.hooks.mod_assign_submit_for_grading = () => { f.s.lastattempt.submission.status = 'submitted'; throw new Error('timeout'); };
  assert.equal((await submitAssignment(token, 4, { files: [f.file], confirm: async () => true })).state, 'submitted');
  assert.equal(f.calls.filter(c => c.name === 'mod_assign_submit_for_grading').length, 1);
});

test('null extension date means no extension and permits an otherwise valid submission', async t => {
  const f = await setup(t);
  f.s.lastattempt.extensionduedate = null;
  f.a.duedate = Math.floor(Date.now() / 1000) + 86400;
  const result = await submitAssignment(token, 4, { files: [f.file], confirm: async preview => {
    assert.match(preview, /Hạn:/);
    assert.doesNotMatch(preview, /Invalid Date|NaN/);
    return true;
  } });
  assert.equal(result.state, 'submitted');
  assert.ok(writes(f).some(call => call.name === 'mod_assign_save_submission'));
});

test('missing access dates and mismatched submission owner fail closed', async t => {
  for (const kind of ['dates', 'extension', 'owner']) await t.test(kind, async t => {
    const f = await setup(t);
    if (kind === 'dates') Object.assign(f.a, { cutoffdate: undefined });
    else if (kind === 'extension') Object.assign(f.s.lastattempt, { extensionduedate: undefined });
    else f.s.lastattempt.submission.userid = 99;
    await assert.rejects(submitAssignment(token, 4, { files: [f.file], confirm: async () => true }));
    assert.equal(writes(f).length, 0);
  });
});

test('CLI rejects unsupported flags, IDs and noninteractive submissions without writing', async t => {
  const { spawnSync } = await import('node:child_process');
  const f = await setup(t);
  await mkdir(join(f.directory, 'course-cli-spike'));
  await writeFile(join(f.directory, 'course-cli-spike', 'auth.json'), JSON.stringify({ token }));
  const preload = join(f.directory, 'fixture.js');
  await writeFile(preload, `const assignment = ${JSON.stringify(f.a)}; const status = ${JSON.stringify(f.s)};
    globalThis.fetch = async (_url, {body}) => { const method = body.get('wsfunction');
    if (/save|submit_for|upload/.test(method)) throw new Error('unexpected write');
    const data = method === 'core_webservice_get_site_info' ? {userid: 7} : method === 'core_enrol_get_users_courses' ? [{id: 12, fullname: 'Algorithms'}] :
      method === 'mod_assign_get_assignments' ? {courses: [{id: 12, assignments: [assignment]}], warnings: []} : status;
    return new Response(JSON.stringify(data)); };`);
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', preload, 'course.js', 'assignment', ...args], {
    cwd: import.meta.dirname, env: { ...process.env, XDG_CONFIG_HOME: f.directory }, encoding: 'utf8',
  });
  const listed = run('list', '--json');
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(JSON.parse(listed.stdout).assignments[0].id, 4);
  const viewed = run('view', '4');
  assert.equal(viewed.status, 0, viewed.stderr); assert.match(viewed.stdout, /Write carefully/);
  for (const args of [['view', '0'], ['status', '4', '--yes'], ['submit', '4', '--yes'], ['list', '4'], ['submit', '4', f.file]]) {
    const result = run(...args); assert.equal(result.status, 1); assert.ok(!result.stderr.includes(token));
  }
});

test('multiple uploads reuse one draft item and preserve existing HTML text exactly', async t => {
  const f = await setup(t);
  const second = join(f.directory, 'second.txt'); await writeFile(second, 'two');
  f.s.lastattempt.submission.plugins[1].editorfields![0] = { name: 'onlinetext', text: '<p>Preserve &amp; me</p>', format: 1 };
  f.hooks.mod_assign_save_submission = () => {
    f.s.lastattempt.submission.plugins[0].fileareas![0].files = [
      { filename: 'new.txt', filesize: 5, fileurl: '' }, { filename: 'second.txt', filesize: 3, fileurl: '' },
    ]; return [];
  };
  const result = await submitAssignment(token, 4, { files: [f.file, second], draft: true, confirm: async () => true });
  assert.equal(result.state, 'saved');
  const uploads = f.calls.filter(c => c.name === 'upload');
  assert.deepEqual(uploads.map(c => c.body.get('itemid')), ['0', '81']);
  const body = f.calls.find(c => c.name === 'mod_assign_save_submission')!.body;
  assert.equal(body.get('plugindata[onlinetext_editor][text]'), '<p>Preserve &amp; me</p>');
  assert.equal(body.get('plugindata[onlinetext_editor][format]'), '1');
});

test('file-only assignments and text-only assignments save with only their enabled plugin', async t => {
  for (const plugin of ['file', 'onlinetext']) await t.test(plugin, async t => {
    const f = await setup(t); f.a.configs = f.a.configs.filter(c => c.plugin === plugin);
    f.s.lastattempt.submission.plugins = f.s.lastattempt.submission.plugins.filter(p => p.type === plugin);
    f.hooks.mod_assign_save_submission = () => {
      if (plugin === 'file') f.s.lastattempt.submission.plugins[0].fileareas![0].files = [{ filename: 'new.txt', filesize: 5, fileurl: '' }];
      else f.s.lastattempt.submission.plugins[0].editorfields![0].text = 'hello';
      return [];
    };
    const result = await submitAssignment(token, 4, { ...(plugin === 'file' ? { files: [f.file] } : { textFile: f.file }), draft: true, confirm: async () => true });
    assert.equal(result.state, 'saved');
    const body = f.calls.find(c => c.name === 'mod_assign_save_submission')!.body;
    assert.equal(body.has('plugindata[files_filemanager]'), plugin === 'file');
    assert.equal(body.has('plugindata[onlinetext_editor][text]'), plugin === 'onlinetext');
  });
});

test('save warnings and changed rights before finalize never submit', async t => {
  for (const mode of ['warning', 'rights']) await t.test(mode, async t => {
    const f = await setup(t);
    f.hooks.mod_assign_save_submission = () => {
      f.s.lastattempt.submission.plugins[0].fileareas![0].files = [{ filename: 'new.txt', filesize: 5, fileurl: '' }];
      if (mode === 'rights') f.s.lastattempt.cansubmit = false;
      return mode === 'warning' ? [{ warningcode: 'partial', message: 'Saved partly' }] : [];
    };
    const result = await submitAssignment(token, 4, { files: [f.file], confirm: async () => true });
    assert.equal(result.state, 'saved');
    assert.equal(f.calls.some(c => c.name === 'mod_assign_submit_for_grading'), false);
  });
});

test('download streams data, rejects foreign URLs and cleans interrupted streams', async t => {
  const f = await setup(t);
  const out = join(f.directory, 'out');
  f.a.introattachments = [{ filename: 'note.txt', filesize: 5, fileurl: 'https://evil.example/pluginfile.php/a' }];
  await assert.rejects(downloadAssignment(token, 4, out), /HTTPS/);
  f.a.introattachments[0].fileurl = site + '/pluginfile.php/a';
  const original = globalThis.fetch;
  let broken = false;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    if (!String(url).includes('pluginfile')) return original(url, options);
    assert.match(String(url), /\/webservice\/pluginfile.php/); assert.equal(options?.redirect, 'error');
    return broken ? new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.error(new Error('interrupted')); } })) : new Response('hello');
  });
  assert.equal((await downloadAssignment(token, 4, out)).downloaded.length, 1);
  assert.equal(await readFile(join(out, 'note.txt'), 'utf8'), 'hello');
  await rm(join(out, 'note.txt')); broken = true;
  await assert.rejects(downloadAssignment(token, 4, out)); assert.deepEqual(await readdir(out), []);
});

test('view scopes lookup warnings to the selected course before submission preflight', async t => {
  const f = await setup(t);
  f.hooks.mod_assign_get_assignments = () => {
    const body = f.calls.at(-1)!.body;
    const scoped = f.calls.filter(c => c.name === 'mod_assign_get_assignments').length > 1;
    assert.equal(body.get('courseids[0]'), '12');
    return { courses: [{ id: 12, assignments: [f.a] }], warnings: scoped ? [] : [{ item: 'course', itemid: 99, warningcode: '1', message: 'Other course unavailable' }] };
  };
  assert.equal((await viewAssignment(token, 4)).warnings.length, 0);
});

test('comments plugin is read-only and disabled plugins do not grant write support', async t => {
  const f = await setup(t);
  f.a.configs.push(config('comments', 'enabled', '1'), config('custom', 'enabled', '0'));
  assert.equal((await submitAssignment(token, 4, { files: [f.file], draft: true, confirm: async () => true })).state, 'saved');
  f.a.configs.find(c => c.plugin === 'file' && c.name === 'enabled')!.value = '0';
  await assert.rejects(submitAssignment(token, 4, { files: [f.file], draft: true, confirm: async () => true }), /Plugin/);
});

test('unrelated module warnings remain visible but do not block submission', async t => {
  const f = await setup(t);
  f.hooks.mod_assign_get_assignments = () => ({ courses: [{ id: 12, assignments: [f.a] }],
    warnings: [{ item: 'module', itemid: 999, warningcode: '1', message: 'Other activity unavailable' }] });
  const result = await submitAssignment(token, 4, { files: [f.file], draft: true, confirm: async () => true });
  assert.equal(result.state, 'saved');
  assert.equal((await viewAssignment(token, 4)).warnings.length, 1);
  assert.equal(writes(f).length, 2);
});

test('first submission may change only one of two enabled plugins', async t => {
  for (const mode of ['file', 'onlinetext']) await t.test(mode, async t => {
    const f = await setup(t);
    delete (f.s.lastattempt as { submission?: unknown }).submission;
    f.hooks.mod_assign_save_submission = () => {
      const saved = status();
      saved.lastattempt.submission.plugins[0].fileareas![0].files = mode === 'file'
        ? [{ filename: 'new.txt', filesize: 5, fileurl: '' }] : [];
      saved.lastattempt.submission.plugins[1].editorfields![0].text = mode === 'onlinetext' ? 'hello' : '';
      f.s = saved;
      return [];
    };
    const result = await submitAssignment(token, 4, { ...(mode === 'file' ? { files: [f.file] } : { textFile: f.file }),
      draft: true, confirm: async () => true });
    assert.equal(result.state, 'saved');
  });
});
