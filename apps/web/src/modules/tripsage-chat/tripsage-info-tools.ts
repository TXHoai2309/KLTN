import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { OVERNIGHT_TOWN_CENTERS } from "../../lib/traveler-display-clean";
import { computeSunTimes, formatMinute, formatShortViDate, todayInVietnam } from "../trip-weather/sun-times";
import { FORECAST_DAYS, getForecasts, summarizeDays, type Point, type PointForecast } from "../trip-weather/forecast";
import type { TripDetail, TripSummary } from "../trip-read/trip-read-service";

/** Owner-scoped reads of the signed-in traveler's saved trips; the server resolves the owner from the request, never the model. */
export type TripsageMyTrips = {
  list: () => Promise<{ items: TripSummary[] }>;
  get: (tripId: string) => Promise<TripDetail>;
};

export type TripsageInfoToolContext = {
  now: () => Date;
  /** Enables getWeatherForecast. Defaults to the shared Open-Meteo forecast (cached) when `true`. */
  weather?: true | ((points: Point[]) => Promise<PointForecast[]>);
  /** Enables listMyTrips / getMyTrip. */
  myTrips?: TripsageMyTrips;
};

export const INFO_TOOL_DESCRIPTIONS = {
  weather: "getWeatherForecast (dự báo thời tiết tham khảo theo khu vực Hà Giang cho tối đa 7 ngày liên tiếp trong 16 ngày tới, kèm giờ mặt trời mọc/lặn)",
  trips: "listMyTrips (liệt kê các chuyến đi người dùng đã lưu) và getMyTrip (đọc lịch, chỗ nghỉ đã chọn và chi phí ước tính của một chuyến đã lưu, chỉ đọc)",
} as const;

