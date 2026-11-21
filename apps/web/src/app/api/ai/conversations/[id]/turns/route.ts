import { withQaHttp } from "../../../../../../modules/ai/qa-runtime";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return withQaHttp(async qaHttp => qaHttp.conversationTurns(request, (await context.params).id));
}
