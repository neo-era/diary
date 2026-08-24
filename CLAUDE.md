# CLAUDE.md

Hướng dẫn cho Claude khi làm việc với repo này.

## Tổng quan

App nhật ký thi công hàng ngày (tiếng Việt) cho công ty chiếu sáng, dùng để in/lưu PDF báo cáo ngày công. Toàn bộ là **một file `index.html` tĩnh** — không build step, không backend, không npm. Mọi state lưu trong `localStorage` của trình duyệt.

## Cấu trúc file

```
diary/
├── index.html            # Toàn bộ app (HTML + CSS + JS inline)
├── huong-dan.html        # Hướng dẫn người dùng (tiếng Việt)
├── manifest.webmanifest  # PWA — tên app, icon, màu, start_url
├── sw.js                 # PWA — service worker (cache để chạy offline)
├── icon-192.png · icon-512.png · icon-maskable.png · apple-touch-icon.png
│  (quyển mẫu gốc .xlsx đã xoá khỏi repo ở commit 191acbe — lấy lại bằng `git show 78fa454:<tên file>`)
├── prompts/              # Prompt tự chứa cho từng thay đổi lớn (chạy lại / giao session khác)
└── CLAUDE.md             # File này
```

Quy tắc "đừng tách file" vẫn áp cho **code app** — toàn bộ logic ở trong `index.html`. `sw.js` và `manifest.webmanifest` buộc phải là file riêng vì trình duyệt yêu cầu vậy, không phải ngoại lệ tự ý.

## Dependencies (chỉ runtime, qua CDN)

- **html2pdf.js v0.10.1** — gọi khi bấm "Kết thúc cuốn" để xuất PDF. Cần online lúc đó. Nếu offline, app báo lỗi và cho phép xóa thủ công.
- **Open-Meteo API** (`api.open-meteo.com`) — tự động lấy nhiệt độ địa phương qua geolocation. Không cần API key. Dùng 2 endpoint:
  - `hourly=temperature_2m,weather_code&forecast_days=1` → nhiệt độ sáng/chiều của hôm nay (`fetchLocalTemperature`)
  - `daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&forecast_days=N` → dự báo N ngày tới (`loadForecast`, N do user nhập, default 7, max 16)

## Mô hình dữ liệu (localStorage key: `nktc_lavipco_v2`)

```js
appState = {
  projects: {
    [projectId]: {
      id, name, createdAt, endedAt,
      startDate,   // 'YYYY-MM-DD', ngày = trang đầu tiên
      startPage,   // số trang của TRANG ĐẦU TIÊN được đánh số (bìa quyển với mẫu có bìa,
                   //   ngày bắt đầu với mẫu không bìa) — sticky base cho computePagenum
      templateId,  // 'lavipco' | 'q8' — khóa vào TEMPLATES
      zones,       // ['Phường Chánh Hưng', ...] — chỉ mẫu có địa bàn; sửa TÊN và SỐ LƯỢNG ở edit-mode
      hideZeroRows,// true = khi xuất, ẩn hạng mục có mọi cột khối lượng = 0
      pageSetup,   // định dạng trang, chỉnh trong cửa sổ xem trước (xem PAGE_SETUP_DEFAULT)
      book,        // chỉ mẫu hasBook: dữ liệu bìa + Tr1 + Tr2 (xem Q8_BOOK_DEFAULT)
      items,       // template hạng mục, đồng bộ từ entry hiện tại (qua syncItemsStructureToProject)
      rep_a, rep_b,// chữ ký mặc định, sticky từ entry mới nhất
      entries: {
        ['YYYY-MM-DD']: {
          date, day, month, year,
          w_morning, w_afternoon, t_morning, t_afternoon,
          workers, workers_other, equipment,
          env, safe, note_a, note_b,
          rep_a, rep_b, pagenum,
          restDay,// true = ngày nghỉ, bảng khối lượng in ra để trống
          items   // bản sao đầy đủ tại thời điểm tạo entry; sau đó qty edit độc lập theo entry
        }
      }
    }
  },
  currentProjectId,
  currentDate
}
```

Item có **2 dạng khối lượng** tùy mẫu:
- mẫu 1 cột → `{ name, unit, qty }`
- mẫu nhiều địa bàn → `{ name, unit, q: { th0, th1, th2, nt0, nt1, nt2 } }`

Luôn truy cập qua `getQ(it, key)` / `setQ(it, key, v)` với `key` lấy từ `qtyKeys(project)` — đừng đọc `it.qty` trực tiếp ở code mới.

### Thêm / bớt địa bàn

Mỗi địa bàn = **2 cột số** (một cho mỗi `colGroup`). Khoá `q` đánh theo chỉ số (`th0…thN`, `nt0…ntN`) nên khi đổi số địa bàn **bắt buộc gọi `applyZoneMapping(p, mapping)`** — hàm này đánh lại chỉ số cho `p.items` *và* items của **mọi ngày**; quên là số liệu ngày cũ nằm lệch cột. `addZone()` / `delZone(i)` đã bọc sẵn.

- Không bao giờ để `p.zones` thành mảng rỗng — `zonesOf()` sẽ lặng lẽ rơi về `tpl.zones`. `delZone` chặn khi còn 1.
- Trần `MAX_ZONES = 6` (12 cột số).
- Bề ngang cột lấy từ `colWidths(p)` theo **%**, dùng chung cho `renderTableHead()` (màn hình) và `workTheadHTML()` (bản xuất) — đừng ghi cứng mm.
- `syncDiaBan()` chỉ ghi đè dòng "Địa bàn: …" trên bìa khi nó vẫn khớp `diaBanText(zones cũ)`, để không xoá câu người dùng đã tự sửa. Vì vậy `Q8_BOOK_DEFAULT.diaBan` phải sinh bằng `diaBanText(Q8_ZONES)`.

Khóa cũ `nktc_lavipco_v1` được auto-migrate sang v2 trong `migrateFromV1()` — giữ lại cho đến khi user manually clear.

Schema v2 **chỉ thêm field, không đổi field cũ** ⇒ dữ liệu localStorage đang có vẫn đọc được. Back-fill (`templateId`, `zones`, `book`) nằm hết trong `ensureProjectMeta(p)` — đây là chỗ duy nhất cần sửa khi thêm field cấp cuốn.

## Mẫu quyển (`TEMPLATES`)

Registry ở đầu `<script>`. Mỗi mẫu mô tả layout trang ngày + có/không phần bìa:

| Key | Nhãn hiển thị | Cột khối lượng | Trang bìa | Ghi chú |
|---|---|---|---|---|
| `lavipco` | Mẫu 1 (1 cột khối lượng) | 1 cột (`qty`) | không | Mẫu gốc, mọi cuốn cũ tự nhận mẫu này |
| `q8` | Mẫu 2 (thực hiện + nghiệm thu) | 2 nhóm × 3 địa bàn = 6 cột (`th0..nt2`) | có | Dựng theo file `.xlsx` trong repo |
| `q8th` | Mẫu 3 (chỉ khối lượng thực hiện) | 1 nhóm × 3 địa bàn = 3 cột (`th0..th2`) | có | Y hệt `q8`, chỉ bỏ nhóm "Khối lượng nghiệm thu"; items lấy từ `Q8_ITEMS_TH` |

