import { api, SITE, type SiteInfo } from './moodle.js';
import { render, requireId } from './terminal.js';

export interface MoodleWarning {
  item?: string;
  itemid?: number | string;
  warningcode: string;
  message: string;
}
interface WithWarnings { warnings?: MoodleWarning[] }
export interface Course { id: number; fullname: string; shortname?: string }
export interface Assignment {
  id: number; name: string; duedate?: number; cutoffdate?: number; cmid?: number;
  intro?: string; introattachments?: { filename: string; filesize: number }[];
}
export interface AssignmentsResponse extends WithWarnings {
  courses: { id: number; assignments?: Assignment[] }[];
}
interface CourseModule {
  id: number; name: string; modname: string; url?: string; description?: string;
  contents?: { filename: string; fileurl?: string }[];
}
interface CourseSection { id: number; name: string; summary?: string; modules?: CourseModule[] }
interface SubmissionStatus extends WithWarnings {
  lastattempt?: {
    extensionduedate: number; submissiongroup?: number;
    submission?: { status: string }; teamsubmission?: { status: string };
  };
}
interface Quiz { id: number; course: number; name: string; attempts?: number; timeclose?: number; coursemodule?: number }
interface QuizAttempt { id: number; state: string; attempt: number }
interface GradeItem {
  itemname?: string; gradeformatted?: string; rangeformatted?: string;
  gradehiddenbydate?: boolean; hidden?: boolean;
  [key: string]: unknown;
}
interface GradesResponse extends WithWarnings {
  usergrades?: { userid: number; gradeitems?: GradeItem[] }[];
}
interface Forum { id: number; name: string; type: string }
interface Discussion { id: number; discussion: number; subject: string; message: string; created?: number }
interface Notice extends Discussion { forumid: number; forumname: string; messageText: string; createdLocal: string | null; webUrl: string }
interface Deadline {
  type: 'assignment' | 'quiz' | 'quiz-attempt'; id: number; courseid: number; name: string;
  due: number; dueLocal: string | null; state: string; overdue: boolean; deadlineComplete: boolean;
  webUrl: string; originalDue?: number | null; extensionDue?: number; cutoff?: number | null;
  cutoffLocal?: string | null; groupid?: number | null; attemptsRemaining?: number | null; attemptid?: number;
}
interface DeadlineOptions { courseId?: number; days?: number; overdue?: boolean }
type InputId = number | string | undefined;

const courseParams = (ids: number[]) => Object.fromEntries(ids.map((id, index) => [`courseids[${index}]`, id]));
const localTime = (timestamp: number | undefined) => timestamp !== undefined && timestamp > 0
  ? `${new Date(timestamp * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })} (Asia/Ho_Chi_Minh, UTC+07:00)` : null;

function warn(warnings: MoodleWarning[], item: string, itemid: number | string, message: string) {
  warnings.push({ item, itemid, warningcode: 'incomplete', message });
}

async function read<T extends WithWarnings>(token: string, method: string, params: Record<string, number | string>, warnings: MoodleWarning[]): Promise<T | null> {
  try {
    const result = await api<T>(token, method, params);
    warnings.push(...(result.warnings ?? []));
    return result;
  } catch (error) {
    warn(warnings, method, Object.values(params)[0] ?? 0, error instanceof Error ? error.message : 'Không đọc được dữ liệu Moodle.');
    return null;
  }
}

async function user(token: string) {
  const info = await api<SiteInfo>(token, 'core_webservice_get_site_info');
  requireId(String(info.userid), 'User ID');
  return info;
}

export async function listCourses(token: string) {
  const info = await user(token);
  const courses = await api<Course[]>(token, 'core_enrol_get_users_courses', { userid: info.userid });
  if (!Array.isArray(courses)) throw new Error('Danh sách môn học trả về không hợp lệ.');
  return { courses: courses.map((course) => ({ ...course, webUrl: `${SITE}/course/view.php?id=${course.id}` })), warnings: [] as MoodleWarning[] };
}

export async function viewCourse(token: string, id: InputId) {
  id = requireId(String(id), 'Course ID');
  const sections = await api<CourseSection[]>(token, 'core_course_get_contents', { courseid: id });
  if (!Array.isArray(sections)) throw new Error('Nội dung môn học trả về không hợp lệ.');
  return {
    courseid: id, webUrl: `${SITE}/course/view.php?id=${id}`,
    sections: sections.map((section) => ({ ...section, summaryText: render(section.summary),
      modules: (section.modules ?? []).map((module) => ({ ...module, descriptionText: render(module.description) })) })),
    warnings: [] as MoodleWarning[],
  };
}

