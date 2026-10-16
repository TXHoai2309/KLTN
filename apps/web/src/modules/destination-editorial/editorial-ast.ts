import { createHash } from "node:crypto";
import { buildEditorialContentUnits } from "./editorial-content-units";
import type { EditorialContext } from "./editorial-contract";
import type { CanonicalContentAst as ContentUnits } from "./editorial-content-units";
export type { ContentAstUnitType } from "./editorial-content-units";
export type ContentAstUnit = ContentUnits["units"][number] & { hash: string };
export type CanonicalContentAst = Omit<ContentUnits, "units"> & { units: ContentAstUnit[] };

/** Hash only on the server; browser composition uses the identical canonical units. */
export function buildCanonicalContentAst(context: EditorialContext): CanonicalContentAst {
  const ast = buildEditorialContentUnits(context);
  return { ...ast, units: ast.units.map(unit => ({ ...unit,
    hash: createHash("sha256").update((unit.type === "CITATION" ? unit.title ?? unit.text : unit.text).normalize("NFC").trim()).digest("hex").slice(0, 12),
  })) };
}
export function getAstUnit(ast: CanonicalContentAst, id: string): ContentAstUnit | undefined {
  return ast.units.find(unit => unit.id === id);
}