Nhãn hiển thị **không lưu trong template** — `tplLabel(id)` ghép `Mẫu <STT> (note)` với STT lấy theo thứ tự khai báo trong `TEMPLATES`. Thêm mẫu mới là tự đánh số; template chỉ khai `note`. Mọi chỗ hiện tên mẫu (dropdown, prompt tạo cuốn, confirm đổi mẫu, alert) đều gọi `tplLabel`.

Field của template: `zones`, `colGroups[{label, prefix}]`, `itemsHeader`, `hasBook`, `zeroAsDash` (0 → `-` khi xuất), `keepQty` (snapshot khối lượng vào `p.items` khi sửa cấu trúc — chỉ còn ảnh hưởng **ngày đầu cuốn**; kế thừa hằng ngày do `prevWorkEntryOf` lo), `continuousNumbering` (STT chạy liên tục qua các nhóm), `splitAfter`, `items`, `book`, `sign`.

Số trang mỗi ngày là **động**: `entryPages(p, e)` chia khối thật rồi `entryPageCount(p, e)` đếm. Bật `hideZeroRows` mà số hạng mục còn lại không vượt điểm cắt thì ngày đó tự rút còn 1 trang, `computePagenum` và `bookPageTotal` cộng dồn theo từng ngày nên số trang vẫn liên tục.

### Ngắt trang theo KHỐI, không chỉ trong bảng

Trang ngày dựng bằng `entryBlocks(p, e)` → một dãy **khối**; ranh giới giữa 2 khối là chỗ ngắt trang hợp lệ. Khóa của khối chính là giá trị lưu trong `splitAfter`:

| Khóa | Ngắt sau |
|---|---|
| `'title'` | tiêu đề + dòng ngày |
| `'s1'` | mục 1 (thời tiết) |
| `'s2'` / `'s2b'` | mục 2.1 (nhân lực) / 2.2 (thiết bị) |
| `'s3'` | mục 3 + 3.1 |
| **số** | hạng mục có STT đó trong bảng khối lượng |
| `'s4'` … `'s7'` | mục 4 / 5 / 6 / 7 |

Bảng chữ ký **không** có khóa — ngắt sau nó là vô nghĩa. Dòng **nhóm** cũng không (`k: null`), tránh để tên nhóm mồ côi cuối trang.

- **Số vẫn là định dạng cũ** ⇒ `[20, 30]` trong localStorage và trong template đọc lên vẫn đúng, không phải migrate.
- `splitAfter`: `null`/`''` = **theo mẫu** · `[]` = **không ngắt** (cả ngày 1 trang) · mảng khóa = ngắt đúng những chỗ đó. Phân biệt `null` với `[]` là điều kiện để người dùng ép mẫu `q8` về 1 trang/ngày — đừng gộp hai giá trị này lại.
- `entryPages()` **bỏ qua** khóa trỏ tới khối không tồn tại (hạng mục đã bị ẩn vì khối lượng 0) và khóa rơi vào khối cuối cùng ⇒ không đẻ ra trang trắng.
- `pageBlocksHTML()` gộp các khối dòng liền nhau thành một `<table>`, nên trang nào có dòng khối lượng cũng tự lặp lại `thead`.
- `data-blk` gắn vào **phần tử CUỐI** của mỗi khối, không bọc thêm `div` — bọc thêm là đụng vào margin/layout của trang đang khít. Thuộc tính này đi cả vào bản xuất nhưng vô hại: CSS làm nó sáng lên chỉ nằm trong `.pv-scale` (CSS màn hình), không có trong `exportCss`.
- **Chọn bằng cách bấm**: `#pvScale` bắt click (delegate, bind 1 lần lúc khởi động) → `toggleSplitAt(el.dataset.blk)`. Toggle tính từ `splitPoints(p)` (tức là những gì ĐANG áp dụng, kể cả của mẫu) nên lần bấm đầu tiên trên cuốn chưa tùy chỉnh sẽ "đông cứng" luôn danh sách của mẫu — đúng ý, vì từ đó cuốn tự quy định.

`entryPageCount()`, số trang liên tục và dòng "Sổ này gồm … trang" đều tự suy ra từ `entryPages()`.

`splitPoints(p)` đọc **`p.pageSetup.splitAfter` trước**, rỗng mới rơi về template — người dùng chỉnh được trong cửa sổ xem trước. Mặc định của `q8`/`q8th` là `[20, 30]`: ở cỡ 11pt trang 1 chỉ ôm được 20 mục tên ngắn (nhóm *Tủ thường*), 18 mục *Tủ kết nối* tên dài phải chia tiếp 2 trang.

Helper dùng chung: `tplOf(p)`, `zonesOf(p)`, `qtyKeys(p)`, `getQ/setQ`, `blankQ(p)`, `makeItem(p, name, unit)`, `deepCopy`.

**Thêm mẫu mới** = thêm 1 entry vào `TEMPLATES`; `renderTableHead()`, `buildWorkTableHTML()`, `newProject()`, `onTemplateChange()` đều tự sinh theo descriptor, không cần sửa.

## Modal "Thông tin quyển" (`#bookModal`)

Chỉ bật khi `tplOf(p).hasBook`. Chứa 5 phần: loại bìa · bìa quyển · bìa tổng · Tr1 (liệt kê văn bản) · Tr2 (danh sách cán bộ). Ghi vào `p.book`.

- **Tr1 và Tr2 đều có khối ký ở cuối**, dựng chung bằng `sheetSignHTML(b, signer, topLine)`. Khác nhau ở dòng nghiêng đầu khối: Tr1 là `Từ … đến …`, Tr2 là `<nơi ký>, ngày … tháng … năm …`. Người ký: `docsSignerB` / `staffSignerB`; `staffSignerB` bỏ trống thì lấy `book.repB.name` (đại diện bên B ở bìa quyển).
- **Đơn vị đứng tên ký = `signOrg(b)` = `daiDienLienDanh || benB`.** Bên B là liên danh thì công ty đại diện mới là bên ký, đúng như quyển mẫu; không khai liên danh thì rơi về chính bên B.
- **Tên liên danh in mỗi công ty một dòng** qua `orgLines(text)`, dùng ở `Đơn vị thi công` (bìa tổng), `Bên B` + `Đại diện liên danh` (bìa quyển) và khối ký Tr1/Tr2. Hai đường:
  1. Có ký tự xuống dòng → `multilineHtml()`, in đúng chỗ người dùng gõ Enter (ô `bk_benB` là `<textarea>` chính vì vậy).
  2. Không có → **chỉ khi** chuỗi mở đầu bằng `Liên danh` mới cắt ở ` - `, các dòng sau thêm tiền tố `- `. Đừng bỏ điều kiện này: tên đơn vị bình thường (`Công ty TNHH Xây dựng - Thương mại Sài Gòn`) cũng có dấu gạch, cắt bừa là vỡ các dòng khác trên bìa.
