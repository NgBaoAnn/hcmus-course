# Thiết kế Course CLI

Ngày: 29/10/2026. Trạng thái: đề xuất để duyệt trước khi triển khai.

## Mục tiêu

CLI cho sinh viên sử dụng `https://courses.fit.hcmus.edu.vn`, với trải nghiệm lệnh
tương tự `gh`. Ưu tiên đọc đề, tải tài liệu, kiểm tra deadline, nộp bài, làm quiz
và xác minh kết quả nộp; bổ sung xem điểm, phản hồi và thông báo môn học.

Người dùng đã chọn ưu tiên API, đăng nhập Microsoft, yêu cầu có làm quiz và
chọn TypeScript cho toàn bộ mã nguồn CLI.
Những quyết định triển khai
chưa được người dùng chỉ định dưới đây là đề xuất của người viết.

## Cơ sở đã kiểm chứng

- Web Services và Mobile Web Services của trường đều được bật.
- Bản thử Node.js đã đăng nhập Microsoft, nhận token và xác minh tài khoản thành công.
- Đã đọc danh sách môn, các Moodle Assignment, nội dung đề và deadline gốc bằng API.
- Đã gọi `mod_assign_get_submission_status` thành công. API trả quyền sửa/nộp,
  trạng thái, gia hạn và thông tin nhóm cho từng bài.
- Token có các hàm đọc nội dung môn, lịch, điểm, forum và các hàm lưu/nộp bài.
- Một số module bị giới hạn quyền. Không được coi dữ liệu trả về là đầy đủ khi có warning.
- Chưa upload, lưu bài hay nộp bài thật. Hàm API xuất hiện không bảo đảm một bài cụ thể cho phép ghi.
- Token có các hàm Quiz API cho danh sách, kiểm tra truy cập, bắt đầu, đọc/lưu câu
  trả lời, xử lý nộp bài và review. Đã đọc danh sách quiz của một môn bằng API và
  kiểm tra loại câu hỏi của một quiz là `multichoice`; chưa bắt đầu lượt làm nào.

## Approaches

1. **API Moodle làm chính, trình duyệt cho đăng nhập — hướng người dùng chọn.**
   Dữ liệu rõ ràng; có thể kiểm tra trạng thái trước và sau khi ghi. Cần xử lý quyền,
   plugin và quy tắc nộp bài riêng của từng Assignment.
2. **Tự động hóa mọi thao tác qua trình duyệt.** Gần trải nghiệm website hơn, nhưng
   phụ thuộc giao diện, khó kiểm tra kết quả và cần trình duyệt cho từng thao tác.

Giữ luồng Microsoft qua trình duyệt cài sẵn: ưu tiên Microsoft Edge, fallback Google
Chrome. Các lệnh đọc/ghi học tập gọi API trực tiếp.
Không xây hệ thống kết hợp scrape website để âm thầm thay thế API bị từ chối.

## Phạm vi bản đầu

Tên lệnh đề xuất: `course`. Node.js >=22, TypeScript ESM, có bước biên dịch bằng
`tsc` và kiểm tra kiểu nghiêm ngặt. Đăng ký `bin` trỏ vào bản biên dịch để chạy qua
`npm link`; cách chạy trực tiếp là `node dist/course.js` sau `npm run build`.

```text
course auth login
course auth status
course auth logout
course doctor
course list
course view <course-id>
course assignment list [--course <course-id>]
course assignment view <assignment-id>
course assignment download <assignment-id> [--output <directory>]
course assignment status <assignment-id>
course assignment submit <assignment-id> [files...] [--text-file <path>] [--draft]
course quiz list [--course <course-id>]
course quiz view <quiz-id>
course quiz attempts <quiz-id>
course quiz start <quiz-id>
course quiz resume <attempt-id>
course quiz status <attempt-id>
course quiz submit <attempt-id>
course quiz review <attempt-id>
course deadlines [--course <course-id>] [--days <positive-integer>] [--overdue]
course grades --course <course-id>
course notices --course <course-id>
```

