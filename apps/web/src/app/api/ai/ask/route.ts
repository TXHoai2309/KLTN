import { qaHttp } from "../../../../modules/ai/qa-runtime";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: Request) => qaHttp.ask(request);