- **`coverRow` escape, `coverRowHTML` thì không.** Dòng nào cần `<br>` phải đi qua `coverRowHTML(label, orgLines(v))`; `orgLines` tự escape từng mảnh nên vẫn an toàn.
- **Dòng "Đại diện liên danh" là tùy chọn** — dùng `coverRowIf()` thay `coverRow()` nên bỏ trống ô đó là **không in ra dòng nào** trên cả bìa tổng lẫn bìa quyển. Các ô còn lại vẫn dùng `coverRow()`: để trống thì **vẫn in nhãn** để người dùng điền tay lên giấy — đừng đổi hết sang `coverRowIf`.
- **Không** dùng auto-save debounce — handler `input` bỏ qua mọi thứ trong `#bookModal`; lưu bằng nút `saveBook()`.
- `collectBookForm()` phải được gọi trước mỗi lần re-render bảng động (`addDocRow`/`delDocRow`/`addStaffRow`/`delStaffRow`) để không mất chữ đang gõ.
- Chuỗi `{MM}` / `{YYYY}` trong `congTacVH`/`congTacBD` được thay bằng tháng/năm của `p.startDate` lúc xuất (`bookCongTac`).

## PWA — cài lên máy tính / điện thoại

- **Phiên bản** khai ở **hai** chỗ và **phải khớp nhau**: `APP_VERSION` trong `index.html` (hiển thị dưới tiêu đề thanh công cụ) và `VERSION` trong `sw.js` (`'nktc-' + APP_VERSION`, dùng làm khoá cache). Đổi nội dung app là bump cả hai.
- **Báo có bản mới**: `watchForUpdate(reg)` bắt `updatefound` → `statechange === 'installed'` **và** `navigator.serviceWorker.controller` có sẵn (có controller nghĩa là bản CẬP NHẬT, không phải lần cài đầu). Khi đó hiện `.update-bar`. Quay lại tab thì gọi `reg.update()` lại, tối đa 1 lần / 5 phút.
- **Không tự reload.** `sw.js` gọi `skipWaiting()` ngay lúc install nên bản mới kích hoạt liền, nhưng TRANG đang mở vẫn chạy code cũ tới khi tải lại — tự reload là mất chữ người dùng đang gõ. `applyUpdate()` chạy `collectForm()` + `persist()` trước rồi mới `location.reload()`.
- **`sw.js`**: HTML dùng **mạng-trước** (app sửa liên tục, phải luôn lấy bản mới; mất mạng mới rơi về cache), ảnh/manifest/CDN dùng **cache-trước**, `api.open-meteo.com` **không cache**. Đổi nội dung app xong nhớ **tăng `VERSION`** trong `sw.js` để cache cũ bị dọn.
- Mọi đường dẫn trong manifest và lúc `register('./sw.js')` đều **tương đối** để chạy được cả ở root lẫn thư mục con (`neo-era.github.io/diary/`).
- Không đặt `id` trong manifest — mặc định lấy theo `start_url` nên tự khớp mọi nơi host.
- Nút `📲 Cài đặt` ẩn sẵn, chỉ hiện khi `beforeinstallprompt` bắn (Chrome/Edge/Android) hoặc khi phát hiện iOS (Safari không có sự kiện này → hướng dẫn thủ công).
- `isStandalone()` **phải bọc try/catch quanh `matchMedia`** — hàm này chạy ngay lúc khởi động, ném lỗi ở đó là vỡ cả app trên WebView cũ.
- `padding-top` chừa tai thỏ của `.toolbar` phải đặt **sau** shorthand `padding`, không thì bị ghi đè.
- Service worker chỉ chạy qua **https:// hoặc localhost** — mở bằng `file://` thì đăng ký thất bại (đã bắt lỗi, app vẫn chạy bình thường).

## Nguyên tắc thiết kế cần biết

