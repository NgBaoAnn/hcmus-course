#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { openDefaultBrowser, registerProtocolHandler, unregisterProtocolHandler } from './protocol.js';
import { api, decodeAppToken, publicConfig, SITE, type SiteInfo } from './moodle.js';
import { listAssignments, viewAssignment, assignmentStatus, downloadAssignment, submitAssignment } from './assignments.js';
import { listQuizzes, viewQuiz, quizAttempts, quizStatus, startQuiz, resumeQuiz, submitQuiz, reviewQuiz } from './quizzes.js';
import { ask, formatCards, formatLocalDate, formatStatus, render, requireId, show, withProgress } from './terminal.js';
import { listCourses, viewCourse, deadlines, grades, notices, type Course, type AssignmentsResponse } from './student.js';
import { calendar, progress, notifications, forums, forumDiscussions, forumView } from './campus.js';

const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'course-cli-spike');
const authFile = join(configDir, 'auth.json');
const pendingLoginFile = join(configDir, 'pending-login.json');
const print = (value: unknown) => show(value, { json: true });
const printCards = (title: string, cards: { title: string; lines: string[] }[]) => console.log(formatCards(title, cards));
const field = (label: string, value: string | number | null | undefined) => `${label}: ${value ?? 'Không rõ'}`;
const reportWarnings = (warnings: { message?: string; warningcode?: string }[] = []) => {
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    const message = render(warning.message || warning.warningcode);
    counts.set(message, (counts.get(message) ?? 0) + 1);
  }
  for (const [message, count] of counts) {
    const label = `Cảnh báo${count > 1 ? ` (${count})` : ''}:`;
    const prefix = process.stderr.isTTY && process.env.NO_COLOR === undefined ? `\x1b[1;33m⚠ ${label}\x1b[0m` : label;
    console.error(`${prefix} ${message}`);
  }
};
const diagnosticJson = (args: string[]) => {
  const { values } = parseArgs({ args, options: { json: { type: 'boolean' } } });
  return values.json === true || !process.stdout.isTTY;
};
const launchPath = '/admin/tool/mobile/launch.php';
interface PendingLogin { loginId: string; passport: string; expiresAt: number }
type LoginResult = { authenticated: true; userid: number; mssv?: string; fullname?: string } | { authenticated: false; message: string };

async function saveToken(token: string, directory = configDir) {
  const tokenFile = join(directory, 'auth.json');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${tokenFile}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ token }), { mode: 0o600, flag: 'wx' });
    await rename(temporary, tokenFile);
  } finally { await rm(temporary, { force: true }); }
}

