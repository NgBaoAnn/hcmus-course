import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseHTML } from 'linkedom';
import { api, SITE, type ResponseTiming, type SiteInfo } from './moodle.js';
import { ask as terminalAsk, confirm as terminalConfirm, render, requireId } from './terminal.js';
import { listCourses, type MoodleWarning } from './student.js';

type Id = number | string | undefined;
type Params = Record<string, string | number | boolean>;
interface Options { confirm?: (preview: string) => Promise<boolean>; ask?: (prompt: string, options?: { secret?: boolean }) => Promise<string> }
interface Quiz {
  id: number; course: number; coursemodule: number; name: string; intro?: string; preferredbehaviour?: string;
  timelimit?: number; timeopen?: number; timeclose?: number; attempts?: number; navmethod?: string;
  overduehandling?: string; graceperiod?: number; browsersecurity?: string; hasquestions?: number;
}
interface Attempt { id: number; quiz: number; userid: number; uniqueid: number; attempt: number; state: string; currentpage: number;
  timestart: number; timemodified: number; timefinish: number; preview?: number }
interface Access { canattempt: boolean; canpreview?: boolean; activerulenames: string[]; accessrules: string[]; preventaccessreasons: string[]; warnings?: MoodleWarning[] }
interface Question { slot: number; type: string; page: number; questionnumber: string; sequencecheck?: number; lastactiontime?: number;
  hasautosavedstep?: boolean; blockedbyprevious?: boolean; status?: string; stateclass?: string; html: string }