- **1 cuốn = 1 công trình. 1 entry = 1 ngày.** Không trộn.
- **`pagenum` là computed**, không lưu user-editable. `computePagenum(p, dateISO)` = `startPage` + `frontMatterPages(p)` + tổng `entryPageCount()` của các ngày trước đó. Ô `#pagenum` là `readonly`.
- **Bìa quyển ĐƯỢC đánh số và là trang đầu tiên** — đúng như quyển mẫu in ra. `FRONT_MATTER = ['cover', 'docs', 'staff']` ⇒ với `startPage = 1`: bìa quyển `Trang 1` · Tr1 (liệt kê văn bản) `Trang 2` · Tr2 (cán bộ) `Trang 3` · ngày đầu `trang 4`. **BÌA TỔNG không đánh số** — nó là bìa của cả gói thầu, không thuộc số trang của quyển này, nên bật/tắt `showCoverTong` không làm lệch số trang. Cả 3 trang đầu quyển lấy số qua `frontPageNum(p, which)`; đừng ghi cứng `startPage + 1` ở từng chỗ.
- **Date picker giới hạn `min=startDate`** để không tạo entry trước ngày bắt đầu cuốn (sẽ làm lệch số trang).
- **`_isNew` flag** trên entry: dùng nội bộ để biết entry vừa tạo lần đầu → trigger auto-fetch nhiệt độ nếu ngày là hôm nay. Phải `delete` trước khi `persist()` để không leak vào localStorage.
- **`items` global var** là tham chiếu tới `currentEntry.items`. `renderTable()` đọc từ đây. `syncItemsStructureToProject()` đẩy thay đổi name/unit/group/add/del sang `project.items` (template) nhưng KHÔNG đẩy qty (qty là số liệu hàng ngày).
- **Ngày mới kế thừa ngày LÀM VIỆC gần nhất.** `ensureEntry` gọi `prevWorkEntryOf(p, dateISO)` — duyệt ngược các ngày `< dateISO`, **bỏ qua mọi entry `restDay`**: sau đợt nghỉ lễ dài phải lấy số của ngày đi làm cuối cùng, không phải mớ rỗng của ngày nghỉ. Kế thừa: **khối lượng (cả 3 mẫu)** qua `inheritQty()` — khớp theo vị trí, lệch thì fallback dò theo tên, đọc/ghi qua `getQ`/`setQ` nên dùng chung cho mẫu 1 cột lẫn mẫu nhiều địa bàn — cùng `workers`, `workers_other`, `equipment`, `env`, `safe`. **Không** kế thừa: thời tiết/nhiệt độ (giữ mặc định, để auto-fetch API lo), `note_a`/`note_b`, `restDay`. Không tìm được ngày nguồn → về `p.items` + hằng số cứng như cũ.
- **Cuốn mới có thể kế thừa cuốn đã có.** `createProject(name, startDate, startPage, templateId, sourceId)` — khi có `sourceId` thì `templateId` **lấy theo cuốn nguồn** (tham số `templateId` bị bỏ qua), và chép sang: `items` (khối lượng lấy từ `lastWorkEntryOf(src)`, không phải `src.items`), `zones`, `book`, `rep_a/rep_b`, `hideZeroRows`. **`entries` luôn rỗng** — cuốn mới là quyển mới, bắt đầu lại từ `startPage` người dùng nhập, không nối tiếp số trang của cuốn nguồn. Ngày đầu của cuốn mới còn được seed `workers`/`workers_other`/`equipment`/`env`/`safe` từ ngày làm việc cuối cuốn nguồn (trong `submitNewBook`).
- **`+ Cuốn mới` dùng modal `#newBookModal`**, không còn chuỗi `prompt()`. Ngày bắt đầu là `<input type="date">` (lịch của trình duyệt) thay vì gõ tay `YYYY-MM-DD`. Ô "Khởi tạo từ" là một `<select>` 2 `optgroup`: *Tạo trắng từ mẫu* (`value="tpl:<id>"`) và *Kế thừa từ cuốn đã có* (`value="src:<projectId>"`); nhóm thứ hai tự ẩn khi chưa có cuốn nào. Giống `#bookModal`, mọi input trong đây **bị loại khỏi auto-save debounce** — chỉ ghi khi bấm "Tạo cuốn".
- **Bố cục 2 trạng thái, ngưỡng 1100px.** ≥ 1100px: `.toolbar` là **thanh dọc cố định bên TRÁI** rộng 300px, `body { padding-left: 300px }`, bên phải hoàn toàn là trang nhật ký. < 1100px: `.toolbar` thành **ngăn kéo** trượt từ trái (`transform: translateX(-100%)` → `.open`), cộng `.mobilebar` cố định trên cùng chứa nút menu + điều hướng ngày. **Ngưỡng là 1100px chứ không phải 820px** vì `.page` rộng cố định 210mm ≈ 794px; 794 + 300 + lề ⇒ hẹp hơn ~1100px là trang bị cuộn ngang.
- **`.toolbar` khi xếp dọc BẮT BUỘC `flex-wrap: nowrap`.** Base `.toolbar` có `flex-wrap: wrap`; đổi sang `flex-direction: column` trên một phần tử bị chặn chiều cao (`position: fixed` + `bottom: 0`) thì các nút **wrap sang cột thứ hai và tràn ra ngoài màn hình**. Để `overflow-y: auto` lo việc cuộn.
- **Quy tắc cho nút giãn hết bề ngang phải viết `.toolbar button:not(.tb-close)`** — `.toolbar button` (0,2,0) đè `.tb-close` (0,1,0), không loại trừ thì nút đóng ngăn kéo bị kéo rộng bằng cả ngăn kéo.
- **Hai ô chọn ngày** (`#datePicker` trong thanh công cụ, `#datePickerTop` trên `.mobilebar`) cùng mang class **`.js-datepicker`**; `refreshDatePicker()` duyệt `querySelectorAll('.js-datepicker')` để đồng bộ cả `value` lẫn `min`. Thêm ô ngày mới thì chỉ cần gắn class này và thêm id vào filter auto-save.
- **Auto-save debounce 800ms** trên `input` event của document, có filter để bỏ qua `#projectSelect`, `#templateSelect`, `#datePicker`, `#importFile`, `#forecastDays` và **mọi thứ trong `#bookModal`** (đều có handler riêng).
- **Ẩn hạng mục khối lượng 0** (`p.hideZeroRows`) chỉ tác động lúc **xuất file** — `visibleItems()` lọc trong `workRowsHTML()`, màn hình vẫn hiện đủ dòng để nhập. Ngày nghỉ thì **không lọc** (bảng cố tình trống nhưng phải đủ tên hạng mục). STT in ra được đánh lại liên tục 1..N.
- **Ngày nghỉ: mọi ô khối lượng in dấu `-`, KHÔNG để trống và cũng không in số `0`.** `fmtQty(tpl, v, true)` trả thẳng `'-'`, **áp cho cả 3 mẫu** kể cả mẫu không bật `zeroAsDash` — trang ngày nghỉ nhìn y hệt trang ngày thường, chỉ khác ở chỗ không có khối lượng.
- **Ngày nghỉ lấy ngày LÀM VIỆC gần nhất làm chuẩn để lọc dòng.** Khi bật `hideZeroRows`, ngày nghỉ in ra 0 hết nên tự lọc theo số của chính nó là mất sạch dòng. `zeroRowRefEntry(p, e)` dò `prevWorkEntryOf` trước, không có thì nhìn TỚI ngày làm việc gần nhất phía sau, vẫn không có thì giữ đủ dòng. Nhờ vậy trang ngày nghỉ có **đúng số hạng mục và đúng số trang** như trang ngày thường. Khớp hạng mục theo vị trí, lệch thì dò theo tên — cùng cách với `inheritQty`.
- **Ngày nghỉ khi xuất file vẫn bỏ trống mục 2** (2.1 nhân lực + 2.2 thiết bị) trong `entryBlocks`. Giữ **nguyên số dòng**, chỉ bỏ phần giá trị — trang A4 đang khít, thêm/bớt dòng là vỡ điểm ngắt trang. Màn hình nhập vẫn hiện đủ để sửa.
- **Mục 4 và 5 in đủ 3 lựa chọn** Tốt / Bình thường / Kém, ô vuông vẽ bằng `border` + `transform` (`.opts .box`) chứ không dùng ký tự ☑ — tránh phụ thuộc font khi html2canvas rasterize.
- **Xóa một ngày = xóa 1–3 trang.** `deleteEntry(dateISO)` (bỏ trống = ngày đang mở) chỉ `delete p.entries[d]` — **không đánh lại số trang**, vì `computePagenum`/`bookPageTotal` tính từ danh sách entries nên các ngày sau tự dồn lên và dòng "Sổ này gồm … trang" theo luôn. Ba cái bẫy:
  - Sau khi xóa **phải nhảy sang một ngày ĐÃ CÓ**. `changeDate` gọi `ensureEntry`, quay lại chính ngày vừa xóa là dựng entry mới ngay. Thứ tự chọn: ngày trước gần nhất → ngày sau gần nhất → chính nó (chỉ khi xóa ngày duy nhất, lúc đó dựng lại trang trắng **là** ý muốn).
  - **Đừng đặt `appState.currentDate` trước khi gọi `changeDate`.** Khi xóa ngày đang mở, để nó vẫn trỏ tới ngày đã xóa thì `collectForm()` bên trong `changeDate` tự no-op (`getEntry()` trả `null`) — nếu trỏ sớm sang ngày đích thì form của ngày vừa xóa **ghi đè** ngày đích.
  - Xóa một ngày **khác** ngày đang mở thì `collectForm()` trước (giữ chữ đang gõ), rồi chỉ `renderForm()` tại chỗ — không chuyển ngày.
- **`p.startDate` không đổi khi xóa.** Xóa mất ngày đầu thì `min` của date picker vẫn là `startDate` cũ, người dùng tạo lại được. Sửa `startDate` theo sẽ làm lệch `computePagenum` của mọi ngày còn lại.
- **Chuyển cuốn/ngày** luôn `clearTimeout(window._sv)` rồi `collectForm()` trước khi switch — không thì debounce sẽ ghi đè entry mới bằng form cũ.

## Kết thúc cuốn

`endProject()` flow:
1. Confirm × 2
2. `collectForm()` + `persist()` để save form hiện tại
3. `exportBookAsWord(p)` — sync, blob `application/msword` + UTF-8 BOM + namespace MS Office, đuôi `.doc`
4. `await exportBookAsPDF(p)` — render mỗi entry vào container ẩn `position:absolute; left:-99999px`, dùng html2pdf với `pagebreak: { mode: ['css','legacy'] }` và CSS `.page { page-break-after: always }`

