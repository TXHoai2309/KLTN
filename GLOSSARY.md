# Domain Glossary

- **RAG document:** An Admin-managed private source file with metadata, review state, content versions, indexing generations, and retrieval data.
- **Original source (nguồn gốc):** A published article or web page used to substantiate content compiled into a RAG document.
- **Original-source attribution:** A declaration within a RAG document that a section or passage draws on a named original source.
- **Disabled RAG document:** A document in terminal `DISABLED` status that is excluded from future retrieval.
- **Soft-deleted RAG document:** A document marked with `deletedAt` and hidden from the active list and retrieval while its file and history remain available to Admin for recovery.
- **Restored RAG document:** A previously soft-deleted document whose marker is cleared and whose status is `DISABLED` with public-Q&A approval revoked.

## Public Q&A language

**Knowledge expansion (Mở rộng kiến thức)**:
An explicitly enabled Q&A capability that permits model knowledge to supplement retrieved documents and add relevant Hà Giang travel context or advice. Model knowledge remains distinct from verified document evidence.
_Avoid_: Web search, verified source.

**Model knowledge (kiến thức của model)**:
Information supplied from the language model's learned knowledge rather than established by this turn's retrieved documents.
_Avoid_: Original source, verified document evidence.

**QA question understanding (hiểu câu hỏi)**:
Interpretation of the user's intended subject and requested information so that Q&A can search for relevant material and respond to the actual question.
_Avoid_: Source verification, factual answer.

**Contextual assistant panel (khung trợ lý theo điểm đến)**:
A compact assistant conversation opened alongside the destination being viewed, so the traveler can ask questions without leaving that destination page.
_Avoid_: Browser popup window, separate AI assistant.

**Global assistant launcher (nút trợ lý dùng chung)**:
The single floating entry owned by the application layout. Its mounted panel keeps the active conversation across client navigation; starting a new chat uses the current public page context or general Hà Giang Q&A.

## Conversational trip planning

**Queued message (tin nhắn chờ gửi)**:
Câu người đi gõ trong lúc trợ lý còn đang trả lời. Chưa thuộc cuộc trò chuyện cho tới khi được gửi; các câu chờ được gộp thành một tin gửi ngay khi câu trả lời hiện tại kết thúc bình thường, và chỉ tồn tại trong phiên đang mở.
_Avoid_: Tin đã gửi, tin nháp.

**Conversational trip planning (lập hành trình trong hội thoại)**:
Creating a new itinerary through a conversation, including reviewing needs, revising a proposal and explicitly saving the resulting trip.
_Avoid_: Travel Q&A, editing an already-saved trip.

**Itinerary proposal (đề xuất hành trình)**:
A proposed arrangement of destination visits that the traveler can review and revise before confirming an official saved trip. A proposal is not proof that the itinerary satisfies its constraints.
_Avoid_: Saved trip, confirmed itinerary.

**Needs recap (bản tổng hợp nhu cầu)**:
A summary of the traveler's stated trip preferences and constraints for them to check and correct before an itinerary is proposed.
_Avoid_: Itinerary proposal, saved trip.

**Destination option (lựa chọn điểm đến)**:
A specific destination offered to the traveler as a possible addition or replacement in their itinerary. Offering a destination does not mean it has been added or the itinerary has been saved.
_Avoid_: Scheduled visit, saved trip.

**Proposal change confirmation (xác nhận chỉnh đề xuất)**:
The traveler's acceptance of a stated change to the itinerary proposal they are reviewing.
_Avoid_: Trip save confirmation.

**Trip save confirmation (xác nhận lưu chuyến đi)**:
The traveler's explicit request to save the reviewed itinerary as an official trip. This request is distinct from the resulting saved trip.
_Avoid_: Proposal change confirmation, saved trip.

**Excluded destination (điểm đã yêu cầu bỏ)**:
A destination the traveler has asked to leave out of their current trip plan, unless they explicitly ask to include it again.
_Avoid_: Hidden destination, unavailable destination.

