import type { Database } from "@KLTN/db";
import { visibleCultureWhere, publicCultureSelect } from "./culture-eligibility";
import { sourceUrlSchema } from "./culture-contract";
import { AppError } from "../../server/http/app-error";

/** Minimal original-object read for Favorite navigation, not a snapshot. */
export async function readPublicCultureDetail(id: string, database: Pick<Database,"cultureContent">) {
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new AppError("CULTURE_NOT_FOUND","Nội dung văn hóa không còn khả dụng hoặc không tồn tại.",404);
  const row=await database.cultureContent.findFirst({where:{id,...visibleCultureWhere},select:publicCultureSelect});
  if(!row) throw new AppError("CULTURE_NOT_FOUND","Nội dung văn hóa không còn khả dụng hoặc không tồn tại.",404);
  return {id:row.id,title:row.title,content:row.content,sourceTitle:row.sourceTitle,sourceUrl:sourceUrlSchema.safeParse(row.sourceUrl).success?row.sourceUrl:null};
}