Cả 2 đường xuất đều bắt đầu bằng `buildBookPagesHTML(p)` (rỗng với mẫu không có bìa) rồi mới đến các entry. Thứ tự trang: BÌA TỔNG *(không số)* → bìa quyển *(Trang 1)* → Tr1 *(Trang 2)* → Tr2 *(Trang 3)* → từng ngày. Sửa layout trang ngày thì sửa `workTheadHTML()` / `workRowsHTML()` / `buildEntryHTML()` — dùng chung cho cả Word lẫn PDF.

Dòng `Công trình: …` **chỉ có trên màn hình**, không đưa vào `buildEntryHTML`.

## Cỡ chữ khi xuất

`exportCss(p)` dùng **đúng số pt ghi trong ô Excel** cho các trang đầu quyển (bìa 28/25/18/13pt · Tr1 16/14/13pt · Tr2 15/12pt) — **đừng đổi mấy số này**. Riêng **trang ngày**: tiêu đề 16pt · thân **12pt** · khối chữ ký **13pt đậm** · bảng khối lượng theo `tableFontPt`. Thân trang ngày nằm ở `body` + `table th, table td`; mọi bảng của bìa/Tr1/Tr2 đều tự khai `font-size` (hoặc `inherit`) nên **không** đổi theo. Nội dung có thể cao hơn 1 khổ A4 — bước tự thu nhỏ trong `renderPagesToPDF` sẽ co đều cả trang, nhờ vậy **tỉ lệ** giữa tiêu đề / tiêu mục / bảng vẫn giống quyển mẫu.

Đừng đổi các số pt này để "cho vừa trang" — cứ để bước thu nhỏ lo.

### Nét kẻ bản xuất — 0,75pt là sàn, đừng phí công hạ số pt

`EXPORT_CSS` ghi `0,4pt` (bảng khối lượng) và `0,5pt` (các bảng khác) theo `hair`/`thin` của Excel, **nhưng in ra cả hai đều là 0,75pt** — hai con số đó chưa bao giờ khác nhau. Lý do:

**Chrome ép mọi thuộc tính `border` khác 0 lên tối thiểu 1px.** Đã đo: từ `1pt` xuống `0.05pt` đều cho `computed 1px`, cùng 2 device px ở `PDF_SCALE = 2`. Vì 1 CSS px ↔ 210mm/794px nên border luôn in ra **0,75pt**, bất kể ghi bao nhiêu pt.

**Đã thử vẽ bằng `background` gradient để xuống 0,375pt — html2canvas không render được:**

| Cách | Kết quả qua html2canvas |
|---|---|
| `background-size: … 0.5px` | **ném lỗi** `createPattern … canvas element with a width or height of 0` → hỏng hẳn nút xuất PDF |
| `background-size: 1px` + color-stop 50% | không lỗi nhưng **mất sạch nét trong bảng**, chỉ còn viền ngoài |
| `background-size: 2px` + color-stop 25% | như trên |
| `border` | cách duy nhất cho lưới đầy đủ |

Trình duyệt vẽ được nét 0,5px, **html2canvas thì không** — nên mọi kiểm chứng về nét kẻ **bắt buộc phải chạy qua html2canvas** (`html2pdf().from(el).toContainer().toCanvas()`), không được dùng `page.screenshot()` của puppeteer: nó rasterize bằng engine thật nên cho kết quả đẹp mà bản PDF thật lại vỡ.

**Muốn mảnh hơn 0,75pt thật sự** thì phải dựng trang ở bội số CSS px rồi thu nhỏ lúc xuất — tức nhân đôi `.page { width }` và **mọi** giá trị `pt` trong `EXPORT_CSS`, rồi để `renderPagesToPDF` co lại. Khi đó 1 CSS px chỉ còn 0,375pt. Đây là việc lớn, không phải chỉnh vài con số.

CSS màn hình giữ nguyên, không đụng tới. Nếu cần chữ to hơn thì giảm số hạng mục mỗi trang (`splitAfter`) chứ không tăng pt.

### Giới hạn vật lý đã đo

38 hạng mục × 6 cột **không thể vừa 2 trang A4 ở cỡ ≥ 11pt**. Chiều cao nội dung 1 ngày ở cỡ 12pt là 329mm (trang 1) + 336mm (trang 2); Excel gốc nhét vừa nhờ lề 7mm/0mm (cao 290mm, rộng 189mm) và vẫn phải in ở 88% ⇒ chỉ đạt 10,6pt. Với lề của app (cao 267mm, rộng 175mm) thì trần cho 2 trang là ~9,4pt. Vì vậy mặc định 11pt đi kèm **3 trang/ngày** (`splitAfter: [20, 30]`).

## Định dạng trang (`p.pageSetup`) & cửa sổ xem trước

`PAGE_SETUP_DEFAULT` = `{ mt:15, mr:15, mb:15, ml:20, fontScale:100, tableFontPt:11, borderPt:0.4, splitAfter:null }` — lề mm (trên/phải/dưới/trái), % phóng cỡ chữ, cỡ chữ bảng khối lượng, nét kẻ, chỗ ngắt trang. Back-fill trong `ensureProjectMeta`.

- **Khối chữ ký cuối trang ngày** dùng `.daysign-role` / `.daysign-name` (13pt in đậm, vẫn đi qua `f()` nên `fontScale` phóng được). **Không** đặt tên `.sign-role` / `.sign-name` — hai lớp đó trang bìa đang dùng, đè vào là hỏng cỡ chữ bìa.
- **`EXPORT_CSS` giờ là hàm `exportCss(p)`** nội suy từ `pageSetup`. Trong đó `f(n)` nhân mọi cỡ chữ với `fontScale`; giá trị `< 3pt` (độ dày nét kẻ) **không** nhân — đó là lý do có ngưỡng 3 trong regex sinh CSS.
- **`mountExportPages(host, html, p)`** dựng wrapper + chạy bước tự thu nhỏ. **Cửa sổ xem trước và bản xuất gọi chung hàm này** — đó là cái bảo đảm "xem trước = file tải về". Đừng nhân bản logic này ra chỗ khác.
- **Vòng lặp tự thu nhỏ phải đo bằng `pg.offsetHeight`, KHÔNG dùng `getBoundingClientRect()`**: rect bị nhân theo `transform` của phần tử cha, mà khung xem trước lại `scale()` để thu cả trang cho vừa màn hình ⇒ đo bằng rect thì xem trước tính sai tỉ lệ thu.
- `buildPagesHTML(p, scope)` với `scope` = `'day'` | `'book'` dùng chung cho xem trước, xuất PDF và xuất Word.
- Modal `#previewModal`: tự ghi `p.pageSetup` + `persist()` mỗi lần đổi (debounce 250ms), **không** đi qua auto-save debounce của form (đã loại trong handler `input` cùng `#bookModal`, `#newBookModal`).
- jsdom **không đo được** bước thu nhỏ (`offsetHeight` luôn 0 vì không có layout engine). Muốn kiểm `splitAfter` có vừa trang không thì phải mở xem trước trong trình duyệt thật — dòng trạng thái báo `⚠️ trang N thu còn X%`.

