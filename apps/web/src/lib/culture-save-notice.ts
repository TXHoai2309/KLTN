// Only a confirmed mutation may create this one-time navigation notice.
let pending: string | null = null;
export function markCultureSaved(created: boolean) { pending = created ? "Đã tạo nội dung văn hóa." : "Đã cập nhật nội dung văn hóa."; }
export function takeCultureSaved() { const value = pending; pending = null; return value; }
