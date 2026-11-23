# Hệ giao diện cho người đi: thon, gọn

Ngày 2026-11-23. Áp dụng cho các màn hình của người đi: **Trợ lý AI** (`/assistant`), **Chuyến đi của tôi** (`/trips`, `/trips/[id]`) và **trang chia sẻ** cho bạn đồng hành. Không áp cho khu quản trị; quy ước của quản trị vẫn theo [DESIGN.md](../../DESIGN.md).

- **Nguồn:** buổi rà soát giao diện ngày 2026-11-23, ghi trong [assistant-trips-redesign-ideas.md](assistant-trips-redesign-ideas.md). Hướng thiết kế lấy từ skill design-taste-frontend, nhánh app screen, kiểu `editorial-greeting` (seed 1974018435), giữ bảng màu và font của thương hiệu.
- **Spec thực hiện:** [TRAVELER-UI-SLIM-REDESIGN](../stories/TRAVELER-UI-SLIM-REDESIGN.md).
- **Thứ tự ưu tiên:** khi tài liệu này và các mục cũ trong `DESIGN.md` khác nhau ở ba màn hình trên, tài liệu này thắng.

## 1. Nguyên tắc

1. **Mỗi màn hình trả lời một câu hỏi.** Thứ trả lời câu hỏi đó phải to nhất và được đọc trước. Với cả trợ lý (khi đã có lịch) và chi tiết chuyến đi, đó là **lịch trình theo ngày cùng bản đồ**.
2. **Một nút chính trên mỗi màn hình.** Các hành động khác là nút phụ, nút chữ hoặc nằm trong menu "⋯".
3. **Màu đặt lên dữ liệu, không đặt lên khung.** Xanh thương hiệu chỉ dùng cho nút chính, link và mục đang chọn. Màu của từng ngày dùng để nhận diện ngày. Phần còn lại là mực và các bậc nền.
4. **Phẳng.** Tách lớp bằng một bậc màu nền, không dùng bóng hay viền. Bóng chỉ dành cho thứ thật sự nổi lên.
5. **Chữ nhẹ.** Độ nhấn đến từ cỡ chữ và vị trí, không đến từ việc in đậm mọi thứ.
6. **Tiêu đề viết từ dữ liệu.** Ví dụ "Đà Nẵng → Hà Giang, 13–16/12", không dùng "Chuyến đi 4 ngày" hay "Bạn muốn khám phá điều gì?".

## 2. Token

Token đặt trong `packages/ui/src/styles/globals.css` với tiền tố `--tv-` (traveler). Mọi CSS của ba màn hình chỉ được đọc token, không viết cứng màu, cỡ hay bóng.

### 2.1 Màu

| Token | Sáng | Tối | Dùng cho |
| --- | --- | --- | --- |
| `--tv-ink` | `#17231d` | `#e6ece8` | Chữ chính, icon chính |
| `--tv-ink-2` | `#5b6a62` | `#a3b0a9` | Chữ phụ, nhãn |
| `--tv-ink-3` | `#8a968f` | `#77847d` | Gợi ý, số đếm phụ ("· 4"), placeholder |
| `--tv-ground` | `#f6f8f6` | `#111613` | Nền trang |
| `--tv-surface` | `#ffffff` | `#18201b` | Thẻ, panel, sheet |
| `--tv-sunken` | `#eef2ef` | `#202a24` | Vùng gợi ý, thanh tab, nền chip |
| `--tv-line` | `#e1e7e3` | `#2c3731` | Viền ô nhập, nút phụ, đường kẻ dưới thanh tab |
| `--tv-accent` | `#2f6b53` | `#6fb894` | Nút chính, link, mục đang chọn |
| `--tv-accent-hover` | `#275a46` | `#85c7a5` | Rê chuột trên nút chính |
| `--tv-on-accent` | `#ffffff` | `#0d1a13` | Chữ trên nút chính |
| `--tv-accent-tint` | `#e8f1ec` | `#1d2e25` | Nền khi rê chuột, nền mục đang chọn |
| `--tv-warn-ink` / `--tv-warn-bg` | `#9a5b0b` / `#fdf3e3` | `#f0b863` / `#33270f` | Vượt ngân sách, cảnh báo thời tiết |
| `--tv-danger` | `#b42318` | `#f2867c` | Chỉ cho lỗi thật và hành động xoá |
| `--tv-focus` | `#2f6b53` | `#6fb894` | Viền focus: vòng 2px, cách 2px |