## Xuất PDF & tên file

- `renderPagesToPDF(pagesHTML, filename)` là chỗ duy nhất gọi html2pdf/jsPDF. 3 nút dùng nó: `exportDayAsPDF()`, `exportBookPDFOnly()`, `exportBookAsPDF()` (trong `endProject`).

### 3 cái bẫy của html2pdf đã trả giá — đừng lặp lại

1. **Phần tử truyền vào `.from()` không được `position:absolute`.** `toContainer()` clone nó vào một container `height:auto`; clone absolute ⇒ container cao 0 ⇒ **PDF ra 1 trang trắng**. Khung ẩn ngoài màn hình phải là phần tử *cha*, từng trang nằm trong luồng bình thường.
2. **Không render nhiều trang trong 1 lần.** Canvas cao quá ~65535px là trình duyệt bỏ cuộc ⇒ cũng trắng. Render **từng `.page`** rồi ghép bằng `worker.get('pdf').then(pdf => pdf.addPage()).from(next).toContainer().toCanvas().toPdf()`. Kèm theo: `<style>` chứa `EXPORT_CSS` phải nằm **bên trong** mỗi wrapper vì html2pdf chỉ clone đúng phần tử được truyền vào.
3. **Không đặt `html2canvas.windowWidth`.** html2canvas lấy vùng cắt `x` từ bounds của phần tử **gốc** nhưng dựng iframe clone theo `windowWidth`; ép giá trị khác bề rộng cửa sổ thật làm 2 hệ tọa độ lệch nhau ⇒ ảnh **mất phần bên trái** (cửa sổ 1920px lệch ~563px).

Vì bỏ `windowWidth`, `EXPORT_CSS` phải tự ghi rõ `width`/`padding`/`font-size` cho `.page`, `.title`, `table th/td` — nếu không, cửa sổ hẹp hơn 820px sẽ để style mobile lọt vào bản PDF.

### Ép mỗi `.page` vừa trọn 1 khổ A4

`toPdf` cắt canvas theo chiều cao trang: `.page` cao hơn 297mm sẽ bị **cắt ngang giữa một dòng bảng** và mất lề dưới. Nên `renderPagesToPDF` làm 2 việc:

- wrapper cố định `210mm × PAGE_H_PX; overflow:hidden` ⇒ html2pdf không bao giờ cắt được đôi.

  **`PAGE_H_PX` không phải 297mm.** html2canvas dựng `canvas.h = floor(ceil(bounds.h) × scale)`, còn `toPdf` cắt mỗi `o = floor(canvas.w × 297/210)` px. Với 297mm: `ceil(1122.52) = 1123` → `canvas.h = 2246 > o = 2245` → **dư 1 pixel ⇒ đẻ ra một trang trắng sau mỗi trang thật**. Vì vậy phải tính ngược:
  ```js
  const CANVAS_W  = Math.floor(Math.ceil(210 * PX_PER_MM) * PDF_SCALE);
  const PAGE_H_PX = Math.floor(Math.floor(CANVAS_W * 297 / 210) / PDF_SCALE) - 0.5;  // 1121.5px ≈ 296.73mm
  ```
  Đổi `PDF_SCALE` thì `PAGE_H_PX` tự tính lại (đã thử scale 1 / 1.5 / 2 / 3 / 4 đều ra đúng 1 trang). Cái giá là ảnh hụt đáy 0.25mm ⇒ lề dưới thực tế 20.25mm.
- vòng lặp đo `getBoundingClientRect().height`, nếu quá 297mm thì nới `width`/`min-height`/`padding` lên `1/k` rồi `transform: scale(k)` — chữ nhỏ đi đều, **lề vẫn đúng**. Hội tụ sau 1 vòng, có `console.info` báo phần trăm đã thu.

Muốn khỏi phải thu nhỏ thì giảm `splitAfter` hoặc bóp thêm `.page.compact` trong `EXPORT_CSS` (class `compact` chỉ gắn cho mẫu có `splitAfter`).
- Tên file: `bookFileBase(p, dateISO)` → `NKTC - <địa bàn> - T<MM>-<YYYY>`. Địa bàn = `zonesOf(p).join(', ')`, mẫu không có zones thì lấy `p.name`. Dùng cho cả `.pdf`, `.doc` và `.json`.
5. Nếu xuất file lỗi, hỏi user có vẫn muốn xóa cuốn không
6. Xóa project, switch sang cuốn còn lại (hoặc tạo "Công trình 1" nếu hết)

## Khi sửa code

- **Đừng tách file.** Single-file đơn giản hơn để mobile/offline dùng. Nếu cần thêm util lớn, cân nhắc inline trước.
- **Đừng thêm framework.** Vanilla JS đủ dùng. Đừng React/Vue/build step.
- **Không dùng `window.print()`** — PDF dựng bằng jsPDF (qua html2pdf) trong `renderPagesToPDF()`. Mọi thay đổi layout phải test bằng nút `📄 Xuất PDF ngày này`.
- **Lề mặc định: trên/phải/dưới 1,5cm — trái 2cm** (trái rộng hơn để chừa gáy đóng sổ), khai trong `PAGE_SETUP_DEFAULT` và lặp lại ở CSS màn hình + `@media print`. jsPDF dùng `margin: 0` — lề nằm trong `padding` của `.page`. Riêng bản Word thì lề do `@page WordSection1` lo, nên `buildWordHTML` phải override `.page { padding: 0 }` để không cộng dồn.
- **Media query mobile phải viết `@media screen and (max-width: 820px)`** — thiếu chữ `screen` thì style mobile đè lên bản in (A4 dọc chỉ ~794px CSS).
- **Đừng viết thẻ đóng HTML nguyên văn trong chuỗi JS** (`buildWordHTML`) — dùng `<\/body>`. Live Server chèn script auto-reload vào thẻ đóng body đầu tiên nó thấy, nếu thẻ đó nằm trong `<script>` thì cả app vỡ.
- **Vietnamese diacritics** ở mọi nơi (filename sanitize, escape, search). Đừng strip.
- **Geolocation/CDN** chỉ work qua HTTPS hoặc localhost — nếu test bằng `file://`, các tính năng đó sẽ fail. Đó là expected, không phải bug.

## Modal dự báo thời tiết

`#forecastModal` là overlay fixed full-viewport, ẩn mặc định (`display: none`), bật bằng class `.open`. Nút <span>🔮 Dự báo thời tiết</span> mở qua `openForecast()`. Đóng bằng nút ×, click overlay, hoặc phím <kbd>Esc</kbd>.

- Số ngày: `<input type="number" id="forecastDays">` (1–16, default 7). Enter trên ô này = trigger `loadForecast()`.
- Mỗi dòng dự báo có nút **"Dùng cho ngày này"** gọi `applyForecastToEntry(dateISO, tmin, tmax, code)` — `collectForm()` ngày hiện tại, switch sang ngày được chọn (tạo entry nếu chưa có), ghi nhiệt độ & mô tả thời tiết vào cả Sáng + Chiều, đóng modal.
- `#forecastDays` cũng phải nằm trong allow-list bỏ qua của debounced auto-save (cùng `projectSelect`, `datePicker`, `importFile`).