- ID môn, Assignment ID và course-module ID là các loại khác nhau. Lệnh bài tập dùng
  Assignment ID từ `assignment list`; link website dùng course-module ID tương ứng.
  Lệnh quiz cũng phân biệt Quiz ID với Attempt ID và course-module ID.
- `list`: các môn sinh viên đang tham gia, gồm ID và tên. `view`: nội dung theo
  chủ đề/tuần, tài nguyên, hoạt động và link mở website.
- `assignment list`: tên, ID, môn, hạn gốc; `view`: đề, file, yêu cầu nộp,
  các hạn và trạng thái liên quan. Đọc HTML thành văn bản giữ cấu trúc và đường dẫn.
- `download`: tải file đề đính kèm, mặc định vào thư mục làm việc. Không tải tùy ý
  mọi URL xuất hiện trong đề, không giải nén tự động và không ghi đè file đang có.
- `status`: trạng thái bản cá nhân/nhóm, file hiện tại, hạn gia hạn, quyền sửa/nộp,
  điểm và phản hồi nếu API cung cấp. Không suy ra đã nộp chỉ từ việc có file.
- `deadlines`: mặc định 14 ngày tới; `--overdue` thêm bài quá hạn chưa nộp.
  Đọc trạng thái cần thiết để áp dụng gia hạn cá nhân/nhóm; phân biệt due date
  với cutoff date. Không coi không có ngày là đã hết hạn. Hiển thị giờ Việt Nam,
  kèm múi giờ rõ ràng. Có cảnh báo nếu không xác định được hạn/trạng thái đầy đủ.
  Bao gồm hạn đóng quiz và hạn của lượt đang làm theo dữ liệu áp dụng cho sinh viên;
  hiển thị rõ loại hoạt động, số lượt còn lại nếu xác định được và trạng thái lượt.
- `grades`: bảng điểm của chính sinh viên trong môn, giữ cách Moodle biểu diễn
  điểm, thang điểm, ẩn điểm và chưa chấm. Không tự tính lại điểm tổng.
- `notices`: thông báo từ forum kiểu announcements/news của môn, nội dung bài đăng
  và link; không xây chức năng nhắn tin, đăng forum hoặc đọc hết mọi thảo luận.
- Lệnh đọc hỗ trợ `--json`; stderr dành cho chẩn đoán. Kết quả JSON giữ timestamp
  và cấu trúc warning, không chứa token. Lỗi quyền và kết quả thiếu phải hiển thị rõ.
- Giữ `probe` như lệnh chẩn đoán tương thích, không mở rộng giao diện của nó.

## Nộp bài

Hỗ trợ plugin chuẩn `file` và `onlinetext`, kể cả khi cả hai cùng bật.
File văn bản UTF-8 từ `--text-file` được gửi dưới dạng plain text, không tự coi là HTML.
Plugin ghi khác và Assignment có thời gian làm bài cần bắt đầu một lượt được thông
báo là chưa hỗ trợ và cung cấp link website. Quy trình làm Moodle Quiz ở phần riêng
bên dưới; không nhầm Assignment có đồng hồ với Quiz.

### Trước khi ghi

1. Xác minh ID, tài khoản, môn, bài, quyền hiện tại, khóa bài, thời gian, cấu hình
   nhóm và attempt từ API. Không coi danh sách API là quyền nộp.
2. Kiểm tra file có thể đọc, là file thường, tên không trùng, giới hạn số lượng,
   dung lượng và loại file do Moodle cung cấp. Moodle vẫn là nơi quyết định cuối cùng.
3. Đối với phần file, danh sách file truyền vào là **toàn bộ bộ file thay thế**,
   không phải phép nối thêm. Hiện rõ file hiện tại sẽ bị thay thế và file mới.
   Không có files thì không yêu cầu sửa phần file. Tương tự, chỉ sửa online text
   khi có `--text-file`. Giữ nguyên phần không được yêu cầu thay đổi.
4. Nếu API không cho giữ nguyên chính xác phần dữ liệu không sửa, từ chối thao tác
   với giải thích và link website, thay vì gửi giá trị rỗng làm mất dữ liệu.