**Màu của từng ngày** (`--tv-day-1` đến `--tv-day-7`) lấy đúng các màu bản đồ đang dùng cho Ngày 1, 2, 3…, kiểm đủ tương phản trên `--tv-surface`. Màu ngày chỉ xuất hiện ở bốn chỗ: chấm trên tab ngày, gạch chân tab đang chọn, đoạn trục thời gian của ngày đó, đường trên bản đồ. Không dùng cho nút, chữ thân trang hay trạng thái.

Ngân sách màu: phần có màu xanh thương hiệu (không tính bản đồ và ảnh) dưới 3% diện tích màn hình.

**Thay cho màu cũ:**
- mực navy `#142238` → `--tv-ink`;
- `#35765c` → `--tv-accent`;
- nút gần đen `#143e2d` → bỏ;
- bóng xanh `rgba(53,118,92,.22)` → bỏ.

### 2.2 Chữ

| Token | Giá trị |
| --- | --- |
| `--tv-font-ui` | Be Vietnam Pro (biến `next/font` đã có) |
| `--tv-font-title` | Lora (`--font-editorial-serif`), chỉ dùng cho tiêu đề trang, tên ngày và tên điểm dừng |

Bỏ Inter khỏi ba màn hình này. Không thêm font thứ ba.

| Cỡ | px / giãn dòng | Độ đậm | Dùng cho |
| --- | --- | --- | --- |
| `--tv-text-xs` | 12 / 1.4 | 400–500 | Dòng xám, nhãn nhỏ, chú thích nguồn |
| `--tv-text-sm` | 13 / 1.45 | 400–500 | Nút sm, chữ trong vùng gợi ý, ô bảng |
| `--tv-text-md` | 14 / 1.5 | 400 | Chữ thân trang, tin nhắn chat (desktop) |
| `--tv-text-lg` | 16 / 1.5 | 400 / 600 | Tin nhắn chat (mobile), tiêu đề panel |
| `--tv-text-xl` | 20 / 1.3 | 600 | Tên điểm dừng (serif), tên ngày trên mobile |
| `--tv-text-2xl` | 28 / 1.15 | 600 | Tiêu đề trang (serif); 24 trên mobile |

- Chỉ dùng ba độ đậm: **400** cho chữ thường, **500** cho nút, tab và nhãn, **600** cho tiêu đề. Không dùng 650 hay 700.
- Không viết hoa toàn bộ, không giãn chữ cho nhãn. Ví dụ "Thời gian", không phải "THỜI GIAN".
- Không in đậm cả câu trong tin nhắn trợ lý. Chỉ in đậm một cụm số liệu hoặc tên riêng khi thật cần.
- Số tiền và giờ dùng `font-variant-numeric: tabular-nums`. Cột số trong bảng căn phải.

### 2.3 Khoảng cách, bo góc, bóng

| Nhóm | Giá trị |
| --- | --- |
| Khoảng cách | 4 · 8 · 12 · 16 · 24 · 32 · 48 (`--tv-space-1` … `--tv-space-7`) |
| Bo góc | `--tv-radius-control` 8px (nút, ô nhập, ô gợi ý) · `--tv-radius-card` 12px (thẻ, panel, sheet) · `--tv-radius-pill` 999px (chỉ chip trả lời nhanh, chấm ngày) |
| Bóng | `--tv-shadow-float` = `0 8px 24px rgb(16 24 20 / .10), 0 2px 6px rgb(16 24 20 / .06)`. Chỉ cho menu, sheet, popover và ô nhập chat đang nổi. Thẻ, nút và tab không có bóng. |
| Lề trang | desktop 32px, tablet 24px, mobile 16px |

### 2.4 Chuyển động

- Chỉ có phản hồi: rê chuột hoặc focus 120ms, nhấn `scale(.98)`, sheet trượt lên 220ms `cubic-bezier(.2,.8,.2,1)`.
- Không có hiệu ứng xuất hiện cho nội dung.
- Với `prefers-reduced-motion`, bỏ phần trượt và giữ phần đổi độ mờ.

## 3. Thành phần

### 3.1 Nút