## Test thủ công khi đổi code

**Không hồi quy mẫu cũ (dữ liệu người dùng nằm trong localStorage):**
- [ ] Mở app với localStorage sẵn có → cuốn cũ vẫn 4 cột, số liệu nguyên vẹn, `🧩 Mẫu` hiện "Mẫu cũ"
- [ ] Kết thúc cuốn mẫu cũ → `.doc`/`.pdf` không có trang bìa, số không bị đổi thành `-`

**Mẫu Q8:**
- [ ] `+ Cuốn mới` → chọn mẫu 2 → 38 hạng mục, 2 nhóm, header 2 tầng, 6 cột số đúng tên 3 phường
- [ ] Sửa hạng mục → đổi tên phường trên header → áp dụng mọi ngày
- [ ] `+ Thêm địa bàn` → cột mới ở CẢ 2 nhóm, =0; số liệu 3 cột cũ ở mọi ngày giữ nguyên
- [ ] Xóa địa bàn giữa (chỉ số 1) → số liệu cột 0 và 2 không bị dồn sai chỗ
- [ ] Còn 1 địa bàn → chặn xóa; quá `MAX_ZONES` → chặn thêm; mẫu cũ → báo không tách địa bàn
- [ ] Tick "Ẩn hạng mục khối lượng = 0" → màn hình vẫn đủ 40 dòng, PDF chỉ còn hạng mục có số và ngày rút còn 1 trang; số trang + "Sổ này gồm" tự tính lại
- [ ] Mục 4, 5 trong PDF in đủ Tốt / Bình thường / Kém, đúng 1 ô được tick
- [ ] Tick "Ngày nghỉ" → ô số bị khóa; xuất PDF thấy bảng trống nhưng còn đủ tên hạng mục, mục 2.1/2.2 cũng trống, ngày vẫn **đúng 2 trang**
- [ ] `📕 Thông tin quyển` → sửa bìa, thêm/xóa văn bản + cán bộ → Lưu → reload còn nguyên
- [ ] Tr2 có khối ký cuối trang: nơi ký + ngày (nghiêng) → `ĐẠI DIỆN BÊN B` + đơn vị → chừa chỗ ký → họ tên
- [ ] Bỏ trống `Người ký trang 2` → lấy đại diện bên B ở bìa quyển; nhập tay → hiện đúng tên đã nhập
- [ ] Có `Đại diện liên danh` → cả Tr1 lẫn Tr2 ký tên công ty đó; bỏ trống → ký tên Bên B, tách mỗi công ty một dòng
- [ ] `Bên B` = `Liên danh A - B` (dữ liệu cũ, một dòng) → bìa tổng + bìa quyển in 2 dòng, dòng 2 có tiền tố `-`
- [ ] Gõ Enter trong ô `Bên B` → in đúng chỗ đã gõ; lưu + reload còn nguyên xuống dòng
- [ ] `Bên B` KHÔNG mở đầu bằng "Liên danh" nhưng có dấu gạch → **không** bị cắt; dòng `Gói thầu`/`Địa điểm` cũng không đổi
- [ ] `📄 Xuất PDF ngày này` → mở PDF: **đúng 2 trang**, trang 1 hạng mục 1–23, trang 2 lặp header + 24–38 + mục 4–7 + chữ ký nằm ngang
- [ ] Lề PDF đo được trên/phải/dưới 1,5cm — trái 2cm, không còn dòng "Công trình:"
- [ ] Tên file dạng `NKTC - Phường … - T07-2026.pdf`
- [ ] Kết thúc → PDF theo thứ tự BÌA TỔNG → bìa quyển → Tr1 → Tr2 → từng ngày, đối chiếu file `.xlsx`
- [ ] Bìa quyển in `Trang 1`, Tr1 `Trang 2`, Tr2 `Trang 3`, ngày đầu `trang 4`; BÌA TỔNG không có số
- [ ] Tắt BÌA TỔNG → số trang các trang còn lại **không đổi**
- [ ] Đổi `📄 Trang bắt đầu` = 25 → bìa quyển `Trang 25`, dòng "Sổ này gồm … từ 25 đến …" khớp
- [ ] Đổi mẫu cuốn cũ → Q8, chọn "Nạp lại hạng mục" và chọn "Không" — cả 2 nhánh không lỗi JS

**Kế thừa ngày mới:**
- [ ] Mẫu 2: nhập khối lượng + `Công nhân`/`Thiết bị`/`Môi trường` → bấm `>` → ngày mới hiện y hệt; thời tiết + ghi chú về mặc định, `Ngày nghỉ` bỏ tick
- [ ] Mẫu 1 cũng kế thừa khối lượng (trước đây về 0) — ngày đầu cuốn vẫn lấy số mặc định của `DEFAULT_ITEMS` (1/2/133…), không phải 0
- [ ] Nghỉ lễ dài: ngày 01 làm việc → 02, 03, 04 tick `Ngày nghỉ` và xóa `Công nhân` về 0 → tạo ngày 05 → kế thừa từ **ngày 01**
- [ ] Cuốn chỉ toàn ngày nghỉ → tạo ngày mới về mặc định `p.items` + `Công nhân = 07`, không lỗi JS
- [ ] Chèn ngày giữa: đã có 01 và 05, tạo 03 → kế thừa từ **01**
- [ ] Sửa số ngày trước → ngày sau đã tạo giữ nguyên số của nó (không rò ngược)
- [ ] Ngày 02 đổi tên hạng mục + `+ Thêm địa bàn` → ngày 03: tên mới khớp vị trí, cột địa bàn mới = 0, cột cũ giữ số

**Ngắt trang ở dòng bất kỳ:**
- [ ] Mở xem trước → rê chuột lên dòng bất kỳ thấy sáng lên; bấm → tách trang ngay tại đó, dòng đó viền đỏ
- [ ] Bấm được cả mục 1/2.1/2.2/3/4/5/6/7 lẫn từng dòng bảng khối lượng; bấm vào bảng chữ ký thì **không** có gì xảy ra
- [ ] Bấm lại đúng dòng đó → bỏ ngắt, trang gộp lại
- [ ] `Bỏ hết` → cả ngày 1 trang, ô hiện `—`; **không** rơi về `[20, 30]` của mẫu
- [ ] `↺ Mặc định` → ô trống, trở lại 3 trang theo mẫu
- [ ] Gõ tay `20, s4, linhtinh` → nhận `[20, "s4"]`, bỏ chữ rác
- [ ] Trang nào có dòng khối lượng đều lặp lại tiêu đề bảng; trang cuối luôn có mục 4–7 + chữ ký
- [ ] Số trang in ra vẫn liên tục, "Sổ này gồm … trang" khớp `Tổng M trang`
- [ ] Reload → chỗ ngắt còn nguyên; cuốn cũ có `splitAfter: [20,30]` mở lên vẫn đúng 3 trang