5. Hiển thị tên môn/bài, tài khoản, nhóm nếu có, attempt, các hạn, trạng thái hiện tại,
   thay đổi file/text và hành động cuối cùng. Nếu bài nhóm, nói rõ tác động đến nhóm
   và trạng thái thành viên cần xác nhận. Không ký thay thành viên khác.
6. Yêu cầu xác nhận tương tác trước mọi upload hoặc lưu bài. Khi có submission
   statement, hiển thị nguyên văn và yêu cầu người dùng đồng ý. Mặc định hủy khi
   không có terminal tương tác, EOF hoặc câu trả lời không phải xác nhận rõ ràng.
   Bản đầu không có cờ bỏ qua xác nhận.

### Upload, lưu, nộp và kiểm tra

- Upload file qua `/webservice/upload.php` vào cùng một draft item, sau đó gọi
  `mod_assign_save_submission` với plugin data đúng cấu hình.
- `--draft` chỉ được chấp nhận nếu Moodle hỗ trợ lưu nháp cho bài đó. Nếu lưu bài
  đồng thời là nộp chính thức, phải từ chối `--draft` trước khi upload.
- Nếu bài yêu cầu bước nộp riêng, chỉ gọi `mod_assign_submit_for_grading` sau khi
  lưu thành công và xác minh dữ liệu đã lưu khớp ý định đã được xác nhận.
- Đọc lại trạng thái và danh sách file/nội dung sau ghi; chỉ báo thành công tương ứng
  với kết quả quan sát được. Với bài nhóm cần tất cả thành viên xác nhận, báo rõ còn
  chờ thành viên thay vì tuyên bố cả nhóm đã hoàn tất.
- Không tự mở lại bài đã nộp, tạo attempt mới hoặc thay đổi nhóm.
- Không tự retry thao tác ghi khi timeout/mất kết nối. Đọc lại trạng thái để đối chiếu;
  nếu chưa chứng minh được kết quả, báo chưa xác định và hướng dẫn `assignment status`.
- Nếu lưu đã thành công nhưng nộp chính thức thất bại, báo đúng trạng thái trung gian.
  Không tự rollback vì có thể ghi đè thay đổi đồng thời trên website.
- Đọc lại trạng thái ngay trước bước lưu/nộp; nếu nhóm, attempt, file hoặc quyền đã
  thay đổi sau xác nhận, dừng và yêu cầu người dùng chạy lại lệnh. Không hứa giao dịch
  nguyên tử: API Moodle vẫn có khoảng đua giữa lần kiểm tra cuối và lần ghi.

## Làm quiz

CLI là công cụ để **sinh viên tự nhập câu trả lời**, lưu và nộp lên Moodle.
Không thêm chức năng AI chọn đáp án hoặc tự làm bài.

### Danh sách, điều kiện truy cập và lượt làm

- `quiz list/view`: tên, hướng dẫn, hạn mở/đóng, thời lượng, số lượt cho phép,
  các lượt của chính sinh viên và điều kiện truy cập mà API công bố.
- Các lệnh đọc không gọi start/save/process và không tiêu thụ lượt làm.
- Trước `start`, kiểm tra quyền, loại câu hỏi có thể xuất hiện, question behaviour,
  lượt đang làm, giới hạn số lượt, thời gian chờ, mật khẩu và access rules.
  Nếu đã có lượt chưa kết thúc, hướng dẫn `resume` đúng Attempt ID; không tạo lượt mới.
- `start` hiển thị môn/quiz, số lượt đã dùng, thời lượng/hạn kết thúc có thể xác định,
  quy tắc hết giờ và việc lưu câu trả lời, rồi yêu cầu xác nhận trước khi tạo lượt.
  Mật khẩu quiz được nhập không echo, chỉ giữ trong bộ nhớ và gửi bằng POST.
- Không vượt qua Safe Exam Browser, browser security, IP, proctoring hoặc quy tắc
  truy cập mà CLI không thực hiện được. Với quiz bị giới hạn, nêu lý do và link website.
