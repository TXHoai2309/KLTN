import { z } from "zod";

export const accountNameSchema = z.string().trim().min(2, "Họ và tên phải có ít nhất 2 ký tự.").max(100, "Họ và tên không được quá 100 ký tự.");
export const updateAccountSchema = z.object({ name: accountNameSchema }).strict();
export const accountDtoSchema = z.object({
  name: z.string(),
  email: z.string(),
  role: z.enum(["TRAVELER", "ADMIN"]),
  createdAt: z.iso.datetime(),
}).strict();
export type AccountDto = z.infer<typeof accountDtoSchema>;
export const ACCOUNT_UPDATE_ERROR = "Không thể cập nhật thông tin. Vui lòng kiểm tra lại và thử lại.";