| Cỡ | Cao | Chữ | Đệm ngang | Icon | Dùng cho |
| --- | --- | --- | --- | --- | --- |
| `sm` | 28px | 12.5px / 500 | 10px | 14px | Trong thẻ và trong vùng gợi ý |
| `md` | 34px | 13.5px / 500 | 14px | 16px | Mặc định trên desktop và tablet |
| `lg` | 44px | 14px / 500 | 16px | 18px | Chỉ cho nút dính ở chân màn hình mobile |

| Kiểu | Nghỉ | Rê chuột | Nhấn | Ghi chú |
| --- | --- | --- | --- | --- |
| Chính | nền `--tv-accent`, chữ `--tv-on-accent` | nền `--tv-accent-hover` | `scale(.98)` | Tối đa một nút trên mỗi màn hình hoặc mỗi sheet |
| Phụ | nền `--tv-surface`, viền 1px `--tv-line`, chữ `--tv-ink` | nền `--tv-sunken` | `scale(.98)` | |
| Chữ | không nền, chữ `--tv-ink` | nền `--tv-accent-tint` | | Dùng cho hàng hành động phụ |
| Link | chữ `--tv-accent`, có thể kèm icon | gạch chân | | Ví dụ "Xem nhanh", "Xem tất cả" |
| Nguy hiểm | chữ `--tv-danger` | nền `--tv-warn-bg` | | Chỉ nằm trong menu "⋯" hoặc hộp xác nhận |
| Chỉ có icon | 34×34 (sm: 28×28), chữ `--tv-ink-2` | nền `--tv-sunken` | | Bắt buộc có `aria-label` |

- Mọi nút bo `--tv-radius-control`; icon cách chữ 6px; nét icon 1.5px.
- Trạng thái đang chạy: giữ nguyên độ rộng, thay icon bằng vòng quay 14px. Không làm mờ cả nút.
- Hạn chế nút bị vô hiệu hoá. Nếu buộc phải dùng: chữ `--tv-ink-3`, nền `--tv-sunken`, kèm lý do ngay cạnh nút.

### 3.2 Tab ngày

- Cao 32px, chữ 13.5px / 500. Khoảng cách giữa các tab 20px trên desktop, 16px trên mobile.
- Một mục tab gồm chấm 7px màu ngày, tên "Ngày 1", và số điểm cùng dòng bằng `--tv-ink-3` ("· 4").
- Tab đang chọn: chữ `--tv-ink`, gạch chân 2px màu ngày. Tab khác: chữ `--tv-ink-2`. Không nền, không bóng. Bên dưới cả thanh là đường kẻ 1px `--tv-sunken`.
- Thứ tự: Ngày đi · Ngày 1…N · Ngày về. Ngày đi và ngày về dùng chấm xám và tên "Ngày đi 12/12".
- Trên mobile, thanh tab cuộn ngang, tab đang chọn tự cuộn vào giữa, và thanh dính ở đầu khi cuộn trang.

### 3.3 Thẻ điểm dừng (DayTimeline)

- Thẻ nền `--tv-surface`, bo 12px, đệm 12px, không viền, không bóng. Thẻ đặt trên nền `--tv-ground`.
- **Biến thể `full`:** ảnh 4:3 rộng 168px bên trái. Bên phải gồm: tên điểm (serif, `--tv-text-xl`); dòng xám "08:12–09:12 · 60 phút"; thứ tự "Điểm dừng 1" dạng chữ xám 12px (không dùng chip); thời tiết.
- **Biến thể `compact`:** ảnh vuông 64px; tên điểm dùng font giao diện 15px / 600. Dưới 480px, ảnh nằm trên tên (16:9).
- Trục thời gian bên trái: giờ 13px / 500 tabular, đường dọc 2px màu ngày ở độ mờ 40%.
- Bỏ dòng địa chỉ khi không có địa chỉ thật, ví dụ "khu vực hà giang".
- Vùng "Gần đây có thể ghé" và "Tối nay": nền `--tv-sunken`, bo 8px, đệm 8px 10px. Mỗi mục một dòng, gồm tên, khoảng cách bằng chữ xám và link "Xem nhanh".

### 3.4 Thẻ tóm tắt bản lịch (trong chat)

