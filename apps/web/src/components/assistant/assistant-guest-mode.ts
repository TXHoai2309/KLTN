import type { QaContext } from "../../modules/ai/qa-contract";
import type { AssistantController } from "./assistant-controller";
import { isPlanningRequest } from "./planning-client";

export type GuestSubmitOutcome = "SENT" | "SIGN_IN" | "REJECTED";

/** Wording shown when a guest asks to plan; planning needs an account. */
export const GUEST_SIGN_IN_INVITATION = "Việc lập hoặc chỉnh hành trình cần có tài khoản. Bạn đăng nhập để tiếp tục nhé — mình sẽ giữ lại yêu cầu của bạn. Trong lúc này, bạn vẫn có thể hỏi mình về Hà Giang.";

const FACTUAL_QUESTION = /có gì|ở đâu|bao nhiêu|giờ mở cửa|giá vé|lịch sử|như thế nào|là gì|\?\s*$/iu;

/** Conservative: only a clear planning request that is not a factual question is routed to sign-in. */
export function isGuestPlanningRequest(text: string): boolean {
  return isPlanningRequest(text) && !FACTUAL_QUESTION.test(text);
}

/** Guest mode is Q&A only: a message is either a Q&A request or a sign-in invitation, never a planning call. */
export function submitGuestMessage(input: {
  controller: AssistantController;
  text: string;
  context: QaContext;
  retain: (text: string, context: QaContext) => void;
}): GuestSubmitOutcome {
  const text = input.text.trim();
  if (text && isGuestPlanningRequest(text)) {
    input.retain(text, input.context);
    return "SIGN_IN";
  }
  input.controller.setDraft(input.text);
  return input.controller.submit() ? "SENT" : "REJECTED";
}