async function authCallback(href: string, directory = configDir) {
  const pendingLoginFile = join(directory, 'pending-login.json');
  let pending: PendingLogin;
  try { pending = JSON.parse(await readFile(pendingLoginFile, 'utf8')) as PendingLogin; }
  catch { throw new Error('Không có lần đăng nhập đang chờ hoặc callback đã được dùng.'); }
  if (!/^[a-f0-9]{32}$/.test(pending.loginId) || !/^[a-f0-9]{64}$/.test(pending.passport) ||
      !Number.isSafeInteger(pending.expiresAt) || pending.expiresAt < Date.now()) {
    throw new Error('Lần đăng nhập đã hết hạn hoặc không hợp lệ.');
  }
  const token = decodeAppToken(href, pending.passport);
  const claimed = join(directory, `pending-login-${pending.loginId}.json`);
  try { await rename(pendingLoginFile, claimed); }
  catch { throw new Error('Callback đã được xử lý hoặc lần đăng nhập không còn chờ.'); }
  try {
    const info = await api<SiteInfo>(token, 'core_webservice_get_site_info');
    if (!Number.isSafeInteger(info.userid) || info.userid <= 0) throw new Error('API không trả thông tin sinh viên hợp lệ.');
    await saveToken(token, directory);
    const result: LoginResult = { authenticated: true, userid: info.userid, mssv: info.username, fullname: info.fullname };
    await writeFile(join(directory, `login-${pending.loginId}.json`), JSON.stringify(result), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    await writeFile(join(directory, `login-${pending.loginId}.json`), JSON.stringify({
      authenticated: false, message: error instanceof Error ? error.message : 'Không xác minh được tài khoản Moodle.',
    }), { mode: 0o600, flag: 'wx' });
  } finally { await rm(claimed, { force: true }); }
}

async function waitForLogin(loginId: string, expiresAt: number): Promise<LoginResult> {
  const resultFile = join(configDir, `login-${loginId}.json`);
  while (Date.now() < expiresAt + 35_000) {
    try {
      const result = JSON.parse(await readFile(resultFile, 'utf8')) as LoginResult;
      await rm(resultFile, { force: true });
      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Đăng nhập quá thời hạn hoặc chưa hoàn tất. Chạy lại auth login để thử.');
}

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
    oauthsso: new URL(microsoft.url).searchParams.get('id') ?? '',
  }).toString();

  const loginId = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 600_000;
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  try {
    const previous = JSON.parse(await readFile(pendingLoginFile, 'utf8')) as PendingLogin;
    if (previous.expiresAt > Date.now()) throw new Error('Đang có lần đăng nhập khác chờ callback.');
    await rm(pendingLoginFile, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && error instanceof Error && error.message === 'Đang có lần đăng nhập khác chờ callback.') throw error;
  }
  await writeFile(pendingLoginFile, JSON.stringify({ loginId, passport, expiresAt }), { mode: 0o600, flag: 'wx' });
  let registered = false;
  try {
    registered = true;
    await registerProtocolHandler({ configDir });
    console.error('Đang mở trình duyệt mặc định. Đăng nhập Microsoft và cho phép mở Course CLI nếu được hỏi.');
    console.error('CLI chỉ nhận token Moodle; không lưu mật khẩu hoặc cookie Microsoft.');
    await openDefaultBrowser(launch.href);
    const result = await waitForLogin(loginId, expiresAt);
    if (!result.authenticated) throw new Error(`Không xác minh được tài khoản Moodle: ${result.message}`);
    print({ ...result, tokenFile: authFile });
  } finally {
    if (registered) {
      try { await unregisterProtocolHandler(); }
      catch { console.error('Cảnh báo: không gỡ được protocol handler coursecli://; chạy auth logout để dọn cấu hình.'); }
    }
    await rm(pendingLoginFile, { force: true });
    await rm(join(configDir, `pending-login-${loginId}.json`), { force: true });
    await rm(join(configDir, `login-${loginId}.json`), { force: true });
  }
}

async function readToken(): Promise<string> {
  let token: unknown;
  try {
    ({ token } = JSON.parse(await readFile(authFile, 'utf8')));
    if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) throw new Error();
  } catch {
    throw new Error('Chưa có token hợp lệ. Chạy: course auth login');
  }
  return token;
}

