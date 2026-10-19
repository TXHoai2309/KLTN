import { qaHttp } from "../../../../modules/ai/qa-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return qaHttp.listConversations(request);
}
