import { describe, it, expect, vi } from "vitest";
import Ajv from "ajv";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/components/map/destination-map", () => ({ default: () => null }));
import { bacMeContext, bacMeCandidates } from "./__fixtures__/bac-me-v4";
import { autoLayoutV2, resolveEditorial } from "./editorial-engine";
import { buildCanonicalContentAst } from "./editorial-ast";
import { proposeEditorial } from "./editorial-ai";
import { acceptedEditorialProposal } from "./editorial-proposal-result";
import { compileEditorialLayout } from "./editorial-compiler";
import { evaluateLayoutQuality } from "./editorial-quality-gate";
import { getLayoutSignature, compareLayoutSignatures } from "./editorial-signature";
import { v3TestStore } from "../destination/__fixtures__/v3-store";
import { writeDestination } from "../destination/destination-service";
import { readEditorialContext } from "./editorial-service";
import { normalizeEditorialText } from "./editorial-content";
import type { EditorialLayoutV2, EditorialNodeV2 } from "./editorial-contract";
import EditorialRenderer from "@/components/editorial/editorial-renderer";

function wireResponse(layout: EditorialLayoutV2, schema: any): unknown {
  const node = (value: EditorialNodeV2, shape: any): unknown => Object.fromEntries(Object.entries(shape.properties).map(([key, spec]: [string, any]) => [key,
    key === "children" ? (value.children ?? []).map(child => node(child, spec.items))
      : (value as any)[key] ?? (spec.anyOf ? null : spec.type === "array" ? [] : spec.type === "boolean" ? false : spec.type === "number" ? 50 : spec.enum?.[0] ?? ""),
  ]));
  return { schemaVersion: 2, mode: "GENERATIVE", family: layout.family, variant: layout.variant,
    hero: { composition: layout.hero?.composition ?? "EDITORIAL", locked: false }, design: layout.design,
    sections: layout.sections.map(section => node(section, schema.properties.sections.items)),
  };
}

describe("Căng Bắc Mê final offline acceptance", () => {
  it("V4 generation uses the current tree, renders four fixture compositions, preserves persistence and Undo", async () => {
    const store = v3TestStore();
    const ctx = bacMeContext;
    const created = await writeDestination(new Headers(), { name: ctx.name, description: ctx.description, category: ctx.category,
      area: ctx.area, latitude: ctx.latitude, longitude: ctx.longitude, suggestedDurationMinutes: 60, minimumDurationMinutes: 20,
      openingDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(dayOfWeek => ({ dayOfWeek, status: "UNKNOWN", intervals: [] })),
    }, "create", null, store.deps);
    if (created.status !== "SUCCESS") throw new Error("Fixture setup failed");
    const id = created.data.id, row = store.rows().get(id);
    row.media.push(...ctx.media.map((media, position) => ({ ...media, position, destinationId: id, rightsEvidence: "Owner DOM fixture only" })));
    row.sources.push(...ctx.sources.map(source => ({ ...source, rightsEvidence: "Owner DOM fixture only" })));
    const context = await readEditorialContext(id, store.deps.database);
    const ast = buildCanonicalContentAst(context);
    let current = autoLayoutV2(context);
    const initial = structuredClone(current), persistedBefore = structuredClone(row);
    const candidates = bacMeCandidates(context);
    const undo: EditorialLayoutV2[] = [];
    const ajv = new Ajv({ strict: false });
    for (let index = 0; index < 4; index++) {
      const mode = "PROPOSE";
      const complete = vi.fn(async (input: any) => {
        const payload = JSON.parse(input.user);
        expect(payload.mode).toBe(mode);
        expect(payload.currentLayout.sections.map((n: any) => n.id)).toEqual(current.sections.map(n => n.id));
        const output = wireResponse(candidates[index]!, input.jsonSchema);
        const valid = ajv.compile(input.jsonSchema);
        expect(valid(output), JSON.stringify(valid.errors)).toBe(true);
        return { rawText: JSON.stringify(output), model: "gpt-6-luna" };
      });
      const result = await proposeEditorial(new Headers(), id, store.deps, { complete }, { layout: current, version: 2, mode, direction: "AUTO" });
      expect(result.status, JSON.stringify(result)).toBe("PROPOSED");
      expect(complete).toHaveBeenCalledOnce();
      const accepted = acceptedEditorialProposal(result, current, context, "AUTO", mode);
      expect(accepted).not.toBeNull();
      const next = accepted!;
      const compiled = compileEditorialLayout(next, context, { ast });
      const quality = evaluateLayoutQuality(next, context, { ast, compiled });
      expect(quality.passed, JSON.stringify(quality.issues)).toBe(true);
      expect(quality.metrics.contentPreservationRatio).toBe(1);
      const html = renderToStaticMarkup(React.createElement(EditorialRenderer, { data: context, editorial: resolveEditorial(next, context)! }));
      const renderedText = normalizeEditorialText(html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&quot;/g, " ").replace(/&amp;/g, "&"));
      for (const unit of ast.units.filter(u => u.provenance.sourceField === "description")) expect(renderedText).toContain(normalizeEditorialText(unit.text));
      expect((html.match(/<img /g) ?? []).length).toBe(context.media.length);
      const effective = (l: EditorialLayoutV2) => ({ ...l, sections: compileEditorialLayout(l, context).nodes as EditorialNodeV2[] });
      const diff = compareLayoutSignatures(getLayoutSignature(effective(current)), getLayoutSignature(effective(next)));
      if (index > 0) expect(diff.level).toBe("SIGNIFICANT");
      undo.push(current); current = next;
      expect(row).toEqual(persistedBefore);
    }
    for (let index = 3; index >= 0; index--) current = undo.pop()!;
    expect(current).toEqual(initial);
    expect(row).toEqual(persistedBefore);
  });
});
