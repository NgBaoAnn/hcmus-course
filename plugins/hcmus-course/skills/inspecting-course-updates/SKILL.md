---
name: inspecting-course-updates
description: Use when a student asks about new announcements, course news, instructor notices, or recent updates across all HCMUS FIT Moodle courses, such as "có thông báo mới gì không", "tin tức môn học", or checking whether teachers have posted reminders.
---

# Inspecting Course Updates

## Overview

Moodle courses often scatter crucial information across multiple places: official News forums, Q&A discussion forums, section summaries, and system notifications. When a student asks "có thông báo gì mới không?" or asks for recent course updates, do not perform a superficial single-command check. Conduct a **thorough multi-channel sweep** across all active courses.

## Exhaustive Sweep Procedure

Follow these steps in order to gather a complete picture of recent academic announcements:

### 1. Identify active courses
Run:
```sh
course list
```
This lists courses enrolled in the current academic year. If the student specifies a particular course or asks about all historical courses, use `course list --all`. Note each course's `id` and name.

### 2. Check official Course Announcements (News Forum)
For each enrolled course:
```sh
course notices --course <course-id>
```
`course notices` paginates the official news forum (`type: news`). Extract:
- Subject and message text
- Created timestamp (formatted in local time `Asia/Ho_Chi_Minh`)
- Post web link

### 3. Deep-dive into Course Forums (Q&A / General Discussion)
Teachers and Teaching Assistants (TAs) frequently post reminders, errata, and project guidelines in general forums rather than the news forum.
For each enrolled course:
```sh
course forum list --course <course-id>
```
If general forums exist (e.g., "Thảo luận", "Hỏi đáp", "Diễn đàn chung"):
```sh
course forum discussions <forum-id>
```
Scan recent discussion topics created by instructors or TAs, or discussions with high reply counts. If a topic mentions upcoming exams, deadlines, or grading changes, inspect its contents with:
```sh
course forum view <discussion-id>
```

### 4. Inspect Course Sections for Pinned Notes
Instructors often edit section summaries directly to post schedule adjustments, Zoom links, or room changes:
```sh
course view <course-id>
```
Check `sections[].summaryText` and module descriptions for recent announcements, banners, or bold notices.

### 5. Check Personal Moodle Notifications
Fetch user-specific notifications (assignment grades released, direct teacher notices, submission confirmations):
```sh
course notifications --limit 10
```

## Information Synthesis and Presentation

Organize the findings into a clear, prioritized briefing for the student:

1. **Urgent & Actionable:** Highlight changes in lecture schedules, classroom reassignments, upcoming tests, or deadline changes first.
2. **Grouped by Course:** Group announcements by course name (e.g., *Lập trình Windows*, *Cơ sở dữ liệu*).
3. **Date and Source:** Include the publication date and specify whether it comes from the official News forum, a discussion topic, or a section note.
4. **Direct Web Link:** Provide the Moodle URL so the student can click and view the full thread if desired.
5. **Clear Verdict:** If no new announcements are found across all channels, state clearly that you checked the News forum, discussions, section notes, and notifications, and everything is up to date.
