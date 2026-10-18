import { z } from "zod";

/**
 * US-24 contract only. This module is intentionally client-safe: it does not
 * import server-only code, persistence, auth or API helpers.
 */

export const TRIP_REQUIREMENT_VALIDATION_ERROR_CODE = "VALIDATION_ERROR" as const;

export const MIN_DURATION_DAYS = 1;
export const MAX_DURATION_DAYS = 14;
export const MIN_GROUP_SIZE = 1;
export const MAX_GROUP_SIZE = 20;
export const MAX_INTERESTS = 8;
export const MAX_MOBILITY_FLAGS = 6;
export const MAX_NOTE_LENGTH = 500;

export const TRANSPORT_VALUES = ["MOTORCYCLE", "CAR"] as const;
export type TripTransport = (typeof TRANSPORT_VALUES)[number];

export const COMPANION_TYPE_VALUES = [
  "SOLO",
  "COUPLE",
  "FAMILY",
  "FRIENDS",
  "OTHER",
] as const;
export type CompanionType = (typeof COMPANION_TYPE_VALUES)[number];

export const INTEREST_VALUES = [
  "NATURE",
  "CULTURE_HISTORY",
  "ETHNIC_VILLAGES",
  "PHOTOGRAPHY",
  "FOOD",
  "ADVENTURE",
  "RELAXATION",
] as const;
export type TripInterest = (typeof INTEREST_VALUES)[number];

export const PACE_VALUES = ["RELAXED", "MODERATE", "PACKED"] as const;
export type TripPace = (typeof PACE_VALUES)[number];

export const MOBILITY_CONSTRAINT_VALUES = [
  "AVOID_LONG_WALKING",
  "NO_STEEP_TERRAIN",
  "WHEELCHAIR_OR_MOBILITY_AID",
  "YOUNG_CHILDREN",
  "SENIORS",
  "MOTION_SICKNESS",
] as const;
export type MobilityConstraint = (typeof MOBILITY_CONSTRAINT_VALUES)[number];

export const TRIP_REQUIREMENT_VALIDATION_CODES = {
  INVALID_FORM: "INVALID_FORM",
  START_DATE_FORMAT: "START_DATE_FORMAT",
  START_DATE_CALENDAR: "START_DATE_CALENDAR",
  DURATION_REQUIRED: "DURATION_REQUIRED",
  DURATION_RANGE: "DURATION_RANGE",
  TRANSPORT_REQUIRED: "TRANSPORT_REQUIRED",
  TRANSPORT_INVALID: "TRANSPORT_INVALID",
  COMPANIONS_INVALID: "COMPANIONS_INVALID",
  COMPANIONS_GROUP_SIZE: "COMPANIONS_GROUP_SIZE",
  COMPANIONS_RULE: "COMPANIONS_RULE",
  INTERESTS_INVALID: "INTERESTS_INVALID",
  INTERESTS_LIMIT: "INTERESTS_LIMIT",
  PACE_INVALID: "PACE_INVALID",
  MOBILITY_FLAGS_INVALID: "MOBILITY_FLAGS_INVALID",
  MOBILITY_FLAGS_LIMIT: "MOBILITY_FLAGS_LIMIT",
  MOBILITY_NOTE_LENGTH: "MOBILITY_NOTE_LENGTH",
  UNKNOWN_FIELD: "UNKNOWN_FIELD",
} as const;

export type TripRequirementValidationCode =
  (typeof TRIP_REQUIREMENT_VALIDATION_CODES)[keyof typeof TRIP_REQUIREMENT_VALIDATION_CODES];

export const TRIP_REQUIREMENT_ERROR_MESSAGES: Record<
  TripRequirementValidationCode | typeof TRIP_REQUIREMENT_VALIDATION_ERROR_CODE,
  string