**Exact departure date (ngày khởi hành cụ thể)**:
The single calendar date intended for the start of the traveler's trip, including its day, month and year.
_Avoid_: Indicative departure window, number of trip days.

**Whole-trip dates (ngày cả chuyến)**:
The full calendar date range from leaving home (`tripStartDate`) to returning home (`tripEndDate`), encompassing both any transit access days and the Hà Giang sightseeing days (`startDate`, `durationDays`) within that span.
_Avoid_: Sightseeing dates alone when separate travel days exist.

**Destination travel time (thời gian di chuyển giữa điểm)**:
Verified road distance and driving duration cached between two catalog destinations for a given transport mode, used when ordering routes and fitting days prior to live final validation.
_Avoid_: Straight-line distance estimate, final Validator PASS proof.

**Trip origin (nơi xuất phát)**:
Địa điểm người đi bắt đầu hành trình, bao gồm chặng từ đó đến khu vực tham quan Hà Giang. Nơi xuất phát khác với điểm tham quan đầu tiên và vị trí hiện tại khi đang đi.
_Avoid_: First attraction, current in-trip location, departure date.

**Return leg (chặng về)**:
Chặng di chuyển từ khu vực nghỉ đêm cuối cùng (hoặc điểm tham quan cuối cùng nếu nằm ngay tại khu vực đó) quay về nơi xuất phát trong ngày cuối của chuyến đi.
_Avoid_: Last attraction, trip completion.

**Day route header (nhãn tuyến đầu ngày)**:
Dòng tóm tắt lộ trình ở đầu mỗi ngày trên lịch trình, hiển thị từ nơi xuất phát sạch (Ngày 1) hoặc khu vực nghỉ đêm của tối hôm trước tới khu vực tham quan trọng tâm trong ngày hoặc điểm về cuối chuyến.
_Avoid_: Bus station suffix on self-drive trips, raw landmark endpoint as morning origin.

**Arrival preparation step (bước chuẩn bị tại điểm đến)**:
Bước chuyển tiếp linh động ngay sau chặng di chuyển tới Hà Giang hoặc điểm tập kết (về khách sạn gửi/cất đồ, nhận phòng tạm, nhận và kiểm tra xe thuê, nghỉ lấy sức) trước lượt tham quan đầu tiên. Bước này không áp khung phút cứng và không chặn lịch.
_Avoid_: Fixed time block, scheduled visit, validation blocker.

**Advisory notice (lưu ý linh động)**:
Thông báo tư vấn gắn trên lịch trình khi giờ về dự kiến muộn hơn khung giờ mong muốn hoặc giờ nghỉ trưa lệch khung quen thuộc, kèm gợi ý điều chỉnh tùy chọn mà không đánh vi phạm hay khóa lưu chuyến.
_Avoid_: Validation violation, save blocker.

**Roadside rest allowance (thời gian nghỉ dọc đường dự kiến)**:
Khoảng thời gian hệ thống dành thêm để nghỉ trong các chặng di chuyển của lịch trình, tách biệt với thời gian chạy xe ước tính.
_Avoid_: Verified driving time, actual rest time, lodging.

**Day timeline (timeline trong ngày)**:
Trình tự thời gian của một ngày trong đề xuất hành trình: khởi hành, chặng đi, lượt tham quan, nghỉ trưa, nghỉ đêm và chặng về. Các mốc giờ trong timeline là mốc đã được lập và kiểm tra; gợi ý đi kèm không làm đổi mốc giờ.
_Avoid_: Free-text itinerary, AI-written schedule.

**Planning suggestion (gợi ý kèm lịch)**:
Lời khuyên do trợ lý thêm vào một khoảng trong timeline, như ăn ở đâu hay mẹo đi lại. Gợi ý không phải là lượt tham quan, không được kiểm tra ràng buộc và không làm đổi mốc giờ.
_Avoid_: Scheduled visit, verified stop.

