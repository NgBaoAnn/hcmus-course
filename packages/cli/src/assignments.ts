import { open, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { api, SITE, type SiteInfo } from './moodle.js';
import { confirm as terminalConfirm, render, requireId } from './terminal.js';
import { listCourses, type MoodleWarning } from './student.js';

interface Attachment { filename: string; filesize: number; fileurl?: string; filepath?: string; timemodified?: number }
interface Plugin {
  type: string;
  fileareas?: { area: string; files: Attachment[] }[];
  editorfields?: { name: string; text: string; format: number }[];
}
interface Submission { id: number; userid?: number; groupid?: number; status: string; attemptnumber: number; timemodified: number; plugins: Plugin[] }
interface Status {
  lastattempt?: {
    submission?: Submission; teamsubmission?: Submission; submissiongroup?: number;
    submissiongroupmemberswhoneedtosubmit?: number[]; submissionsenabled: boolean; locked: boolean;
    canedit: boolean; caneditowner: boolean; cansubmit: boolean; extensionduedate: number | null; timelimit?: number; usergroups: number[];
  };
  feedback?: unknown; warnings?: MoodleWarning[];
}
interface Assignment {
  id: number; cmid: number; name: string; intro?: string; introattachments?: Attachment[];
  duedate: number; cutoffdate: number; allowsubmissionsfromdate: number; submissiondrafts: number;
  teamsubmission: number; requireallteammemberssubmit: number; requiresubmissionstatement: number;
  submissionstatement?: string; timelimit?: number;
  configs: { plugin: string; subtype: string; name: string; value: string }[];
}
interface SubmitOptions { files?: string[]; textFile?: string; draft?: boolean; confirm?: (preview: string) => Promise<boolean> }
type InputId = number | string | undefined;
const idOf = (id: InputId) => requireId(String(id), 'Assignment ID');
const submission = (s: Status, a: Assignment) => a.teamsubmission ? s.lastattempt?.teamsubmission : s.lastattempt?.submission;
const filesOf = (s: Submission | undefined) => s?.plugins.find(p => p.type === 'file')?.fileareas?.find(f => f.area === 'submission_files')?.files;
const textOf = (s: Submission | undefined) => s?.plugins.find(p => p.type === 'onlinetext')?.editorfields?.find(f => f.name === 'onlinetext');
const fileSummary = (files: Attachment[]) => files.map(f => [f.filename, f.filesize, f.filepath ?? '/']).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const date = (value: number) => value > 0 ? `${new Date(value * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })} (Asia/Ho_Chi_Minh)` : 'không đặt';

// Raw editor data avoids changing HTML/format when an untouched plugin must be saved.
export async function assignmentStatus(token: string, id: InputId) {
  const result = await api<Status>(token, 'mod_assign_get_submission_status', {
    assignid: idOf(id), moodlewssettingraw: true, moodlewssettingfileurl: false,
  });
  return { ...result, warnings: result.warnings ?? [] };
}

export async function listAssignments(token: string, courseId?: InputId) {
  const courses = courseId === undefined ? (await listCourses(token)).courses
    : [{ id: requireId(String(courseId), 'Course ID'), fullname: '' }];
  if (!courses.length) return { assignments: [], warnings: [] as MoodleWarning[] };
  const response = await api<{ courses: { id: number; fullname?: string; assignments?: Assignment[] }[]; warnings?: MoodleWarning[] }>(
    token, 'mod_assign_get_assignments', Object.fromEntries(courses.map((c, i) => [`courseids[${i}]`, c.id])));
  if (!Array.isArray(response.courses)) throw new Error('Danh sách bài tập không hợp lệ.');
  return { assignments: response.courses.flatMap(c => (c.assignments ?? []).map(a => ({ ...a, courseid: c.id,
    coursename: c.fullname || courses.find(course => course.id === c.id)?.fullname || String(c.id),
    webUrl: `${SITE}/mod/assign/view.php?id=${a.cmid}` }))), warnings: response.warnings ?? [] };
}

export async function viewAssignment(token: string, id: InputId) {
  id = idOf(id);
  const courseId = (await listAssignments(token)).assignments.find(a => a.id === id)?.courseid;
  if (!courseId) throw new Error('Không tìm thấy Assignment ID hoặc không đủ quyền đọc; xem assignment list.');
  const result = await listAssignments(token, courseId);
  const assignment = result.assignments.find(a => a.id === id);
  if (!assignment) throw new Error('Bài tập đã thay đổi hoặc không đủ quyền đọc; chạy lại assignment list.');
  const status = await assignmentStatus(token, id);
  return { ...assignment, introText: render(assignment.intro), status, warnings: [...result.warnings, ...status.warnings] };
}

function safeName(name: string, token: string) {
  if (!name || name === '.' || name === '..' || /[\\/\x00-\x1f\x7f-\x9f]/.test(name) || name.includes(token)) {
    throw new Error('Tên file không an toàn.');
  }
}
function fileUrl(value: string | undefined) {
  let url: URL;
  try { url = new URL(value!); } catch { throw new Error('URL file không hợp lệ.'); }
  if (url.origin !== SITE || url.username || url.password || !/^\/(webservice\/)?pluginfile\.php\//.test(url.pathname)) {
    throw new Error('Chỉ tải file đính kèm qua HTTPS của trường.');
  }
  if (url.pathname.startsWith('/pluginfile.php/')) url.pathname = '/webservice' + url.pathname;
  url.searchParams.delete('token');
  return url;
}

export async function downloadMoodleFiles(token: string, files: { filename: string; fileurl?: string; filesize?: number }[], directory = process.cwd()) {
  if (directory.includes(token)) throw new Error('Thư mục không an toàn.');
  const names = new Set<string>();
  for (const file of files) {
    safeName(file.filename, token);
    if (names.has(file.filename)) throw new Error('Tên file đính kèm trùng nhau.');
    names.add(file.filename);
    fileUrl(file.fileurl);
  }
  await mkdir(directory, { recursive: true });
  const downloaded: string[] = [];
  for (const file of files) {
    const destination = join(directory, file.filename);
    const handle = await open(destination, 'wx', 0o600);
    let complete = false;
    try {
      const url = fileUrl(file.fileurl);
      url.searchParams.set('token', token);
      // Reject every redirect; credentials never reach a second destination.
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok || !response.body) throw new Error();
      let bytes = 0;
      for await (const chunk of response.body) { await handle.writeFile(chunk); bytes += chunk.length; }
      if (file.filesize !== undefined && bytes !== file.filesize) throw new Error();
      complete = true;
      downloaded.push(destination);
    } catch { throw new Error(`Tải file thất bại; đã xóa file tải dở. Đã tải ${downloaded.length} file trước đó.`); }
    finally { await handle.close(); if (!complete) await rm(destination, { force: true }); }
  }
  return downloaded;
}

