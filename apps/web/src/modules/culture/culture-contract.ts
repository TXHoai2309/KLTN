import { z } from "zod";

const text = (max: number) => z.string().transform(value => value.normalize("NFC").trim()).pipe(z.string().min(1, "Không được để trống.").max(max, `Tối đa ${max} ký tự.`));
const optionalText = (max: number) => z.string().transform(value => value.normalize("NFC").trim() || null).pipe(z.string().max(max).nullable()).nullable();
export const cultureIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/, "ID không hợp lệ.");
export const cultureVisibilitySchema = z.enum(["HIDDEN", "VISIBLE"]);
export const sourceUrlSchema = optionalText(2000).refine(value => {
  if (value === null) return true;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password && !/[\u0000-\u0020\u007f]/.test(value); }
  catch { return false; }
}, "Liên kết nguồn phải là URL http/https hợp lệ, không chứa thông tin đăng nhập.");
export const cultureInputSchema = z.object({
  title: text(200), content: text(20000), sourceTitle: optionalText(300), sourceUrl: sourceUrlSchema,
  destinationIds: z.array(cultureIdSchema).max(100).transform(ids => [...new Set(ids)].sort()),
}).strict();
export type CultureInput = z.infer<typeof cultureInputSchema>;
export const cultureVisibilityInputSchema = z.object({ visibility: cultureVisibilitySchema }).strict();
export const cultureDestinationSchema = z.object({ id: cultureIdSchema, name: z.string().min(1).max(200) }).strict();
export const cultureDtoSchema = cultureInputSchema.extend({ id: cultureIdSchema, visibility: cultureVisibilitySchema, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), destinations: z.array(cultureDestinationSchema).max(100) }).strict();
export type CultureDto = z.infer<typeof cultureDtoSchema>;
export const cultureListItemSchema = cultureDtoSchema.pick({ id: true, title: true, sourceTitle: true, sourceUrl: true, visibility: true, updatedAt: true, destinations: true });
export const cultureListSchema = z.object({ items: z.array(cultureListItemSchema).max(25), page: z.number().int().min(1).max(10000), hasMore: z.boolean() }).strict();
export type CultureList = z.infer<typeof cultureListSchema>;
export const destinationLookupSchema = z.object({ items: z.array(cultureDestinationSchema).max(25), hasMore: z.boolean() }).strict();
export const publicCultureSummarySchema = z.object({ id: cultureIdSchema, title: text(200), excerpt: z.string().max(280), sourceTitle: optionalText(300), sourceUrl: sourceUrlSchema }).strict();
