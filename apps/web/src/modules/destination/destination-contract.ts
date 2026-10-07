import { z } from "zod";

export const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export const weekdayLabels = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const text = (max: number) => z.string().transform(value => value.normalize("NFC").trim()).pipe(z.string().min(1, "Không được để trống.").max(max, `Tối đa ${max} ký tự.`));
const taxonomy = text(100).transform(value => value.replace(/\s+/g, " ").toLocaleLowerCase("vi-VN"));
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Giờ phải theo HH:mm.");
export const toMinute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const fromMinute = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const intervalSchema = z.object({ opensAt: time, closesAt: z.union([time, z.literal("24:00")]) }).strict().superRefine((value, ctx) => {
  if (toMinute(value.opensAt) >= toMinute(value.closesAt)) ctx.addIssue({ code: "custom", path: ["closesAt"], message: "Giờ kết thúc phải sau giờ bắt đầu; không hỗ trợ qua đêm." });
});
const daySchema = z.object({ dayOfWeek: z.enum(weekdays), status: z.enum(["OPEN", "CLOSED", "UNKNOWN"]), intervals: z.array(intervalSchema).max(24) }).strict().superRefine((day, ctx) => {
  if (day.status === "OPEN" && day.intervals.length === 0) ctx.addIssue({ code: "custom", path: ["intervals"], message: "Ngày mở cửa cần ít nhất một khung giờ." });
  if (day.status !== "OPEN" && day.intervals.length !== 0) ctx.addIssue({ code: "custom", path: ["intervals"], message: "Ngày đóng cửa/chưa có dữ liệu không có khung giờ." });
  const sorted = [...day.intervals].sort((a, b) => toMinute(a.opensAt) - toMinute(b.opensAt));
  if (sorted.some((item, index) => index > 0 && toMinute(item.opensAt) < toMinute(sorted[index - 1]!.closesAt))) ctx.addIssue({ code: "custom", path: ["intervals"], message: "Các khung giờ không được chồng lấn." });
}).transform(day => ({ ...day, intervals: [...day.intervals].sort((a, b) => toMinute(a.opensAt) - toMinute(b.opensAt)) }));
const scheduleSchema = z.array(daySchema).length(7, "Cần đủ bảy ngày.").superRefine((days, ctx) => {
  if (new Set(days.map(day => day.dayOfWeek)).size !== 7) ctx.addIssue({ code: "custom", message: "Mỗi ngày trong tuần phải xuất hiện đúng một lần." });
}).transform(days => [...days].sort((a, b) => weekdays.indexOf(a.dayOfWeek) - weekdays.indexOf(b.dayOfWeek)));
const duration = z.number().int("Thời lượng phải là phút nguyên.").min(1, "Thời lượng phải lớn hơn 0 phút.").max(10080, "Thời lượng tối đa 10080 phút.").nullable();
export const destinationInputSchema = z.object({
  name: text(200), description: text(10000), area: taxonomy, category: taxonomy,
  latitude: z.number().min(-90, "Vĩ độ phải từ -90 đến 90.").max(90, "Vĩ độ phải từ -90 đến 90."), longitude: z.number().min(-180, "Kinh độ phải từ -180 đến 180.").max(180, "Kinh độ phải từ -180 đến 180."),
  suggestedDurationMinutes: duration, minimumDurationMinutes: duration, openingDays: scheduleSchema,
}).strict();
export type DestinationInput = z.infer<typeof destinationInputSchema>;
export const visibilitySchema = z.enum(["HIDDEN", "VISIBLE"]);
export const destinationDtoSchema = destinationInputSchema.extend({ id: z.string().min(1), visibility: visibilitySchema, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }).strict();
export type DestinationDto = z.infer<typeof destinationDtoSchema>;
export const destinationListItemSchema = destinationDtoSchema.pick({ id: true, name: true, area: true, category: true, visibility: true, updatedAt: true });
export const destinationListSchema = z.object({ items: z.array(destinationListItemSchema), page: z.number().int().positive(), hasMore: z.boolean() }).strict();
export type DestinationList = z.infer<typeof destinationListSchema>;
export const unknownSchedule = (): DestinationInput["openingDays"] => weekdays.map(dayOfWeek => ({ dayOfWeek, status: "UNKNOWN", intervals: [] }));