- Nền `--tv-surface`, bo 12px, đệm 14px 16px, rộng tối đa 420px.
- Nội dung:
  - dòng 1: "Bản lịch v2" 12px `--tv-ink-2`;
  - dòng 2: "4 ngày · 11 điểm" `--tv-text-lg` / 600;
  - dòng 3: "28,6 tr" kèm "vượt 8,6 tr" màu cảnh báo khi vượt ngân sách;
  - dòng 4: "Kiểm tra 5/5 đạt";
  - cuối thẻ: nút chính `md` "Xem lịch trình". Trên desktop đã chia đôi màn hình, nút này đổi thành link "Đang mở bên phải".
- Thẻ của bản cũ: độ mờ 0.55, nhãn "Đã có bản mới", không có nút.

### 3.5 Chip trả lời nhanh

- Cao 30px, đệm 0 12px, bo pill, nền `--tv-sunken`, chữ 13px / 500 `--tv-ink`. Khi rê chuột, nền `--tv-accent-tint`.
- Nếu chip có con số, số nằm cùng chip ("Đi xe khách · −4,2 tr").
- Trên mobile chip cuộn ngang trên một dòng, không xuống dòng.
- Chip luôn hiện **sau** khi đoạn chữ của lượt đó đã chạy xong.

### 3.6 Ô nhập chat

- Một dòng, cao 44px, tự giãn tối đa 4 dòng. Nền `--tv-surface`, bo 12px, bóng `--tv-shadow-float` (đây là một trong số ít thứ nổi).
- Nút gửi là nút tròn 32px nằm trong ô, góc phải, nền `--tv-accent`. Khi trợ lý đang trả lời, nút đổi thành nút dừng.
- Bộ đếm ký tự chỉ hiện khi đã dùng trên 80% giới hạn.

### 3.7 Khối tiến độ

Dùng khi trợ lý lập lịch lâu.

- Mỗi bước một dòng 13px: ✓ (xong, `--tv-accent`), ● (đang chạy, nhấp nháy độ mờ), ○ (chưa tới, `--tv-ink-3`).
- Bước đang chạy có thể kèm chi tiết bằng chữ xám ("đợt 3/5").
- Không dùng thanh phần trăm giả.

### 3.8 Bảng chi phí

- Desktop: bảng 3 cột (Khoản · Cách tính · Số tiền), đường kẻ 1px `--tv-sunken` giữa các dòng, không tô xen kẽ, không dải màu ở dòng tiêu đề.
- Mobile: danh sách 2 cột (Khoản · Số tiền), cách tính thành dòng xám bên dưới.
- Dòng tổng dùng 600 và tách bằng khoảng trống 8px, không dùng đường kẻ đậm.

### 3.9 Sheet (mobile)

- Nền `--tv-surface`, bo 16px ở hai góc trên, có thanh kéo 36×4px, bóng `--tv-shadow-float`, phủ tối đa 92% chiều cao màn hình.
- Đóng bằng cách kéo xuống, chạm vào vùng mờ hoặc nút Back. Khi đóng, trang trở về đúng chỗ đang đọc.
- Nút chính `lg` dính ở chân sheet.

## 4. Bố cục màn hình

### 4.1 Trợ lý AI

**Desktop từ 1200px trở lên, khi đã có lịch:** thanh bên 240px, cột chat 440–480px, panel lịch chiếm phần còn lại và dính.
- Panel gồm: tiêu đề viết từ dữ liệu, dòng xám, nút chính "Lưu chuyến", tab ngày, rồi `DayTimeline full` và bản đồ đặt cạnh nhau. Khi panel hẹp hơn 760px, bản đồ chuyển thành tab.
- Tab phụ của panel: Lịch trình · Chi phí · Kiểm tra.

**Desktop khi chưa có lịch:** một cột chat rộng tối đa 720px, căn giữa.

**Từ 768px đến dưới 1200px:** một cột. Thẻ tóm tắt mở panel lịch thành một ngăn kéo từ bên phải, rộng 560px.

**Mobile:**
- thanh trên cùng 48px gồm ☰, tên cuộc chat và nút "+";
- thẻ tóm tắt trong luồng chat mở sheet lịch có 3 tab Lịch · Bản đồ · Chi phí, nút "Lưu chuyến" dính ở chân sheet;
- bỏ nút mở thanh bên đang nổi.

