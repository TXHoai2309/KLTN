import type { PlanningPreferenceReply } from "../../modules/assistant-planning/planning-preferences";
import { planningExclusiveTexts } from "../../modules/assistant-planning/planning-preferences";

export type PlanningDraftSuggestion = Pick<PlanningPreferenceReply, "text" | "interest" | "exclusive">;
const normalize = (text: string) => text.normalize("NFC").toLocaleLowerCase("vi");
const interestSentence = (line: string) => /^(Mình thích trải nghiệm )([^.!?\r\n]+)([.!?]?)$/iu.exec(line);

export function hasPlanningDraftSuggestion(draft: string, suggestion: PlanningDraftSuggestion) {
  if (!suggestion.interest) return normalize(draft).includes(normalize(suggestion.text));
  return draft.split("\n").some(line => interestSentence(line)?.[2]?.split(",").some(value => normalize(value.trim()) === normalize(suggestion.interest!)));
}

export function appendPlanningDraftSuggestion(draft: string, suggestion: PlanningDraftSuggestion) {
  if (suggestion.exclusive) {
    const options = new Set(planningExclusiveTexts(suggestion.exclusive).map(normalize));
    const lines = draft.split("\n");
    const matches = (line: string) => options.has(normalize(line.trim())) || suggestion.exclusive === "companions" && /^Nhóm mình có \d+ người$/iu.test(line.trim());
    const index = lines.findIndex(matches);
    if (index !== -1) return lines.flatMap((line, i) => i === index ? [suggestion.text] : matches(line) ? [] : [line]).join("\n");
  }
  if (hasPlanningDraftSuggestion(draft, suggestion)) return draft;
  if (suggestion.interest) {
    const lines = draft.split("\n");
    const index = lines.findLastIndex(line => interestSentence(line));
    if (index !== -1) {
      const sentence = interestSentence(lines[index]!)!;
      lines[index] = `${sentence[1]}${sentence[2]}, ${suggestion.interest}${sentence[3]}`;
      return lines.join("\n");
    }
  }
  return `${draft}${draft && !draft.endsWith("\n") ? "\n" : ""}${suggestion.text}`;
}