**Suggestion marker (mốc gợi ý)**:
Mốc hiển thị ở tầng trình bày ngay trong `DayTimeline` (chấm rỗng viền màu ngày, đoạn trục nét đứt, giờ ước tính có dấu `~` và nhãn nhỏ `gợi ý`) cho chiều rảnh, nhận phòng hoặc ăn tối gần chỗ nghỉ, cùng dòng gợi ý gọn ngay dưới điểm dừng cho `Gần đây có thể ghé`. Chỉ tính ở tầng hiển thị để sắp thứ tự; không phải lượt tham quan, không ghi vào lịch đã kiểm tra, không đổi mốc giờ, không qua Constraint Validator và không ảnh hưởng chi phí.
_Avoid_: Scheduled visit, verified stop.

**Nearby activity suggestion (gợi ý vui chơi quanh đây)**:
Một địa điểm vui chơi hoặc tham quan gần một điểm dừng, hoặc một nơi đi chơi buổi tối gần chỗ nghỉ, hệ thống tự tìm cho mỗi chặng của hành trình. Là dữ liệu bản đồ chưa kiểm tra, được giữ cùng chuyến đi đã lưu để người đi biết; không phải là lượt tham quan, không chiếm giờ trong timeline và không ảnh hưởng kết quả kiểm tra hay chi phí.
_Avoid_: Scheduled visit, verified stop, destination.

**Free afternoon (chiều rảnh)**:
Khoảng thời gian trong ngày sau lượt tham quan cuối khi lịch kết thúc sớm và chưa có hoạt động nào được xếp. Chiều rảnh không phải lượt tham quan; trợ lý chỉ kèm gợi ý vui chơi quanh đây cho khoảng này.
_Avoid_: Empty day, scheduled visit.

**Lodging suggestion (gợi ý chỗ nghỉ)**:
Một nơi lưu trú bên ngoài danh mục điểm đến được gợi ý cho một đêm của chuyến đi, luôn được đánh dấu là chưa kiểm tra. Gợi ý chỗ nghỉ không phải là đặt phòng và không phải là lượt tham quan.
_Avoid_: Booking, overnight stop, destination.

**Chosen lodging (chỗ nghỉ đã chọn)**:
Gợi ý chỗ nghỉ mà người đi chọn cho một đêm cụ thể; mỗi đêm có tối đa một chỗ nghỉ đã chọn, được giữ cùng đề xuất và chuyến đi đã lưu. Vẫn là chưa kiểm tra: không phải đặt phòng, không đổi mốc giờ, không ảnh hưởng kết quả kiểm tra hay bảng chi phí ước tính.
_Avoid_: Booking, reservation, overnight stop.

**Place preview (xem nhanh địa điểm)**:
Khung xem vị trí và thông tin công khai của một địa điểm (bản đồ, đánh giá) mở ngay trong trang, không rời ứng dụng. Chỉ có cho điểm đến trong danh mục và gợi ý do hệ thống tìm được, không có cho tên địa điểm trợ lý tự viết.
_Avoid_: Browser popup window, verified place, booking page.

**Cost estimate (bảng chi phí ước tính)**:
Bảng các khoản chi dự kiến của chuyến đi theo từng nhóm và tổng cộng. Số tiền là ước tính, không phải giá đã xác nhận.
_Avoid_: Quote, verified price, booking total.

**Trip hub (điểm tập kết)**:
Nơi người đi bắt đầu phần đi bằng xe máy hoặc ô tô của chuyến đi, thường là nơi thuê xe, khi họ đến từ xa bằng phương tiện khác. Khi có điểm tập kết, nó là nơi xuất phát của phần lịch được kiểm tra.
_Avoid_: Trip origin, first attraction.

**Access leg (chặng tiếp cận)**:
Phần di chuyển từ nhà người đi đến điểm tập kết bằng máy bay, xe khách hay tàu. Chặng tiếp cận được ước tính và hiển thị nhưng không được kiểm tra ràng buộc.
_Avoid_: Return leg, roadside driving leg, verified journey.

