# Ý tưởng nâng cấp giao diện: Trợ lý AI và Chuyến đi của tôi

Ngày 2026-11-23. Giai đoạn ý tưởng, chưa có code. Dựa trên một cuộc chat mới chạy trên prod (conversation `a3e290bf`, nhóm 4 người từ Đà Nẵng, 4 ngày xe máy, khởi hành 12/12) và chuyến đi được lưu từ đó (`/trips/cmws4tw8t000108l8oyszsmj3`). Xem ở 1440px và 375px.

Phương pháp: skill design-taste-frontend, nhánh **app screen** (màn hình để làm việc, không phải trang giới thiệu). Hướng rút được: `editorial-greeting` (seed 1974018435), giữ bảng màu và font của thương hiệu (`--keep palette,type`). Chưa chạy `inspect.mjs`, vì trình kiểm tra mở Chrome mới không có phiên đăng nhập nên không vào được hai trang này; mọi nhận xét bên dưới là từ ảnh chụp thật.

## 1. Mỗi màn hình trả lời câu hỏi nào

| Màn hình | Câu hỏi đầu tiên của người dùng | Thứ phải to nhất |
| --- | --- | --- |
| Trợ lý AI (khi đã có lịch) | "Lịch của mình trông thế nào, có đi được không, hết bao nhiêu?" | Lịch trình theo ngày cùng bản đồ |
| Trợ lý AI (trống) | "Bắt đầu từ đâu?" | Ô nhập và 1–2 lối tắt có thật |
| Danh sách chuyến đi | "Chuyến sắp tới là chuyến nào, còn bao lâu?" | Chuyến gần nhất |
| Chi tiết chuyến đi | "Ngày nào đi đâu, mấy giờ?" | Lịch trình theo ngày cùng bản đồ (đã đúng) |

Chỗ lệch lớn nhất: ở trang trợ lý, thứ trả lời câu hỏi chính là lịch trình, nhưng nó bị chôn dưới bảng chi phí. Bản đồ phải bấm "Xem bản đồ lộ trình" mới mở, còn nút lưu trông như một dòng chữ.

## 2. Những gì đã thấy

### 2.1 Trợ lý AI — giao diện

1. **Thứ tự trong tin nhắn bị ngược.** Đoạn chữ, rồi bảng chi phí 9 dòng, rồi mới tới tab ngày và timeline, rồi "Kiểm tra lịch trình", rồi link bản đồ, rồi thẻ lưu. Người dùng phải cuộn qua bảng tiền mới thấy mình đi đâu.
2. **Bản đồ bị ẩn.** Trang chuyến đi có bản đồ dính bên phải rất tốt; trang trợ lý thì giấu nó sau một link.
3. **Nút lưu không giống nút.** "Lưu hành trình" là một `button` không có nền, đặt cạnh "Lịch trình chưa được lưu" nên đọc như nhãn. Sau khi lưu, nó thành một khung viền xanh có chữ "Đã lưu hành trình. Mở chuyến đi".
4. **Thẻ trả lời nhanh hiện trước khi chữ chạy xong.** Ở lượt 2, thẻ "Chốt ngày bay…" đã hiện trong khi đoạn chữ phía trên còn đang chạy dần.
5. **Cả câu hỏi bị in đậm.** "Chốt ngày bay ra Hà Nội là 12/12/2026 chứ?" và "Bạn có muốn mình tìm thêm quán ăn…?" in đậm cả câu, nên độ nhấn mất tác dụng.
6. **Thanh bên toàn tên trùng.** Khoảng 20 cuộc chat tên "Tôi muốn lập hành trình đi hà giang" hoặc "Lập hành trình Hà Giang"; không phân biệt được, cũng không biết cuộc nào đã ra chuyến đi.
7. **Mobile.** Nút mở thanh bên đè lên tin nhắn đầu. Ô nhập chiếm 2 dòng cộng một nút Gửi to, khoảng 1/5 màn hình. Sau khi lưu, ô nhập nhảy lên giữa và để lại khoảng trống bên dưới.

### 2.2 Trợ lý AI — chất lượng trả lời và tốc độ

