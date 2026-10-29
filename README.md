# Course CLI

CLI TypeScript cho sinh viên dùng `https://courses.fit.hcmus.edu.vn`: đọc môn học,
đề và tài liệu, deadline, lịch, tiến độ, điểm, thông báo, diễn đàn; nộp Moodle
Assignment và tự nhập câu trả lời quiz qua API. Trình duyệt chỉ dùng cho đăng nhập
Microsoft.

## Cài và chạy

Cần Node.js **22 trở lên** và trình duyệt mặc định của hệ điều hành cho `auth login`.

```sh
npm install          # prepare tự biên dịch TypeScript vào dist/
npm link             # đăng ký lệnh course trên máy
course --help
course doctor
course auth login
course auth status
```

Không dùng `npm link` vẫn chạy được từ thư mục dự án:

```sh
npm run build
node dist/course.js --help
node dist/course.js list
```

Sau khi sửa mã nguồn `.ts`, chạy lại `npm run build`; `dist/` là đầu ra biên dịch,
không commit. `npm test` biên dịch rồi chạy các test với API giả lập, không ghi lên
Moodle thật. `auth login` mở trình duyệt mặc định; không cần cài Chrome, Edge hay
trình duyệt Playwright riêng.

`auth login` đăng ký tạm handler `coursecli://` theo tài khoản máy, rồi mở trình
duyệt mặc định. Đăng nhập Microsoft và hoàn tất MFA nếu có trong vòng 10 phút; nếu
hệ điều hành hỏi, cho phép mở Course CLI. Callback chỉ lưu token sau khi kiểm tra
passport một lần và xác minh tài khoản qua Moodle. Handler được gỡ khi login kết
thúc hoặc khi chạy `auth logout`. CLI không lưu cookie, mật khẩu Microsoft hay
private token.

Token cũ tiếp tục dùng được ở `~/.config/course-cli-spike/auth.json`, hoặc
`$XDG_CONFIG_HOME/course-cli-spike/auth.json`, quyền file `0600`. Đây là bí mật dạng
văn bản: không chia sẻ hoặc commit file. `auth status` kiểm tra tài khoản qua API;
khi hết hạn chạy lại `auth login`. `course auth logout` xóa token và handler trên
máy, không thu hồi token phía Moodle; dùng trang security keys của Moodle nếu có
quyền.

## Lệnh đọc

```sh
course list
course list --all
course view <course-id>
course assignment list [--course <course-id>]
course assignment view <assignment-id>
course assignment status <assignment-id>
course assignment download <assignment-id> [--output <directory>]
course quiz list [--course <course-id>]
course quiz view <quiz-id>
course quiz attempts <quiz-id>
course quiz status <attempt-id>
course quiz review <attempt-id>
course deadlines [--course <course-id>] [--days <positive-integer>] [--overdue]
course calendar [--course <course-id>] [--days <positive-integer>]
course progress --course <course-id>
course notifications [--limit <positive-integer>]
course forum list [--course <course-id>]
course forum discussions <forum-id> [--page <positive-integer>]
course forum view <discussion-id>
course grades --course <course-id>
course notices --course <course-id>
```

Các ID đều là số nguyên dương và **khác loại**: Course ID lấy từ `list`, Assignment
ID từ `assignment list`, Quiz ID từ `quiz list`, Attempt ID từ `quiz attempts`.
Course-module ID nằm trong link website (`view.php?id=...`), không dùng thay
Assignment ID hay Quiz ID. `quiz resume/status/submit/review` nhận **Attempt ID**.
Forum ID lấy từ `forum list`; Discussion ID lấy từ `forum discussions`.

`course list` hỏi chọn năm học hiện tại hoặc tất cả môn khi chạy trong terminal.
Nhấn Enter để chọn năm học hiện tại; khi chạy không tương tác, lệnh cũng dùng
lựa chọn này. `course list --all` xem mọi môn tài khoản còn được ghi danh, kể cả
năm cũ. Năm học được nhận diện qua danh mục Moodle dạng `2026-2027` và đổi năm
từ tháng 9 theo giờ Việt Nam. Các lệnh tìm bài tập/deadline vẫn xét mọi môn đã
ghi danh, không phụ thuộc lựa chọn hiển thị của `course list`.

