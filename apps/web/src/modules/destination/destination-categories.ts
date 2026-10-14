/** Owner-approved Destination taxonomy; Culture has its own independent taxonomy. */
export const destinationCategories = [
  "công viên địa chất",
  "thiên nhiên – thắng cảnh",
  "di tích lịch sử – kiến trúc",
  "làng du lịch – bản làng",
  "chợ phiên",
  "điểm trải nghiệm du lịch",
] as const;
export const DEFAULT_DESTINATION_AREA = "khu vực hà giang";
export const isDestinationCategory = (value: string) =>
  destinationCategories.some((category) => category === value);