- Nếu start timeout, kiểm tra lại các lượt của sinh viên; không retry tạo lượt và
  không tự chọn một lượt nếu không xác minh được kết quả.

### Câu hỏi và tương tác terminal

- `start` thành công chuyển vào cùng phiên tương tác như `resume`; `resume` tiếp tục
  lượt hiện có, không tạo mới. Hiển thị câu hỏi, lựa chọn, số thứ tự, trang và trạng thái.
- Bản đầu hỗ trợ `description`, `multichoice` (một/nhiều lựa chọn), `truefalse`,
  `shortanswer`, `numerical`, `match`, `gapselect` và `essay` dạng văn bản không đính kèm.
  Question behaviour bản đầu là `deferredfeedback`. Kiểm tra trước lượt làm;
  loại khác, interactive/adaptive/CBM, câu hỏi cần JavaScript/kéo thả hoặc essay upload
  được thông báo chưa hỗ trợ và dùng website. Không bắt đầu quiz không tương thích.
- Dùng HTML DOM parser để lấy control, tên trường, giá trị lựa chọn và metadata thật
  từ API. Giữ thứ tự trộn và mapping lựa chọn của lượt hiện tại; không suy ra answer ID
  từ A/B/C hoặc chỉ số câu. Giữ sequence-check và các trường bắt buộc đúng phiên bản.
- Text câu hỏi được định dạng an toàn; tài nguyên hình/âm thanh/công thức không hiển
  thị đầy đủ phải có chỉ dẫn và link xem. Không che phần nội dung bị mất khi chuyển HTML.
- Sinh viên nhập/chọn câu trả lời rồi CLI lưu ngay và kiểm tra API xác nhận trước khi
  báo đã lưu. Enter bỏ qua giữ nguyên đáp án hiện có; xóa đáp án là thao tác rõ ràng.
  Không ghi rỗng các câu người dùng chưa thay đổi. EOF/Ctrl-C không tự nộp toàn bộ bài.
- Cho phép điều hướng trang theo navigation method Moodle. Sequential không được
  đi ngược; cảnh báo trước khi rời trang không thể quay lại. Không đánh đồng autosave
  với xử lý chuyển trang: dùng đúng `save_attempt`/`process_attempt` theo luồng Moodle.
- Đọc lại dữ liệu sau lưu/chuyển trang để có sequence-check mới. Nếu phát hiện xung
  đột do sửa trên website/thiết bị khác, dừng ghi và báo chưa lưu phần bị xung đột.
  Không tự gửi lại bằng sequence mới để ghi đè câu trả lời khác.
- Nếu gặp câu không hỗ trợ sau khi lượt đã tồn tại, không tạo lượt khác hoặc tự nộp;
  chỉ dẫn tiếp tục cùng lượt trên website, giữ các câu đã lưu trên server.

### Thời gian, nộp và review

- Hiển thị hạn kết thúc hiệu lực từ Quiz API (`endtime`) và thời gian còn lại cho lượt
  có giới hạn. Đồng bộ với thời gian server, tính cả hạn đóng và override; không chỉ
  cộng timelimit vào đồng hồ máy. Thoát CLI không dừng đồng hồ Moodle.
- Khi tới hạn, xử lý theo overdue handling của Moodle (auto-submit, grace period hoặc
  abandoned), không tự đặt lại giờ hay mặc định còn quyền sửa. Nêu hành vi trước start.
  Không đặt `timeup=true` sớm để ép chuyển trạng thái. Mất mạng phải báo rõ trạng thái
  câu chưa được server xác nhận và khả năng server đã xử lý hết giờ.
- `quiz status`: trạng thái lượt, thời gian, số câu được server ghi nhận và hạn;
  không tiết lộ đáp án đúng khi review options chưa cho phép.
- `quiz submit`: lấy summary mới, nêu câu chưa trả lời và tính không thể sửa sau nộp,
  rồi yêu cầu xác nhận rõ ràng trước khi gọi finish attempt. Nộp thủ công không có
  cờ bỏ xác nhận; việc server tự xử lý hết giờ tuân theo quy tắc đã hiển thị khi bắt đầu.