**Current access leg (chặng tiếp cận hiện hành)**:
Bản chặng tiếp cận mới nhất trong một cuộc trò chuyện. Mỗi cuộc trò chuyện chỉ có một chặng tiếp cận hiện hành; bảng chi phí ước tính, mục đã ghim và chuyến đi được lưu đều dùng đúng bản này. Các bản trước đó là bản cũ: vẫn xem được nhưng không ghim được.
_Avoid_: Pinned access leg, any access leg card.

**Travel day (ngày đi / ngày về)**:
Ngày người đi di chuyển từ nhà tới điểm tập kết, hoặc từ điểm tập kết về nhà, theo chặng tiếp cận. Ngày đi và ngày về đứng trước và sau các ngày của chuyến đi nhưng không được tính vào số ngày chuyến đi.
_Avoid_: Day 1, trip day.

**Evening plan (tối nay)**:
Phần cuối của một ngày có nghỉ đêm: khu vực nghỉ đêm, chỗ nghỉ đã chọn hoặc gợi ý chỗ nghỉ, và vài nơi ăn uống hay vui chơi buổi tối gần đó. Tối nay chỉ là gợi ý chưa kiểm tra: không chiếm giờ trong timeline và không ảnh hưởng kết quả kiểm tra hay bảng chi phí ước tính.
_Avoid_: Scheduled visit, evening stop, booking.

**Price reference (bảng giá tham khảo)**:
Tài liệu được duyệt ghi các mức giá phổ biến cho chuyến đi Hà Giang, kèm ngày cập nhật, làm cơ sở cho bảng chi phí ước tính.
_Avoid_: Live price, quote.

**Assumed draft (bản nháp giả định)**:
Một đề xuất hành trình trợ lý lập ngay khi người dùng mới nói muốn đi, dựa trên các giá trị giả định được ghi rõ (điểm tập kết, số ngày, phương tiện, ngày đi). Bản nháp vẫn được xếp giờ và kiểm tra như mọi đề xuất, nhưng không lưu được cho đến khi người dùng xác nhận nơi xuất phát và ngày đi.
_Avoid_: Saved trip, confirmed itinerary, sample itinerary viết tay.

**Planning intent confirmation (xác nhận muốn lập lịch)**:
Câu trợ lý hỏi lại khi người đang hỏi đáp chuyển sang muốn lập lịch, nêu những gì nó đã hiểu để người dùng đồng ý. Không cần khi người dùng mở đầu bằng yêu cầu lập lịch rõ ràng.
_Avoid_: Trip save confirmation, proposal change confirmation.

**Required stop (điểm bắt buộc)**:
Một điểm đến người dùng muốn chắc chắn có trong lịch, ví dụ địa điểm họ vừa hỏi trước khi chuyển sang lập lịch. Lịch đề xuất phải chứa điểm này hoặc nói rõ vì sao không xếp được.
_Avoid_: Night-area preference, suggestion.

**Origin candidate (ứng viên điểm xuất phát)**:
Một địa điểm hệ thống tìm được từ tên nơi đi người dùng gõ, được trợ lý nói lại để người dùng xác nhận. Ứng viên chưa phải là nơi xuất phát cho đến khi người dùng đồng ý.
_Avoid_: Trip origin, confirmed origin.

**Chat origin confirmation (xác nhận nơi xuất phát trong chat)**:
Câu trả lời đồng ý của người dùng ngay sau khi trợ lý nói lại một ứng viên điểm xuất phát; nó biến ứng viên đó thành nơi xuất phát đã xác nhận.
_Avoid_: Model-chosen origin, map pin.

**Indicative departure window (khoảng khởi hành dự kiến)**:
A period in which the traveler may start the trip without yet choosing one exact departure date, such as a particular week.
_Avoid_: Exact departure date, confirmed trip dates.