interface Page { attempt: Attempt; questions: Question[]; nextpage: number; warnings?: MoodleWarning[]; messages?: string[] }
interface AttemptAccess { endtime?: number; isfinished: boolean; preventnewattemptreasons: string[]; warnings?: MoodleWarning[] }
interface Summary { questions: Question[]; totalunanswered?: number; warnings?: MoodleWarning[] }
interface QuizResult { state: string; attemptid: number; message: string; webUrl: string; warnings: MoodleWarning[] }
interface Field { name: string; kind: string; value: string; choices: { value: string; text: string }[]; clear?: string; stem?: string }
interface Form { fields: Field[]; sequenceName: string; sequence: string; values: Record<string, string>; fingerprint: string; text: string; media: boolean }
const supported = new Set(['description', 'multichoice', 'truefalse', 'shortanswer', 'numerical', 'match', 'gapselect', 'essay']);
const safeRules = new Set(['numattempts', 'openclosedate', 'timelimit', 'delaybetweenattempts', 'password']);
const expiryNotice = 'Moodle có thể xử lý hết giờ (tự nộp, grace period hoặc abandoned) khi mở phiên này. Thoát CLI không dừng đồng hồ.';
const urlOf = (q: Quiz) => `${SITE}/mod/quiz/view.php?id=${q.coursemodule}`;
const attemptUrl = (id: number) => `${SITE}/mod/quiz/attempt.php?attempt=${id}`;
const idOf = (id: Id, label: string) => requireId(String(id), label);
const date = (value?: number) => value ? `${new Date(value * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })} (Asia/Ho_Chi_Minh)` : 'không đặt';
const incomplete = (message: string): MoodleWarning => ({ warningcode: 'incomplete', message });
function result(state: string, id: number, message: string, warnings: MoodleWarning[] = []): QuizResult {
  return { state, attemptid: id, message, webUrl: attemptUrl(id), warnings };
}
function checked<T extends { warnings?: MoodleWarning[] }>(value: T): T {
  if (value.warnings?.length) throw new Error(`Moodle chưa xác nhận đầy đủ: ${value.warnings.map(w => render(w.message)).join('; ')}`);
  return value;
}
async function consent(confirm: (preview: string) => Promise<boolean>, preview: string) {
  try { if (await confirm(preview)) return; } catch { /* EOF cancels. */ }
  throw new Error('Đã hủy; không gửi thao tác quiz.');
}
async function ask(prompt: string, options?: { secret?: boolean }) {
  if (!options?.secret) return terminalAsk(prompt);
  if (!process.stdin.isTTY) throw new Error('Mật khẩu cần terminal tương tác.');
  process.stderr.write(`${render(prompt)} `);
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const io = createInterface({ input: process.stdin, output, terminal: true });
  try { return await io.question(''); }
  finally { io.close(); output.destroy(); process.stderr.write('\n'); }
}
async function basicQuizzes(token: string, courseId?: Id, timing?: ResponseTiming) {
  const params: Params = courseId === undefined ? {} : { 'courseids[0]': idOf(courseId, 'Course ID') };
  const response = await api<{ quizzes: Quiz[]; warnings?: MoodleWarning[] }>(token, 'mod_quiz_get_quizzes_by_courses', params, timing);
  if (!Array.isArray(response.quizzes)) throw new Error('Danh sách quiz không hợp lệ.');
  return { quizzes: response.quizzes.map(q => ({ ...q, timeopenLocal: date(q.timeopen), timecloseLocal: date(q.timeclose), webUrl: urlOf(q) })), warnings: response.warnings ?? [] };
}
async function attemptsFor(token: string, id: number) {
  const response = await api<{ attempts: Attempt[]; warnings?: MoodleWarning[] }>(token, 'mod_quiz_get_user_attempts', {
    quizid: id, userid: 0, status: 'all', includepreviews: false,
  });
  if (!Array.isArray(response.attempts)) throw new Error('Danh sách lượt quiz không hợp lệ.');
  return { attempts: response.attempts.map(a => ({ ...a, timestartLocal: date(a.timestart), timefinishLocal: date(a.timefinish), timemodifiedLocal: date(a.timemodified) })), warnings: response.warnings ?? [] };
}
async function quizById(token: string, id: Id, timing?: ResponseTiming) {
  const qid = idOf(id, 'Quiz ID');
  const response = await basicQuizzes(token, undefined, timing);
  const quiz = response.quizzes.find(q => q.id === qid);
  if (!quiz) throw new Error('Không tìm thấy Quiz ID hoặc không đủ quyền; xem quiz list.');
  return { quiz, warnings: response.warnings };
}
async function findAttempt(token: string, id: Id) {
  const attemptid = idOf(id, 'Attempt ID');
  const response = await basicQuizzes(token);
  for (const quiz of response.quizzes) {
    const a = await attemptsFor(token, quiz.id);
    const attempt = a.attempts.find(a => a.id === attemptid);
    if (attempt) return { quiz, attempt, warnings: [...response.warnings, ...a.warnings] };
  }
  throw new Error('Không tìm thấy lượt của bạn; xem quiz attempts <quiz-id>.');
}
export async function listQuizzes(token: string, courseId?: Id) {
  const response = await basicQuizzes(token, courseId);
  const quizzes = [];
  const warnings = [...response.warnings];
  for (let i = 0; i < response.quizzes.length; i += 4) {
    const batch = await Promise.all(response.quizzes.slice(i, i + 4).map(async quiz => {
      try {
        const attempts = await attemptsFor(token, quiz.id);
        const access = await api<Access>(token, 'mod_quiz_get_quiz_access_information', { quizid: quiz.id });
        warnings.push(...attempts.warnings, ...(access.warnings ?? []));
        return { ...quiz, introText: render(quiz.intro), attempts: attempts.attempts, allowedAttempts: quiz.attempts, access };
      } catch {
        warnings.push(incomplete(`Quiz ${quiz.id}: không đọc đủ lượt/điều kiện truy cập.`));
        return { ...quiz, introText: render(quiz.intro), allowedAttempts: quiz.attempts, attempts: null, access: null };
      }
    }));
    quizzes.push(...batch);
  }
  return { quizzes, warnings };
}
export async function viewQuiz(token: string, id: Id) {
  const { quiz, warnings } = await quizById(token, id);
  const attempts = await attemptsFor(token, quiz.id);
  const access = await api<Access>(token, 'mod_quiz_get_quiz_access_information', { quizid: quiz.id });
  return { ...quiz, introText: render(quiz.intro), allowedAttempts: quiz.attempts, attempts: attempts.attempts, access,
    warnings: [...warnings, ...attempts.warnings, ...(access.warnings ?? [])] };
}
export async function quizAttempts(token: string, id: Id) {
  const { quiz, warnings } = await quizById(token, id);
  const response = await attemptsFor(token, quiz.id);
  return { quizid: quiz.id, attempts: response.attempts, webUrl: urlOf(quiz), warnings: [...warnings, ...response.warnings] };
}
export async function quizStatus(token: string, id: Id) {
  const found = await findAttempt(token, id);
  return { ...found, endtime: null, answeredQuestions: null, webUrl: attemptUrl(found.attempt.id), warnings: [...found.warnings,
    incomplete('Lệnh đọc không xử lý hết giờ: endtime/hạn hiệu lực và số câu đã trả lời không có nguồn API chỉ đọc; trạng thái có thể chờ Moodle cập nhật.')] };
}
export async function reviewQuiz(token: string, id: Id) {
  const found = await findAttempt(token, id);
  if (found.attempt.state !== 'finished') throw new Error(`Chỉ review lượt đã kết thúc (finished); trạng thái ${found.attempt.state}. ${urlOf(found.quiz)}`);
  const response = await api<{ attempt: Attempt; questions: (Question & { text?: string })[]; grade?: string; warnings?: MoodleWarning[] }>(
    token, 'mod_quiz_get_attempt_review', { attemptid: found.attempt.id, page: -1 });
  return { ...response, questions: response.questions.map(q => ({ ...q, text: render(q.html) })), webUrl: `${SITE}/mod/quiz/review.php?attempt=${found.attempt.id}`,
    warnings: [...found.warnings, ...(response.warnings ?? [])] };
}
function validateAccess(quiz: Quiz, access: Access) {
  if (!access.canattempt || access.canpreview) throw new Error(`Không có quyền làm bài sinh viên. ${urlOf(quiz)}`);
  if (quiz.preferredbehaviour !== 'deferredfeedback') throw new Error(`Question behaviour chưa hỗ trợ: ${quiz.preferredbehaviour ?? 'không rõ'}. ${urlOf(quiz)}`);
  const unsupported = access.activerulenames.filter(rule => !safeRules.has(rule.replace(/^quizaccess_/, '')));
  if (unsupported.length || (quiz.browsersecurity && !['-', 'none'].includes(quiz.browsersecurity))) {
    throw new Error(`Access rule chưa hỗ trợ: ${unsupported.join(', ') || quiz.browsersecurity}. Dùng website: ${urlOf(quiz)}`);
  }
  if (!['free', 'seq'].includes(quiz.navmethod ?? '')) throw new Error(`Navigation method chưa hỗ trợ. ${urlOf(quiz)}`);
  if (!['autosubmit', 'graceperiod', 'autoabandon'].includes(quiz.overduehandling ?? '')) throw new Error(`Quy tắc hết giờ không rõ. ${urlOf(quiz)}`);
  checked(access);
}
async function password(access: Access, prompt: NonNullable<Options['ask']>): Promise<Params> {
  if (!access.activerulenames.some(rule => rule.replace(/^quizaccess_/, '') === 'password')) return {};
  let value: string;
  try { value = await prompt('Mật khẩu quiz (không hiển thị):', { secret: true }); }
  catch { throw new Error('Đã hủy nhập mật khẩu.'); }
  if (!value) throw new Error('Đã hủy nhập mật khẩu.');
  return { 'preflightdata[0][name]': 'quizpassword', 'preflightdata[0][value]': value };
}
function serverNow(timing: ResponseTiming) {
  if (timing.serverTime === undefined || timing.receivedAt === undefined) throw new Error('Không xác minh được thời gian server; dùng website.');
  // HTTP Date has one-second precision; stop conservatively at the next second.
  return timing.serverTime + 1 + (performance.now() - timing.receivedAt) / 1000;
}
const sameValues = (left: Record<string, string>, right: Record<string, string>) => JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
const fieldsParams = (values: Record<string, string>): Params => Object.fromEntries(Object.entries(values).flatMap(([name, value], i) => [
  [`data[${i}][name]`, name], [`data[${i}][value]`, value],
]));

