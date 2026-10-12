export const CULTURE_CATEGORIES: { value: string; label: string }[] = [
  { value: "le-hoi", label: "Lễ hội" },
  { value: "phong-tuc-tap-quan", label: "Phong tục và tập quán" },
  { value: "tin-nguong-nghi-le", label: "Tín ngưỡng và nghi lễ" },
  { value: "am-thuc", label: "Ẩm thực" },
  { value: "trang-phuc-truyen-thong", label: "Trang phục truyền thống" },
  { value: "kien-truc-nha-o", label: "Kiến trúc và nhà ở" },
  { value: "nghe-thuat-bieu-dien", label: "Nghệ thuật và biểu diễn dân gian" },
  { value: "nghe-thu-cong", label: "Nghề thủ công và làng nghề" },
  { value: "di-san-tri-thuc", label: "Di sản và tri thức dân gian" },
  { value: "doi-song-cong-dong", label: "Đời sống cộng đồng" },
  { value: "van-hoa-khac", label: "Văn hóa khác" },
];

/**
 * Resolve a stored value (key or free-text legacy) to a display label.
 * For legacy free-text categories not in the standard list, return them as-is.
 */
export function resolveCategoryLabel(value: string | null): string {
  if (!value) return "";
  const found = CULTURE_CATEGORIES.find((c) => c.value === value);
  return found ? found.label : value; // Display legacy values as-is
}

export function normalizeCultureCategorySearch(s: string) {
  // Normalize for search: remove diacritics, lowercase
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

// Canonicalize only exact spelling/diacritic equivalents; unknown legacy stays intact.
export function canonicalCultureCategory(value: string | null): string | null {
  if (value === null) return null;
  const normalized = normalizeCultureCategorySearch(value).replace(/\s+/g, " ");
  return (
    CULTURE_CATEGORIES.find(
      (c) =>
        normalizeCultureCategorySearch(c.label) === normalized ||
        c.value === normalized,
    )?.value ?? value
  );
}
