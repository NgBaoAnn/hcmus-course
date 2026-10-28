# Course CLI — bản thử kết nối API

Bản thử dùng riêng cho `https://courses.fit.hcmus.edu.vn`. Mục tiêu là xác minh
đăng nhập Microsoft, token Moodle, danh sách môn và đề bài trước khi thiết kế CLI đầy đủ.
**Không có chức năng upload, nộp bài hoặc sửa dữ liệu học tập.**

## Chạy

Cần Node.js 22 trở lên và Google Chrome đã cài trên máy.

```sh
npm install
node course.mjs doctor
node course.mjs auth login
node course.mjs probe
```

`auth login` mở một cửa sổ Chrome riêng. Tự đăng nhập Microsoft và hoàn tất MFA
nếu có. CLI đọc liên kết trả token của Moodle, kiểm tra nó thuộc lần đăng nhập này,
gọi API xác minh tài khoản rồi lưu token. Không cần copy token hoặc gửi mật khẩu.

`probe` in JSON gồm môn học, danh sách bài với timestamp deadline gốc của Moodle,
đề bài đầu tiên tìm được (HTML gốc), tên file đính kèm và các hàm API token được cấp.
Nếu chưa có bài tập, `sampleAssignment` là `null`; xem `warnings` để biết API có bỏ qua dữ liệu không.
Việc tên API xuất hiện **chưa chứng minh** tài khoản có quyền nộp một bài cụ thể.

Token lưu trong `~/.config/course-cli-spike/auth.json` (hoặc dưới `XDG_CONFIG_HOME`),
quyền file `0600`. Đây là file chứa bí mật ở dạng văn bản; không chia sẻ hoặc commit nó.
Không lưu cookie trình duyệt, mật khẩu Microsoft hoặc private token của Moodle.
Khi hết hạn, chạy lại `auth login`.

```sh
node course.mjs auth logout
npm test
```

`auth logout` chỉ xóa token cục bộ. Muốn thu hồi token trên server, dùng phần quản lý
security keys của Moodle nếu tài khoản được phép.

## Giới hạn của bản thử

- Phụ thuộc Chrome và liên kết `#launchapp` của luồng đăng nhập Moodle hiện tại.
- Chỉ đọc bài tập Moodle Assignment; không làm quiz, thi hoặc xử lý plugin nộp bài riêng.
- Chưa có giao diện terminal hoàn chỉnh, trình đọc PDF, cache hoặc phân phối package.
- Chỉ có thể xác nhận quyền đọc sau khi thử với tài khoản thật; không kiểm chứng quyền ghi.

Tham khảo luồng chính thức: [Moodle mobile launch](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/admin/tool/mobile/launch.php),
[Assignment APIs](https://docs.moodle.org/dev/Assignment_submission_support_in_the_Mobile_app).
