import { api, type SiteInfo } from './moodle.js';
import { listCourses } from './student.js';
import { listAssignments } from './assignments.js';
import { quizAttempts } from './quizzes.js';
import { forumDiscussions, forumView, forums, notifications, progress } from './campus.js';
import { favouriteCourses, inbox, materials } from './extras.js';
import { requireId, selectItem } from './terminal.js';

type Choice = { id: number; label: string };
export async function chooseId(value: string | undefined, title: string, load: () => Promise<Choice[]>, json = false) {
  if (value !== undefined) return requireId(value, title);
  if (json || !process.stdin.isTTY || !process.stdout.isTTY) return requireId(undefined, title);
  return requireId(String((await selectItem(title, await load())).id), title);
}

export async function courseChoices(token: string): Promise<Choice[]> {
  return (await listCourses(token)).courses.map(course => ({ id: course.id, label: course.fullname }));
}
export async function assignmentChoices(token: string): Promise<Choice[]> {
  return (await listAssignments(token)).assignments.map(item => ({ id: item.id, label: `${item.name} · ${item.coursename}` }));
}
export async function quizChoices(token: string): Promise<Choice[]> {
  const result = await api<{ quizzes: { id: number; name: string }[] }>(token, 'mod_quiz_get_quizzes_by_courses');
  if (!Array.isArray(result.quizzes)) throw new Error('Danh sách quiz không hợp lệ.');
  return result.quizzes.map(item => ({ id: item.id, label: item.name }));
}
export async function attemptChoices(token: string, action: string): Promise<Choice[]> {
  const quizid = await chooseId(undefined, 'Quiz', () => quizChoices(token));
  return (await quizAttempts(token, quizid)).attempts.filter(attempt =>
    action === 'review' ? attempt.state === 'finished' : ['resume', 'submit'].includes(action)
      ? ['inprogress', 'overdue'].includes(attempt.state) : true)
    .map(attempt => ({ id: attempt.id, label: `Lượt ${attempt.attempt} · ${attempt.state}` }));
}
export async function forumChoices(token: string): Promise<Choice[]> {
  return (await forums(token)).forums.map(item => ({ id: item.id, label: `${item.name} · Môn #${item.course}` }));
}
export async function discussionChoices(token: string): Promise<Choice[]> {
  const forumid = await chooseId(undefined, 'Diễn đàn', () => forumChoices(token));
  return (await forumDiscussions(token, forumid)).discussions.map(item => ({ id: item.discussion, label: item.subject }));
}
export async function postChoices(token: string): Promise<Choice[]> {
  const discussionid = await chooseId(undefined, 'Chủ đề (20 mục mới nhất)', () => discussionChoices(token));
  return (await forumView(token, discussionid)).posts.map(item => ({ id: item.id, label: `${item.subject} · ${item.author?.fullname ?? 'Không rõ tác giả'}` }));
}
export async function conversationChoices(token: string): Promise<Choice[]> {
  return (await inbox(token, 100)).conversations.map(item => ({ id: item.id,
    label: item.name || item.members?.map(member => member.fullname).join(', ') || 'Hội thoại' }));
}
export async function recipientChoices(token: string): Promise<Choice[]> {
  const user = await api<SiteInfo>(token, 'core_webservice_get_site_info');
  const seen = new Map<number, string>();
  for (const conversation of (await inbox(token, 100)).conversations) for (const member of conversation.members ?? []) {
    if (member.id !== user.userid) seen.set(member.id, member.fullname);
  }
  return [...seen].map(([id, label]) => ({ id, label }));
}
export async function notificationChoices(token: string): Promise<Choice[]> {
  return (await notifications(token, 100)).notifications.filter(item => !item.read)
    .map(item => ({ id: item.id, label: item.subject || 'Thông báo' }));
}
export async function materialChoices(token: string, courseId: number): Promise<Choice[]> {
  return (await materials(token, courseId)).materials.filter(item => item.files.length)
    .map(item => ({ id: item.id, label: `${item.name} · ${item.section}` }));
}
export async function activityChoices(token: string, courseId: number): Promise<Choice[]> {
  return (await progress(token, courseId)).activities.filter(item => item.tracking === 1 && !item.isautomatic)
    .map(item => ({ id: item.cmid, label: `${item.name} · ${item.state > 0 ? 'Đã hoàn thành' : 'Chưa hoàn thành'}` }));
}
export async function favouriteCourseChoices(token: string, action: 'add' | 'remove'): Promise<Choice[]> {
  if (action === 'remove') return (await favouriteCourses(token)).courses.map(item => ({ id: item.id, label: item.fullname }));
  const starred = new Set((await favouriteCourses(token)).courses.map(item => item.id));
  return (await courseChoices(token)).filter(item => !starred.has(item.id));
}
