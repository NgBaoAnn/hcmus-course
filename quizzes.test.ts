import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { listQuizzes, viewQuiz, quizAttempts, quizStatus, startQuiz, resumeQuiz, submitQuiz, reviewQuiz } from './quizzes.js';
import { api, type ResponseTiming } from './moodle.js';

const token = 'a'.repeat(32);
const now = 1793251000;
const prefix = (slot = 1) => `q91:${slot}_`;
function question(type = 'shortanswer', controls = '<input type="text" name="q91:1_answer" value="old">', slot = 1, page = 0) {
  return { slot, type, page, questionnumber: String(slot), sequencecheck: 1, lastactiontime: now, hasautosavedstep: false,
    status: 'Chưa trả lời', stateclass: 'notyetanswered',
    html: `<div class="que ${type} deferredfeedback"><div class="qtext">Question ${slot}?</div><input type="hidden" name="${prefix(slot)}:sequencecheck" value="1">${controls}</div>` };
}
async function setup(t: TestContext) {
  const quiz = { id: 4, course: 12, coursemodule: 40, name: 'Quiz', intro: '<p>Read</p>', preferredbehaviour: 'deferredfeedback',
    timelimit: 300, timeopen: 0, timeclose: now + 300, attempts: 2, navmethod: 'free', overduehandling: 'autosubmit', graceperiod: 0, browsersecurity: '-', hasquestions: 1 };
  const access = { canattempt: true, canpreview: false, activerulenames: ['quizaccess_timelimit', 'quizaccess_openclosedate', 'quizaccess_numattempts'], accessrules: [], preventaccessreasons: [], warnings: [] };
  const attempt = { id: 8, quiz: 4, userid: 7, uniqueid: 91, attempt: 1, state: 'inprogress', currentpage: 0, timestart: now, timemodified: now, timefinish: 0, preview: 0 };
  let attempts: typeof attempt[] = [attempt];
  const pages = new Map([[0, [question()]]]);
  let qtypes = ['shortanswer'];
  let endtime = now + 250;
  let date = new Date(now * 1000).toUTCString();
  const calls: { name: string; body: URLSearchParams }[] = [];
  const hooks: Record<string, (body: URLSearchParams) => unknown | Promise<unknown>> = {};
  const outputs: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { outputs.push(args.join(' ')); });
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    const body = options?.body;
    assert.ok(body instanceof URLSearchParams);
    const name = body.get('wsfunction')!;
    calls.push({ name, body });
    assert.equal(options?.method, 'POST'); assert.ok(!String(url).includes(token));
    let result: unknown;
    if (hooks[name]) result = await hooks[name](body);
    else switch (name) {
      case 'core_webservice_get_site_info': result = { userid: 7, fullname: 'Student' }; break;
      case 'core_enrol_get_users_courses': result = [{ id: 12, fullname: 'Algorithms' }]; break;
      case 'mod_quiz_get_quizzes_by_courses': result = { quizzes: [quiz], warnings: [] }; break;
      case 'mod_quiz_get_user_attempts': assert.equal(body.get('status'), 'all'); assert.equal(body.get('userid'), '0'); result = { attempts, warnings: [] }; break;
      case 'mod_quiz_get_quiz_access_information': result = access; break;
      case 'mod_quiz_get_quiz_required_qtypes': result = { questiontypes: qtypes, warnings: [] }; break;
      case 'mod_quiz_get_attempt_access_information': result = { endtime, isfinished: false, preventnewattemptreasons: [], warnings: [] }; break;
      case 'mod_quiz_start_attempt': attempts = [attempt]; result = { attempt, warnings: [] }; break;
      case 'mod_quiz_get_attempt_data': {
        const page = Number(body.get('page'));
        result = { attempt, questions: pages.get(page), nextpage: pages.has(page + 1) ? page + 1 : -1, warnings: [], messages: [] }; break;
      }
      case 'mod_quiz_save_attempt': {
        const fields = data(body);
        const slot = Number(fields.slots);
        const q = [...pages.values()].flat().find(q => q.slot === slot)!;
        const { parseHTML } = await import('linkedom');
        const { document } = parseHTML(q.html);
        for (const e of Array.from(document.querySelectorAll('input,select,textarea'))) {
          const name = e.getAttribute('name')!;
          if (!(name in fields)) {
            if (e.getAttribute('type') === 'radio') e.removeAttribute('checked');
            continue;
          }
          if (e.localName === 'textarea') e.textContent = fields[name];
          else if (e.localName === 'select') {
            for (const option of Array.from(e.querySelectorAll('option'))) {
              if (option.getAttribute('value') === fields[name]) option.setAttribute('selected', 'selected'); else option.removeAttribute('selected');
            }
          } else if (['radio', 'checkbox'].includes(e.getAttribute('type')!)) {
            if (fields[name] === e.getAttribute('value')) e.setAttribute('checked', 'checked'); else e.removeAttribute('checked');
          } else e.setAttribute('value', fields[name]);
        }
        q.html = document.toString(); q.hasautosavedstep = true;
        result = { status: true, warnings: [] }; break;
      }
      case 'mod_quiz_process_attempt': if (body.get('finishattempt') === '1') attempt.state = 'finished'; result = { state: attempt.state, warnings: [] }; break;
      case 'mod_quiz_view_attempt': attempt.currentpage = Number(body.get('page')); result = { status: true, warnings: [] }; break;
      case 'mod_quiz_get_attempt_summary': result = { questions: [...pages.values()].flat().map(({ html, ...q }) => ({ ...q, html: '' })), totalunanswered: 1, warnings: [] }; break;
      case 'mod_quiz_get_attempt_review': result = { attempt, questions: [{ html: '<p>Allowed feedback</p>', slot: 1 }], grade: 'Pending', warnings: [] }; break;
      default: throw new Error('Unexpected ' + name);
    }
    return new Response(JSON.stringify(result), { headers: date ? { date } : {} });
  });
  return { quiz, access, attempt, pages, calls, hooks, outputs, get attempts() { return attempts; }, set attempts(v) { attempts = v; },
    set qtypes(v: string[]) { qtypes = v; }, set endtime(v: number) { endtime = v; }, set date(v: string) { date = v; } };
}
function data(body: URLSearchParams) {
  const result: Record<string, string> = {};
  for (let i = 0; body.has(`data[${i}][name]`); i++) result[body.get(`data[${i}][name]`)!] = body.get(`data[${i}][value]`)!;
  return result;
}
const mutationNames = /start_attempt|save_attempt|process_attempt|view_attempt$|get_attempt_data|get_attempt_summary|get_attempt_access_information/;
const writes = (f: Awaited<ReturnType<typeof setup>>) => f.calls.filter(c => mutationNames.test(c.name));
const answer = (...values: string[]) => async (_prompt: string) => { assert.ok(values.length, 'Unexpected prompt'); return values.shift()!; };