function formFor(q: Question, attempt: Attempt): Form {
  if (!supported.has(q.type) || q.blockedbyprevious) throw new Error(`Câu ${q.questionnumber}: loại câu chưa hỗ trợ hoặc bị khóa.`);
  const { document } = parseHTML(q.html);
  const content = (document.querySelector('.qtext') ?? document).cloneNode(true) as Element;
  for (const control of Array.from(content.querySelectorAll('input, select, textarea, button'))) control.remove();
  const text = render(content.innerHTML ?? content.textContent);
  const media = !!document.querySelector('img, audio, video, math, iframe, object, embed, svg, canvas') || /\\\(|\\\[|\$\$/.test(q.html);
  if (q.type === 'description') return { fields: [], sequenceName: '', sequence: '', values: {}, fingerprint: '', text, media };
  if (!document.querySelector('.deferredfeedback') || document.querySelector('.adaptive, .interactive, .deferredcbm')) throw new Error('Question behaviour chưa hỗ trợ.');
  const expectedPrefix = `q${attempt.uniqueid}:${q.slot}_`;
  const controls = Array.from(document.querySelectorAll('input[name], select[name], textarea[name]'));
  if (controls.some(e => !e.getAttribute('name')!.startsWith(expectedPrefix))) throw new Error('Control không thuộc câu hỏi hiện tại.');
  const sequenceName = expectedPrefix + ':sequencecheck';
  const sequenceControl = controls.find(e => e.getAttribute('name') === sequenceName);
  if (!sequenceControl || !Number.isSafeInteger(q.sequencecheck) || sequenceControl.getAttribute('value') !== String(q.sequencecheck)) throw new Error('Thiếu hoặc sai sequence-check.');
  const fields: Field[] = [];
  const values: Record<string, string> = {};
  const seen = new Set<string>();
  const label = (e: Element) => {
    const id = e.getAttribute('id');
    const l = id ? Array.from(document.querySelectorAll('label')).find(l => l.getAttribute('for') === id) : undefined;
    return render(l?.innerHTML ?? e.closest('.r0,.r1')?.innerHTML ?? e.getAttribute('aria-label') ?? 'Lựa chọn');
  };
  for (const e of controls) {
    const name = e.getAttribute('name')!;
    const suffix = name.slice(expectedPrefix.length);
    const kind = e.localName === 'input' ? e.getAttribute('type') ?? 'text' : e.localName;
    if (suffix === ':sequencecheck' || suffix === ':flagged') continue;
    if (suffix.startsWith('-') || suffix.startsWith(':')) throw new Error('Control behaviour chưa hỗ trợ.');
    if (e.hasAttribute('disabled') || e.hasAttribute('readonly')) throw new Error('Câu hỏi không cho sửa.');
    const allowed = q.type === 'multichoice' ? /^(answer|choice\d+)$/ : q.type === 'truefalse' ? /^answer$/
      : q.type === 'match' ? /^sub\d+$/ : q.type === 'gapselect' ? /^p\d+$/ : q.type === 'numerical' ? /^(answer|unit)$/
      : q.type === 'essay' ? /^(answer|answerformat)$/ : /^answer$/;
    if (!allowed.test(suffix)) throw new Error(`Control ${suffix} chưa hỗ trợ; dùng website.`);
    if (kind === 'hidden') {
      if (q.type === 'essay' && suffix === 'answerformat' && e.getAttribute('value') === '2') { values[name] = '2'; continue; }
      if (q.type === 'multichoice' && /^choice\d+$/.test(suffix) && e.getAttribute('value') === '0') { values[name] = '0'; continue; }
      throw new Error('Hidden control chưa hỗ trợ.');
    }
    if (q.type === 'essay' && (kind !== 'textarea' || !e.classList.contains('qtype_essay_plain'))) throw new Error('Essay chỉ hỗ trợ plain text không đính kèm.');
    if (kind === 'radio' || kind === 'checkbox') {
      if (!['multichoice', 'truefalse'].includes(q.type) && !(q.type === 'numerical' && suffix === 'unit' && kind === 'radio')) throw new Error('Control lựa chọn không hợp lệ.');
      let field = fields.find(f => f.name === name);
      if (!field) { field = { name, kind, value: '', choices: [] }; fields.push(field); }
      if (field.kind !== kind) throw new Error('Control trùng tên khác loại.');
      const value = e.getAttribute('value');
      if (value === null) throw new Error('Lựa chọn không có giá trị.');
      if (kind === 'radio' && value === '-1') field.clear = value;
      else field.choices.push({ value, text: label(e) });
      if (e.hasAttribute('checked')) values[name] = value;
      else if (kind === 'checkbox' && !(name in values)) values[name] = '0';
      continue;
    }
    if (!['text', 'number', 'textarea', 'select'].includes(kind)) throw new Error('Control cần JavaScript/file chưa hỗ trợ.');
    if (seen.has(name) || fields.some(f => f.name === name)) throw new Error('Control trùng tên.');
    seen.add(name);
    if (kind === 'select') {
      if (e.hasAttribute('multiple')) throw new Error('Select multiple chưa hỗ trợ.');
      const options = Array.from(e.querySelectorAll('option'));
      if (options.some(o => o.hasAttribute('disabled'))) throw new Error('Lựa chọn khóa chưa hỗ trợ.');
      const current = options.find(o => o.hasAttribute('selected')) ?? options[0];
      if (!current || options.some(o => !o.hasAttribute('value'))) throw new Error('Select thiếu giá trị.');
      const clear = options.find(o => ['0', ''].includes(o.getAttribute('value')!))?.getAttribute('value') ?? undefined;
      const choices = options.filter(o => o.getAttribute('value') !== clear).map(o => ({ value: o.getAttribute('value')!, text: render(o.innerHTML) }));
      const stemNode = q.type === 'match' ? e.closest('tr')?.querySelector('td.text') : null;
      const stem = stemNode ? render(stemNode.innerHTML).replace(/\s+/g, ' ').trim() : undefined;
      if (q.type === 'match' && !stem) throw new Error('Không đọc được nội dung cần ghép của câu matching; dùng website.');
      values[name] = current.getAttribute('value')!;
      fields.push({ name, kind, value: values[name], choices, clear, stem });
    } else {
      values[name] = kind === 'textarea' ? e.textContent ?? '' : e.getAttribute('value') ?? '';
      fields.push({ name, kind, value: values[name], choices: [] });
    }
  }
  if (!fields.length || (q.type === 'essay' && values[expectedPrefix + 'answerformat'] !== '2')) throw new Error('Thiếu control trả lời được hỗ trợ.');
  if (q.type === 'multichoice' && fields.some(f => f.kind === 'checkbox' && values[f.name] !== '0' && values[f.name] !== '1')) throw new Error('Checkbox mapping chưa hỗ trợ.');
  const fingerprint = JSON.stringify([q.sequencecheck, q.lastactiontime, q.hasautosavedstep, fields, values]);
  return { fields, sequenceName, sequence: String(q.sequencecheck), values, fingerprint, text, media };
}
function answerFields(form: Form, input: string): Record<string, string> {
  const values = { ...form.values };
  if (input === ':clear') {
    for (const field of form.fields) {
      if (field.kind === 'select' && field.clear === undefined) throw new Error('Control này không cho xóa an toàn.');
      if (field.kind === 'radio' && field.clear === undefined) delete values[field.name];
      else values[field.name] = field.kind === 'checkbox' ? '0' : field.kind === 'radio' ? field.clear! : field.kind === 'select' ? field.clear! : '';
    }
    return values;
  }
  if (form.fields.every(f => f.kind === 'checkbox')) {
    const indexes = input.trim().split(/[,\s]+/).map(Number);
    if (!indexes.length || indexes.some(i => !Number.isInteger(i) || i < 1 || i > form.fields.length) || new Set(indexes).size !== indexes.length) throw new Error('Số lựa chọn không hợp lệ.');
    form.fields.forEach((f, i) => { values[f.name] = indexes.includes(i + 1) ? f.choices[0].value : '0'; });
    return values;
  }
  const inputs = form.fields.length === 1 ? [input] : input.split('|');
  if (inputs.length !== form.fields.length) throw new Error('Nhập một giá trị cho mỗi control, ngăn bằng |.');
  form.fields.forEach((field, i) => {
    if (['radio', 'select'].includes(field.kind)) {
      const index = Number(inputs[i].trim());
      if (!Number.isInteger(index) || index < 1 || index > field.choices.length) throw new Error('Số lựa chọn không hợp lệ.');
      values[field.name] = field.choices[index - 1].value;
    } else values[field.name] = inputs[i];
  });
  return values;
}
function promptFor(q: Question, form: Form, attemptid: number, endtime?: number, timing?: ResponseTiming) {
  const options = form.fields.map((f, i) => `${form.fields.length > 1 ? `${i + 1}. ` : ''}${f.stem ? `${f.stem} — ` : ''}${f.kind}: ${f.choices.map((c, j) => `${j + 1}) ${c.text}`).join('; ')}`).join('\n');
  return `Trang ${q.page + 1}, câu ${q.questionnumber} (${q.type}), ${render(q.status)}\n${form.text}\n${options}\n${form.media ? `Có hình/âm thanh/công thức không thể hiện đầy đủ; xem ${attemptUrl(attemptid)} hoặc website quiz.\n` : ''}${endtime ? `Hạn: ${date(endtime)}; còn khoảng ${Math.max(0, Math.floor(endtime - serverNow(timing!)))} giây.\n` : ''}Nhập câu trả lời${form.fields.length > 1 ? ' (các control ngăn bằng |; checkbox chọn số cách nhau bằng dấu phẩy)' : ''}; Enter giữ nguyên; :clear xóa; :quit thoát:`;
}

async function interact(token: string, quiz: Quiz, initial: Attempt, preflight: Params, prompt: NonNullable<Options['ask']>): Promise<QuizResult> {
  const id = initial.id;
  const timing: ResponseTiming = {};
  let page = initial.currentpage;
  const readPage = async () => checked(await api<Page>(token, 'mod_quiz_get_attempt_data', { attemptid: id, page, ...preflight }, timing));
  const remaining = async (): Promise<{ stop?: QuizResult; endtime?: number }> => {
    const access = checked(await api<AttemptAccess>(token, 'mod_quiz_get_attempt_access_information', { quizid: quiz.id, attemptid: id }, timing));
    const current = checked(await attemptsFor(token, quiz.id)).attempts.find(a => a.id === id);
    if (!current) throw new Error('Không xác minh được lượt hiện tại.');
    if (current.state !== 'inprogress') return { stop: result(current.state, id, `Moodle ghi nhận ${current.state}. ${current.state === 'overdue' ? 'Grace period chỉ cho nộp, không cho sửa; chạy quiz submit.' : ''}`) };
    if (access.endtime === undefined) throw new Error('Moodle không trả endtime; không thể xác minh hạn hiệu lực.');
    if (access.endtime && serverNow(timing) >= access.endtime) return { stop: result('expired', id, `Đã tới hạn server. Dừng sửa; Moodle quyết định ${quiz.overduehandling}. Chạy quiz status ${id}.`) };
    return { endtime: access.endtime };
  };
  try {
    let clock = await remaining();
    if (clock.stop) return clock.stop;
    let current = await readPage();
    for (;;) {
      if (current.attempt.state !== 'inprogress') return result(current.attempt.state, id, `Moodle ghi nhận ${current.attempt.state}.`);
      if (!Array.isArray(current.questions)) throw new Error('Dữ liệu câu hỏi không hợp lệ.');
      const forms = new Map<number, Form>();
      try { for (const q of current.questions) forms.set(q.slot, formFor(q, current.attempt)); }
      catch (error) { return result('unsupported', id, `${error instanceof Error ? error.message : 'Câu chưa hỗ trợ'} Tiếp tục cùng lượt trên website: ${attemptUrl(id)}. Câu đã lưu vẫn ở Moodle.`); }
      for (const question of current.questions) {
        const form = forms.get(question.slot)!;
        if (question.type === 'description') {
          console.error(`Trang ${page + 1}, ${form.text}${form.media ? `\nCó tài nguyên không thể hiện đầy đủ: ${attemptUrl(id)}` : ''}`);
          continue;
        }
        let input: string;
        try { input = await prompt(promptFor(question, form, id, clock.endtime, timing)); }
        catch { return result('paused', id, 'Đã thoát; chỉ các câu được server xác nhận còn ở Moodle. Không tự nộp.'); }
        if (input === ':quit') return result('paused', id, `Đã dừng. Tiếp tục: quiz resume ${id}.`);
        if (input === '') continue;
        let values: Record<string, string>;
        try { values = answerFields(form, input); }
        catch (error) { return result('paused', id, `${error instanceof Error ? error.message : 'Đầu vào không hợp lệ'} Chưa lưu câu đang nhập; chạy quiz resume ${id}.`); }
        const fresh = await readPage();
        const freshQ = fresh.questions.find(q => q.slot === question.slot);
        if (!freshQ || formFor(freshQ, fresh.attempt).fingerprint !== form.fingerprint || fresh.attempt.currentpage !== current.attempt.currentpage) {
          return result('conflict', id, 'Phát hiện câu/sequence-check thay đổi trên thiết bị khác. Chưa lưu câu đang nhập; không gửi lại.');
        }
        clock = await remaining();
        if (clock.stop) return clock.stop;
        const posted = { slots: String(question.slot), [form.sequenceName]: form.sequence, ...values };
        try {
          checked(await api<{ status: boolean; warnings?: MoodleWarning[] }>(token, 'mod_quiz_save_attempt', { attemptid: id, ...fieldsParams(posted), ...preflight }).then(r => {
            if (!r.status) throw new Error('Moodle không xác nhận lưu.'); return r;
          }));
        } catch (error) {
          if (error instanceof Error && /outofsequence/i.test(error.message)) return result('conflict', id, 'Sequence-check xung đột; chưa lưu câu vừa nhập. Không gửi lại.');
          // A timeout may have reached Moodle; never replay the answer.
          try {
            const after = await readPage();
            const q = after.questions.find(q => q.slot === question.slot);
            const saved = q && formFor(q, after.attempt);
            if (saved && sameValues(values, saved.values)) {
              return result('paused', id, `Đọc lại thấy câu khớp trên Moodle sau lỗi lưu; dừng để đối chiếu. quiz resume ${id}.`);
            }
          } catch { /* Expiry or a failed read leaves the save unconfirmed. */ }
          return result('uncertain', id, `Chưa xác nhận câu đang nhập đã lưu; Moodle có thể đã xử lý hết giờ. Không gửi lại tự động. quiz status ${id}.`);
        }
        current = await readPage();
        const savedQ = current.questions.find(q => q.slot === question.slot);
        const saved = savedQ && formFor(savedQ, current.attempt);
        if (!saved || !sameValues(values, saved.values)) {
          return result('conflict', id, 'Moodle chưa xác nhận đúng câu vừa lưu (có thể sequence-check xung đột). Dừng, không gửi lại.');
        }
        forms.set(question.slot, saved);
        console.error(`Câu ${render(question.questionnumber)} đã được server xác nhận lưu.`);
      }
      let navigation: string;
      const warning = quiz.navmethod === 'seq' && current.nextpage !== -1 ? ' — không thể quay lại sau khi sang trang' : '';
      try { navigation = (await prompt(`Trang ${page + 1}${warning}. next: trang kế; ${quiz.navmethod === 'free' && page > 0 ? 'back: trang trước; ' : ''}submit: nộp; quit: thoát:`)).trim(); }
      catch { return result('paused', id, 'Đã thoát; không tự nộp.'); }
      if (navigation === 'quit' || navigation === '') return result('paused', id, `Đã dừng. Tiếp tục quiz resume ${id}; nộp: quiz submit ${id}.`);
      if (navigation === 'submit') return submitQuiz(token, id, { ask: prompt, confirm: async preview => (await prompt(`${preview}\nNhập yes để xác nhận:`)).trim().toLowerCase() === 'yes' });
      const next = navigation === 'next' ? current.nextpage : navigation === 'back' && quiz.navmethod === 'free' ? page - 1 : -1;
      if (next < 0) return result('paused', id, `Không thể đi tới trang đó. Chưa nộp; dùng quiz resume ${id} hoặc quiz submit ${id}.`);
      clock = await remaining();
      if (clock.stop) return clock.stop;
      const fresh = await readPage();
      if (fresh.attempt.currentpage !== current.attempt.currentpage || fresh.questions.some(q => {
        const before = current.questions.find(old => old.slot === q.slot);
        return !before || formFor(q, fresh.attempt).fingerprint !== formFor(before, current.attempt).fingerprint;
      })) return result('conflict', id, 'Trang thay đổi trên thiết bị khác; không chuyển trang.');
      // Autosaved steps are promoted by Moodle on finish; empty slots never overwrite untouched responses.
      const processed = checked(await api<{ state: string; warnings?: MoodleWarning[] }>(token, 'mod_quiz_process_attempt', {
        attemptid: id, finishattempt: false, timeup: false, ...fieldsParams({ slots: '' }), ...preflight,
      }));
      if (processed.state !== 'inprogress') return result(processed.state, id, `Moodle ghi nhận ${processed.state}.`);
      const viewed = checked(await api<{ status: boolean; warnings?: MoodleWarning[] }>(token, 'mod_quiz_view_attempt', { attemptid: id, page: next, ...preflight }));
      if (!viewed.status) throw new Error('Moodle không xác nhận trang mới.');
      page = next;
      current = await readPage();
      clock = await remaining();
      if (clock.stop) return clock.stop;
    }
  } catch {
    let state = 'uncertain';
    try { state = (await attemptsFor(token, quiz.id)).attempts.find(a => a.id === id)?.state ?? state; } catch { /* Keep unknown. */ }
    return result(['finished', 'overdue', 'abandoned'].includes(state) ? state : 'uncertain', id,
      `Không tiếp tục ghi; chưa xác nhận câu/trang đang xử lý. Moodle có thể xử lý hết giờ. Chạy quiz status ${id} hoặc tiếp tục cùng lượt trên website.`);
  }
}

export async function startQuiz(token: string, id: Id, options: Options = {}): Promise<QuizResult> {
  const timing: ResponseTiming = {};
  const { quiz, warnings } = await quizById(token, id, timing);
  checked({ warnings });
  const access = checked(await api<Access>(token, 'mod_quiz_get_quiz_access_information', { quizid: quiz.id }, timing));
  validateAccess(quiz, access);
  if (access.preventaccessreasons.length) throw new Error(`${access.preventaccessreasons.map(render).join('; ')} ${urlOf(quiz)}`);
  const required = checked(await api<{ questiontypes: string[]; warnings?: MoodleWarning[] }>(token, 'mod_quiz_get_quiz_required_qtypes', { quizid: quiz.id }));
  if (!Array.isArray(required.questiontypes) || !required.questiontypes.length || quiz.hasquestions !== 1) throw new Error('Không xác định được loại câu hỏi; chưa tạo lượt.');
  const unsupported = required.questiontypes.filter(type => !supported.has(type) || type === 'essay');
  // required_qtypes exposes no essay attachment settings before a new attempt is consumed.
  if (unsupported.length) throw new Error(`Loại câu hỏi chưa hỗ trợ khi start: ${unsupported.join(', ')}. Essay cần kiểm tra control của lượt có sẵn; dùng website: ${urlOf(quiz)}`);
  const attempts = checked(await attemptsFor(token, quiz.id));
  const existing = attempts.attempts.find(a => ['inprogress', 'overdue'].includes(a.state));
  if (existing) throw new Error(`Đã có lượt chưa kết thúc. Chạy quiz resume ${existing.id}. ${urlOf(quiz)}`);
  if (quiz.attempts === undefined || quiz.attempts > 0 && attempts.attempts.length >= quiz.attempts) throw new Error(`Hết lượt hoặc không xác định giới hạn lượt. ${urlOf(quiz)}`);
  if (quiz.timelimit || quiz.timeclose || quiz.timeopen) serverNow(timing);
  const info = await api<SiteInfo>(token, 'core_webservice_get_site_info');
  const courses = (await listCourses(token)).courses;
  const course = courses.find(c => c.id === quiz.course);
  if (!course) throw new Error('Không xác minh được môn học của quiz.');
  const preview = `${render(info.fullname)} (${info.userid})\n${render(course.fullname)} / ${render(quiz.name)} (Quiz ID ${quiz.id})\n${render(quiz.intro)}\nĐã dùng ${attempts.attempts.length}/${quiz.attempts || 'không giới hạn'} lượt. Thời lượng ${quiz.timelimit ?? 'không rõ'} giây; đóng: ${date(quiz.timeclose)}.\nQuy tắc hết giờ: ${quiz.overduehandling}; grace period: ${quiz.graceperiod ?? 0} giây.\n${access.accessrules.map(render).join('\n')}\nCâu trả lời sẽ lưu ngay sau mỗi lần nhập. ${expiryNotice}\nBắt đầu sẽ tiêu thụ một lượt. ${urlOf(quiz)}`;
  await consent(options.confirm ?? terminalConfirm, preview);
  const prompt = options.ask ?? ask;
  const preflight = await password(access, prompt);
  const freshQuiz = await quizById(token, quiz.id, timing);
  checked(freshQuiz);
  const freshTypes = checked(await api<{ questiontypes: string[]; warnings?: MoodleWarning[] }>(token, 'mod_quiz_get_quiz_required_qtypes', { quizid: quiz.id }));
  if (JSON.stringify(freshQuiz.quiz) !== JSON.stringify(quiz) || JSON.stringify(freshTypes.questiontypes) !== JSON.stringify(required.questiontypes)) throw new Error('Quiz hoặc loại câu hỏi thay đổi sau xác nhận; chạy lại lệnh.');
  const accessNow = checked(await api<Access>(token, 'mod_quiz_get_quiz_access_information', { quizid: quiz.id }, timing));
  validateAccess(quiz, accessNow);
  if (accessNow.preventaccessreasons.length) throw new Error(accessNow.preventaccessreasons.map(render).join('; '));
  const freshAttempts = checked(await attemptsFor(token, quiz.id));
  if (JSON.stringify(freshAttempts.attempts) !== JSON.stringify(attempts.attempts)) throw new Error('Lượt đã thay đổi sau xác nhận; chạy lại lệnh.');
  const accessAttempt = checked(await api<AttemptAccess>(token, 'mod_quiz_get_attempt_access_information', { quizid: quiz.id, attemptid: 0 }, timing));
  if (accessAttempt.isfinished || accessAttempt.preventnewattemptreasons.length) throw new Error(`Không thể bắt đầu: ${accessAttempt.preventnewattemptreasons.map(render).join('; ')} ${urlOf(quiz)}`);
  if (quiz.timelimit || quiz.timeclose || quiz.timeopen) serverNow(timing);
  let response: { attempt: Attempt; warnings?: MoodleWarning[] };
  try { response = await api(token, 'mod_quiz_start_attempt', { quizid: quiz.id, forcenew: false, ...preflight }); }
  catch {
    let observed: Attempt[] = [];
    try { observed = (await attemptsFor(token, quiz.id)).attempts.filter(a => !attempts.attempts.some(old => old.id === a.id)); } catch { /* Unknown start result. */ }
    return result('uncertain', observed.length === 1 ? observed[0].id : 0,
      `Chưa xác định kết quả start; không tạo lại lượt. ${observed.length === 1 ? `Có lượt mới: kiểm tra quiz status ${observed[0].id}, rồi quiz resume ${observed[0].id}.` : `Kiểm tra quiz attempts ${quiz.id} và website.`}`);
  }
  checked(response);
  if (!response.attempt || !Number.isSafeInteger(response.attempt.id) || response.attempt.id <= 0 || response.attempt.quiz !== quiz.id || response.attempt.userid !== info.userid || response.attempt.state !== 'inprogress') {
    throw new Error(`Moodle không tạo lượt hợp lệ; không thử lại. Xem quiz attempts ${quiz.id}.`);
  }
  return interact(token, quiz, response.attempt, preflight, prompt);
}

export async function resumeQuiz(token: string, id: Id, options: Options = {}): Promise<QuizResult> {
  const found = await findAttempt(token, id);
  checked(found);
  if (!['inprogress', 'overdue'].includes(found.attempt.state)) return result(found.attempt.state, found.attempt.id, `Moodle ghi nhận ${found.attempt.state}; không mở lại lượt.`);
  const access = await api<Access>(token, 'mod_quiz_get_quiz_access_information', { quizid: found.quiz.id });
  validateAccess(found.quiz, access);
  const prompt = options.ask ?? ask;
  await consent(async preview => (await prompt(`${preview}\nNhập yes để xác nhận:`)).trim().toLowerCase() === 'yes',
    `Tiếp tục ${render(found.quiz.name)}, Attempt ID ${found.attempt.id}. ${expiryNotice}`);
  const preflight = await password(access, prompt);
  return interact(token, found.quiz, found.attempt, preflight, prompt);
}

export async function submitQuiz(token: string, id: Id, options: Options = {}): Promise<QuizResult> {
  const found = await findAttempt(token, id);
  checked(found);
  const { quiz, attempt } = found;
  if (!['inprogress', 'overdue'].includes(attempt.state)) return result(attempt.state, attempt.id, `Moodle ghi nhận ${attempt.state}; không gửi nộp lần nữa.`);
  const confirm = options.confirm ?? terminalConfirm;
  await consent(confirm, `${render(quiz.name)}, Attempt ID ${attempt.id}. Đọc summary mới trước nộp. ${expiryNotice}`);
  const access = checked(await api<Access>(token, 'mod_quiz_get_quiz_access_information', { quizid: quiz.id }));
  validateAccess(quiz, access);
  const preflight = await password(access, options.ask ?? ask);
  const readSummary = async () => checked(await api<Summary>(token, 'mod_quiz_get_attempt_summary', { attemptid: attempt.id, ...preflight }));
  const signature = (s: Summary) => JSON.stringify([s.totalunanswered, s.questions.map(q => [q.slot, q.sequencecheck, q.lastactiontime, q.hasautosavedstep, q.status, q.html])]);
  let summary: Summary;
  try { summary = await readSummary(); }
  catch {
    const observed = (await attemptsFor(token, quiz.id)).attempts.find(a => a.id === attempt.id);
    if (observed && ['finished', 'abandoned'].includes(observed.state)) return result(observed.state, attempt.id, `Moodle ghi nhận ${observed.state}.`);
    return result('uncertain', attempt.id, `Không đọc được summary (có thể đã hết giờ). Chạy quiz status ${attempt.id}; chưa gửi nộp.`);
  }
  const unAnswered = summary.questions.filter(q => q.stateclass === 'notyetanswered').map(q => q.questionnumber);
  const preview = `${render(quiz.name)}, Attempt ID ${attempt.id}. Chưa trả lời: ${summary.totalunanswered ?? 'không xác định đầy đủ'}${unAnswered.length ? `; câu ${unAnswered.map(render).join(', ')}` : ''}.\nSau nộp không thể sửa. Nộp toàn bộ bài?`;
  try { await consent(confirm, preview); }
  catch { return result('paused', attempt.id, 'Đã hủy nộp; câu đã lưu vẫn ở Moodle.'); }
  const fresh = await readSummary();
  if (signature(fresh) !== signature(summary)) return result('conflict', attempt.id, 'Summary thay đổi sau xác nhận; không nộp. Chạy lại quiz submit.');
  const before = checked(await attemptsFor(token, quiz.id)).attempts.find(a => a.id === attempt.id);
  if (!before) return result('uncertain', attempt.id, 'Không xác minh được lượt; chưa gửi nộp.');
  if (['finished', 'abandoned'].includes(before.state)) return result(before.state, attempt.id, `Moodle ghi nhận ${before.state}.`);
  if (before.state === 'overdue' && quiz.overduehandling !== 'graceperiod') return result('overdue', attempt.id, 'Moodle ghi nhận overdue; tiếp tục trên website.');
  let failed = false;
  try {
    checked(await api<{ state: string; warnings?: MoodleWarning[] }>(token, 'mod_quiz_process_attempt', {
      attemptid: attempt.id, finishattempt: true, timeup: false, ...fieldsParams({ slots: '' }), ...preflight,
    }));
  } catch { failed = true; }
  try {
    const observed = checked(await attemptsFor(token, quiz.id)).attempts.find(a => a.id === attempt.id);
    if (observed && ['finished', 'overdue', 'abandoned'].includes(observed.state)) return result(observed.state, attempt.id, `Moodle xác nhận trạng thái ${observed.state}.`);
  } catch { /* A write response alone does not prove the observed final state. */ }
  return result('uncertain', attempt.id, `${failed ? 'Nộp bị lỗi/mất kết nối.' : 'Chưa thấy trạng thái kết thúc trên server.'} Không nộp lại tự động; chạy quiz status ${attempt.id} trước khi thử lại.`);
}
