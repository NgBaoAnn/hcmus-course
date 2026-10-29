import { api, SITE, type SiteInfo } from './moodle.js';
import { render, requireId } from './terminal.js';
import { listCourses, viewCourse, type MoodleWarning } from './student.js';

type Id = number | string | undefined;
type WithWarnings = { warnings?: MoodleWarning[] };
const courseParams = (ids: number[]) => Object.fromEntries(ids.map((id, i) => [`courseids[${i}]`, id]));

interface CalendarEvent {
  id: number; name: string; description?: string; courseid: number; eventtype?: string;
  modulename?: string; instance?: number; timestart: number; timeduration?: number;
}

export async function calendar(token: string, courseId?: Id, days: Id = 14) {
  const id = courseId === undefined ? undefined : requireId(String(courseId), 'Course ID');
  const window = requireId(String(days), 'Số ngày');
  if (window > 365) throw new Error('Số ngày tối đa là 365.');
  const courses = id === undefined ? (await listCourses(token)).courses : [{ id }];
  const now = Math.floor(Date.now() / 1000);
  const until = now + window * 86400;
  const params = {
    ...Object.fromEntries(courses.map((course, i) => [`events[courseids][${i}]`, course.id])),
    'options[timestart]': now, 'options[timeend]': until,
    'options[userevents]': id === undefined ? 1 : 0,
    'options[siteevents]': id === undefined ? 1 : 0,
  };
  const result = await api<WithWarnings & { events: CalendarEvent[] }>(token, 'core_calendar_get_calendar_events', params);
  if (!Array.isArray(result.events)) throw new Error('Lịch Moodle trả về không hợp lệ.');
  return { days: window, courseid: id ?? null, timezone: 'Asia/Ho_Chi_Minh',
    events: result.events.filter(event => event.timestart >= now && event.timestart <= until)
      .sort((a, b) => a.timestart - b.timestart).map(event => ({ ...event,
        descriptionText: render(event.description), webUrl: `${SITE}/calendar/view.php?view=day&time=${event.timestart}` })),
    warnings: result.warnings ?? [] };
}

interface CompletionStatus {
  cmid: number; state: number; hascompletion?: boolean; uservisible?: boolean;
  timecompleted?: number; tracking?: number; isautomatic?: boolean;
}

export async function progress(token: string, courseId: Id) {
  const id = requireId(String(courseId), 'Course ID');
  const info = await api<SiteInfo>(token, 'core_webservice_get_site_info');
  const [result, contents] = await Promise.all([
    api<WithWarnings & { statuses: CompletionStatus[] }>(token, 'core_completion_get_activities_completion_status', { courseid: id, userid: info.userid }),
    viewCourse(token, id),
  ]);
  if (!Array.isArray(result.statuses)) throw new Error('Tiến độ Moodle trả về không hợp lệ.');
  const modules = new Map(contents.sections.flatMap(section => section.modules.map(module => [module.id, module] as const)));
  const activities = result.statuses.filter(status => status.hascompletion !== false && status.uservisible !== false)
    .map(status => ({ ...status, name: modules.get(status.cmid)?.name ?? `Hoạt động #${status.cmid}`,
      type: modules.get(status.cmid)?.modname ?? 'activity',
      webUrl: modules.get(status.cmid)?.url ?? `${SITE}/course/view.php?id=${id}` }));
  return { courseid: id, completed: activities.filter(activity => activity.state > 0).length,
    total: activities.length, activities, warnings: result.warnings ?? [] };
}

interface Notification {
  id: number; subject?: string; fullmessage?: string; fullmessagehtml?: string;
  shortmessage?: string; timecreated?: number; read?: boolean; contexturl?: string;
}

export async function notifications(token: string, limit: Id = 20) {
  const count = requireId(String(limit), 'Giới hạn');
  if (count > 100) throw new Error('Giới hạn tối đa là 100.');
  const result = await api<{ notifications: Notification[]; unreadcount: number }>(token,
    'message_popup_get_popup_notifications', { useridto: 0, newestfirst: 1, limit: count, offset: 0 });
  if (!Array.isArray(result.notifications)) throw new Error('Thông báo Moodle trả về không hợp lệ.');
  return { unreadcount: result.unreadcount, notifications: result.notifications.map(item => {
    const link = item.contexturl && URL.canParse(item.contexturl, SITE) ? new URL(item.contexturl, SITE) : null;
    return { ...item, messageText: render(item.fullmessagehtml || item.fullmessage || item.shortmessage),
      webUrl: link?.origin === SITE && !link.username && !link.password ? link.href : `${SITE}/message/output/popup/notifications.php` };
  }), warnings: [] as MoodleWarning[] };
}

interface Forum { id: number; course: number; name: string; type: string; intro?: string; numdiscussions?: number; cmid?: number }
interface Discussion { id: number; discussion: number; subject: string; message?: string; created?: number;
  numreplies?: number; numunread?: number; locked?: boolean; pinned?: boolean; canreply?: boolean }
interface ForumPost { id: number; subject: string; message?: string; timecreated?: number; parentid?: number;
  author?: { fullname?: string }; attachments?: { filename: string; fileurl?: string }[] }

export async function forums(token: string, courseId?: Id) {
  const id = courseId === undefined ? undefined : requireId(String(courseId), 'Course ID');
  const ids = id === undefined ? (await listCourses(token)).courses.map(course => course.id) : [id];
  if (!ids.length) return { forums: [] as (Forum & { introText: string; webUrl: string })[], warnings: [] as MoodleWarning[] };
  const result = await api<Forum[]>(token, 'mod_forum_get_forums_by_courses', courseParams(ids));
  if (!Array.isArray(result)) throw new Error('Danh sách diễn đàn trả về không hợp lệ.');
  return { forums: result.map(forum => ({ ...forum, introText: render(forum.intro),
    webUrl: forum.cmid ? `${SITE}/mod/forum/view.php?id=${forum.cmid}` : `${SITE}/course/view.php?id=${forum.course}` })),
    warnings: [] as MoodleWarning[] };
}

export async function forumDiscussions(token: string, forumId: Id, page: Id = 1) {
  const id = requireId(String(forumId), 'Forum ID');
  const current = requireId(String(page), 'Số trang');
  const result = await api<WithWarnings & { discussions: Discussion[] }>(token,
    'mod_forum_get_forum_discussions', { forumid: id, page: current - 1, perpage: 20 });
  if (!Array.isArray(result.discussions)) throw new Error('Chủ đề diễn đàn trả về không hợp lệ.');
  return { forumid: id, page: current, discussions: result.discussions.map(discussion => ({ ...discussion,
    messageText: render(discussion.message), webUrl: `${SITE}/mod/forum/discuss.php?d=${discussion.discussion}` })),
    warnings: result.warnings ?? [] };
}

export async function forumView(token: string, discussionId: Id) {
  const id = requireId(String(discussionId), 'Discussion ID');
  const result = await api<WithWarnings & { posts: ForumPost[]; forumid: number; courseid: number }>(token,
    'mod_forum_get_discussion_posts', { discussionid: id });
  if (!Array.isArray(result.posts)) throw new Error('Bài viết diễn đàn trả về không hợp lệ.');
  return { discussionid: id, forumid: result.forumid, courseid: result.courseid,
    posts: result.posts.map(post => ({ ...post, messageText: render(post.message),
      webUrl: `${SITE}/mod/forum/discuss.php?d=${id}#p${post.id}` })), warnings: result.warnings ?? [] };
}