> = {
  VALIDATION_ERROR: "Thông tin nhu cầu chuyến đi chưa hợp lệ.",
  INVALID_FORM: "Vui lòng kiểm tra lại thông tin chuyến đi.",
  START_DATE_FORMAT: "Ngày bắt đầu chưa hợp lệ. Vui lòng nhập đủ ngày, tháng và năm.",
  START_DATE_CALENDAR: "Ngày bắt đầu không tồn tại trong lịch.",
  DURATION_REQUIRED: "Vui lòng nhập số ngày chuyến đi.",
  DURATION_RANGE: `Số ngày chuyến đi phải từ ${MIN_DURATION_DAYS} đến ${MAX_DURATION_DAYS} ngày.`,
  TRANSPORT_REQUIRED: "Vui lòng chọn phương tiện di chuyển.",
  TRANSPORT_INVALID: "Phương tiện chỉ được là xe máy hoặc ô tô.",
  COMPANIONS_INVALID: "Thông tin người đi cùng không hợp lệ.",
  COMPANIONS_GROUP_SIZE: `Số người đi cùng phải từ ${MIN_GROUP_SIZE} đến ${MAX_GROUP_SIZE}.`,
  COMPANIONS_RULE: "Số người chưa phù hợp với loại nhóm đã chọn.",
  INTERESTS_INVALID: "Sở thích chuyến đi không hợp lệ.",
  INTERESTS_LIMIT: `Có thể chọn tối đa ${MAX_INTERESTS} sở thích.`,
  PACE_INVALID: "Nhịp độ chuyến đi không hợp lệ.",
  MOBILITY_FLAGS_INVALID: "Ràng buộc di chuyển không hợp lệ.",
  MOBILITY_FLAGS_LIMIT: `Có thể chọn tối đa ${MAX_MOBILITY_FLAGS} ràng buộc di chuyển.`,
  MOBILITY_NOTE_LENGTH: `Ghi chú di chuyển không được quá ${MAX_NOTE_LENGTH} ký tự.`,
  UNKNOWN_FIELD: "Dữ liệu chứa trường không được hỗ trợ.",
};

type TripOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};

export const TRANSPORT_OPTIONS = [
  {
    value: "MOTORCYCLE",
    label: "Xe máy",
    description: "Phù hợp khi muốn chủ động di chuyển trên các cung đường địa phương.",
  },
  {
    value: "CAR",
    label: "Ô tô",
    description: "Phù hợp khi ưu tiên sự thuận tiện và che chắn khi di chuyển.",
  },
] as const satisfies readonly TripOption<TripTransport>[];

export const COMPANION_OPTIONS = [
  { value: "SOLO", label: "Một mình", description: "Chuyến đi chỉ có một người." },
  { value: "COUPLE", label: "Cặp đôi", description: "Chuyến đi dành cho hai người." },
  { value: "FAMILY", label: "Gia đình", description: "Chuyến đi cùng người thân." },
  { value: "FRIENDS", label: "Bạn bè", description: "Chuyến đi cùng nhóm bạn." },
  { value: "OTHER", label: "Khác", description: "Nhóm đồng hành chưa thuộc các lựa chọn trên." },
] as const satisfies readonly TripOption<CompanionType>[];

export const INTEREST_OPTIONS = [
  { value: "NATURE", label: "Thiên nhiên", description: "Núi, thung lũng, ruộng bậc thang và cảnh quan tự nhiên." },
  { value: "CULTURE_HISTORY", label: "Văn hóa - lịch sử", description: "Di sản, lịch sử và đời sống văn hóa địa phương." },
  { value: "ETHNIC_VILLAGES", label: "Bản làng dân tộc", description: "Bản làng, cộng đồng và trải nghiệm địa phương." },
  { value: "PHOTOGRAPHY", label: "Chụp ảnh", description: "Các điểm ngắm cảnh và khoảnh khắc phù hợp để chụp ảnh." },
  { value: "FOOD", label: "Ẩm thực", description: "Món ăn và trải nghiệm ẩm thực địa phương." },
  { value: "ADVENTURE", label: "Khám phá", description: "Trải nghiệm năng động và khám phá ngoài trời." },
  { value: "RELAXATION", label: "Thư giãn", description: "Nhịp điệu nhẹ nhàng, nghỉ ngơi và tận hưởng cảnh quan." },
] as const satisfies readonly TripOption<TripInterest>[];