- Sau nộp, đọc lại trạng thái. Khi timeout, kiểm tra trước khi cho thử lại và không
  tuyên bố đã nộp nếu chưa xác định được. Phân biệt finished, overdue và abandoned.
- `quiz review`: điểm/phản hồi/nội dung được Moodle cho phép tại thời điểm xem.
  Tôn trọng review options, lịch công bố đáp án và essay chưa chấm; không tự chấm.
- Không lưu câu trả lời, mật khẩu quiz hoặc nội dung quiz vào cache/log/file trong
  bản đầu. Các câu đã xác nhận được giữ trên Moodle; câu đang nhập chỉ ở bộ nhớ.

### Cơ sở kỹ thuật

Luồng tham chiếu: [Moodle Quiz API](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/mod/quiz/classes/external.php),
[Quiz support in the Mobile app](https://docs.moodle.org/dev/Quiz_support_in_the_Mobile_app).
Builder kiểm tra input/schema và rule theo nguồn thực tế; không coi HTML câu hỏi
là HTML form tùy ý được phép thực thi hoặc gửi mọi control không phân loại.

## API và dữ liệu

| Việc | API chính |
|---|---|
| Xác minh tài khoản, hàm được cấp | `core_webservice_get_site_info` |
| Môn đang tham gia | `core_enrol_get_users_courses` |
| Nội dung môn | `core_course_get_contents` |
| Assignment, đề, cấu hình | `mod_assign_get_assignments` |
| Trạng thái, gia hạn, phản hồi | `mod_assign_get_submission_status` |
| Upload file | `/webservice/upload.php` |
| Lưu bài, nộp chính thức | `mod_assign_save_submission`, `mod_assign_submit_for_grading` |
| Quiz, lượt làm, điều kiện | `mod_quiz_get_quizzes_by_courses`, `mod_quiz_get_user_attempts`, `mod_quiz_get_quiz_access_information`, `mod_quiz_get_quiz_required_qtypes` |
| Bắt đầu/đọc quiz | `mod_quiz_start_attempt`, `mod_quiz_get_attempt_data`, `mod_quiz_get_attempt_access_information` |
| Lưu câu trả lời, chuyển trang/nộp | `mod_quiz_save_attempt`, `mod_quiz_process_attempt`, `mod_quiz_get_attempt_summary` |
| Kết quả quiz | `mod_quiz_get_attempt_review`, `mod_quiz_get_user_best_grade` |
| Điểm môn | `gradereport_user_get_grade_items` |
| Thông báo | `mod_forum_get_forums_by_courses`, `mod_forum_get_forum_discussions`, `mod_forum_get_discussion_posts` |

Builder kiểm tra schema thực tế và nguồn Moodle chính thức trước khi viết tham số,
đặc biệt cho plugin data, nhóm, upload và question fields/sequence-check. Phân trang khi API yêu cầu. Giới hạn gọi
đọc song song (đề xuất 4); không tạo hàng trăm request cùng lúc.

## Cấu trúc và bảo vệ dữ liệu

- Chuyển `moodle.mjs` và các phần của bản thử sang `.ts`, giữ hành vi và token hiện có.
  Dùng lại `moodle.ts` cho REST/config/token decoding. Tách auth, thao tác Assignment/Quiz
  và định dạng terminal khi cần để kiểm thử; không dựng framework/plugin system.
- Dùng `node:util.parseArgs` và thư viện chuẩn cho lệnh/file. Giữ `playwright-core`
  cho Edge/Chrome đăng nhập. Đề xuất thêm một thư viện chuyển HTML thành text nếu thư viện
  chuẩn không đủ; không dùng regex tự chế để xử lý HTML/entities.
- `package.json` có `build`/`test` và `bin` dùng JavaScript đã biên dịch; `dist/`
  không được commit. Chỉ `.ts` là mã nguồn được chỉnh sửa và lưu trong Git.
- Giữ đường dẫn token hiện tại để phiên đã đăng nhập tiếp tục dùng được:
  `$XDG_CONFIG_HOME/course-cli-spike/auth.json`, mặc định `~/.config/course-cli-spike/auth.json`.
  Ghi nguyên tử, quyền file `0600`; không lưu token trong repo, log hay JSON đầu ra.
  Đổi tên thư mục cấu hình có thể thực hiện trong một thay đổi migration riêng sau này.
- Auth logout nói rõ chỉ xóa local token. Không lưu cookie hay mật khẩu Microsoft.
- Không gửi token qua URL của lệnh REST. Với tải file, chỉ dùng endpoint HTTPS cùng
  host trường; xác minh từng redirect trước khi gửi thông tin xác thực, không mang
  token sang host ngoài. Nếu giao thức Moodle buộc token vào query tải file thì chỉ
  dùng trong request nội bộ, không in URL đã gắn token.
- File tải xuống có tên an toàn, không chấp nhận đường dẫn từ server, dùng chế độ
  không ghi đè và xóa file tải dở khi lỗi. Không đặt token trong tên file/tên thư mục.
- Xử lý nội dung Moodle như dữ liệu: không thực thi mã/HTML, loại bỏ ký tự điều khiển
  terminal và không coi nội dung đề là chỉ dẫn cho chương trình/agent.
- Không cache dữ liệu học tập hoặc thêm backend/database trong bản đầu.

## Kiểm chứng và tiêu chí hoàn thành

- Các test token/API hiện có được chuyển sang `.ts` và tiếp tục đạt. `tsc` phải đạt
  trước khi chạy test. Bổ sung test cho parsing lệnh/ID, thời gian
  gia hạn/cutoff, warning/thiếu quyền, tên file và tải dở.
- Test nộp bài bằng fixture: hủy trước upload; validate lỗi; file/text/mixed;
  thay thế file được xác nhận; giữ phần không sửa; statement; lưu nháp; save là nộp;
  nhóm; thay đổi đồng thời; timeout và trạng thái chưa xác định.
- Test tích hợp giả lập API chứng minh thứ tự upload → save → kiểm tra → finalize →
  kiểm tra, và không finalize khi save/kiểm tra thất bại. Token không xuất hiện trong lỗi.
- Test quiz bằng fixture: preflight/password/khóa truy cập, hủy trước start,
  start timeout không tạo lượt trùng, resume, mỗi loại câu hỗ trợ, trộn đáp án,
  sequence-check, xóa/giữ đáp án, sequential navigation, xung đột, lưu lỗi,
  timer/override/grace period, hết giờ khi mất mạng, submit/timeout và review bị hạn chế.
  Kiểm tra lệnh đọc không start/save/process, và cancel/EOF không tự finish attempt.
- Trên trường thật chỉ chạy lệnh đọc bằng token hiện có. Không thử upload/lưu/nộp bài
  thật trong quá trình phát triển khi người dùng chưa chỉ định bài/file và yêu cầu nộp.
  Tương tự, không bắt đầu, lưu câu trả lời hoặc nộp một lượt quiz thật để test;
  dùng server/fixture giả lập cho các nhánh ghi.
- README có hướng dẫn cài/chạy, ID, thời gian, ngữ nghĩa thay thế file, trạng thái và
  cách xử lý lỗi. Hoàn thành khi các lệnh trong phạm vi hoạt động qua API, kiểm tra
  cần thiết đạt và giới hạn còn lại được nêu rõ.

## Ngoài phạm vi và phần builder tự quyết

Ngoài phạm vi: quiz cần loại câu/question behaviour hoặc browser/proctoring rule chưa
được hỗ trợ như đã nêu; plugin nộp riêng, nhắn tin/đăng forum, xem dữ liệu sinh viên
khác, tự làm bài, tự nộp theo lịch, UI web, đa trường, publish npm và auto-update.

Builder tự quyết tên module nội bộ, trình bày bảng, thư viện HTML nhỏ phù hợp,
cách chia fixture, cỡ trang API và cách đối chiếu file theo metadata server cung cấp.
Không bỏ qua các yêu cầu bảo vệ dữ liệu hoặc tự bổ sung tính năng để thay đổi phạm vi.