test('transport records server Date using monotonic receipt time', async t => {
  await setup(t); const timing: ResponseTiming = {};
  await api(token, 'core_webservice_get_site_info', {}, timing);
  assert.equal(timing.serverTime, now); assert.equal(typeof timing.receivedAt, 'number');
});
test('all read commands remain read-only and expose incomplete timing/count honestly', async t => {
  const f = await setup(t);
  assert.equal((await listQuizzes(token, 12)).quizzes[0].id, 4);
  assert.equal((await viewQuiz(token, 4)).introText, 'Read');
  assert.equal((await quizAttempts(token, 4)).attempts[0].id, 8);
  const s = await quizStatus(token, 8);
  assert.equal(s.attempt.state, 'inprogress'); assert.equal(s.endtime, null); assert.equal(s.answeredQuestions, null);
  assert.match(s.warnings.map((w: { message: string }) => w.message).join(' '), /hạn|endtime/);
  await assert.rejects(reviewQuiz(token, 8), /kết thúc|finished/);
  f.attempt.state = 'finished';
  assert.equal((await reviewQuiz(token, 8)).questions[0].text, 'Allowed feedback');
  assert.equal(writes(f).length, 0);
});
test('read review respects API denial and never falls back to active data', async t => {
  const f = await setup(t); f.attempt.state = 'finished';
  f.hooks.mod_quiz_get_attempt_review = () => ({ exception: 'error', errorcode: 'noreview' });
  await assert.rejects(reviewQuiz(token, 8), /noreview/); assert.equal(writes(f).length, 0);
});
test('start refuses unsupported qtypes, behaviour and access rules before consuming attempt', async t => {
  const f = await setup(t); f.attempts = [];
  for (const type of ['ddwtos', 'essay']) {
    f.qtypes = [type]; await assert.rejects(startQuiz(token, 4, { confirm: async () => true }), /hỗ trợ|essay/);
  }
  f.qtypes = ['shortanswer']; f.quiz.preferredbehaviour = 'adaptive';
  await assert.rejects(startQuiz(token, 4, { confirm: async () => true }), /behaviour/);
  f.quiz.preferredbehaviour = 'deferredfeedback'; f.access.activerulenames.push('quizaccess_seb');
  await assert.rejects(startQuiz(token, 4, { confirm: async () => true }), /quizaccess_seb/);
  assert.equal(writes(f).length, 0);
});
test('existing attempt points start to resume; cancel and EOF write nothing', async t => {
  const f = await setup(t);
  await assert.rejects(startQuiz(token, 4, { confirm: async () => true }), /resume 8/);
  f.attempts = [];
  await assert.rejects(startQuiz(token, 4, { confirm: async () => false }), /hủy/);
  await assert.rejects(startQuiz(token, 4, { confirm: async () => { throw Error('EOF'); } }), /hủy/);
  await assert.rejects(resumeQuiz(token, 8, { ask: answer('no') }), /hủy|tìm thấy/);
  assert.equal(writes(f).length, 0);
});
test('start previews identity/timing and expiry disclosure, validates success, then resumes', async t => {
  const f = await setup(t); f.attempts = [];
  const result = await startQuiz(token, 4, { confirm: async preview => {
    for (const text of ['Student', 'Algorithms', 'Quiz', '300', 'autosubmit', 'hết giờ']) assert.ok(preview.includes(text), text);
    return true;
  }, ask: answer('', 'quit') });
  assert.equal(result.state, 'paused'); assert.equal(f.calls.filter(c => c.name === 'mod_quiz_start_attempt').length, 1);
  assert.equal(f.calls.some(c => c.name === 'mod_quiz_process_attempt'), false);
});
test('start checks waiting rules after consent and fails closed without server time', async t => {
  const f = await setup(t); f.attempts = []; f.date = '';
  await assert.rejects(startQuiz(token, 4, { confirm: async () => true }), /giờ server|thời gian server/);
  assert.equal(f.calls.some(c => c.name === 'mod_quiz_start_attempt'), false);
  f.date = new Date(now * 1000).toUTCString();
  f.hooks.mod_quiz_get_attempt_access_information = () => ({ isfinished: false, preventnewattemptreasons: ['Wait before retry'], warnings: [] });
  await assert.rejects(startQuiz(token, 4, { confirm: async () => true }), /Wait before retry/);
  assert.equal(f.calls.some(c => c.name === 'mod_quiz_start_attempt'), false);
});
test('start warning without attempt and ambiguous timeout never retries or selects an attempt', async t => {
  const f = await setup(t); f.attempts = [];
  f.hooks.mod_quiz_start_attempt = () => ({ attempt: {}, warnings: [{ warningcode: 'blocked', message: 'No start' }] });
  await assert.rejects(startQuiz(token, 4, { confirm: async () => true }), /No start|không tạo/);
  f.hooks.mod_quiz_start_attempt = () => { f.attempts = [f.attempt]; throw Error('timeout'); };
  const result = await startQuiz(token, 4, { confirm: async () => true });
  assert.equal(result.state, 'uncertain'); assert.match(result.message, /resume 8/);
  assert.equal(f.calls.filter(c => c.name === 'mod_quiz_start_attempt').length, 2);
});
test('password is requested as secret and only POSTed; answers never appear in output', async t => {
  const f = await setup(t); f.attempts = []; f.access.activerulenames.push('quizaccess_password');
  const values = ['hidden-password', 'private-answer', 'quit'];
  await startQuiz(token, 4, { confirm: async () => true, ask: async (prompt, options) => {
    if (values.length === 3) assert.equal(options?.secret, true);
    assert.ok(!prompt.includes('hidden-password')); return values.shift()!;
  } });
  const start = f.calls.find(c => c.name === 'mod_quiz_start_attempt')!.body;
  assert.equal(start.get('preflightdata[0][value]'), 'hidden-password');
  assert.ok(!f.outputs.join('\n').includes('private-answer')); assert.ok(!f.outputs.join('\n').includes('hidden-password'));
});
test('supported HTML controls map actual shuffled values and preserve enter/explicit clear', async t => {
  const cases: [string, string, string, Record<string, string>][] = [
    ['multichoice', '<input type="radio" name="q91:1_answer" value="7" id="x"><label for="x">Shuffled</label><input type="radio" name="q91:1_answer" value="2"><input type="radio" aria-hidden="true" name="q91:1_answer" value="-1">', '1', { 'q91:1_answer': '7' }],
    ['multichoice', '<input type="hidden" name="q91:1_choice2" value="0"><input type="checkbox" name="q91:1_choice2" value="1"><input type="hidden" name="q91:1_choice0" value="0"><input type="checkbox" name="q91:1_choice0" value="1">', '2', { 'q91:1_choice2': '0', 'q91:1_choice0': '1' }],
    ['truefalse', '<input type="radio" name="q91:1_answer" value="0"><input type="radio" name="q91:1_answer" value="1">', '1', { 'q91:1_answer': '0' }],
    ['shortanswer', '<input type="text" name="q91:1_answer" value="old">', 'new answer', { 'q91:1_answer': 'new answer' }],
    ['numerical', '<input type="text" name="q91:1_answer" value=""><select name="q91:1_unit"><option value="">Unit</option><option value="kg">kg</option></select>', '2.5|1', { 'q91:1_answer': '2.5', 'q91:1_unit': 'kg' }],
    ['match', '<select name="q91:1_sub2"><option value="0">Choose</option><option value="77">B</option></select>', '1', { 'q91:1_sub2': '77' }],
    ['gapselect', '<select name="q91:1_p1"><option value="0">Choose</option><option value="4">Gap</option></select>', '1', { 'q91:1_p1': '4' }],
    ['essay', '<textarea name="q91:1_answer" class="qtype_essay_plain">old</textarea><input type="hidden" name="q91:1_answerformat" value="2">', 'my essay', { 'q91:1_answer': 'my essay', 'q91:1_answerformat': '2' }],
    ['shortanswer', '<input type="text" name="q91:1_answer" value="old">', ':clear', { 'q91:1_answer': '' }],
    ['shortanswer', '<input type="text" name="q91:1_answer" value="old">', '', {}],
    ['description', '<p>Read this</p>', '', {}],
  ];
  for (const [type, controls, input, expected] of cases) {
    const f = await setup(t); f.pages.set(0, [question(type, controls)]);
    await resumeQuiz(token, 8, { ask: type === 'description' ? answer('yes', 'quit') : answer('yes', input, 'quit') });
    const saves = f.calls.filter(c => c.name === 'mod_quiz_save_attempt');
    if (!Object.keys(expected).length) assert.equal(saves.length, 0, type);
    else { assert.equal(saves.length, 1, type); const fields = data(saves[0].body);
      for (const [key, value] of Object.entries(expected)) assert.equal(fields[key], value, type);
      assert.equal(fields['q91:1_:sequencecheck'], '1'); assert.equal(fields.slots, '1'); }
  }
});
test('unsupported controls after attempt exists preserve it and avoid save/finish', async t => {
  const f = await setup(t); f.pages.set(0, [question('essay', '<textarea name="q91:1_answer">x</textarea><input name="q91:1_attachments" type="hidden" value="9">')]);
  const result = await resumeQuiz(token, 8, { ask: answer('yes') });
  assert.equal(result.state, 'unsupported'); assert.match(result.message, /website|hỗ trợ/);
  assert.equal(f.calls.some(c => /start_attempt|save_attempt|process_attempt/.test(c.name)), false);
});
test('sequence or concurrent autosave conflict stops before write and never retries', async t => {
  const f = await setup(t);
  const result = await resumeQuiz(token, 8, { ask: async prompt => {
    if (prompt.includes('Nhập yes')) return 'yes';
    f.pages.get(0)![0].html = f.pages.get(0)![0].html.replace('value="old"', 'value="website"');
    return 'mine';
  } });
  assert.equal(result.state, 'conflict'); assert.equal(f.calls.some(c => /save_attempt|process_attempt/.test(c.name)), false);
});
test('save timeout and silently ignored save report uncertainty without replay', async t => {
  const f = await setup(t); f.hooks.mod_quiz_save_attempt = () => { throw Error('timeout'); };
  assert.equal((await resumeQuiz(token, 8, { ask: answer('yes', 'mine') })).state, 'uncertain');
  assert.equal(f.calls.filter(c => c.name === 'mod_quiz_save_attempt').length, 1);
  f.hooks.mod_quiz_save_attempt = () => ({ status: true, warnings: [] });
  assert.equal((await resumeQuiz(token, 8, { ask: answer('yes', 'mine') })).state, 'conflict');
});
test('sequential navigation processes then persists page, warns, and refuses going back', async t => {
  const f = await setup(t); f.quiz.navmethod = 'seq'; f.pages.set(1, [question('description', '<p>Page two</p>', 2, 1)]);
  await resumeQuiz(token, 8, { ask: async prompt => {
    if (prompt.includes('Nhập yes')) return 'yes';
    if (prompt.includes('không thể quay lại')) return 'next';
    if (prompt.includes('Trang 2')) return 'quit';
    return '';
  } });
  const processIndex = f.calls.findIndex(c => c.name === 'mod_quiz_process_attempt');
  const viewIndex = f.calls.findIndex(c => c.name === 'mod_quiz_view_attempt');
  assert.ok(processIndex >= 0 && viewIndex > processIndex); assert.equal(f.attempt.currentpage, 1);
  assert.equal(f.calls[processIndex].body.get('finishattempt'), '0'); assert.equal(f.calls[processIndex].body.get('timeup'), '0');
  assert.equal(data(f.calls[processIndex].body).slots, '');
});
test('expiry/grace/abandoned and EOF never force a save or finish', async t => {
  const f = await setup(t); f.endtime = now - 1;
  const result = await resumeQuiz(token, 8, { ask: answer('yes') });
  assert.equal(result.state, 'expired'); assert.equal(f.calls.some(c => /save_attempt|process_attempt/.test(c.name)), false);
  f.endtime = now + 100; f.attempt.state = 'overdue'; f.quiz.overduehandling = 'graceperiod';
  assert.equal((await resumeQuiz(token, 8, { ask: answer('yes') })).state, 'overdue');
  f.attempt.state = 'inprogress';
  assert.equal((await resumeQuiz(token, 8, { ask: async prompt => { if (prompt.includes('Nhập yes')) return 'yes'; throw Error('EOF'); } })).state, 'paused');
  assert.equal(f.calls.some(c => /save_attempt|process_attempt/.test(c.name)), false);
});
test('submit requires consent before expiry-sensitive summary and explicit final confirmation', async t => {
  const f = await setup(t);
  await assert.rejects(submitQuiz(token, 8, { confirm: async () => false }), /hủy/); assert.equal(writes(f).length, 0);
  let confirmations = 0;
  const result = await submitQuiz(token, 8, { confirm: async preview => { confirmations++;
    if (confirmations === 1) { assert.match(preview, /hết giờ/); return true; }
    assert.match(preview, /1/); assert.match(preview, /không thể sửa/); return false;
  } });
  assert.equal(result.state, 'paused'); assert.equal(confirmations, 2); assert.equal(f.calls.some(c => c.name === 'mod_quiz_process_attempt'), false);
});
test('submit finish is server verified; timeout reconciliation does not retry', async t => {
  const f = await setup(t);
  assert.equal((await submitQuiz(token, 8, { confirm: async () => true })).state, 'finished');
  let process = f.calls.find(c => c.name === 'mod_quiz_process_attempt')!;
  assert.equal(process.body.get('finishattempt'), '1'); assert.equal(process.body.get('timeup'), '0');
  f.attempt.state = 'inprogress';
  f.hooks.mod_quiz_process_attempt = () => { f.attempt.state = 'finished'; throw Error('timeout'); };
  assert.equal((await submitQuiz(token, 8, { confirm: async () => true })).state, 'finished');
  f.attempt.state = 'inprogress'; f.hooks.mod_quiz_process_attempt = () => { throw Error('timeout'); };
  assert.equal((await submitQuiz(token, 8, { confirm: async () => true })).state, 'uncertain');
  assert.equal(f.calls.filter(c => c.name === 'mod_quiz_process_attempt').length, 3);
});