## Travel companions

**Saved itinerary (lịch trình đã lưu)**:
The official itinerary of a trip, including its travel dates and arranged destination visits, that its owner has confirmed and saved.
_Avoid_: Itinerary proposal, companion invitation, hành trình đang lưu, phương án đã lưu.

**Companion invitation (bài đăng tìm bạn đồng hành)**:
The host's public invitation for additional companions to join an existing trip, with an introduction and a summary of that trip.
_Avoid_: Saved itinerary, group conversation, separate public event.

**Trip host (chủ chuyến)**:
The person who owns a trip opened to travel companions and retains authority to edit its itinerary.
_Avoid_: Shared owner, group administrator role.

**Trip member (thành viên chuyến)**:
A person who has joined a trip and can view its itinerary and participate in its group conversation.
_Avoid_: Join applicant, co-editor, trip host.

**Companion capacity (số chỗ tìm thêm)**:
The number of additional people a host invites to join, excluding the host and companions already traveling with them. Each joining account occupies one place.
_Avoid_: Total party size, planner companion count, vehicle seats.

**Trip group conversation (trò chuyện nhóm chuyến)**:
The conversation shared by a trip's host and its joined members.
_Avoid_: AI assistant conversation, direct message, public comments.

**Recruitment closure (đóng tuyển)**:
The point at which a trip stops accepting additional companions.
_Avoid_: Trip completion, trip cancellation, trip deletion.

## Assistant Skill Runtime V2

**Assistant skill (kỹ năng trợ lý)**:
A reusable domain-level operating policy that tells the Assistant how to reason about a class of user goals, what actions it may request, and what output contract it must respect. A skill does not own deterministic truth or database writes.
_Avoid_: Tool, API endpoint, model, autonomous sub-agent.

**Skill runtime (bộ chạy skill)**:
The single server-side Assistant runtime that selects the active skill, supplies current conversation/domain state, obtains a structured next-action decision, executes allowed application actions, and composes the user-facing result.
_Avoid_: Multi-agent system, planner engine, provider SDK.

**Capability action (hành động năng lực)**:
A typed application-owned operation exposed to the skill runtime, such as reading planning state, generating a proposal through the existing planner, retrieving destination candidates, validating an itinerary, or saving a confirmed trip. The application executes the action; the model does not own its truth.
_Avoid_: Skill, free-form prompt instruction.

**Material question (câu hỏi có ảnh hưởng quyết định)**:
A question whose answer can materially change the candidate itinerary, is required for a safe/authorized action, or resolves ambiguity that cannot be handled by a reversible preliminary proposal.
_Avoid_: Every unanswered optional profile field.

**Minimum useful brief (bộ thông tin tối thiểu hữu ích)**:
The smallest confirmed planning input that is sufficient to create a useful preliminary itinerary. For the current Hà Giang planner this is trip duration plus supported transport; an exact departure date is still required before final confirmation/save.
_Avoid_: Fully completed preference questionnaire, save-ready requirement.

**Progressive refinement (tinh chỉnh dần)**:
Creating a preliminary proposal as soon as the minimum useful brief is available, then using later preferences, dates, constraints and corrections to revise that proposal instead of blocking on a fixed questionnaire.
_Avoid_: Silent defaulting of unknown facts, skipping mandatory save requirements.

**Response plan (kế hoạch phản hồi)**:
A structured description of the next conversational goal, supported facts, allowed actions, and safety/business constraints from which natural Vietnamese prose is composed. It replaces the V1 pattern where the model is restricted to paraphrasing one canonical sentence.
_Avoid_: Itinerary proposal, model-generated business decision.

**Planning guidance (tư vấn theo lịch hiện tại)**:
A read-only answer to a request for advice about the current itinerary proposal or edit draft (whether it is balanced, tiring, affected by sun times or forecast weather, or how to adjust for a rest break or delay). It uses only facts supported by the current schedule, its validation checks, travel legs, and available forecasts, never changes the schedule by itself, and is distinct from an edit request.
_Avoid_: Replanning, clarification question, weather safety guarantee.

