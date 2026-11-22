# ASSISTANT-WEATHER — Hỏi đáp thời tiết trong trợ lý và làm lại giao diện khối thời tiết

## Status

`implemented` (2026-11-18, tickets 01–06); owner live acceptance pending (gọi model OpenAI thật và chuyến lưu thử cần owner đồng ý). Owner đã duyệt toàn bộ ở buổi grill ngày 2026-11-18 ("đồng ý hết", "đồng ý"). Mở rộng [WEATHER-SUN-ADVISORIES](WEATHER-SUN-ADVISORIES.md); quyết định nền là [ADR-36](../decisions.md#adr-36--weather-is-an-advisory-never-a-constraint-validator-input-2026-11-18) kèm phần bổ sung "Assistant".

Thuật ngữ theo [GLOSSARY](../../GLOSSARY.md#weather-and-sun-times): câu hỏi thời tiết, điểm đại diện, dự báo tại điểm đến, giờ mặt trời, cảnh báo thời tiết, chưa có dự báo.

## Problem Statement

Dự báo và giờ mặt trời đã có ở trang điểm đến và trong bảng của bản đề xuất, nhưng trợ lý chưa biết gì về chúng. Q&A chỉ trả lời từ tài liệu nguồn nên hỏi "mai Mã Pí Lèng có mưa không?" sẽ nhận câu "không đủ nguồn". Sau khi trợ lý lập lịch trình, câu trả lời trong chat không nhắc gì đến cảnh báo, người dùng phải tự cuộn xuống tìm.

Ngoài ra khối "Thời tiết và giờ mặt trời" hiện là một khối chữ dày đặc (cảnh báo, từng ngày, từng điểm, từng chặng nối nhau), khó quét mắt, đặc biệt trên điện thoại.

## Solution

1. **Hỏi đáp thời tiết.** Bước AI hiểu câu hỏi đã có của Q&A nhận thêm ý định `WEATHER` và một ngày chuẩn `weatherDate`. Khi gặp câu hỏi thời tiết, Q&A không đi vào truy xuất tài liệu mà trả lời bằng **thẻ thời tiết** dựng từ dự báo thật, kèm một câu dẫn ngắn do model viết. Guest cũng hỏi được.
2. **Nhắc cảnh báo sau khi lập lịch.** Khi một lượt tạo hoặc sửa lịch trình có cảnh báo, câu trả lời thêm một dòng nêu tối đa 2 cảnh báo nặng nhất. Không có cảnh báo hoặc chưa có dự báo thì không nói gì.
3. **Làm lại giao diện khối thời tiết.** Một component dùng chung cho form, trợ lý và chuyến đã lưu: mỗi ngày một thẻ, cảnh báo là chip, thời tiết dọc chặng thu gọn.

Trợ lý không bao giờ kết luận "nên đi" hay "không nên đi". Thời tiết vẫn chỉ để tham khảo (ADR-36).

## User Stories

### Hỏi đáp thời tiết

1. As a Guest, I want to ask the assistant whether it will rain at a named destination on a given day, so that I get a real forecast instead of "không đủ nguồn".
2. As a Guest, I want to ask what time the sun rises or sets at a destination, so that I can plan for the view.
3. As a Traveler, I want the same weather answers as a Guest, so that signing in changes nothing about this question.
4. As a user, I want to say "mai", "ngày kia", "thứ bảy này", "20/11" or "cuối tuần" and have the assistant understand the date, so that I do not type an exact date.
5. As a user, I want a day beyond the forecast horizon to answer "Chưa có dự báo, sẽ có từ ngày X", so that I never get a guess.
6. As a user, I want an ambiguous date (for example "tháng sau") to get one short clarifying question, so that the assistant does not pick a date for me.
7. As a user who omits the day, I want today to be used, so that "Lũng Cú có mưa không?" just works.
8. As a user viewing a destination page's assistant, I want the destination I am looking at to be used without naming it, so that "mai trời sao?" works there.
9. As a user whose question matches several destinations, I want up to three choices to pick from, so that the assistant does not guess.
10. As a user whose question matches no destination, I want a plain "mình chưa tìm thấy điểm đó", so that I am not given another place's weather.
11. As a user who asks about Hà Giang in general, I want a representative point used and named as such, so that I understand what the numbers stand for.
12. As a user, I want a mixed question such as "Mã Pí Lèng đẹp nhất mùa nào?" to stay a normal knowledge answer, so that seasonal advice is not mistaken for a forecast.
13. As a user, I want the weather figures and advisories shown as a card, so that numbers are never mis-typed by the model.
14. As a user, I want the assistant never to tell me whether I should go, so that I make the decision with the figures in front of me.
15. As a user, I want the forecast source and update time on the card, so that I can judge how fresh it is.
16. As a user, I want a clear unavailable notice when the provider fails, so that I never read missing data as good weather.
17. As a user reopening a saved conversation, I want the weather card to show the latest forecast for that destination and day, so that I do not read a stale copy.
18. As the product owner, I want weather questions to count toward the existing Q&A abuse limits, so that the provider is protected without a new quota.
19. As the product owner, I want hidden or unavailable destinations never to return a forecast, so that public visibility rules still hold.

### Nhắc cảnh báo trong câu trả lời lịch trình

20. As a Traveler, I want a turn that creates a proposal to mention the heaviest advisories in the reply, so that I see them without scrolling.
21. As a Traveler, I want a turn that changes a proposal to mention advisories only when they exist, so that replies are not padded.
22. As a Traveler, I want at most two advisories named, so that the reply stays short.
23. As a Traveler, I want read-only turns (for example a question about the proposal) to add no weather line, so that the caveat is not repeated every turn.
24. As a Traveler, I want that line to come from the computed advisories, not model wording, so that no figure is invented.

### Giao diện khối thời tiết

25. As a Traveler, I want each day to be one card headed by sunrise and sunset with icons, so that I can scan the trip day by day.
26. As a Traveler, I want each visit to be one compact row with weather icon, temperature, rain chance and wind, so that comparing stops is quick.
27. As a Traveler, I want visibility shown only when it is unusually low, so that normal rows stay short.
28. As a Traveler, I want advisories as coloured chips at the top that jump to the affected visit, so that I find the problem fast.
29. As a Traveler, I want leg weather collapsed by default, so that the block stays short.
30. As a Traveler on a phone, I want the block to fit the screen without horizontal scroll, so that it is usable on the road.
31. As a Traveler, I want the same block in the form proposal, the assistant proposal and the saved trip, so that the three screens look alike.
32. As a Traveler, I want the block to remain readable in light and dark themes, so that it matches the rest of the app.

## Implementation Decisions

- **Understanding.** Extend the existing `QaQuestionUnderstanding` and its JSON schema in `qa-question-understander.ts`: add `WEATHER` to `intent` and a nullable `weatherDate` (`YYYY-MM-DD`). The prompt receives today's date in Vietnam time. No keyword list for weather. The deterministic fallback used when the AI call fails never returns `WEATHER`; the question then goes through retrieval as today.
- **Date check.** The server re-validates `weatherDate` (format, not in the past, within the forecast horizon). A past date or an unparseable value gives a clarification; a date beyond the horizon gives "chưa có dự báo". A missing date means today (Vietnam time). The model's date is never trusted as a forecast fact.
- **Destination.** Reuse `matchKnownDestinations`, `targetSubjects` and the resolved destination context. More than one match: up to 3 choices as a clarification. No match: plain not-found answer. No destination named: representative point (the Hà Giang city destination), flagged in the answer.
- **Weather branch in Q&A.** When intent is `WEATHER`, `qa-service` skips retrieval and source-based generation and returns a new completed-turn status carrying `{ destinationId, date, representative }` plus a short lead-in. The lead-in is composed by the model from the already-fetched figures and must not contain a verdict or any figure not in the data. The existing `getDestinationWeather` service supplies the forecast and sun times; public-visibility rules are inherited from it.
- **No stored forecast.** The conversation stores only the destination, date and lead-in, never forecast values. On display the client fetches the existing `GET /api/destinations/[id]/weather?date=` (ADR-36: no weather snapshot).
- **Guest and limits.** The branch lives inside the existing Q&A service, so Guest mode, the abuse guard and idempotency apply unchanged. A weather question counts as one Q&A turn.
- **Assistant (V2) route.** The `ha-giang-qa` skill and its single `answer-ha-giang-question` action stay the entry point; its instruction text drops "live weather" from the out-of-scope list for destination forecasts and keeps saved-trip weather out of scope. No new write capability is granted.
- **Proposal reply line.** The planning response plan gains the two heaviest advisories of the current proposal. The line is built by code from the advisory result, after the proposal exists. It is skipped when there are no advisories or the forecast is unavailable, and on read-only turns, following the Caveat policy.
- **Fetching advisories for the reply.** The server computes advisories with the existing `getTripWeather` from the stored proposal. A weather failure never fails or delays the turn beyond a short timeout; the line is simply omitted.
- **Shared weather block.** Replace the body of `TripWeatherView` with day cards, advisory chips and a collapsed leg section. `TripWeatherPanel` and its three call sites keep their props. Presentation only; no change to the request, response or thresholds.
- **Chat card.** A small client component renders the weather answer from `{ destinationId, date }` by reusing the destination-forecast view and the sun-times view already built.
- **Docs.** GLOSSARY ("Weather question", "Representative point") and the ADR-36 addendum are already written.

## Testing Decisions

- Understanding: schema validation of `WEATHER` and `weatherDate`; the fallback never yields `WEATHER`; date validation table (today, tomorrow, past, beyond horizon, malformed, null).
- Q&A weather branch with fake understander, fake weather service and fake generator: weather answer for named, current-page, ambiguous (3 choices), unknown and representative destinations; mixed seasonal question stays on retrieval; hidden destination returns not-found; provider failure returns the unavailable notice; Guest path and abuse-limit counting; a lead-in containing a verdict or an unknown figure is rejected and replaced with a fixed sentence.
- Proposal reply line: zero, one, two and three advisories (only two named); unavailable forecast; read-only turn adds nothing.
- Component tests for the shared block: day card, chips with jump targets, collapsed legs, unavailable and not-yet-available states, light and dark.
- Existing weather, Q&A, planning-response and V2 runtime suites keep passing. `tsc`, build and `git diff --check` pass. A live check of the Q&A path uses the real model only when the owner approves the cost.

## Out of Scope

- Weather questions about a saved trip or the in-trip skill ("chuyến của tôi ngày mai thế nào?").
- Weather as a Constraint Validator input or any change to Validator results.
- Verdicts such as "nên đi" or "không nên đi"; seasonal or climate advice (stays with source-based Q&A).
- A separate weather quota, a stored forecast, push alerts, or new weather providers.
- Redesign of other parts of the trip or assistant pages.

## Further Notes

- The new completed-turn status changes the shared Q&A contract; the ticketing step should place that contract change first and keep older stored turns readable.
- The chat card depends on the destination weather endpoint staying public and cached; its 1-hour server cache bounds provider calls.
- Thresholds and the representative point (Hà Giang city) are owner-set and uncalibrated.
