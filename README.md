# HCMUS Course

Repo gồm CLI TypeScript tại `packages/cli` và plugin agent tại `plugins/hcmus-course`.
Plugin chứa skills hướng dẫn Codex, Claude Code, OpenCode, Antigravity, Cursor,
GitHub Copilot CLI và các agent hỗ trợ Agent Skills dùng lệnh `course`; CLI được cài riêng từ npm.

## Cài plugin cho agent

Plugin cần agent chạy **cục bộ** trên máy có Node.js 22 trở lên và có quyền gọi
CLI. Sau khi cài plugin, hãy yêu cầu agent “Thiết lập HCMUS Course”. Cách cài CLI,
đăng nhập và tra lệnh nằm trong [hướng dẫn CLI](packages/cli/README.md).

### Claude Code

Trong Claude Code, chạy:

```text
/plugin marketplace add NgBaoAnn/hcmus-course
/plugin install hcmus-course@hcmus-course-marketplace
```

Hoặc dùng terminal: `claude plugin marketplace add NgBaoAnn/hcmus-course`, rồi
`claude plugin install hcmus-course@hcmus-course-marketplace`.

### Codex

Trong Codex CLI, chạy `codex plugin marketplace add NgBaoAnn/hcmus-course`, rồi mở
`/plugins` để chọn **HCMUS Course** từ marketplace `hcmus-course-local`. Trong Codex
desktop, thêm cùng GitHub marketplace trong Plugins Directory rồi cài plugin.
Plugin cần local executor để chạy `course`.

### OpenCode 2

Chạy:

```sh
opencode plugin add 'github:NgBaoAnn/hcmus-course#main::path:plugins/hcmus-course'
```

Khởi động lại OpenCode và dùng skill `setup` để kiểm tra CLI. Hướng dẫn cài, cập
nhật và cách nạp skills thủ công cho bản cũ nằm tại [.opencode/INSTALL.md](.opencode/INSTALL.md).

### Antigravity

Antigravity CLI/App cài plugin trực tiếp từ GitHub:

```sh
agy plugin install https://github.com/NgBaoAnn/hcmus-course
agy plugin list
```

Cài lại bằng lệnh `agy plugin install` khi có bản mới. Plugin dùng manifest
`.antigravity-plugin/plugin.json` ở gốc repo và cùng năm skill ở
`plugins/hcmus-course/skills/`.

### GitHub Copilot CLI

Copilot CLI đọc được marketplace Claude đã có trong repo:

```sh
copilot plugin marketplace add NgBaoAnn/hcmus-course
copilot plugin install hcmus-course@hcmus-course-marketplace
```

### Cursor và Gemini CLI

Cài năm skill cho tài khoản máy bằng bộ cài Agent Skills. Chọn đúng agent:

```sh
npx skills add https://github.com/NgBaoAnn/hcmus-course/tree/main/plugins/hcmus-course -g -a cursor --skill '*' -y
npx skills add https://github.com/NgBaoAnn/hcmus-course/tree/main/plugins/hcmus-course -g -a gemini-cli --skill '*' -y
```

Chỉ chạy dòng ứng với agent đang dùng. Cursor còn có manifest
`.cursor-plugin/marketplace.json` để nhóm dùng Cursor Team Marketplace nhập repo
này từ GitHub. Trong Gemini CLI, chạy `/skills list` để kiểm tra sau khi cài.

### Agent Skills khác

Với agent được `npx skills` hỗ trợ, thay `cursor` ở lệnh trên bằng tên agent
(ví dụ `windsurf`, `cline`, `continue`, `kimi-cli`) và khởi động phiên mới.
`-g` cài cho tài khoản máy; bỏ `-g` để chỉ dùng trong dự án hiện tại. Bộ cài
`skills` yêu cầu Node.js 22.20 trở lên. Mọi agent vẫn cần chạy cục bộ, thấy
được lệnh `course`, và có thể truyền xác nhận qua pipe hoặc phiên tương tác cho thao tác ghi.

**Cập nhật:** Claude Code dùng `claude plugin marketplace update hcmus-course-marketplace`
rồi kiểm tra bản plugin mới trong `/plugin`;
Codex cập nhật marketplace/plugin trong Plugins Directory; OpenCode dùng
`opencode plugin update` hoặc gỡ và cài lại Git package; Copilot CLI dùng
`copilot plugin update hcmus-course`; skills cài bằng `npx skills` cập nhật
qua `npx skills update -g`. CLI cập nhật riêng bằng
`npm update -g hcmus-course-cli`. Phiên agent mới sẽ nạp skills mới.

Danh mục plugin chính thức của Claude/Codex cần quy trình xét duyệt riêng;
hiện chưa được liệt kê ở đó.

### Skills và thao tác ghi

Plugin có năm skill tại `plugins/hcmus-course/skills/`: `setup` để cài và đăng nhập,
`using-course-cli` cho lệnh đọc và xác thực, `submitting-course-assignments` cho
nộp Assignment và kiểm tra chéo requirement, `taking-course-quizzes` cho làm Quiz,
và `inspecting-course-updates` cho quét toàn diện thông báo, diễn đàn và tin tức môn học. Chúng là tài liệu hướng
dẫn agent, không thay đổi hành vi của lệnh `course`.

Trong chat agent có thể hỏi trực tiếp: “Còn deadline nào tôi chưa làm?”,
“Đọc đề bài tập đó và giúp tôi làm”, hoặc “Nộp bài này giúp tôi”. Agent dùng CLI
để tra dữ liệu; với thao tác ghi, agent chuẩn bị nội dung, trình bày bản xem trước
và chờ bạn duyệt trong chat trước khi xác nhận lệnh.

Nếu chỉ muốn nạp skills thủ công cho Codex hoặc agent hỗ trợ Agent Skills, có thể
chép chúng vào `~/.agents/skills/`. Từ thư mục gốc repo, chạy:

```sh
mkdir -p ~/.agents/skills
cp -R plugins/hcmus-course/skills/* ~/.agents/skills/
```

Mở phiên agent mới sau khi cài để danh sách skill được cập nhật. Khi nâng cấp
repo, chạy lại lệnh `cp -R` để đồng bộ nội dung mới.