**Trip structure (cấu trúc chuyến đi)**:
The days of a trip together with the nights the traveler explicitly said they will stay. Nights are never derived from days; more nights than days is clarified, not corrected silently.
_Avoid_: Trip duration, lodging.

**Overnight anchor (khu vực nghỉ đêm)**:
The fixed town or commune area where a night between two itinerary days falls, acting as the evening check-in destination for that day and the departure anchor for the next morning or return leg. It remains distinct from a suggested or chosen lodging place, price, or booking.
_Avoid_: Hotel, homestay, accommodation booking, unverified lodging pin.

**Night-area preference (khu vực nghỉ đêm mong muốn)**:
An area the traveler explicitly asks to sleep in on a given night. It is honoured when a selected stop belongs to that area and reported plainly when it cannot be arranged; it is a preference, not a validity rule.
_Avoid_: Mandatory destination, Validator constraint.

**Caveat policy (chính sách lưu ý)**:
The rule that a turn creating or changing a proposal carries one short, specific caveat (for example the missing departure date and the opening hours it blocks), while read-only turns carry none unless the traveler asks about checks, the date or saving.
_Avoid_: Repeating the same disclaimer every turn.

**Guest (khách)**:
An unauthenticated visitor identified only by the guest cookie. A Guest may ask public Hà Giang questions and nothing else.
_Avoid_: Anonymous user, visitor account.

**Guest mode (chế độ khách)**:
The Assistant chat mode for a Guest: question-and-answer only, with source citations. Planning, saving and trip changes need an account; a Guest who asks for them is invited to sign in.
_Avoid_: Demo mode, read-only planning.
**Listing withdrawal (gỡ công khai)**:
Removal of a trip's invitation from public discovery while preserving its existing travel group.
_Avoid_: Recruitment closure, group dissolution, trip deletion.

**Companion trip cancellation (hủy chuyến đồng hành)**:
The host's decision to call off the shared trip offered to its members.
_Avoid_: Trip completion, listing withdrawal, trip deletion.

## Weather and sun times

**Destination forecast (dự báo tại điểm đến)**:
The forecast weather conditions at a destination for a given hour or day.
_Avoid_: Real-time weather, weather constraint.

**Visit-time weather (thời tiết lúc có mặt)**:
The destination forecast for the hour at which a scheduled visit is planned.
_Avoid_: Departure weather, daily weather.

**Weather advisory (cảnh báo thời tiết)**:
An informational notice about forecast conditions shown on an itinerary proposal or saved trip. It is never a Constraint Validator result and never blocks a trip.
_Avoid_: Validation failure, weather constraint.

**Forecast not yet available (chưa có dự báo)**:
The state of a day that lies beyond the forecast horizon. It carries no substitute values.
_Avoid_: Climate average, estimated weather.

**Sun times (giờ mặt trời)**:
Sunrise, sunset and the morning and evening golden hours for a destination's location on a given date.
_Avoid_: Astronomy forecast.

**Outdoor destination (điểm ngoài trời)**:
A destination an Admin has marked as experienced in the open, so daylight matters for the visit.
_Avoid_: Nature category, scenic spot.

**After-sunset advisory (cảnh báo sau hoàng hôn)**:
A weather advisory that a visit to an outdoor destination is scheduled after that day's sunset.
_Avoid_: Opening-hours violation.

**Leg weather (thời tiết dọc chặng)**:
The forecast along a travel leg for the time the traveler is expected to pass each part of it.
_Avoid_: Departure weather, destination forecast.

**Weather question (câu hỏi thời tiết)**:
A question to the Assistant about forecast weather or sun times at a destination, answered from the destination forecast rather than from source documents. It never ends in a verdict on whether to go.
_Avoid_: Seasonal advice, climate question.

