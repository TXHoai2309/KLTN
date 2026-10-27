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

**Indicative departure window (khoảng khởi hành dự kiến)**:
A period in which the traveler may start the trip without yet choosing one exact departure date, such as a particular week.
_Avoid_: Exact departure date, confirmed trip dates.

## Travel companions — planned extension

These terms describe the owner-selected feature design in `docs/implementation/trip-companions-design.md`; they do not imply that the feature is implemented.

**Trip host (chủ chuyến)**:
The person who owns a trip opened to travel companions and retains authority to edit its itinerary.
_Avoid_: Shared owner, group administrator role.

**Trip member (thành viên chuyến)**:
A person who has joined a trip and can view its itinerary and participate in its group conversation.
_Avoid_: Join applicant, co-editor, trip host.

**Open companion places (số chỗ tìm thêm)**:
The number of additional people a host invites to join, excluding the host and companions already traveling with them. Each joining account occupies one place.
_Avoid_: Total party size, planner companion count, vehicle seats.

**Trip group conversation (trò chuyện nhóm chuyến)**:
The conversation shared by a trip's host and its joined members.
_Avoid_: AI assistant conversation, direct message, public comments.

**Recruitment closure (đóng tuyển)**:
The point at which a trip stops accepting additional companions.
_Avoid_: Trip completion, trip cancellation, trip deletion.