| Lượt | Thời gian (đo tay) | Vấn đề |
| --- | --- | --- |
| 1. Nêu nhu cầu | khoảng 20 giây | Người dùng nói "4 người ở Đà Nẵng, đi xe máy". Trợ lý hỏi "bạn xuất phát gần Ngũ Hành Sơn, Bà Nà Hills hay Cầu Rồng?", tức là đang định tính chặng chạy xe máy Đà Nẵng → Hà Giang. Lẽ ra phải hỏi ngay cách ra điểm tập kết (đúng luật persona đã có). |
| 2. "Bay ra Hà Nội, xe khách lên TP Hà Giang" | khoảng 40 giây | Trợ lý hỏi lại "Chốt ngày bay ra Hà Nội là 12/12/2026 chứ?", dù persona đã cấm xác nhận lại. Mất thêm một lượt. |
| 3. Bấm "Đúng" | khoảng 100 giây | Suốt quá trình chỉ có một dòng "Đang kiểm tra lịch trình…", không có bước tiến nào, không có chữ nào chạy ra. |

Tổng cộng khoảng 2 phút 40 giây và 3 lượt mới thấy bản lịch đầu tiên. Có thể rút xuống còn 1 lượt.

Chất lượng nội dung của bản lịch:

- **Vượt ngân sách mà không đưa lối ra.** Tổng 28,63 triệu, vượt 8,63 triệu (43%). Trợ lý chỉ nêu con số, rồi hỏi một câu không liên quan ("tìm thêm quán ăn…?") và không có nút trả lời nhanh. Nên đưa 2–3 nút cụ thể: "Đi xe khách thay máy bay (tiết kiệm khoảng X)", "Homestay rẻ hơn", "Bớt 1 ngày".
- **Bỏ qua sở thích đã nói.** Người dùng nói "thích săn mây và ăn đặc sản", nhưng lịch không gắn điểm săn mây (giờ sáng sớm ở Lũng Cú hay Mã Pí Lèng) và gợi ý ăn trưa không nói tới đặc sản.
- **Dữ liệu thô lộ ra ngoài.**
  - Có tiền tố "[Tạm]" trong tên điểm.
  - Thẻ nào cũng ghi địa chỉ "khu vực hà giang", viết thường.
  - Tiêu đề nghỉ đêm là "Nghỉ đêm khu vực hà giang".
  - Mục "Gần đây có thể ghé" lẫn chỗ lưu trú (Balana Hà Giang, H'mong Village Resort, Homestay Tommy house) và một tên chung chung là "Khu Vui Chơi" (đã ghi trong spec [ASSISTANT-TRIP-TIMELINE-PARITY](../stories/ASSISTANT-TRIP-TIMELINE-PARITY.md), BR-8 và BR-10).
- **Ngày 4 có 0 điểm, cần kiểm lại.** Chuyến "4 ngày" có Ngày 4 không có điểm nào, với "Hạn về Ngày 4: 18:00", trong khi thẻ chặng tiếp cận ghi xe khách TP Hà Giang → Hà Nội lúc 07:00 và bay lúc 18:00. Chưa rõ Ngày 4 là ngày chạy xe hay ngày về; người dùng sẽ thấy mình chỉ có 3 ngày đi chơi. Cần xem lại cách tính ngày khi chặng về bắt đầu từ sáng sớm.
- **Điểm tốt nên giữ:**
  - Bảng chi phí rõ, có cột "Cách tính".
  - Chặng tiếp cận đã tự cộng và khớp với mục ghim (20.419.536đ ở cả hai nơi).
  - Đã tra giá Google Flights.

### 2.3 Chuyến đi của tôi — danh sách

- Mọi thẻ đều tên "Chuyến đi 5 ngày" hoặc "Chuyến đi 4 ngày", dùng lặp lại 2 ảnh minh hoạ, nên không phân biệt được chuyến nào với chuyến nào.
- Mỗi thẻ có 3 hành động cùng hiện: Xem chi tiết (nút đặc), Đánh dấu hoàn thành, Xóa chuyến đi (chữ đỏ). Mười hai thẻ là 36 nút.
- Có nhãn "Sắp tới" lặp ở cả tab, tiêu đề nhóm lẫn từng thẻ.

### 2.4 Chuyến đi của tôi — chi tiết

- **Điểm mạnh nhất của cả ứng dụng:** timeline có ảnh bên trái, bản đồ dính bên phải tô màu theo ngày. Giữ nguyên, và đem cách này sang trang trợ lý.
- **Tiêu đề không nói gì.** "Chuyến đi 4 ngày" phía trên nhãn chữ hoa nhỏ "HÀNH TRÌNH ĐÃ LƯU". Bốn ô thông tin có icon trong ô màu và nhãn chữ hoa nhỏ (THỜI GIAN, THỜI LƯỢNG…).
- **Năm nút ngang hàng, ba nút tô đặc.** Chỉnh sửa, Đổi nơi/giờ xuất phát (xanh đặc), Tìm bạn đồng hành, Trợ lý chuyến đi (đen đặc), Thêm vào lịch (xanh đặc). Không nút nào là hành động chính. Trên mobile, năm nút này chiếm hết màn hình đầu.
- **Mục ghim chặng tiếp cận:** icon máy bay và xe khách rơi xuống dòng riêng, nên đọc như văn bản vỡ.
- **Lỗi tương phản:** nhãn "Ngày 1" trên trục bên trái là chữ trắng trên nền gần trắng.
- **Tab ngày:** "Ngày 4 (0 điểm)" vẫn hiện như một ngày đi chơi.

## 3. Hướng thiết kế: Editorial greeting, giữ màu thương hiệu

Lý do chọn: KLTN là "ngôi nhà" của một chuyến đi cá nhân hoặc của một nhóm nhỏ. Người dùng mở lại vài lần trước chuyến, đọc kỹ chứ không theo dõi số liệu. Hướng này mở đầu bằng một tiêu đề được viết từ dữ liệu thật, đặt trong một cột căn giữa có lưới 12 cột, và để các mảng nền nhạt làm khung thay cho viền và bóng.

- **Màu:** giữ xanh rừng hiện có làm màu nhấn, nhưng chỉ dùng cho **một** hành động chính trên mỗi màn hình và cho dữ liệu chính (đường đi trên bản đồ). Nền và panel là các bậc xám–xanh rất nhạt. Màu nhấn dưới 2% diện tích.
- **Font:** giữ serif của tiêu đề (đang dùng ở "Ngày 1", tên điểm) và sans cho phần còn lại; tối đa 2 font.
- **Bỏ:** nhãn chữ hoa nhỏ phía trên tiêu đề, icon trong ô màu, ba nút tô đặc cùng lúc, bóng trên thẻ đứng yên, chữ in đậm cả câu.

### Bộ mặt: tiêu đề viết từ dữ liệu

Thay "Chuyến đi 4 ngày" và "Bạn muốn khám phá điều gì?" bằng một câu lấy từ chính chuyến đi:

- Chi tiết chuyến: **"Đà Nẵng → Hà Giang, 13–16/12"**, dòng xám bên dưới: "4 người · xe máy · 11 điểm dừng · 415 km · còn 20 ngày".
- Danh sách: tên chuyến tự đặt theo cung đường, ví dụ "Quản Bạ – Đồng Văn – Mèo Vạc", thay cho "Chuyến đi N ngày".
- Trợ lý khi trống: "Chào Hoài." kèm một lối tắt có thật: "Tiếp tục chuyến Đà Nẵng → Hà Giang (13/12)" nếu có chuyến sắp tới.
- Thanh bên của trợ lý: tên cuộc chat lấy từ nội dung đã chốt ("Đà Nẵng → HG · 4 người · 12/12"), có dấu nhỏ cho cuộc chat đã ra chuyến đi.

### Yếu tố riêng: màu của từng ngày

Bản đồ đã tô mỗi ngày một màu (Ngày 1 xanh lá, Ngày 2 xanh dương, Ngày 3 nâu…). Biến màu đó thành **danh tính của ngày** và dùng nhất quán: chấm màu trên tab ngày, đoạn trục thời gian của ngày đó, đường trên bản đồ, và dải "cung đường" nhỏ ở đầu trang (một thanh ngang chia theo quãng đường từng ngày). Màu ngày chỉ để nhận diện, không dùng cho nút hay trạng thái.

## 4. Ba thay đổi có tác động lớn nhất

### 4.1 Trợ lý: chia đôi màn hình khi đã có lịch

Trên desktop (từ khoảng 1200px trở lên), khi cuộc chat đã có bản lịch:

```
┌ thanh bên ┬──────── chat (~460px) ────────┬──────── Bản lịch (phần còn lại, dính) ────────┐
│ cuộc chat │ tin nhắn ngắn                 │ Đà Nẵng → Hà Giang, 13–16/12      [Lưu chuyến]│
│           │ ┌ Bản lịch v2 ─────────────┐  │ 4 người · 11 điểm · 28,6 tr · 5/5 đạt        │
│           │ │ 4 ngày · 11 điểm · 5/5   │→ │ [Ngày đi][Ngày 1●][Ngày 2●][Ngày 3●][Ngày về]│
│           │ │ 28,6 tr (vượt 8,6 tr)    │  │ ┌ DayTimeline ──────┐┌ bản đồ ───────────┐  │
│           │ └──────────────────────────┘  │ │ 07:00 Khởi hành    ││  đường màu theo   │  │
│           │ [Đi xe khách] [Homestay rẻ]   │ │ 08:12 Cổng trời…   ││  ngày             │  │
│           │ ô nhập                        │ └───────────────────┘└───────────────────┘  │
│           │                               │ Lịch trình · Chi phí · Kiểm tra (tab phụ)    │
└───────────┴───────────────────────────────┴──────────────────────────────────────────────┘
```

- Trong tin nhắn chỉ còn một **thẻ tóm tắt bản lịch** (số ngày, số điểm, tổng chi phí, kết quả kiểm tra). Bấm vào thì mở hoặc làm nổi panel bên phải. Thẻ của bản cũ ghi "Bản v1 · đã có bản mới", cùng cách với chặng tiếp cận hiện hành trong spec parity.
- Panel bên phải chính là `DayTimeline` dùng chung (spec parity) cộng với bản đồ dính, nên trợ lý, chuyến đi và trang chia sẻ giống hệt nhau mà không phải làm hai lần.
- **"Lưu chuyến"** là nút đặc duy nhất, nằm ở đầu panel. Sau khi lưu, nút thành "Mở chuyến đi".
- Panel không vẽ lại mỗi khi chat có tin mới, vì nó đọc theo id của bản lịch hiện hành. Điều này giải quyết luôn lỗi thẻ bị tạo lại.
- **Mobile:** không chia đôi. Thẻ tóm tắt mở panel lịch thành một sheet toàn màn hình có tab ngày và nút "Lưu chuyến" ở chân; bản đồ là một tab trong sheet.

### 4.2 Chi tiết chuyến đi: tiêu đề, một hành động chính, dải cung đường

- **Tiêu đề và dòng xám** viết từ dữ liệu (mục 3). Bỏ nhãn "HÀNH TRÌNH ĐÃ LƯU" và bốn ô icon; thông tin của chúng gộp vào dòng xám.
- **Một hành động chính:** "Hỏi trợ lý về chuyến này" (hoặc "Chỉnh sửa", nếu bạn muốn ưu tiên sửa lịch). Các hành động khác thành nút chữ trên một hàng: Chỉnh sửa · Đổi giờ xuất phát · Tìm bạn đồng hành · Thêm vào lịch, còn Xóa đưa vào menu "⋯". Trên mobile chỉ hiện nút chính và "⋯".
- **Dải cung đường:** dưới tiêu đề, một thanh ngang chia theo từng ngày bằng màu của ngày, ghi "Ngày 1 · 4 điểm · 132 km". Bấm vào một đoạn là nhảy tới ngày đó, kèm tab Ngày đi / Ngày về ở hai đầu (spec parity, BR-6).
- Chặng tiếp cận chuyển vào tab Ngày đi / Ngày về, không còn nằm trong mục ghim (spec parity).
- Sửa lỗi nhỏ: chữ trắng của "Ngày 1" trên trục; icon máy bay và xe khách nằm cùng dòng với chữ; bỏ dòng địa chỉ "khu vực hà giang" khi không có địa chỉ thật.

**Danh sách chuyến đi:**
- Thẻ dùng ảnh thật của điểm dừng đầu tiên (đã có trong timeline), tên theo cung đường, dòng meta, "còn N ngày".
- Một thao tác chính trên mỗi thẻ: bấm cả thẻ để mở. "Đánh dấu hoàn thành" và "Xóa" vào menu "⋯".
- Chuyến gần nhất được làm to ở đầu trang (ảnh lớn, đếm ngược); các chuyến khác là danh sách gọn bên dưới.

### 4.3 Luồng AI: bớt 2 lượt, cho thấy tiến độ, biến vấn đề thành nút bấm

1. **Người ở xa không bị hỏi quận.** Khi thành phố nhà cách xa hơn N km (Đà Nẵng, TP Hồ Chí Minh…), câu hỏi đầu tiên là "Ra Hà Nội bằng máy bay, tàu hay xe khách?" kèm 3 nút, không hỏi "Ngũ Hành Sơn hay Bà Nà". Nên chặn từ phía server (`findOrigin` không trả ứng viên trong thành phố nhà khi đã có homeCity ở xa), không chỉ dựa vào persona.
2. **Không xác nhận lại ngày.** Khi người dùng đã nêu ngày (12/12) và cách đi, lập lịch luôn. Ngày tạm hiểu ghi trong thẻ tóm tắt và sửa được bằng một nút "Đổi ngày".
3. **Tiến độ thật trong lúc chờ 60–100 giây.** Thay một dòng "Đang kiểm tra lịch trình…" bằng các bước lấy từ tool đang chạy (đã có tool trace): Chọn điểm đến → Kiểm tra lịch (đợt 3/5) → Tìm chỗ nghỉ → Tính chi phí. Mỗi bước xong được đánh dấu. Người dùng biết hệ thống đang làm gì và sắp xong chưa.
4. **Nhanh hơn thật sự.** Chạy song song những việc không phụ thuộc nhau sau khi lịch đạt: tìm chỗ nghỉ, gợi ý quanh đây, giá vé và bảng chi phí. Đoạn chữ ngắn của trợ lý chạy ra ngay khi lịch đạt, còn các thẻ đổ vào panel khi xong. Xem lại tốc độ chạy chữ dần phía client: chữ đang hiện chậm hơn dữ liệu về, và thẻ trả lời nhanh hiện trước khi chữ xong.
5. **Vượt ngân sách thì có lối ra.** Khi tổng vượt ngân sách, trợ lý đưa 2–3 nút có con số tiết kiệm ước tính lấy từ bảng giá tham khảo (đổi máy bay sang xe khách, hạng phòng rẻ hơn, bớt một ngày), không hỏi sang chuyện khác.
6. **Sở thích thành nhãn trên lịch.** "Săn mây" thành nhãn trên điểm và giờ sáng sớm phù hợp; "ăn đặc sản" thành gợi ý ăn trưa và ăn tối ghi rõ món. Lấy từ tài liệu địa phương đã duyệt (`lookupLocalKnowledge`), không bịa.
7. **Dọn dữ liệu hiển thị:** bỏ tiền tố "[Tạm]" khi hiển thị (hoặc sửa dữ liệu gốc), viết hoa địa danh, bỏ chỗ lưu trú khỏi "Gần đây có thể ghé".

## 5. Đề xuất thứ tự làm

1. **Nhỏ, ít rủi ro, thấy ngay:** 4.3 mục 1, 2, 7; nút lưu thành nút thật; bỏ in đậm cả câu; sửa chữ trắng "Ngày 1"; tên cuộc chat và tên chuyến tự đặt.
2. **Spec [ASSISTANT-TRIP-TIMELINE-PARITY](../stories/ASSISTANT-TRIP-TIMELINE-PARITY.md):** `DayTimeline` dùng chung, chặng tiếp cận hiện hành, khối "Tối nay". Đây là nền cho bước 3.
3. **Trợ lý chia đôi màn hình** (4.1) dùng `DayTimeline` và bản đồ dính.
4. **Đầu trang chi tiết chuyến** (4.2) và danh sách chuyến đi.
5. **Tiến độ thật và chạy song song** (4.3 mục 3, 4), ngân sách có lối ra (mục 5), sở thích thành nhãn (mục 6).

## 6. Câu hỏi cần bạn chốt trước khi viết spec

- Hành động chính của trang chi tiết chuyến đi là "Hỏi trợ lý" hay "Chỉnh sửa"?
- Trợ lý chia đôi màn hình từ 1200px trở lên có ổn không, hay muốn giữ một cột với thẻ lịch to?
- Ngày 4 có 0 điểm: chuyến "4 ngày" có tính ngày về sáng sớm là một ngày không? Đây là quy tắc sản phẩm, cần bạn quyết.

## 7. Phụ lục

- Hướng thiết kế đã lưu ở `.taste-skill/app/direction.json`. Thư mục `.taste-skill/` chưa nằm trong `.gitignore`.
- Dữ liệu thử để lại trên prod: conversation `a3e290bf-21b5-457b-8b58-1c034971c9fb` và chuyến đi `cmws4tw8t000108l8oyszsmj3` ("Chuyến đi 4 ngày", 13–16/12/2026). Có thể xoá nếu không cần.
