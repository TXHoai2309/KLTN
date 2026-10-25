import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanionsEditor, DurationEditor, InterestsEditor, MobilityEditor, PaceEditor, StartDateEditor, TransportEditor } from "./trip-field-editors";

const noop = () => {};
function editors(idPrefix = "trip") {
  const common = { idPrefix, errorId: `${idPrefix}-error`, onChange: noop };
  return createElement(Fragment, null,
    createElement(StartDateEditor, { ...common, value: "2027-03-20" }),
    createElement(DurationEditor, { ...common, value: "2" }),
    createElement(TransportEditor, { ...common, value: "CAR" }),
    createElement(CompanionsEditor, { ...common, typeValue: "", groupSizeValue: "", onTypeChange: noop, onGroupSizeChange: noop, typeErrorId: `${idPrefix}-type-error`, groupSizeErrorId: `${idPrefix}-size-error` }),
    createElement(InterestsEditor, { ...common, value: ["NATURE"] }),
    createElement(PaceEditor, { ...common, value: "" }),
    createElement(MobilityEditor, { ...common, flags: [], note: "", onFlagsChange: noop, onNoteChange: noop, flagsErrorId: `${idPrefix}-flags-error`, noteErrorId: `${idPrefix}-note-error` }),
  );
}

describe("Shared Trip editor accessibility", () => {
  it("keeps form anchors while isolating every review input and description", () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, editors(), editors("trip-review")));
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const prefix of ["trip", "trip-review"]) {
      for (const name of ["start-date", "duration", "transport", "companion-type", "interest-first", "pace", "mobility-first"]) {
        expect(ids).toContain(`${prefix}-${name}`);
      }
    }
    for (const match of html.matchAll(/\sfor="([^"]+)"/g)) expect(ids).toContain(match[1]);
    for (const match of html.matchAll(/\saria-describedby="([^"]+)"/g)) {
      for (const id of match[1]!.split(" ")) expect(ids).toContain(id);
    }
    expect(html).toContain('name="trip-transport"');
    expect(html).toContain('name="trip-review-transport"');
  });

  it("announces the chosen duration and keeps the interests legend directly inside its fieldset", () => {
    const html = renderToStaticMarkup(editors());
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<fieldset id="trip-interest-first"[^>]*><legend/);
    expect(html).toContain("Đã chọn 1 sở thích");
  });

  it("uses the same vector icon system for every canonical option", () => {
    const html = renderToStaticMarkup(editors());
    expect(html).toContain("lucide-accessibility");
    expect(html).toContain("lucide-baby");
    expect(html).toContain("lucide-footprints");
    expect(html).not.toMatch(/⚠️|🌟|🏃|🏔️/u);
  });
});
