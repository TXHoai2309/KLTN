const messages = {
  UNKNOWN_SKILL: "The Assistant skill is not registered.",
  INVALID_CONTEXT: "The Assistant context is invalid.",
  UNKNOWN_ACTION: "The Assistant action is not registered.",
  ACTION_NOT_ALLOWED: "The active skill cannot request this action.",
  INVALID_ACTION_INPUT: "The Assistant action input is invalid.",
  INVALID_ACTION_OUTPUT: "The Assistant action output is invalid.",
  ACTION_EXECUTION_FAILED: "The Assistant action could not complete.",
} as const;

export type AssistantV2ErrorCode = keyof typeof messages;

/** Internal failures are explicit; raw action errors never become response text. */
export class AssistantV2Error extends Error {
  constructor(readonly code: AssistantV2ErrorCode, options?: ErrorOptions) {
    super(messages[code], options);
    this.name = "AssistantV2Error";
  }
}
