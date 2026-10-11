import type { ExtractionResult } from "./preference-extraction-contract";
import type { TripRequirementFormFields } from "../trip-requirement/trip-requirement-form-logic";

export const EXTRACTION_SUGGESTION_FIELDS = [
  "startDate",
  "durationDays",
  "transport",
  "companionType",
  "companionGroupSize",
  "interests",
  "pace",
  "mobilityFlags",
  "mobilityNote",
] as const;

export type ExtractionSuggestionField = (typeof EXTRACTION_SUGGESTION_FIELDS)[number];
export type ExtractionSuggestionValue = string | string[];

export type ExtractionSuggestion = {
  field: ExtractionSuggestionField;
  value: ExtractionSuggestionValue;
  sourceText: string;
  status: "APPLIED" | "PENDING";
};

export type ExtractionSuggestions = Partial<
  Record<ExtractionSuggestionField, ExtractionSuggestion>
>;

export type ApplyExtractionResult = {
  fields: TripRequirementFormFields;
  suggestions: ExtractionSuggestions;
};

function isEmpty(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length === 0 : value.trim() === "";
}

function sameValue(left: string | string[], right: string | string[]): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function setField(
  fields: TripRequirementFormFields,
  field: ExtractionSuggestionField,
  value: ExtractionSuggestionValue,
): void {
  switch (field) {
    case "interests":
      fields.interests = [...(value as string[])];
      break;
    case "mobilityFlags":
      fields.mobilityFlags = [...(value as string[])];
      break;
    case "startDate":
      fields.startDate = value as string;
      break;
    case "durationDays":
      fields.durationDays = value as string;
      break;
    case "transport":
      fields.transport = value as string;
      break;
    case "companionType":
      fields.companionType = value as string;
      break;
    case "companionGroupSize":
      fields.companionGroupSize = value as string;
      break;
    case "pace":
      fields.pace = value as string;
      break;
    case "mobilityNote":
      fields.mobilityNote = value as string;
      break;
  }
}

function getField(
  fields: TripRequirementFormFields,
  field: ExtractionSuggestionField,
): ExtractionSuggestionValue {
  switch (field) {
    case "interests": return fields.interests;
    case "mobilityFlags": return fields.mobilityFlags;
    case "startDate": return fields.startDate;
    case "durationDays": return fields.durationDays;
    case "transport": return fields.transport;
    case "companionType": return fields.companionType;
    case "companionGroupSize": return fields.companionGroupSize;
    case "pace": return fields.pace;
    case "mobilityNote": return fields.mobilityNote;
  }
}

function addCandidate(
  fields: TripRequirementFormFields,
  suggestions: ExtractionSuggestions,
  field: ExtractionSuggestionField,
  value: ExtractionSuggestionValue,
  sourceText: string,
): void {
  if (isEmpty(value)) return;
  const current = getField(fields, field);
  const suggestion: ExtractionSuggestion = {
    field,
    value: Array.isArray(value) ? [...value] : value,
    sourceText,
    status: "PENDING",
  };
  if (isEmpty(current)) {
    setField(fields, field, suggestion.value);
    suggestion.status = "APPLIED";
  } else if (sameValue(current, suggestion.value)) {
    return;
  }
  suggestions[field] = suggestion;
}

/**
 * Apply only verified EXTRACTED values to empty US-24 controls. Conflicting
 * values remain pending until the user explicitly chooses them.
 */
