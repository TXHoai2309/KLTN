import { z } from "zod";
export const communeSchema = z.object({
  code: z.string().regex(/^\d+$/u),
  name: z.string().min(1).max(200),
  provinceCode: z.literal("08"),
  provinceName: z.string().min(1).max(200),
});
export type Commune = z.infer<typeof communeSchema>;
export const addressSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/đ/giu, "d")
    .toLocaleLowerCase("vi")
    .trim();
export function formatDestinationAddress(
  detail: string,
  commune?: Pick<Commune, "name" | "provinceName">,
) {
  return [
    detail.trim().replace(/\s+/gu, " "),
    commune?.name,
    commune?.provinceName,
  ]
    .filter(Boolean)
    .join(", ");
}