**Representative point (điểm đại diện)**:
The place whose forecast stands in for "Hà Giang" when a Weather question names no destination. The answer states that it is a representative point.
_Avoid_: Province-wide forecast.

## Itinerary editing

**Edit draft (bản nháp chỉnh sửa)**:
The temporary in-progress copy of a trip's itinerary where the traveler makes manual or AI-assisted adjustments before deciding whether to save. An edit draft does not alter the saved itinerary.
_Avoid_: Phương án chỉnh sửa, hành trình đề xuất, phương án đề xuất.

**Scheduled visit (lượt tham quan)**:
A planned stop at a destination or external place on a specific day of an itinerary, with an order, start time, and planned duration.
_Avoid_: Điểm đến (when referring to a stop in a schedule), điểm dừng số X.

**Itinerary validation (kiểm tra tính hợp lệ)**:
The deterministic server evaluation of an itinerary against opening hours, minimum stay duration, travel time, and schedule conflicts. Weather advisories and AI suggestions are not validation.
_Avoid_: AI review, weather warning.

**Saved-trip assistant (trợ lý chuyến đi)**:
The unified conversational and visual workspace for an owned saved trip where the traveler can ask questions, receive planning guidance, and adjust a shared edit draft through conversation or direct controls before confirming a save.
_Avoid_: Separate in-trip chat vs edit screen, auto-saving assistant.

**In-trip incident (yêu cầu phát sinh)**:
A situation a traveler reports during an ongoing trip that may change the rest of their itinerary: bad weather, tiredness or a wish to rest, a delay from traffic or a vehicle breakdown, a wish to add a nearby place, or an upcoming place being closed or unreachable.
_Avoid_: Planning request, general Q&A question, edit command.

**Elapsed visit (điểm đã qua giờ)**:
A visit in an ongoing trip whose scheduled time has already passed. It is protected from change unless the traveler confirms they have not been there.
_Avoid_: Visited place, completed visit (when the traveler has not confirmed it).

**Confirmed-unvisited visit (điểm xác nhận chưa đến)**:
An elapsed visit that the traveler has explicitly said they have not reached, so the assistant may move, shorten or drop it.
_Avoid_: Skipped visit, cancelled visit.

**Actionable advice suggestion (gợi ý chỉnh sửa từ tư vấn)**:
A concrete, optional adjustment offered alongside a read-only planning guidance answer that does not change the edit draft unless the traveler chooses to apply it.
_Avoid_: Automatic draft edit, unverified recommendation.

**Correction note (dòng đính chính)**:
A short system-written line attached under an assistant answer when the answer overstated the itinerary validation result or promised absolute weather safety; it restates the verified fact without removing the answer.
_Avoid_: Silently replacing the answer, repeated disclaimers.

**Stated assumption (giả định nêu rõ)**:
The reading the Saved-trip assistant picks when a traveler's edit request leaves one detail open but has a single reasonable interpretation; the assistant applies it to the edit draft and says which reading it chose so the traveler can redirect or undo. When readings involve a real trade-off it offers options instead, and when it cannot tell what the traveler means it asks.
_Avoid_: Guessing silently, asking back on every missing detail.

**Schedule rest buffer (khoảng nghỉ trong lịch)**:
An intentional gap before or between scheduled visits created by shifting visit times so the traveler can rest, distinct from roadside rest allowance, an overnight anchor, or a scheduled visit.
_Avoid_: Fake destination stop, hotel or lodging booking.

**Pinned item (mục đã ghim)**:
Một vé máy bay, chỗ ở, quán ăn hoặc bảng chi phí mà người dùng ghim từ trợ lý sang chuyến đi đã lưu. Là ảnh chụp có ngày của dữ liệu tham khảo, không phải đặt chỗ và không phải lượt tham quan. Bạn đồng hành chỉ thấy chỗ ở, quán ăn và phần lưu trú, ăn uống của chi phí.
_Avoid_: Booking, scheduled visit, saved trip.
