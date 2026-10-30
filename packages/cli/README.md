# HCMUS Course CLI

CLI cho sinh viên sử dụng [HCMUS FIT Course](https://courses.fit.hcmus.edu.vn/)
qua Moodle API. Hỗ trợ xem môn học, đề bài, deadline, quiz, điểm, thông báo và
nộp bài. Cần Node.js 22 trở lên.

```sh
npm install -g hcmus-course-cli
course doctor
course auth login
course auth status
course deadlines
```

`course auth login` mở trình duyệt mặc định để bạn tự đăng nhập Microsoft. Không
nhập mật khẩu hoặc token vào CLI hay chat. Chạy `course auth logout` khi muốn xóa
token đã lưu trên máy.

Chạy `course --help` để xem toàn bộ lệnh. Tài liệu sử dụng, giới hạn API và
plugin Codex nằm trong [README của dự án](https://github.com/NgBaoAnn/portal-cli#readme).