export const PACE_OPTIONS = [
  { value: "RELAXED", label: "Thư thả", description: "Ít điểm dừng hơn và có nhiều thời gian nghỉ." },
  { value: "MODERATE", label: "Vừa phải", description: "Cân bằng giữa tham quan và thời gian nghỉ." },
  { value: "PACKED", label: "Nhiều trải nghiệm", description: "Ưu tiên nhiều điểm dừng trong ngày." },
] as const satisfies readonly TripOption<TripPace>[];

export const MOBILITY_CONSTRAINT_OPTIONS = [
  { value: "AVOID_LONG_WALKING", label: "Hạn chế đi bộ xa", description: "Ưu tiên điểm đến có quãng đi bộ ngắn." },
  { value: "NO_STEEP_TERRAIN", label: "Tránh địa hình dốc", description: "Hạn chế đường dốc hoặc địa hình khó đi." },
  { value: "WHEELCHAIR_OR_MOBILITY_AID", label: "Xe lăn/dụng cụ hỗ trợ", description: "Cần cân nhắc khả năng tiếp cận cho dụng cụ hỗ trợ di chuyển." },
  { value: "YOUNG_CHILDREN", label: "Có trẻ nhỏ", description: "Cần cân nhắc nhịp độ và điều kiện phù hợp với trẻ nhỏ." },
  { value: "SENIORS", label: "Có người lớn tuổi", description: "Cần cân nhắc nhịp độ và mức vận động phù hợp." },
  { value: "MOTION_SICKNESS", label: "Dễ say xe", description: "Cần cân nhắc quãng đường và cung đường di chuyển." },
] as const satisfies readonly TripOption<MobilityConstraint>[];

const normalizeText = (value: string): string => value.normalize("NFC").trim();
const normalizeNullableText = (value: string): string | null => {
  const normalized = normalizeText(value);
  return normalized === "" ? null : normalized;
};

function canonicalizeEnumList<const T extends readonly string[]>(
  values: readonly T[number][],
  canonicalOrder: T,
): T[number][] {
  const unique = new Set(values);
  return canonicalOrder.filter((value) => unique.has(value));
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= (daysInMonth ?? 0);
}

const startDateSchema = z
  .string()
  .transform(normalizeNullableText)
  .superRefine((value, context) => {
    if (value === null) return;
    if (!ISO_DATE_PATTERN.test(value)) {
      context.addIssue({
        code: "custom",
        message: TRIP_REQUIREMENT_ERROR_MESSAGES.START_DATE_FORMAT,
      });
      return;
    }
    if (!isValidCalendarDate(value)) {
      context.addIssue({
        code: "custom",
        message: TRIP_REQUIREMENT_ERROR_MESSAGES.START_DATE_CALENDAR,
      });
    }
  })
  .nullable()
  .optional()
  .default(null);

const durationDaysSchema = z
  .number({ error: TRIP_REQUIREMENT_ERROR_MESSAGES.DURATION_REQUIRED })
  .int(TRIP_REQUIREMENT_ERROR_MESSAGES.DURATION_RANGE)
  .min(MIN_DURATION_DAYS, TRIP_REQUIREMENT_ERROR_MESSAGES.DURATION_RANGE)
  .max(MAX_DURATION_DAYS, TRIP_REQUIREMENT_ERROR_MESSAGES.DURATION_RANGE);

const transportSchema = z.enum(TRANSPORT_VALUES, {
  error: TRIP_REQUIREMENT_ERROR_MESSAGES.TRANSPORT_INVALID,
});

