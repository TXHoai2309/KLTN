import { withQaHttp } from "../../../../modules/ai/qa-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withQaHttp(qaHttp => qaHttp.listConversations(request));
}