export async function deadlines(token: string, { courseId, days = 14, overdue = false }: DeadlineOptions = {}) {
  if (courseId !== undefined) courseId = requireId(String(courseId), 'Course ID');
  days = requireId(String(days), 'Số ngày');
  if (!Number.isSafeInteger(days * 86400)) throw new Error('Số ngày quá lớn.');
  const ids = courseId === undefined ? (await listCourses(token)).courses.map((course) => course.id) : [courseId];
  const warnings: MoodleWarning[] = [];
  const result: Deadline[] = [];
  const now = Math.floor(Date.now() / 1000);
  const until = now + days * 86400;
  const include = (due: number | undefined, pending: boolean) => due !== undefined && due > 0 && due <= until && (due >= now || (overdue && pending));
  if (!ids.length) return { deadlines: [], warnings, timezone: 'Asia/Ho_Chi_Minh' };
  const assignments = await read<AssignmentsResponse>(token, 'mod_assign_get_assignments', courseParams(ids), warnings);
  // Sequential lookups keep request concurrency at one, including large enrolled course lists.
  for (const course of assignments?.courses ?? []) {
    for (const assignment of course.assignments ?? []) {
      const status = await read<SubmissionStatus>(token, 'mod_assign_get_submission_status', { assignid: assignment.id }, warnings);
      const last = status?.lastattempt;
      if (status && !last) warn(warnings, 'assignment', assignment.id, 'Không xác định được trạng thái và gia hạn.');
      const submission = last?.teamsubmission ?? last?.submission;
      const state = last ? (submission?.status ?? 'new') : 'unknown';
      const extension = last?.extensionduedate ?? 0;
      const due = Math.max(assignment.duedate ?? 0, extension);
      if (assignment.duedate === undefined) warn(warnings, 'assignment', assignment.id, 'API không cung cấp hạn nộp.');
      if (state !== 'submitted' && include(due, state !== 'unknown')) {
        result.push({ type: 'assignment', id: assignment.id, courseid: course.id, name: assignment.name,
          due, dueLocal: localTime(due), originalDue: assignment.duedate ?? null,
          extensionDue: extension, cutoff: assignment.cutoffdate ?? null, cutoffLocal: localTime(assignment.cutoffdate),
          state, overdue: due < now, deadlineComplete: !!last && assignment.duedate !== undefined,
          groupid: last?.submissiongroup ?? null,
          webUrl: assignment.cmid ? `${SITE}/mod/assign/view.php?id=${assignment.cmid}` : `${SITE}/course/view.php?id=${course.id}` });
      }
    }
  }
  const quizzes = await read<WithWarnings & { quizzes: Quiz[] }>(token, 'mod_quiz_get_quizzes_by_courses', courseParams(ids), warnings);
  for (const quiz of quizzes?.quizzes ?? []) {
    const attempts = await read<WithWarnings & { attempts: QuizAttempt[] }>(token, 'mod_quiz_get_user_attempts', { quizid: quiz.id, status: 'all', includepreviews: 0 }, warnings);
    const remaining = attempts && quiz.attempts !== undefined && quiz.attempts > 0 ? Math.max(0, quiz.attempts - (attempts.attempts ?? []).length) : null;
    const active = (attempts?.attempts ?? []).filter((attempt) => ['inprogress', 'overdue'].includes(attempt.state));
    const base = { id: quiz.id, courseid: quiz.course, name: quiz.name, attemptsRemaining: remaining,
      webUrl: quiz.coursemodule ? `${SITE}/mod/quiz/view.php?id=${quiz.coursemodule}` : `${SITE}/course/view.php?id=${quiz.course}` };
    if (quiz.timeclose === undefined) warn(warnings, 'quiz', quiz.id, 'API không cung cấp hạn đóng quiz.');
    if (quiz.timeclose !== undefined && include(quiz.timeclose, !!attempts && !(attempts.attempts ?? []).some((a) => a.state === 'finished'))) {
      result.push({ ...base, type: 'quiz', due: quiz.timeclose, dueLocal: localTime(quiz.timeclose),
        state: active[0]?.state ?? (attempts ? 'not-in-progress' : 'unknown'), overdue: quiz.timeclose < now,
        deadlineComplete: !!attempts });
    }
    for (const attempt of active) {
      const access = await read<WithWarnings & { endtime?: number }>(token, 'mod_quiz_get_attempt_access_information', { quizid: quiz.id, attemptid: attempt.id }, warnings);
      if (!access || access.endtime === undefined) {
        if (access) warn(warnings, 'quiz-attempt', attempt.id, 'Không xác định được hạn của lượt đang làm.');
        continue;
      }
      if (include(access.endtime, true)) result.push({ ...base, type: 'quiz-attempt', attemptid: attempt.id,
        due: access.endtime, dueLocal: localTime(access.endtime), state: attempt.state, overdue: access.endtime < now,
        deadlineComplete: true });
    }
  }
  result.sort((a, b) => a.due - b.due);
  return { deadlines: result, warnings, timezone: 'Asia/Ho_Chi_Minh' };
}

export async function grades(token: string, id: InputId) {
  id = requireId(String(id), 'Course ID');
  const info = await user(token);
  const result = await api<GradesResponse>(token, 'gradereport_user_get_grade_items', { courseid: id, userid: info.userid });
  return { ...result, courseid: id, warnings: result.warnings ?? [] };
}

export async function notices(token: string, id: InputId) {
  id = requireId(String(id), 'Course ID');
  const warnings: MoodleWarning[] = [];
  const forums = await api<Forum[]>(token, 'mod_forum_get_forums_by_courses', courseParams([id]));
  if (!Array.isArray(forums)) throw new Error('Danh sách forum trả về không hợp lệ.');
  const notices: Notice[] = [];
  for (const forum of forums.filter((forum) => forum.type === 'news')) {
    const seen = new Set<number>();
    for (let page = 0; ; page++) {
      const data = await read<WithWarnings & { discussions: Discussion[] }>(token, 'mod_forum_get_forum_discussions', { forumid: forum.id, page, perpage: 50 }, warnings);
      if (!data) break;
      const discussions = data.discussions ?? [];
      for (const post of discussions) {
        if (seen.has(post.discussion)) {
          warn(warnings, 'forum', forum.id, 'API trả trang trùng; danh sách thông báo có thể thiếu.');
          return { courseid: id, notices, warnings };
        }
        seen.add(post.discussion);
        notices.push({ ...post, forumid: forum.id, forumname: forum.name, messageText: render(post.message),
          createdLocal: localTime(post.created), webUrl: `${SITE}/mod/forum/discuss.php?d=${post.discussion}` });
      }
      if (discussions.length < 50) break;
    }
  }
  return { courseid: id, notices, warnings };
}