test('quiz configuration and potential qtypes are rechecked after start confirmation', async t => {
  const f = await setup(t); f.attempts = [];
  await assert.rejects(startQuiz(token, 4, { confirm: async () => { f.quiz.timelimit = 10; return true; } }), /thay đổi/);
  assert.equal(f.calls.some(c => c.name === 'mod_quiz_start_attempt'), false);
  f.quiz.timelimit = 300;
  await assert.rejects(startQuiz(token, 4, { confirm: async () => { f.qtypes = ['essay']; return true; } }), /thay đổi|hỗ trợ/);
  assert.equal(f.calls.some(c => c.name === 'mod_quiz_start_attempt'), false);
});
test('numerical radio units follow their actual rendered values', async t => {
  const f = await setup(t);
  f.pages.set(0, [question('numerical', '<input type="text" name="q91:1_answer" value=""><input type="radio" name="q91:1_unit" value="metres"><input type="radio" name="q91:1_unit" value="seconds">')]);
  const result = await resumeQuiz(token, 8, { ask: answer('yes', '5|2', 'quit') });
  assert.equal(result.state, 'paused');
  assert.equal(data(f.calls.find(c => c.name === 'mod_quiz_save_attempt')!.body)['q91:1_unit'], 'seconds');
});
test('media warnings link to this attempt and prompt never logs saved answer text', async t => {
  const f = await setup(t);
  f.pages.set(0, [question('essay', '<textarea name="q91:1_answer" class="qtype_essay_plain">secret-existing-answer</textarea><input type="hidden" name="q91:1_answerformat" value="2"><img src="image.png">')]);
  let sawQuestion = false;
  await resumeQuiz(token, 8, { ask: async prompt => {
    assert.ok(!prompt.includes('secret-existing-answer'));
    if (prompt.includes('Nhập yes')) return 'yes';
    if (prompt.includes('câu 1')) { sawQuestion = true; assert.match(prompt, /attempt=8/); return ''; }
    return 'quit';
  } });
  assert.equal(sawQuestion, true);
});
test('grace-period submit is allowed but abandoned attempts are never reopened', async t => {
  const f = await setup(t); f.quiz.overduehandling = 'graceperiod'; f.attempt.state = 'overdue';
  assert.equal((await submitQuiz(token, 8, { confirm: async () => true })).state, 'finished');
  f.attempt.state = 'abandoned';
  assert.equal((await resumeQuiz(token, 8, { ask: answer() })).state, 'abandoned');
});
test('a sequence conflict returned by Moodle is never retried', async t => {
  const f = await setup(t);
  f.hooks.mod_quiz_save_attempt = () => ({ exception: 'moodle_exception', errorcode: 'submissionoutofsequencefriendlymessage' });
  assert.equal((await resumeQuiz(token, 8, { ask: answer('yes', 'my-answer') })).state, 'conflict');
  assert.equal(f.calls.filter(c => c.name === 'mod_quiz_save_attempt').length, 1);
});
test('submission summary changed during confirmation stops finish', async t => {
  const f = await setup(t); let confirms = 0;
  const result = await submitQuiz(token, 8, { confirm: async () => {
    if (++confirms === 2) f.pages.get(0)![0].sequencecheck++;
    return true;
  } });
  assert.equal(result.state, 'conflict'); assert.equal(f.calls.some(c => c.name === 'mod_quiz_process_attempt'), false);
});