export async function downloadAssignment(token: string, id: InputId, directory = process.cwd()) {
  if (directory.includes(token)) throw new Error('Thư mục không an toàn.');
  const assignment = await viewAssignment(token, id);
  return { downloaded: await downloadMoodleFiles(token, assignment.introattachments ?? [], directory), warnings: assignment.warnings };
}

export async function submitAssignment(token: string, id: InputId, options: SubmitOptions = {}) {
  id = idOf(id);
  const a = await viewAssignment(token, id);
  const fail = (message: string): never => { throw new Error(`${message} ${a.webUrl}`); };
  const user = await api<SiteInfo>(token, 'core_webservice_get_site_info');
  requireId(String(user.userid), 'User ID');
  const configs = a.configs?.filter(c => c.subtype === 'assignsubmission');
  if (!configs?.length) fail('Không xác định được plugin nộp bài.');
  const enabled = new Set(configs.filter(c => c.name === 'enabled' && c.value === '1' && c.plugin !== 'comments').map(c => c.plugin));
  if (!enabled.size) fail('Không có plugin nộp bài được bật.');
  if ([...enabled].some(p => !['file', 'onlinetext'].includes(p))) fail('Plugin nộp bài chưa hỗ trợ.');
  const setting = (name: string) => configs.find(c => c.plugin === 'file' && c.name === name)?.value;
  const before = a.status;
  function check(s: Status) {
    const last = s.lastattempt;
    if (!last) return fail('Không xác minh được trạng thái.');
    const relevantWarnings = a.warnings.filter(w => w.item !== 'module' || Number(w.itemid) === a.cmid || Number(w.itemid) === id);
    if (relevantWarnings.length || s.warnings?.length || !last.submissionsenabled || last.locked || !last.canedit || !last.caneditowner) fail('Không xác minh được quyền sửa bài.');
    if (a.timelimit || last.timelimit) fail('Assignment có thời gian làm bài chưa hỗ trợ.');
    if (![0, 1].includes(a.submissiondrafts) || ![0, 1].includes(a.teamsubmission)) fail('Thiếu cấu hình nộp bài.');
    if (options.draft && !a.submissiondrafts) fail('Bài này lưu là nộp chính thức; không hỗ trợ --draft.');
    const current = submission(s, a);
    const extension = last.extensionduedate === null ? 0 : last.extensionduedate;
    if (![a.duedate, a.cutoffdate, a.allowsubmissionsfromdate, extension].every(value => Number.isSafeInteger(value) && value >= 0)) fail('Thiếu thông tin thời gian truy cập.');
    if (current && (a.teamsubmission ? current.groupid !== last.submissiongroup : current.userid !== user.userid)) fail('Không xác minh được chủ bài nộp.');
    if (current?.status === 'submitted') fail('Bài đã nộp; CLI không mở lại bài.');
    if (current && (!Number.isSafeInteger(current.attemptnumber) || !Array.isArray(current.plugins))) fail('Không xác minh được attempt/plugin.');
    if (a.teamsubmission && (!last.submissiongroup || !last.usergroups?.includes(last.submissiongroup) || !current ||
      (a.requireallteammemberssubmit && !Array.isArray(last.submissiongroupmemberswhoneedtosubmit)))) fail('Không xác minh được nhóm và trạng thái thành viên.');
    const now = Date.now() / 1000;
    if (a.allowsubmissionsfromdate > now || (a.cutoffdate > 0 && Math.max(a.cutoffdate, extension) <= now)) fail('Bài chưa mở hoặc đã quá cutoff.');
  }
  check(before);
  const paths = options.files ?? [];
  if (!paths.length && options.textFile === undefined) fail('Cần file hoặc --text-file để lưu bài.');
  if (paths.length && !enabled.has('file') || options.textFile !== undefined && !enabled.has('onlinetext')) fail('Plugin yêu cầu chưa bật.');
  // shortcut: when submissiondrafts=0, Moodle auto-submits via save_submission and skips the statement modal — statement is shown in preview for user confirmation instead
  if (a.requiresubmissionstatement && !a.submissionstatement) fail('Không lấy được nội dung submission statement từ API.');
  const current = submission(before, a);
  const oldFiles = filesOf(current);
  const oldText = textOf(current);
  if (current && enabled.has('file') && !oldFiles) fail('Không đọc được đầy đủ file hiện tại.');
  let editor = oldText;
  if (options.textFile !== undefined) {
    const handle = await open(options.textFile, 'r');
    try {
      if (!(await handle.stat()).isFile()) fail('Text phải là file thường.');
      editor = { name: 'onlinetext', text: new TextDecoder('utf-8', { fatal: true }).decode(await handle.readFile()), format: 2 };
    } finally { await handle.close(); }
  } else if (enabled.has('onlinetext')) {
    const plugin = current?.plugins.find(p => p.type === 'onlinetext');
    if ((current && !editor) || plugin?.fileareas?.some(area => area.files.length) || editor?.text.includes('@@PLUGINFILE@@')) fail('Không thể giữ nguyên chính xác online text và file nhúng; dùng website.');
  }
  const newFiles: { filename: string; filesize: number; data: Uint8Array }[] = [];
  const names = new Set<string>();
  for (const path of paths) {
    const filename = basename(path);
    safeName(filename, token);
    if (names.has(filename)) fail('Tên file mới trùng nhau.');
    names.add(filename);
    const handle = await open(path, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) fail('Chỉ nộp file thường.');
      const maxSize = Number(setting('maxsubmissionsizebytes'));
      if (!Number.isSafeInteger(maxSize) || maxSize <= 0 || stat.size > maxSize) fail('File vượt dung lượng hoặc không xác định được giới hạn.');
      const types = setting('filetypeslist');
      if (types === undefined) fail('Không xác định được giới hạn loại file.');
      if (types && types !== '*') {
        const extensions = types.split(/[\s,;]+/).filter(Boolean);
        if (extensions.some(e => !/^\.[\w.-]+$/.test(e))) fail('Nhóm loại file/MIME chưa hỗ trợ; dùng website.');
        if (!extensions.some(e => filename.toLowerCase().endsWith(e.toLowerCase()))) fail('Loại file không được phép.');
      }
      const data = await handle.readFile();
      if (data.length !== stat.size) fail('File đã thay đổi khi đọc.');
      newFiles.push({ filename, filesize: data.length, data });
    } finally { await handle.close(); }
  }
  if (newFiles.length) {
    const maxCount = Number(setting('maxfilesubmissions'));
    if (!Number.isSafeInteger(maxCount) || maxCount < newFiles.length) fail('Vượt số lượng file hoặc thiếu giới hạn.');
  }
  const preview = [
    `Tài khoản: ${user.fullname ?? user.userid} (${user.userid})`, `Môn: ${a.coursename}; Bài: ${a.name} (${id})`,
    `Attempt: ${current?.attemptnumber ?? 'mới'}; trạng thái: ${current?.status ?? 'new'}`,
    `Hạn: ${date(Math.max(a.duedate, before.lastattempt!.extensionduedate ?? 0))}; cutoff: ${date(a.cutoffdate)}`,
    a.teamsubmission ? `Tác động đến cả nhóm ${before.lastattempt!.submissiongroup}; thành viên còn phải xác nhận: ${before.lastattempt!.submissiongroupmemberswhoneedtosubmit?.join(', ') ?? 'không yêu cầu'}. Chỉ xác nhận cho tài khoản hiện tại.` : '',
    newFiles.length ? `Thay thế toàn bộ file hiện tại: ${(oldFiles ?? []).map(f => f.filename).join(', ') || '(không có)'}\nFile mới: ${newFiles.map(f => `${f.filename} (${f.filesize} bytes)`).join(', ')}` : 'Giữ nguyên file hiện tại.',
    options.textFile !== undefined ? `Thay online text bằng UTF-8 plain text (${editor!.text.length} ký tự):\n${editor!.text.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}` : 'Giữ nguyên online text.',
    `Hành động: ${options.draft ? 'lưu nháp' : 'nộp chính thức'}.`,
    a.submissionstatement ? `Submission statement — xác nhận đồng ý:\n${a.submissionstatement}` : '', a.webUrl,
  ].join('\n');
  let accepted = false;
  try { accepted = await (options.confirm ?? terminalConfirm)(preview); } catch { /* EOF cancels before writing. */ }
  if (accepted !== true) fail('Đã hủy; chưa upload hoặc lưu bài.');
  const fingerprint = (s: Status) => ({ ...s.lastattempt });
  const refresh = await assignmentStatus(token, id);
  check(refresh);
  if (!same(fingerprint(before), fingerprint(refresh))) fail('Trạng thái đã thay đổi sau xác nhận; chạy lại lệnh.');
  const warnings: MoodleWarning[] = [];
  const result = (state: 'saved' | 'submitted' | 'uncertain', observed: Status | null, message: string) => ({ state, observed, message,
    pendingMembers: a.teamsubmission ? observed?.lastattempt?.submissiongroupmemberswhoneedtosubmit ?? null : [], warnings, webUrl: a.webUrl });
  const observe = async () => { try { return await assignmentStatus(token, id); } catch { return null; } };
  const matches = (s: Status | null) => {
    if (!s || s.warnings?.length) return false;
    const observed = submission(s, a);
    if (!observed || observed.attemptnumber !== current?.attemptnumber && !!current ||
      s.lastattempt?.submissiongroup !== before.lastattempt?.submissiongroup) return false;
    const expectedFiles = newFiles.length ? newFiles : oldFiles ?? [];
    const observedText = textOf(observed);
    const hasEmbeddedFiles = observed.plugins.find(p => p.type === 'onlinetext')?.fileareas?.some(area => area.files.length);
    return (!enabled.has('file') || same(fileSummary(filesOf(observed) ?? []), fileSummary(expectedFiles))) &&
      (!enabled.has('onlinetext') || !!editor && same(observedText, editor) || !editor && !current &&
        !hasEmbeddedFiles && (!observedText || observedText.text === ''));
  };
  const observedState = (s: Status | null) => matches(s) ? submission(s!, a)?.status : undefined;
  const params: Record<string, string | number | boolean> = { assignmentid: id };
  let draftItem = 0;
  try {
    for (const file of newFiles) {
      const body = new FormData();
      body.set('token', token); body.set('itemid', String(draftItem)); body.set('filepath', '/');
      body.set('file_1', new Blob([new Uint8Array(file.data)]), file.filename);
      const response = await fetch(`${SITE}/webservice/upload.php`, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error();
      const uploaded = await response.json() as { itemid?: number; filename?: string; filesize?: number; error?: string }[];
      if (!Array.isArray(uploaded) || uploaded.length !== 1 || uploaded[0].error || !Number.isSafeInteger(uploaded[0].itemid) || uploaded[0].itemid! <= 0 ||
        uploaded[0].filename !== file.filename || uploaded[0].filesize !== file.filesize || draftItem && uploaded[0].itemid !== draftItem) throw new Error();
      draftItem = uploaded[0].itemid!;
    }
  } catch { return result('uncertain', await observe(), 'Upload chưa xác định hoặc thất bại; chưa lưu/nộp bài. Không tự retry; kiểm tra assignment status.'); }
  if (draftItem) params['plugindata[files_filemanager]'] = draftItem;
  if (editor && enabled.has('onlinetext')) {
    params['plugindata[onlinetext_editor][text]'] = editor.text;
    params['plugindata[onlinetext_editor][format]'] = editor.format;
    params['plugindata[onlinetext_editor][itemid]'] = 0;
  }
  const presave = await assignmentStatus(token, id);
  check(presave);
  if (!same(fingerprint(refresh), fingerprint(presave))) fail('Trạng thái đã thay đổi trước lưu; draft upload có thể còn trên Moodle. Chạy lại lệnh.');
  let saveFailed = false;
  try {
    const response = await api<MoodleWarning[]>(token, 'mod_assign_save_submission', params);
    if (!Array.isArray(response)) saveFailed = true;
    else { warnings.push(...response); saveFailed = response.length > 0; }
  } catch { saveFailed = true; }
  const saved = await observe();
  const savedState = observedState(saved);
  if (!savedState || !['draft', 'submitted'].includes(savedState)) return result('uncertain', saved, 'Chưa xác minh dữ liệu đã lưu; không nộp tiếp. Kiểm tra assignment status.');
  if (savedState === 'submitted') return result('submitted', saved, 'Đã quan sát bài nộp trên Moodle.');
  if (options.draft || saveFailed) return result('saved', saved, 'Đã quan sát bản lưu; chưa nộp chính thức.');
  const presubmit = await observe();
  if (!presubmit || !matches(presubmit) || !same(fingerprint(saved!), fingerprint(presubmit)) || !presubmit.lastattempt?.cansubmit || presubmit.lastattempt.locked) {
    return result('saved', saved, 'Đã lưu; quyền/trạng thái thay đổi trước nộp. Kiểm tra assignment status và chạy lại.');
  }
  try {
    const response = await api<MoodleWarning[]>(token, 'mod_assign_submit_for_grading', { assignmentid: id, acceptsubmissionstatement: !!a.requiresubmissionstatement });
    if (Array.isArray(response)) warnings.push(...response);
  } catch { /* Never retry a write; read the resulting state. */ }
  const final = await observe();
  const finalState = observedState(final);
  if (finalState === 'submitted') return result('submitted', final, 'Đã quan sát bài nộp trên Moodle.');
  if (finalState === 'draft') return result('saved', final, a.teamsubmission ? 'Bài nhóm đã lưu; kiểm tra thành viên còn cần xác nhận.' : 'Đã lưu nhưng chưa nộp chính thức.');
  return result('uncertain', final, 'Chưa xác định kết quả nộp; không tự retry. Kiểm tra assignment status.');
}