`view` đọc các chủ đề, tài nguyên và hoạt động của môn. `assignment view` đọc đề,
file đính kèm, cấu hình và trạng thái; `status` giữ trạng thái cá nhân/nhóm, gia hạn,
file và phản hồi Moodle cung cấp. Có file chưa chứng minh đã nộp: kiểm tra trạng
thái `submitted` và thành viên nhóm còn cần xác nhận.

`download` chỉ tải file đề đính kèm qua HTTPS cùng host trường, mặc định vào thư
mục hiện tại. Không tự tải mọi link trong đề, không giải nén và không ghi đè file
đã có. Khi lỗi, file tải dở bị xóa; file đã tải xong trước đó được giữ lại.

`deadlines` mặc định 14 ngày tới; `--overdue` thêm bài quá hạn chưa nộp theo trạng
thái đọc được. Hạn Assignment áp dụng gia hạn cá nhân/nhóm; due date và cutoff
(hạn cuối nhận bài) là hai trường riêng. Không có ngày không có nghĩa là hết hạn.
Thời gian định dạng theo `Asia/Ho_Chi_Minh` (UTC+07:00).
Hạn đóng quiz và số lượt còn lại chỉ có khi API cung cấp đủ dữ liệu.

`calendar` đọc sự kiện môn học, cá nhân và toàn site trong 14 ngày tới; `--course`
chỉ xem một môn, `--days` tối đa 365. Đây là lịch Moodle, có thể chứa những sự kiện
khác ngoài hạn Assignment/Quiz. `progress` xem hoạt động có theo dõi hoàn thành
trong một môn, gồm trạng thái và liên kết. `notifications` đọc tối đa 20 thông báo
mới nhất, `--limit` tối đa 100; lệnh không đánh dấu đã đọc. `forum list` liệt kê
diễn đàn, `forum discussions` xem chủ đề theo trang 20 mục, và `forum view` đọc bài
viết, phản hồi, file đính kèm. Các lệnh diễn đàn không ghi bài hay đánh dấu đã đọc.

**Giới hạn chỉ đọc của quiz:** `list/view/attempts/status/review` và `deadlines`
không gọi API có thể xử lý hết giờ. Vì Moodle có thể tự nộp khi gọi API lấy dữ liệu,
summary hoặc quyền của lượt đang làm, `quiz status` trả `endtime: null` và
`answeredQuestions: null`, kèm warning. `deadlines` cũng cảnh báo nếu không biết
hạn hiệu lực của lượt đang làm. Trạng thái có thể chờ Moodle cập nhật; xem website
để kiểm tra đồng hồ chính xác. `review` chỉ đọc lượt `finished`, theo quyền review
và thời điểm Moodle cho phép, không tự chấm essay hay mở đáp án bị ẩn.

`grades` giữ điểm/thang điểm Moodle công bố, không tự tính tổng. Trường có thể từ
chối bằng `nopermissiontoviewgrades`: đây là lỗi quyền Moodle, không phải bảng điểm
rỗng. `notices` đọc forum announcements/news, không đọc hết các forum hay đăng bài.

Kết quả có cảnh báo có thể chưa đầy đủ dù lệnh thành công; lỗi kết thúc với mã
khác 0. Trong terminal tương tác, output dùng thẻ, tự xuống dòng theo độ rộng và
có màu nếu không đặt `NO_COLOR`; các lệnh tải lâu hiển thị tiến trình. Cảnh báo
trùng nhau được gộp khi in. `doctor`, `auth status` và `probe` cũng hiển thị thẻ.
`probe` được giữ để chẩn đoán tương thích: môn, Assignment, đề mẫu và quyền API;
có tên API trong token chưa chứng minh được quyền ghi một bài cụ thể.

## Nộp Assignment

```sh
course assignment submit <assignment-id> [files...] [--text-file <path>] [--draft]
```

Hỗ trợ plugin chuẩn `file`, `onlinetext` hoặc cả hai. `--text-file` đọc UTF-8 và
nộp plain text, kể cả khi nội dung trông giống HTML. Phải cung cấp file hoặc text.

