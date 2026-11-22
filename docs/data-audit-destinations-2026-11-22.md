# Destination data audit (production, read-only) — 2026-11-22

Scope: `destination`, `opening_day`, `opening_interval` on the production database. Nothing was changed. All numbers below are what the data holds today; "Proposal" rows are suggestions that need the owner's decision, and the real-world facts behind them (hours, ticketing, how long a visit takes) must be confirmed against an official or on-site source before anything is applied.

## What the data says

- **Only 22 visible destinations exist.** This is the first limit on how many places a plan can use: a 4-day trip from Hà Nội has 2 visiting days × at most 3 stops, drawn from these 22.
- **`isOutdoor` is false for all 22**, including cliffs, passes and terraces. The weather/sunset scheduling preference reads this flag, so it currently never treats any place as outdoor.
- **Two places have no visit duration at all:** `Cao nguyên đá Đồng Văn` and `Pả Vi Thượng` (both `suggestedDurationMinutes` and `minimumDurationMinutes` are empty). The planner cannot schedule a stop without a duration.
- **Opening hours look like one template:** 19 of 22 places are `07:00–17:00` every day of the week. Exceptions: `Cổng trời Quản Bạ` 05:00–17:00, `Ruộng bậc thang Hoàng Su Phì` and `Sông Nho Quế` 06:00–17:00, `Đèo Mã Pì Lèng` 07:00–18:00, and `Cao nguyên đá Đồng Văn` 00:00–24:00. No place has a closed day or a lunch break.
- **Closing at 17:00 caps the day.** Open-air viewpoints closing at 17:00 are why a day ends early in the timeline (sunset in December is about 17:30).
- **Draft names are visible:** five places start with `[Tam]` (`Du Già`, `Núi Đôi Cô Tiên`, `Rừng thông Yên Minh`, `Sủng Là (Nhà của Pao)`, `Thị trấn Mèo Vạc`) and are shown to travelers as is.

## Durations (minutes, suggested / minimum)

| Place | Now | Note |
|---|---|---|
| Cột cờ Lũng Cú | 120 / 90 | Looks long for a flag tower and viewpoint; check on site |
| Ruộng bậc thang Hoàng Su Phì | 240 / 120 | Area-scale, not one stop; long for one slot |
| Đỉnh Chiêu Lầu Thi | 180 / 120 | A trek; plausible |
| Sông Nho Quế | 180 / 90 | Boat trip; plausible |
| Làng văn hóa Nặm Đăm, Hạ Thành, Pả Vi Hạ | 120 / 60 | Plausible |
| Phố cổ Đồng Văn | 120 / 60 | Plausible |
| Dinh thự họ Vương | 90 / 60 | Plausible |
| Rừng thông Yên Minh | 30 / 15 | Short photo stop; plausible |
| Cao nguyên đá Đồng Văn, Pả Vi Thượng | empty | Missing |

## Proposals (not applied)

1. Set `isOutdoor = true` for the natural and open-air places: Cổng trời Quản Bạ, Đèo Mã Pì Lèng, Núi Đôi Cô Tiên, Rừng thông Yên Minh, Ruộng bậc thang Hoàng Su Phì, Sông Nho Quế, Đỉnh Chiêu Lầu Thi, Cao nguyên đá Đồng Văn, Pả Vi Thượng, Cột cờ Lũng Cú.
2. Fill the two empty durations (for example 90 / 45 for both) once the owner confirms.
3. For open-air viewpoints with no gate (Cổng trời Quản Bạ, Đèo Mã Pì Lèng, Núi Đôi Cô Tiên, Rừng thông Yên Minh), widen hours to 06:00–18:00 so the day can end near sunset instead of 17:00.
4. Re-check `Chợ tình Khâu Vai`: it is stored as open every day 07:00–17:00, but it is a seasonal market; confirm whether a plan should treat it as an ordinary daily stop.
5. Review the `Cột cờ Lũng Cú` (120 / 90) and `Ruộng bậc thang Hoàng Su Phì` (240 / 120) durations.
6. Remove the `[Tam]` prefix from public names once the places are confirmed.
7. Add more destinations through the admin; with 22 places the pool, not the planner, limits how many stops a plan can have.