**Thanh bên:**
- tên cuộc chat tự đặt từ nội dung đã chốt (ví dụ "Đà Nẵng → HG · 4 người · 12/12");
- chấm 6px `--tv-accent` cho cuộc chat đã ra chuyến đi;
- mục đang chọn có nền `--tv-sunken`.

### 4.2 Chi tiết chuyến đi

**Desktop:** cột nội dung bên trái, bản đồ dính bên phải. Giữ bố cục hiện tại; đây là phần làm tốt nhất của ứng dụng.

Đầu trang:
1. Tiêu đề viết từ dữ liệu (serif 28px).
2. Dòng xám: "4 người · xe máy · 11 điểm dừng · 415 km · còn 20 ngày".
3. Hàng hành động: một nút chính, sau đó là các nút chữ, cuối cùng là "⋯".
4. **Dải cung đường:** một thanh 8px chia theo quãng đường từng ngày, mỗi đoạn tô màu của ngày đó, bên dưới ghi "Ngày 1 · 4 điểm · 132 km". Bấm vào một đoạn là chuyển tới ngày đó.
5. Tab ngày, dính khi cuộn.

Bỏ: nhãn "HÀNH TRÌNH ĐÃ LƯU", bốn ô icon thông tin, và mục chặng tiếp cận trong "Mục đã ghim" (chặng này chuyển vào tab Ngày đi / Ngày về).

**Mobile:**
- thanh trên cùng gồm ←, "Chuyến đi" và "⋯";
- ảnh của điểm dừng đầu tiên tỉ lệ 16:9, rồi tiêu đề, dòng xám, dải cung đường, tab ngày, timeline;
- thanh chân dính gồm nút phụ "Bản đồ" (mở sheet bản đồ, lọc theo ngày đang xem) và nút chính;
- bỏ nút trợ lý đang nổi.

### 4.3 Danh sách chuyến đi

- Chip lọc: Sắp tới · Đang đi · Đã xong, kèm số đếm 12px `--tv-ink-3`. Tìm kiếm thu thành một nút icon, bấm vào mới mở ô nhập.
- Chuyến gần nhất được làm to: ảnh thật của điểm dừng đầu (16:9, bo 12px), tên theo cung đường, ngày và "còn N ngày".
- Các chuyến khác là dòng gọn cao 72px: ảnh vuông 56px, tên, dòng xám (ngày · phương tiện · số điểm), nút "⋯" ở bên phải.
- Bấm vào cả dòng để mở. "Đánh dấu hoàn thành" và "Xoá" nằm trong menu "⋯".

### 4.4 Trang chia sẻ

Dùng `DayTimeline full` và dải cung đường như trang chi tiết. Không có tab Ngày đi / Ngày về và không hiện thành phố nhà, theo spec [ASSISTANT-TRIP-TIMELINE-PARITY](../stories/ASSISTANT-TRIP-TIMELINE-PARITY.md).

## 5. Chữ trên giao diện

- Nút: động từ đứng đầu, 1–3 từ, viết hoa chữ đầu câu, không dấu chấm. Ví dụ: "Lưu chuyến", "Xem lịch trình", "Hỏi trợ lý", "Đổi giờ xuất phát".
- Trạng thái: "Đã lưu", "Đang kiểm tra lịch · đợt 3/5". Không dùng "thành công" hay dấu chấm than.
- Trạng thái trống là một lời mời. Ví dụ: "Chưa có chuyến nào. Bắt đầu với trợ lý" kèm nút "Lập hành trình".
- Không để lộ dữ liệu thô: tiền tố "[Tạm]", địa danh viết thường, mã nội bộ.

## 6. Kiểm tra trước khi giao

- Mỗi màn hình chỉ có một nút chính, ở cả desktop và mobile.
- Không còn `font-weight` 650 hoặc 700, `box-shadow` trên thẻ, nút hay tab, hay màu viết cứng trong CSS của ba màn hình. Kiểm bằng grep.
- Tương phản đạt WCAG AA: chữ thường từ 4.5:1, chữ lớn và icon từ 3:1, ở cả chế độ sáng và tối.
- Có viền focus nhìn thấy được trên mọi nút, tab, chip và link.
- Chụp màn hình ở 1440, 768 và 375px cho trợ lý (trống, đang chờ, đã có lịch), chi tiết chuyến đi và danh sách chuyến đi; không có cuộn ngang.