**Danh sách `files...` là toàn bộ bộ file thay thế**, không nối thêm file cũ.
Không truyền files thì giữ phần file; không truyền `--text-file` thì giữ online
text. Nếu API không cho giữ nguyên phần không sửa (ví dụ text có file nhúng), CLI
từ chối và dẫn tới website. `--draft` chỉ hoạt động khi Moodle hỗ trợ lưu nháp;
bài lưu là nộp chính thức sẽ bị từ chối trước upload nếu có cờ này.

CLI kiểm tra quyền, file, giới hạn, nhóm, attempt và thời gian, rồi hiện tài khoản,
bài, file cũ/mới, tác động nhóm và submission statement nếu áp dụng. Mọi upload/lưu
đều cần terminal tương tác và nhập `yes` rõ ràng; không có cờ bỏ xác nhận.
EOF, hủy hoặc chạy qua pipe không ghi bài. CLI đọc lại dữ liệu sau lưu trước khi
nộp chính thức và kiểm tra trạng thái sau nộp. Nhóm có thể vẫn chờ thành viên khác.

Không hỗ trợ plugin nộp riêng, Assignment có đồng hồ cần bắt đầu lượt, mở lại bài
đã nộp hoặc tự xác nhận thay thành viên nhóm. Khi timeout, CLI không tự retry thao
tác ghi hoặc rollback. Nếu báo `saved` hay `uncertain`, xem `assignment status`
và website để đối chiếu; không mặc định là đã nộp. API vẫn có khoảng đua giữa lần
kiểm tra cuối và lần ghi, nên tránh sửa cùng bài trên thiết bị khác khi đang nộp.

## Tự làm quiz trong terminal

```sh
course quiz start <quiz-id>
course quiz resume <attempt-id>
course quiz submit <attempt-id>
```

CLI giúp sinh viên tự nhập câu trả lời, không tự chọn đáp án. `start` kiểm tra cấu
hình, quyền, lượt còn lại, access rules và loại câu hỏi trước khi yêu cầu `yes` và
tạo lượt. Có lượt đang làm thì dùng `resume`, không tạo lượt mới.

Chỉ hỗ trợ behaviour `deferredfeedback`; loại câu gồm description, multichoice
một/nhiều lựa chọn, truefalse, shortanswer, numerical, match và gapselect.
**Quiz có essay phải bắt đầu trên website**: API trước lượt làm không chứng minh
được essay có yêu cầu attachment hay không. `resume` hỗ trợ essay plain text không
đính kèm khi đã kiểm tra control thật của lượt. Loại khác, adaptive/interactive/CBM,
kéo thả, JavaScript, essay upload, Safe Exam Browser, IP/proctoring hoặc quy tắc
truy cập chưa hỗ trợ đều cần website; CLI không vượt qua các hạn chế này.

Nhập theo hướng dẫn từng câu/control. Enter giữ đáp án hiện tại; `:clear` xóa rõ
ràng; `:quit` thoát ở câu hỏi. Ở menu trang dùng `next`, `back` (nếu được phép),
`submit` hoặc `quit`. Sequential chỉ đi tới và không quay lại. Câu thay đổi được
lưu ngay và đọc lại trước khi báo server xác nhận; xung đột sẽ dừng ghi, không tự
gửi lại với sequence mới. Hình, âm thanh và công thức có thể cần mở link website.

`start/resume/submit` yêu cầu xác nhận trước khi dùng các API có thể xử lý hết giờ.
Hạn hiệu lực `endtime` lấy từ Moodle, đồng bộ theo giờ server. **Thoát CLI không
dừng đồng hồ**: Moodle vẫn áp dụng autosubmit, grace period hoặc abandoned.
EOF/Ctrl-C không chủ động nộp bài. `submit` đọc summary mới và cần xác nhận cuối
trước khi finish; timeout không tự retry hay tuyên bố đã nộp. Mất mạng có thể để
câu đang nhập chưa được xác nhận dù server đã xử lý hết giờ. Dùng `quiz status`
và website để đối chiếu, `quiz review` khi Moodle cho phép.

Không cache câu trả lời, mật khẩu hoặc nội dung quiz ra file/log. Mật khẩu quiz
nhập không echo, chỉ giữ trong bộ nhớ và gửi qua POST. Các nhánh ghi được kiểm thử
bằng fixture; phát triển chỉ smoke-test lệnh đọc trên trường thật, chưa xác nhận
upload/lưu/nộp hoặc tạo lượt thật bằng tài khoản này.
