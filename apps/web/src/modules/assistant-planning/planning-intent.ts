/** Shared recognition only; authorization and execution remain server-owned. */
export const isPlanningRequest = (text: string) => /(?:lập|lên|tạo|lên kế hoạch|sắp xếp).{0,30}(?:hành trình|hành trinh|hành hình di chuyển|hình trình|lịch trình|chuyến đi|kế hoạch)|(?:muốn|dự định|định|giúp).{0,30}(?:đi|du lịch).{0,40}\d+\s*ngày/iu.test(text);