export function applyExtractionToForm(
  currentFields: TripRequirementFormFields,
  result: ExtractionResult,
): ApplyExtractionResult {
  const fields = {
    ...currentFields,
    interests: [...currentFields.interests],
    mobilityFlags: [...currentFields.mobilityFlags],
  };
  const suggestions: ExtractionSuggestions = {};

  const startDate = result.fields.startDate;
  if (startDate.status === "EXTRACTED") {
    addCandidate(fields, suggestions, "startDate", startDate.value, startDate.sourceText);
  }
  const durationDays = result.fields.durationDays;
  if (durationDays.status === "EXTRACTED") {
    addCandidate(fields, suggestions, "durationDays", String(durationDays.value), durationDays.sourceText);
  }
  const transport = result.fields.transport;
  if (transport.status === "EXTRACTED") {
    addCandidate(fields, suggestions, "transport", transport.value, transport.sourceText);
  }
  const companions = result.fields.companions;
  if (companions.status === "EXTRACTED") {
    addCandidate(fields, suggestions, "companionType", companions.value.type, companions.sourceText);
    addCandidate(fields, suggestions, "companionGroupSize", String(companions.value.groupSize), companions.sourceText);
  }
  const interests = result.fields.interests;
  if (interests.status === "EXTRACTED") {
    addCandidate(fields, suggestions, "interests", [...interests.value], interests.sourceText);
  }
  const pace = result.fields.pace;
  if (pace.status === "EXTRACTED") {
    addCandidate(fields, suggestions, "pace", pace.value, pace.sourceText);
  }
  const mobility = result.fields.mobilityConstraints;
  if (mobility.status === "EXTRACTED") {
    addCandidate(fields, suggestions, "mobilityFlags", [...mobility.value.flags], mobility.sourceText);
    if (mobility.value.note) {
      addCandidate(fields, suggestions, "mobilityNote", mobility.value.note, mobility.sourceText);
    }
  }

  return { fields, suggestions };
}

export function useExtractionSuggestion(
  currentFields: TripRequirementFormFields,
  currentSuggestions: ExtractionSuggestions,
  field: ExtractionSuggestionField,
): ApplyExtractionResult {
  const suggestion = currentSuggestions[field];
  if (!suggestion || suggestion.status !== "PENDING") {
    return { fields: currentFields, suggestions: currentSuggestions };
  }
  const fields = {
    ...currentFields,
    interests: [...currentFields.interests],
    mobilityFlags: [...currentFields.mobilityFlags],
  };
  setField(fields, field, suggestion.value);
  return {
    fields,
    suggestions: {
      ...currentSuggestions,
      [field]: { ...suggestion, status: "APPLIED" },
    },
  };
}

/** Remove a user-visible suggestion; revert an untouched auto-filled field. */
export function dismissExtractionSuggestion(
  currentFields: TripRequirementFormFields,
  currentSuggestions: ExtractionSuggestions,
  field: ExtractionSuggestionField,
): ApplyExtractionResult {
  const suggestion = currentSuggestions[field];
  if (!suggestion) return { fields: currentFields, suggestions: currentSuggestions };
  const fields = {
    ...currentFields,
    interests: [...currentFields.interests],
    mobilityFlags: [...currentFields.mobilityFlags],
  };
  if (suggestion.status === "APPLIED" && sameValue(getField(fields, field), suggestion.value)) {
    setField(fields, field, Array.isArray(suggestion.value) ? [] : "");
  }
  const { [field]: _removed, ...suggestions } = currentSuggestions;
  return { fields, suggestions };
}

/** Remove an applied label as soon as the user edits its corresponding field. */
export function removeExtractionSuggestion(
  suggestions: ExtractionSuggestions,
  field: string,
): ExtractionSuggestions {
  const keys = new Set<ExtractionSuggestionField>();
  if (field === "startDate" || field === "durationDays" || field === "transport" || field === "pace") {
    keys.add(field);
  } else if (field === "companions.type") {
    keys.add("companionType");
  } else if (field === "companions.groupSize") {
    keys.add("companionGroupSize");
  } else if (field === "interests") {
    keys.add("interests");
  } else if (field === "mobilityConstraints.flags") {
    keys.add("mobilityFlags");
  } else if (field === "mobilityConstraints.note") {
    keys.add("mobilityNote");
  }
  const next = { ...suggestions };
  for (const key of keys) delete next[key];
  return next;
}