test('clearing truefalse omits the answer rather than inventing a truthy radio value', async t => {
  const f = await setup(t);
  f.pages.set(0, [question('truefalse', '<input type="radio" name="q91:1_answer" value="1" checked><input type="radio" name="q91:1_answer" value="0">')]);
  assert.equal((await resumeQuiz(token, 8, { ask: answer('yes', ':clear', 'quit') })).state, 'paused');
  const saved = data(f.calls.find(c => c.name === 'mod_quiz_save_attempt')!.body);
  assert.equal('q91:1_answer' in saved, false);
  assert.equal(saved.slots, '1');
});
test('quiz commands validate ID and flags before reading authentication', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = (...args: string[]) => spawnSync(process.execPath, ['dist/course.js', 'quiz', ...args], { encoding: 'utf8' });
  assert.match(run('status', '0').stderr, /Attempt ID/);
  assert.match(run('start', '4', '--json').stderr, /ERR_PARSE_ARGS_UNKNOWN_OPTION/);
  assert.match(run('list', '--course', 'no').stderr, /Course ID/);
  assert.equal(spawnSync(process.execPath, ['dist/course.js', '--help'], { encoding: 'utf8' }).stdout.includes('quiz'), true);
});

test('submit detects an autosaved answer change even with unchanged sequence metadata', async t => {
  const f = await setup(t); let confirms = 0;
  f.hooks.mod_quiz_get_attempt_summary = () => ({ questions: f.pages.get(0), totalunanswered: 0, warnings: [] });
  const result = await submitQuiz(token, 8, { confirm: async () => {
    if (++confirms === 2) f.pages.get(0)![0].html = f.pages.get(0)![0].html.replace('value="old"', 'value="website"');
    return true;
  } });
  assert.equal(result.state, 'conflict'); assert.equal(f.calls.some(c => c.name === 'mod_quiz_process_attempt'), false);
});
