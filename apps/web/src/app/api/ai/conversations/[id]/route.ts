import { qaHttp } from "../../../../../modules/ai/qa-runtime";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return qaHttp.conversation(request, (await context.params).id, false);
}

export async function PATCH(request: Request, context: Context) {
  return qaHttp.renameConversation(request, (await context.params).id);
}

export async function DELETE(request: Request, context: Context) {
  return qaHttp.conversation(request, (await context.params).id, true);
}