const companionsSchema = z
  .object({
    type: z.enum(COMPANION_TYPE_VALUES, {
      error: TRIP_REQUIREMENT_ERROR_MESSAGES.COMPANIONS_INVALID,
    }),
    groupSize: z
      .number({ error: TRIP_REQUIREMENT_ERROR_MESSAGES.COMPANIONS_GROUP_SIZE })
      .int(TRIP_REQUIREMENT_ERROR_MESSAGES.COMPANIONS_GROUP_SIZE)
      .min(MIN_GROUP_SIZE, TRIP_REQUIREMENT_ERROR_MESSAGES.COMPANIONS_GROUP_SIZE)
      .max(MAX_GROUP_SIZE, TRIP_REQUIREMENT_ERROR_MESSAGES.COMPANIONS_GROUP_SIZE),
  })
  .strict()
  .superRefine((value, context) => {
    const expectedSize = value.type === "SOLO" ? 1 : value.type === "COUPLE" ? 2 : null;
    if (expectedSize !== null && value.groupSize !== expectedSize) {
      context.addIssue({
        code: "custom",
        path: ["groupSize"],
        message: TRIP_REQUIREMENT_ERROR_MESSAGES.COMPANIONS_RULE,
      });
    } else if (expectedSize === null && value.groupSize < 2) {
      context.addIssue({
        code: "custom",
        path: ["groupSize"],
        message: TRIP_REQUIREMENT_ERROR_MESSAGES.COMPANIONS_RULE,
      });
    }
  });

const interestsSchema = z
  .array(z.enum(INTEREST_VALUES, { error: TRIP_REQUIREMENT_ERROR_MESSAGES.INTERESTS_INVALID }))
  .transform((values) => canonicalizeEnumList(values, INTEREST_VALUES))
  .refine((values) => values.length <= MAX_INTERESTS, {
    message: TRIP_REQUIREMENT_ERROR_MESSAGES.INTERESTS_LIMIT,
  });

const paceSchema = z.enum(PACE_VALUES, {
  error: TRIP_REQUIREMENT_ERROR_MESSAGES.PACE_INVALID,
});

const mobilityFlagsSchema = z
  .array(z.enum(MOBILITY_CONSTRAINT_VALUES, { error: TRIP_REQUIREMENT_ERROR_MESSAGES.MOBILITY_FLAGS_INVALID }))
  .transform((values) => canonicalizeEnumList(values, MOBILITY_CONSTRAINT_VALUES))
  .refine((values) => values.length <= MAX_MOBILITY_FLAGS, {
    message: TRIP_REQUIREMENT_ERROR_MESSAGES.MOBILITY_FLAGS_LIMIT,
  });

const mobilityConstraintsSchema = z
  .object({
    flags: mobilityFlagsSchema,
    note: z
      .string()
      .transform(normalizeNullableText)
      .nullable()
      .optional()
      .default(null)
      .refine((value) => value === null || value.length <= MAX_NOTE_LENGTH, {
        message: TRIP_REQUIREMENT_ERROR_MESSAGES.MOBILITY_NOTE_LENGTH,
      }),
  })
  .strict()
  .transform((value) =>
    value.flags.length === 0 && value.note === null ? null : value,
  );

export const tripRequirementInputSchema = z
  .object({
    startDate: startDateSchema,
    durationDays: durationDaysSchema,
    transport: transportSchema,
    companions: companionsSchema.nullable().optional().default(null),
    interests: interestsSchema.optional().default([]),
    pace: paceSchema.nullable().optional().default(null),
    mobilityConstraints: mobilityConstraintsSchema
      .nullable()
      .optional()
      .default(null),
  })
  .strict();

export type TripRequirementInput = z.infer<typeof tripRequirementInputSchema>;
export type TripRequirementInputRaw = z.input<typeof tripRequirementInputSchema>;

export function tripRequirementFieldErrors(
  error: z.ZodError,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        const prefix = issue.path.map(String).join(".");
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        fieldErrors[fieldPath] ??= TRIP_REQUIREMENT_ERROR_MESSAGES.UNKNOWN_FIELD;
      }
      continue;
    }
    const fieldPath = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    fieldErrors[fieldPath] ??= issue.message;
  }
  return fieldErrors;
}