const AREAS = Object.keys(OVERNIGHT_TOWN_CENTERS) as [string, ...string[]];
const MAX_WEATHER_CALLS = 2;
const MAX_TRIP_CALLS = 3;

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Read-only information tools for the chat: weather forecast and the traveler's own saved trips. */
export function createTripsageInfoTools(context: TripsageInfoToolContext) {
  let weatherCalls = 0;
  let tripCalls = 0;
  const tools: ToolSet = {};

  if (context.weather) {
    const forecasts = context.weather === true ? (points: Point[]) => getForecasts(points) : context.weather;
    tools.getWeatherForecast = tool({
      description: `Dự báo thời tiết tham khảo (Open-Meteo) cho một khu vực ở Hà Giang, tối đa 7 ngày liên tiếp trong ${FORECAST_DAYS} ngày tới, kèm giờ mặt trời mọc/lặn. Dùng khi người dùng hỏi thời tiết các ngày cụ thể hoặc 'mấy ngày tới'. Chỉ mang tính tham khảo, không ảnh hưởng kết quả kiểm tra lịch.`,
      inputSchema: z.object({
        area: z.enum(AREAS).optional().describe("Khu vực; mặc định TP Hà Giang. Vùng cao nguyên đá dùng Đồng Văn / Mèo Vạc / Lũng Cú."),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional().describe("Ngày bắt đầu YYYY-MM-DD; mặc định hôm nay (giờ Việt Nam)."),
        days: z.number().int().min(1).max(7).optional().describe("Số ngày, mặc định 3."),
      }).strict(),
      async execute(input) {
        if (weatherCalls >= MAX_WEATHER_CALLS) return { ok: false as const, code: "WEATHER_LIMIT", message: "Đã đạt số lần tra thời tiết trong lượt này." };
        weatherCalls++;
        const area = input.area ?? "TP Hà Giang";
        const center = OVERNIGHT_TOWN_CENTERS[area]!;
        const today = todayInVietnam(context.now());
        const start = input.startDate && input.startDate > today ? input.startDate : today;
        const lastForecastDate = addDays(today, FORECAST_DAYS - 1);
        const dates = Array.from({ length: input.days ?? 3 }, (_, i) => addDays(start, i));
        const [point] = await forecasts([center]).catch(() => [undefined]);
        if (!point || point.status !== "AVAILABLE") {
          return { ok: false as const, code: "WEATHER_UNAVAILABLE", message: "Chưa lấy được dự báo thời tiết lúc này. Nói rõ là chưa có dự báo, không đoán số liệu." };
        }
        const byDate = new Map(summarizeDays(point.hours).map(day => [day.date, day]));
        return {
          ok: true as const,
          area,
          source: "Open-Meteo (dự báo tham khảo)",
          fetchedAt: point.fetchedAt,
          days: dates.map(date => {
            const sun = computeSunTimes(center.latitude, center.longitude, date);
            const sunTimes = { sunrise: formatMinute(sun.sunriseMinute), sunset: formatMinute(sun.sunsetMinute) };
            const day = byDate.get(date);
            if (!day) {
              return { date: formatShortViDate(date), status: date > lastForecastDate ? "NOT_YET_AVAILABLE" as const : "NO_DATA" as const, ...sunTimes };
            }
            return {
              date: formatShortViDate(date),
              status: "AVAILABLE" as const,
              minTemperatureC: day.minTemperatureC,
              maxTemperatureC: day.maxTemperatureC,
              maxRainChancePercent: day.maxPrecipitationProbability,
              totalRainMm: day.totalPrecipitationMm,
              minVisibilityM: day.minVisibilityM,
              maxWindGustKmh: day.maxWindGustKmh,
              ...sunTimes,
            };
          }),
          note: "Giá trị null nghĩa là nhà cung cấp không có số liệu: nói là chưa có, không tự điền. NOT_YET_AVAILABLE: ngày quá xa, chưa có dự báo.",
        };
      },
    });
  }

  if (context.myTrips) {
    const myTrips = context.myTrips;
    const limited = () => ({ ok: false as const, code: "TRIP_READ_LIMIT", message: "Đã đạt số lần đọc chuyến đi trong lượt này." });
    tools.listMyTrips = tool({
      description: "Liệt kê các chuyến đi người dùng đang đăng nhập đã lưu (mã, ngày đi/về, phương tiện, số điểm, trạng thái). Chỉ đọc.",
      inputSchema: z.object({}).strict(),
      async execute() {
        if (tripCalls >= MAX_TRIP_CALLS) return limited();
        tripCalls++;
        const { items } = await myTrips.list().catch(() => ({ items: [] as TripSummary[] }));
        return {
          ok: true as const,
          count: items.length,
          trips: items.slice(0, 10).map(trip => ({
            tripId: trip.id,
            title: [trip.originLabel, trip.lastArea].filter(Boolean).join(" → ") || "Hà Giang",
            dates: `${formatShortViDate(trip.startDate)}–${formatShortViDate(trip.endDate)}`,
            durationDays: trip.durationDays,
            transport: trip.transport === "CAR" ? "Ô tô" : "Xe máy",
            stops: trip.visitCount,
            status: trip.status,
          })),
        };
      },
    });
    tools.getMyTrip = tool({
      description: "Đọc chi tiết một chuyến đã lưu của người dùng (tripId lấy từ listMyTrips): từng ngày gồm các điểm và giờ, chỗ nghỉ đã chọn, chi phí ước tính. Chỉ đọc, không sửa.",
      inputSchema: z.object({ tripId: z.string().min(1).max(64) }).strict(),
      async execute(input) {
        if (tripCalls >= MAX_TRIP_CALLS) return limited();
        tripCalls++;
        const trip = await myTrips.get(input.tripId).catch(() => null);
        if (!trip) return { ok: false as const, code: "TRIP_NOT_FOUND", message: "Không tìm thấy chuyến đi này trong các chuyến của người dùng. Hãy gọi listMyTrips để lấy đúng mã." };
        const cost = trip.pinnedItems?.find(item => item.kind === "COST");
        return {
          ok: true as const,
          tripId: trip.id,
          dates: `${formatShortViDate(trip.startDate)}–${formatShortViDate(trip.endDate)}`,
          transport: trip.transport === "CAR" ? "Ô tô" : "Xe máy",
          status: trip.status,
          days: trip.days.map(day => ({
            day: day.dayIndex,
            date: formatShortViDate(day.localDate),
            stops: day.visits.map(visit => `${clock(visit.startMinute)} ${visit.destination.name} (${visit.plannedDurationMinutes} phút)`),
          })),
          chosenLodgings: (trip.chosenLodgings ?? []).map(lodging => ({ night: lodging.nightIndex, name: lodging.name })),
          ...(cost && cost.kind === "COST" ? { costEstimate: { totalVnd: cost.cost.total, travelers: cost.cost.travelers, days: cost.cost.days } } : {}),
          note: "Dữ liệu chỉ đọc từ chuyến đã lưu. Muốn sửa chuyến, hướng người dùng vào nút Chỉnh sửa hành trình trên trang chuyến.",
        };
      },
    });
  }
  return tools;
}