**Ngày nghỉ:**
- [ ] Bật `Ẩn hạng mục khối lượng = 0`, ngày thường còn N hạng mục → ngày nghỉ cũng **đúng N hạng mục, đúng số trang**, mọi ô khối lượng in `-` (cả mẫu 1)
- [ ] Nghỉ 2–3 ngày liên tiếp → mọi ngày nghỉ đều lấy chuẩn từ ngày làm việc cuối cùng
- [ ] Cuốn **mở đầu** bằng ngày nghỉ → lấy chuẩn từ ngày làm việc đầu tiên phía sau
- [ ] Cuốn toàn ngày nghỉ → giữ đủ 38 dòng, không lỗi JS
- [ ] Mục 2.1 / 2.2 của ngày nghỉ vẫn để trống (chỉ bảng khối lượng mới in 0)

**Xóa trang (ngày):**
- [ ] `🗑️ Xóa trang này` → confirm ghi đúng ngày + khoảng trang (`trang 10–12`) + số ngày sẽ dồn lên
- [ ] Bấm Hủy → không mất gì
- [ ] Xóa ngày giữa → nhảy về ngày trước gần nhất, ngày sau dồn số trang, ngày trước giữ nguyên
- [ ] Xóa ngày đầu → nhảy TỚI ngày sau, ngày đó nhận đúng `startPage`
- [ ] Xóa ngày duy nhất → dựng lại trang trắng cùng ngày (`Công nhân = 07`, ghi chú rỗng), không lỗi JS
- [ ] Đang gõ dở ô ghi chú rồi xóa **ngày khác** (qua `📚 Danh sách ngày` → `x<STT>`) → chữ đang gõ **không mất**, không bị chuyển ngày
- [ ] `📚 Danh sách ngày` nhập rác (`xyz`, `x99`) → không xóa gì
- [ ] Sau khi xóa: reload trang → đúng như trước reload; xem trước cả cuốn → số trang liên tục, "Sổ này gồm … trang" khớp

**Kế thừa cuốn mới:**
- [ ] `+ Cuốn mới` mở modal, ô ngày bấm ra lịch (không phải gõ tay), mặc định chọn cuốn đang mở
- [ ] Cuốn A đã tùy chỉnh (đổi tên hạng mục, thêm địa bàn, sửa bìa, đổi chữ ký, tick ẩn dòng 0) → tạo B kế thừa A → B có đủ tất cả
- [ ] B chỉ có **1 ngày**, `pagenum` bắt đầu lại theo `startPage` đã nhập — không nối tiếp số trang của A
- [ ] Ngày cuối của A là ngày nghỉ → B vẫn lấy số của ngày làm việc trước đó
- [ ] Sửa hạng mục/khối lượng/bìa trong B → cuốn A không đổi (deep copy)
- [ ] Chọn "Tạo trắng từ mẫu" → về đúng mặc định template, `Công nhân = 07`
- [ ] Chưa có cuốn nào → select chỉ còn nhóm "Tạo trắng từ mẫu"
- [ ] Để trống ngày / số trang = 0 → alert, modal vẫn mở, không tạo cuốn rác; bấm Hủy / Esc → thoát sạch
- [ ] Modal hiển thị đúng trên mobile 390px, chữ ≥ 16px, không scroll ngang

**Xuất file (chạy sau MỌI thay đổi EXPORT_CSS):**
- [ ] Bấm `📄 Xuất PDF ngày này` với **cả 3 mẫu** → không có alert "Không tạo được PDF"
- [ ] Bấm `📕 Xuất PDF cả cuốn` → chạy trót lọt (đường này còn dựng bìa + Tr1 + Tr2)
- [ ] Mở PDF: lưới bảng **đầy đủ**, không mất nét trong, còn viền ngoài phải/dưới
- [ ] Mẫu 2/3 vẫn đúng 2 trang, mẫu 1 vẫn 1 trang

> Kiểm bằng `page.screenshot()` của puppeteer là **chưa đủ** — nó dùng engine thật nên vẫn đẹp trong khi html2canvas đã hỏng. Phải gọi thẳng `exportDayAsPDF()` / `exportBookPDFOnly()`.

**Phiên bản & cập nhật:**
- [ ] Dòng "Phiên bản …" hiện dưới tiêu đề thanh công cụ, khớp `APP_VERSION`
- [ ] `APP_VERSION` (index.html) và `VERSION` (sw.js) khớp nhau
- [ ] Deploy bản mới (đổi `VERSION`) → mở lại tab cũ → thanh "Đã có phiên bản mới" tự hiện
- [ ] Bấm "Để sau" → thanh ẩn; bấm "Tải lại ngay" → không mất chữ đang gõ dở
- [ ] Ctrl+P → cả dòng phiên bản lẫn thanh báo đều không lọt vào bản in
- [ ] Mobile 390px: thanh báo trải hết bề ngang, chữ không bị bóp thành cột hẹp

**Bố cục thanh công cụ:**
- [ ] 1440 / 1280 / 1100px → thanh dọc bên trái đúng 300px, **không nút nào tràn sang cột thứ hai**, trang nhật ký không bị đè, không cuộn ngang
- [ ] 1099 / 1024 / 820 / 390px → thanh dọc ẩn hẳn, `.mobilebar` hiện, không cuộn ngang
- [ ] Nút menu mở ngăn kéo; bấm nền mờ (dải bên phải) / nút đóng / `Esc` đều đóng
- [ ] Bấm một nút trong ngăn kéo → thực thi **và** đóng; bấm `select` thì **không** đóng
- [ ] Đổi ngày ở `.mobilebar` → `#datePicker` trong ngăn kéo cùng giá trị; cả hai có `min = startDate`
- [ ] Mở ngăn kéo ở 800px rồi kéo rộng ra 1400px → không còn nền mờ kẹt lại
- [ ] Nút menu và nút đóng đều ≥ 44×44px; nút đóng **không** bị kéo giãn hết bề ngang
- [ ] Xem trước + xuất PDF ở **cả hai** breakpoint → đúng số trang, lề đúng, không mất phần bên trái
- [ ] Ctrl+P → `.toolbar`, `.mobilebar`, nền mờ đều ẩn; `body` không còn padding

**Chung:**
- [ ] Tạo cuốn mới với ngày bắt đầu khác hôm nay → ngày đầu = trang `startPage`
- [ ] Chuyển ngày bằng date picker, prev/next → pagenum tăng đúng
- [ ] Sửa hạng mục, đổi tên item → ngày khác đã có không bị ảnh hưởng (item đã copy)
- [ ] Sửa qty ngày này → ngày khác giữ nguyên qty cũ của ngày đó
- [ ] Bấm Kết thúc → tải về `.doc` và `.pdf` rồi cuốn biến mất
- [ ] Mở file `.doc` trong Word/LibreOffice → định dạng bảng còn nguyên
- [ ] Mở PDF → mỗi ngày 1 trang A4
- [ ] In (Ctrl+P) → toolbar ẩn, form khớp A4
- [ ] Bấm "🔮 Dự báo thời tiết" → modal mở, gõ số ngày → bảng dự báo hiện ra
- [ ] Bấm "Dùng cho ngày này" trên 1 dòng dự báo → chuyển sang ngày đó, nhiệt độ + thời tiết được áp dụng
