export const normalizePlanningReply = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[.!?,;:]/g, " ").replace(/\s+/g, " ").trim();