async function probe() {
  const token = await readToken();
  const info = await api<SiteInfo>(token, 'core_webservice_get_site_info');
  const names = new Set(info.functions?.map((fn) => fn.name));
  const capabilities = Object.fromEntries([
    'core_enrol_get_users_courses', 'mod_assign_get_assignments',
    'mod_assign_get_submission_status', 'mod_assign_save_submission', 'mod_assign_submit_for_grading',
  ].map((name) => [name, names.has(name)]));
  if (!capabilities.core_enrol_get_users_courses || !capabilities.mod_assign_get_assignments) {
    print({ userid: info.userid, capabilities });
    throw new Error('Token chưa được cấp đủ API để đọc môn học và bài tập.');
  }
  const courses = await api<Course[]>(token, 'core_enrol_get_users_courses', { userid: info.userid });
  if (!Array.isArray(courses)) throw new Error('Danh sách môn học trả về không hợp lệ.');
  // shortcut: probe reads all enrolled courses once, add course selection in the real CLI.
  const params = Object.fromEntries(courses.map((course, index) => [`courseids[${index}]`, course.id]));
  const result = courses.length ? await api<AssignmentsResponse>(token, 'mod_assign_get_assignments', params) : { courses: [], warnings: [] };
  if (!Array.isArray(result.courses)) throw new Error('Danh sách bài tập trả về không hợp lệ.');
  const assignments = result.courses.flatMap((course) =>
    (course.assignments ?? []).map((assignment) => ({ ...assignment, courseid: course.id })));
  const sample = assignments.find((assignment) => assignment.intro || assignment.introattachments?.length) ?? assignments[0];
  return {
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
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.join(' ');
  if (args[0] === 'quiz') {
    const action = args[1];
    if (!['list', 'view', 'attempts', 'status', 'start', 'resume', 'submit', 'review'].includes(action)) throw new Error('Lệnh quiz không hợp lệ.');
    const readOnly = ['list', 'view', 'attempts', 'status', 'review'].includes(action);
    const options = {
      ...(readOnly ? { json: { type: 'boolean' as const } } : {}),
      ...(action === 'list' ? { course: { type: 'string' as const } } : {}),
    };
    const { values, positionals } = parseArgs({ args: args.slice(2), options, allowPositionals: true });
    if (positionals.length !== (action === 'list' ? 0 : 1)) throw new Error('Đối số quiz không hợp lệ.');
    const id = action === 'list' ? undefined : requireId(positionals[0], ['view', 'attempts', 'start'].includes(action) ? 'Quiz ID' : 'Attempt ID');
    const courseId = values.course === undefined ? undefined : requireId(String(values.course), 'Course ID');
    const token = await readToken();
    const load = async () => action === 'list' ? await listQuizzes(token, courseId)
      : action === 'view' ? await viewQuiz(token, id)
      : action === 'attempts' ? await quizAttempts(token, id)
      : action === 'status' ? await quizStatus(token, id)
      : action === 'start' ? await startQuiz(token, id)
      : action === 'resume' ? await resumeQuiz(token, id)
      : action === 'submit' ? await submitQuiz(token, id) : await reviewQuiz(token, id);
    const result = readOnly && !values.json ? await withProgress('Đang đọc quiz từ Moodle…', load) : await load();
    reportWarnings(result.warnings);
    if (values.json) show(result, { json: true });
    else if ('quizzes' in result) printCards(`Quiz · ${result.quizzes.length}`, result.quizzes.map(q => ({
      title: `#${q.id} · ${q.name}`,
      lines: [field('Môn', q.course), field('Thời lượng', q.timelimit ? `${q.timelimit} giây` : 'Không giới hạn'),
        `Lượt: ${q.attempts?.length ?? 'Không rõ'}/${q.allowedAttempts ?? 'Không rõ'}${q.allowedAttempts === 0 ? ' (không giới hạn)' : ''}`,
        `Mở: ${formatLocalDate(q.timeopen)} · Đóng: ${formatLocalDate(q.timeclose)}`,
        q.introText ? `Đề: ${q.introText}` : '',
        ...(q.access ? [...q.access.accessrules, ...q.access.preventaccessreasons] : ['Chưa đọc đủ điều kiện truy cập.']), q.webUrl,
      ].filter(Boolean),
    })));
    else if ('state' in result) {
      printCards('Kết quả quiz', [{ title: formatStatus(result.state), lines: [result.message, result.webUrl] }]);
      if (['uncertain', 'conflict', 'unsupported', 'expired', 'abandoned'].includes(result.state)) process.exitCode = 1;
    } else if ('allowedAttempts' in result && 'introText' in result) printCards('Chi tiết quiz', [{
      title: `#${result.id} · ${result.name}`,
      lines: [field('Môn', result.course), `Thời lượng: ${result.timelimit ? `${result.timelimit} giây` : 'Không giới hạn'}`,
        `Lượt đã dùng: ${result.attempts.length}/${result.allowedAttempts || 'Không giới hạn'}`,
        `Mở: ${formatLocalDate(result.timeopen)} · Đóng: ${formatLocalDate(result.timeclose)}`, result.introText || 'Không có mô tả.',
        ...result.access.accessrules, ...result.access.preventaccessreasons, result.webUrl],
    }]);
    else if ('attempt' in result && 'quiz' in result) printCards('Trạng thái quiz', [{
      title: `Lượt #${result.attempt.id} · ${formatStatus(result.attempt.state)}`,
      lines: [field('Quiz ID', result.quiz.id), `Lượt: ${result.attempt.attempt}`,
        `Bắt đầu: ${formatLocalDate(result.attempt.timestart)}`, `Cập nhật: ${formatLocalDate(result.attempt.timemodified)}`,
        'Hạn hiệu lực và số câu đã trả lời không có từ API chỉ đọc.', result.webUrl],
    }]);
    else if ('attempts' in result) printCards(`Lượt làm quiz #${result.quizid}`, [...result.attempts.map(attempt => ({
      title: `Lượt #${attempt.id} · ${formatStatus(attempt.state)}`,
      lines: [field('Lượt', attempt.attempt), `Bắt đầu: ${formatLocalDate(attempt.timestart)}`,
        `Nộp: ${attempt.timefinish > 0 ? formatLocalDate(attempt.timefinish) : 'Chưa nộp'}`],
    })), { title: 'Mở quiz trên Moodle', lines: [result.webUrl] }]);
    else if ('questions' in result) printCards(`Bài quiz đã nộp${result.grade ? ` · Điểm ${result.grade}` : ''}`,
      [...result.questions.map(question => ({
        title: `Câu ${question.questionnumber || question.slot}`,
        lines: [question.status ? `Trạng thái: ${formatStatus(question.status)}` : '', question.text ?? '',
          ...Object.entries(question).filter(([key]) => !['html', 'text', 'slot', 'questionnumber', 'status', 'page', 'type'].includes(key))
            .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)],
      })), { title: 'Mở bài review trên Moodle', lines: [result.webUrl] }]);
    else show(result);
  } else if (args[0] === 'assignment') {
    const action = args[1];
    if (!['list', 'view', 'status', 'download', 'submit'].includes(action)) throw new Error('Lệnh assignment không hợp lệ.');
    const options = {
      ...(action !== 'submit' ? { json: { type: 'boolean' as const } } : {}),
      ...(action === 'list' ? { course: { type: 'string' as const } } : {}),
      ...(action === 'download' ? { output: { type: 'string' as const } } : {}),
      ...(action === 'submit' ? { 'text-file': { type: 'string' as const }, draft: { type: 'boolean' as const } } : {}),
    };
    const { values, positionals } = parseArgs({ args: args.slice(2), options, allowPositionals: true });
    if (action === 'list' ? positionals.length !== 0 : action === 'submit' ? positionals.length < 1 : positionals.length !== 1) {
      throw new Error('Đối số assignment không hợp lệ.');
    }
    const id = action === 'list' ? undefined : requireId(positionals[0], 'Assignment ID');
    const courseId = values.course === undefined ? undefined : requireId(String(values.course), 'Course ID');
    const token = await readToken();
    const load = async () => action === 'list' ? await listAssignments(token, courseId)
      : action === 'view' ? await viewAssignment(token, id)
      : action === 'status' ? await assignmentStatus(token, id)
      : action === 'download' ? await downloadAssignment(token, id, typeof values.output === 'string' ? values.output : undefined)
      : await submitAssignment(token, id, { files: positionals.slice(1), textFile: typeof values['text-file'] === 'string' ? values['text-file'] : undefined, draft: values.draft === true });
    const result = action === 'submit' || values.json ? await load() : await withProgress('Đang đọc bài tập từ Moodle…', load);
    reportWarnings(result.warnings);
    if (values.json) show(result, { json: true });
    else if ('assignments' in result) printCards(`Bài tập · ${result.assignments.length}`, result.assignments.map(a => ({
      title: `#${a.id} · ${a.name}`,
      lines: [field('Môn', `${a.coursename} (${a.courseid})`), `Hạn: ${formatLocalDate(a.duedate)}`,
        ...(a.cutoffdate > 0 ? [`Hạn cuối nhận bài: ${formatLocalDate(a.cutoffdate)}`] : []), a.webUrl],
    })));
    else if ('introText' in result) {
      const submission = result.status.lastattempt?.teamsubmission ?? result.status.lastattempt?.submission;
      printCards('Chi tiết bài tập', [{
        title: `#${result.id} · ${result.name}`,
        lines: [field('Môn', `${result.coursename} (${result.courseid})`), `Mở nhận bài: ${formatLocalDate(result.allowsubmissionsfromdate)}`,
          `Hạn: ${formatLocalDate(result.duedate)}`,
          ...(result.cutoffdate > 0 ? [`Hạn cuối nhận bài: ${formatLocalDate(result.cutoffdate)}`] : []),
          `Hình thức nộp: ${result.configs.filter(config => config.subtype === 'assignsubmission' && config.name === 'enabled' && config.value === '1').map(config => config.plugin).join(', ') || 'Không rõ'}`,
          `Nộp nhóm: ${result.teamsubmission ? 'Có' : 'Không'} · Lưu nháp: ${result.submissiondrafts ? 'Có' : 'Không'}`,
          `Trạng thái: ${formatStatus(submission?.status ?? 'unknown')}`, result.introText || 'Không có mô tả.',
          ...(result.status.feedback ? [`Phản hồi: ${JSON.stringify(result.status.feedback)}`] : []),
          ...(result.introattachments ?? []).map(file => `Tệp đề: ${file.filename} (${file.filesize} bytes)`), result.webUrl],
      }]);
    }
    else if ('state' in result) {
      printCards('Kết quả nộp bài', [{ title: formatStatus(result.state), lines: [result.message,
        ...(result.pendingMembers?.length ? [`Thành viên còn cần xác nhận: ${result.pendingMembers.join(', ')}`] : []), result.webUrl] }]);
      if (result.state === 'uncertain' || (!values.draft && result.state !== 'submitted')) process.exitCode = 1;
    } else if ('downloaded' in result) printCards('Đã tải file', result.downloaded.map(path => ({ title: path, lines: [] })));
    else if ('lastattempt' in result) {
      const attempt = result.lastattempt;
      const submission = attempt?.teamsubmission ?? attempt?.submission;
      printCards('Trạng thái bài tập', [{ title: submission ? formatStatus(submission.status) : 'Không có lượt nộp',
        lines: [field('Lượt', submission?.attemptnumber), `Có thể sửa: ${attempt?.canedit ? 'Có' : 'Không'}`,
          `Được phép nộp: ${attempt?.cansubmit ? 'Có' : 'Không'}`,
          ...(result.feedback ? [`Phản hồi: ${JSON.stringify(result.feedback)}`] : [])] }]);
    } else show(result);
  } else if (args[0] === 'forum') {
    const action = args[1];
    if (!['list', 'discussions', 'view'].includes(action)) throw new Error('Lệnh forum không hợp lệ.');
    const { values, positionals } = parseArgs({ args: args.slice(2), allowPositionals: true, options: {
      json: { type: 'boolean' },
      ...(action === 'list' ? { course: { type: 'string' as const } } : {}),
      ...(action === 'discussions' ? { page: { type: 'string' as const } } : {}),
    } });
    if (positionals.length !== (action === 'list' ? 0 : 1)) throw new Error('Đối số forum không hợp lệ.');
    const id = action === 'list' ? undefined : requireId(positionals[0], action === 'view' ? 'Discussion ID' : 'Forum ID');
    const courseId = values.course === undefined ? undefined : requireId(String(values.course), 'Course ID');
    const page = values.page === undefined ? 1 : requireId(String(values.page), 'Số trang');
    const token = await readToken();
    const load = async () => action === 'list' ? await forums(token, courseId)
      : action === 'discussions' ? await forumDiscussions(token, id, page) : await forumView(token, id);
    const result = values.json ? await load() : await withProgress('Đang đọc diễn đàn Moodle…', load);
    reportWarnings(result.warnings);
    if (values.json) show(result, { json: true });
    else if ('forums' in result) printCards(`Diễn đàn · ${result.forums.length}`, result.forums.map(forum => ({
      title: `#${forum.id} · ${forum.name}`, lines: [`Môn: ${forum.course} · Loại: ${forum.type}`,
        `Chủ đề: ${forum.numdiscussions ?? 'Không rõ'}`, forum.introText, forum.webUrl],
    })));
    else if ('discussions' in result) printCards(`Chủ đề · Forum #${result.forumid} · Trang ${result.page}`, result.discussions.map(d => ({
      title: `#${d.discussion} · ${d.subject}`, lines: [`Trả lời: ${d.numreplies ?? 0} · Chưa đọc: ${d.numunread ?? 0}`,
        `Đăng lúc: ${formatLocalDate(d.created)}`, d.locked ? 'Trạng thái: Đã khóa' : '', d.messageText, d.webUrl],
    })));
    else printCards(`Thảo luận #${result.discussionid} · ${result.posts.length} bài viết`, result.posts.map(post => ({
      title: `#${post.id} · ${post.subject}`, lines: [field('Người viết', post.author?.fullname),
        `Đăng lúc: ${formatLocalDate(post.timecreated)}`, post.messageText,
        ...(post.attachments ?? []).map(file => `Tệp: ${file.filename}${file.fileurl ? ` · ${file.fileurl}` : ''}`), post.webUrl],
    })));
  } else if (['list', 'view', 'deadlines', 'grades', 'notices', 'calendar', 'progress', 'notifications'].includes(args[0])) {
    const action = args[0];
    const options = {
      json: { type: 'boolean' as const },
      ...(action === 'list' ? { all: { type: 'boolean' as const } } : {}),
      ...(['deadlines', 'grades', 'notices', 'calendar', 'progress'].includes(action) ? { course: { type: 'string' as const } } : {}),
      ...(['deadlines', 'calendar'].includes(action) ? { days: { type: 'string' as const } } : {}),
      ...(action === 'deadlines' ? { overdue: { type: 'boolean' as const } } : {}),
      ...(action === 'notifications' ? { limit: { type: 'string' as const } } : {}),
    };
    const { values, positionals } = parseArgs({ args: args.slice(1), options, allowPositionals: true });
    if (positionals.length !== (action === 'view' ? 1 : 0)) throw new Error(`Đối số không hợp lệ cho course ${action}.`);
    const id = action === 'view' ? requireId(positionals[0], 'Course ID')
      : values.course !== undefined || ['grades', 'notices', 'progress'].includes(action) ? requireId(typeof values.course === 'string' ? values.course : undefined, 'Course ID') : undefined;
    const days = values.days === undefined ? 14 : requireId(typeof values.days === 'string' ? values.days : undefined, 'Số ngày');
    const limit = values.limit === undefined ? 20 : requireId(String(values.limit), 'Giới hạn');
    const token = await readToken();
    let all = values.all === true;
    if (action === 'list' && !all && !values.json && process.stdin.isTTY && process.stdout.isTTY) {
      printCards('Chọn phạm vi môn học', [
        { title: '1 · Năm học hiện tại', lines: ['Nhấn Enter để chọn nhanh.'] },
        { title: '2 · Tất cả môn', lines: ['Bao gồm các năm học trước.'] },
      ]);
      const choice = (await ask('Chọn 1 hoặc 2:')).trim();
      if (!['', '1', '2'].includes(choice)) throw new Error('Vui lòng chọn 1 hoặc 2.');
      all = choice === '2';
    }
    const load = async () => action === 'list' ? await listCourses(token, !all)
      : action === 'view' ? await viewCourse(token, id)
      : action === 'deadlines' ? await deadlines(token, { courseId: id, days, overdue: values.overdue === true })
      : action === 'grades' ? await grades(token, id)
      : action === 'notices' ? await notices(token, id)
      : action === 'calendar' ? await calendar(token, id, days)
      : action === 'progress' ? await progress(token, id) : await notifications(token, limit);
    const result = values.json ? await load() : await withProgress(action === 'deadlines' ? 'Đang kiểm tra hạn từ Moodle…' : 'Đang đọc dữ liệu Moodle…', load);
    reportWarnings(result.warnings);
    if (values.json) show(result, { json: true });
    else if ('courses' in result) printCards(`${result.academicYear ? `Môn học ${result.academicYear}` : 'Tất cả môn học'} · ${result.courses.length}`,
      result.courses.map(course => ({ title: `#${course.id} · ${course.fullname}`, lines: [course.webUrl] })));
    else if ('sections' in result) printCards(`Nội dung môn học · ${result.sections.length}`, result.sections.map(section => ({
      title: section.name,
      lines: [section.summaryText, ...section.modules.flatMap(module => [`${module.modname}: ${module.name}`, module.descriptionText, module.url ?? '']).filter(Boolean)],
    })).concat([{ title: 'Mở trên Moodle', lines: [result.webUrl] }]));
    else if ('deadlines' in result) printCards(`Hạn nộp / đóng quiz · ${days} ngày tới${values.overdue ? ' + quá hạn' : ''} · ${result.deadlines.length}`, result.deadlines.map(deadline => ({
      title: `${deadline.type === 'assignment' ? 'Bài tập' : 'Quiz'} #${deadline.id} · ${deadline.name}${deadline.overdue ? ' · Quá hạn' : ''}`,
      lines: [field('Môn ID', deadline.courseid), `Hạn: ${formatLocalDate(deadline.due)}`,
        `Trạng thái: ${formatStatus(deadline.state)}`,
        ...(deadline.cutoff && deadline.cutoff > 0 ? [`Hạn cuối nhận bài: ${formatLocalDate(deadline.cutoff)}`] : []),
        ...(deadline.attemptsRemaining != null ? [`Lượt còn: ${deadline.attemptsRemaining}`] : []), deadline.webUrl],
    })));
    else if ('usergrades' in result) printCards(`Điểm · ${(result.usergrades ?? []).reduce((count, entry) => count + (entry.gradeitems?.length ?? 0), 0)}`,
      (result.usergrades ?? []).flatMap(entry => (entry.gradeitems ?? []).map(item => ({
      title: render(item.itemname ?? 'Mục điểm'),
      lines: [`Điểm: ${render(item.gradeformatted ?? 'Chưa có')}${item.rangeformatted ? ` / ${render(item.rangeformatted)}` : ''}`,
        ...(item.gradehiddenbydate || item.hidden ? ['Đang ẩn'] : [])],
    }))));
    else if ('notices' in result) printCards(`Thông báo · ${result.notices.length}`, result.notices.map(notice => ({
      title: notice.subject, lines: [field('Diễn đàn', notice.forumname), `Đăng lúc: ${formatLocalDate(notice.created)}`, notice.messageText, notice.webUrl],
    })));
    else if ('events' in result) printCards(`Lịch · ${result.days} ngày tới · ${result.events.length} sự kiện`, result.events.map(event => ({
      title: `${event.eventtype === 'due' ? '⏳ ' : '◈ '}${event.name}`,
      lines: [`Thời gian: ${formatLocalDate(event.timestart)}`, `Môn: ${event.courseid || 'Cá nhân / toàn site'}`,
        event.descriptionText, event.webUrl],
    })));
    else if ('activities' in result) printCards(`Tiến độ môn #${result.courseid} · ${result.completed}/${result.total} hoàn thành`, result.activities.map(activity => ({
      title: `${activity.state > 0 ? '✓' : '○'} ${activity.name}`,
      lines: [`Loại: ${activity.type}`, `Trạng thái: ${activity.state === 0 ? 'Chưa hoàn thành' : activity.state === 3 ? 'Hoàn thành, chưa đạt' : 'Đã hoàn thành'}`,
        activity.timecompleted ? `Hoàn thành lúc: ${formatLocalDate(activity.timecompleted)}` : '', activity.webUrl],
    })));
    else if ('notifications' in result) printCards(`Hộp thông báo · ${result.unreadcount} chưa đọc`, result.notifications.map(item => ({
      title: `${item.read ? '◌' : '●'} ${item.subject || 'Thông báo'}`,
      lines: [`Trạng thái: ${item.read ? 'Đã đọc' : 'Chưa đọc'}`, `Nhận lúc: ${formatLocalDate(item.timecreated)}`,
        item.messageText, item.webUrl],
    })));
  } else if (args[0] === 'doctor') {
    const json = diagnosticJson(args.slice(1));
    const config = json ? await publicConfig() : await withProgress('Đang kiểm tra kết nối Moodle…', publicConfig);
    const result = { site: SITE, name: config.sitename, webservices: config.enablewebservices,
      mobileWebservices: config.enablemobilewebservice,
      microsoft: config.identityproviders?.some((provider) => provider.name === 'Microsoft') };
    if (json) print(result);
    else printCards('Kết nối Moodle', [{ title: result.name || 'Website môn học', lines: [result.site,
      `Web service: ${result.webservices ? 'Sẵn sàng' : 'Chưa bật'}`,
      `Mobile API: ${result.mobileWebservices ? 'Sẵn sàng' : 'Chưa bật'}`,
      `Microsoft: ${result.microsoft ? 'Có' : 'Không'}`] }]);
  } else if (command === 'auth login') {
    await login();
  } else if (args[0] === 'auth' && args[1] === 'callback') {
    if (args.length === 3) await authCallback(args[2]);
    else if (args.length === 5 && args[2] === '--config-dir') await authCallback(args[4], resolve(args[3]));
    else throw new Error('Callback đăng nhập không hợp lệ.');
  } else if (args[0] === 'auth' && args[1] === 'status') {
    const json = diagnosticJson(args.slice(2));
    const token = await readToken();
    const info = json ? await api<SiteInfo>(token, 'core_webservice_get_site_info')
      : await withProgress('Đang kiểm tra tài khoản…', () => api<SiteInfo>(token, 'core_webservice_get_site_info'));
    requireId(String(info.userid), 'User ID');
    const result = { authenticated: true, userid: info.userid, mssv: info.username, fullname: info.fullname };
    if (json) print(result);
    else printCards('Tài khoản', [{ title: info.fullname || `Moodle #${info.userid}`,
      lines: [`Trạng thái: Đã đăng nhập`, field('MSSV', info.username), field('Moodle User ID', info.userid)] }]);
  } else if (command === 'auth logout') {
    await rm(authFile, { force: true });
    try { await unregisterProtocolHandler(); }
    catch { console.error('Cảnh báo: không gỡ được protocol handler coursecli://.'); }
    console.log('Đã xóa token trên máy. Token phía Moodle chưa bị thu hồi.');
  } else if (args[0] === 'probe') {
    const json = diagnosticJson(args.slice(1));
    const result = json ? await probe() : await withProgress('Đang kiểm tra quyền API…', probe);
    if (json) print(result);
    else {
      reportWarnings(result.warnings);
      printCards('Chẩn đoán Moodle', [
        { title: 'Tài khoản', lines: [result.user.fullname || `Moodle #${result.user.id}`, field('Moodle User ID', result.user.id)] },
        { title: 'Dữ liệu đọc được', lines: [`Môn học: ${result.courses.length}`, `Bài tập: ${result.assignments.length}`,
          `Cảnh báo: ${result.warnings.length}`] },
        { title: 'Quyền API', lines: Object.entries(result.capabilities).map(([name, enabled]) => `${enabled ? '✓' : '✕'} ${name}`) },
        ...(result.sampleAssignment ? [{ title: 'Bài tập mẫu', lines: [`#${result.sampleAssignment.id} · ${result.sampleAssignment.name}`,
          `Tệp đề: ${result.sampleAssignment.attachments?.length ?? 0}`, result.sampleAssignment.webUrl] }] : []),
      ]);
    }
  } else {
    if (command && command !== '--help') throw new Error(`Lệnh không hợp lệ: ${command}`);
    printCards('Lệnh và tùy chọn', [
      { title: 'Tài khoản & chẩn đoán', lines: ['course doctor', 'course auth login',
        'course auth status', 'course auth logout', 'course probe'] },
      { title: 'Môn học', lines: ['course list', 'course view &lt;course-id&gt;',
        'course deadlines [--course &lt;course-id&gt;] [--days &lt;số-ngày&gt;] [--overdue]',
        'course grades --course &lt;course-id&gt;', 'course notices --course &lt;course-id&gt;',
        'course calendar [--course &lt;course-id&gt;] [--days &lt;số-ngày&gt;]',
        'course progress --course &lt;course-id&gt;', 'course notifications [--limit &lt;số&gt;]'] },
      { title: 'Diễn đàn', lines: ['course forum list [--course &lt;course-id&gt;]',
        'course forum discussions &lt;forum-id&gt; [--page &lt;số&gt;]',
        'course forum view &lt;discussion-id&gt;'] },
      { title: 'Bài tập', lines: ['course assignment list [--course &lt;course-id&gt;]',
        'course assignment view|status &lt;assignment-id&gt;',
        'course assignment download &lt;assignment-id&gt; [--output &lt;thư-mục&gt;]',
        'course assignment submit &lt;assignment-id&gt; [files...] [--text-file &lt;path&gt;] [--draft]'] },
      { title: 'Quiz', lines: ['course quiz list [--course &lt;course-id&gt;]',
        'course quiz view|attempts &lt;quiz-id&gt;', 'course quiz status|review &lt;attempt-id&gt;',
        'course quiz start &lt;quiz-id&gt;', 'course quiz resume|submit &lt;attempt-id&gt;'] },
    ]);
  }
}

main().catch((error) => {
  console.error(error.code ? `Lỗi hệ thống: ${error.code}` : error.message);
  process.exitCode = 1;
});
