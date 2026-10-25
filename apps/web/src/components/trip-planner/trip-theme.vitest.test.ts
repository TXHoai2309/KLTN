import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { ThemeProvider } from "../theme-provider";
import { mapStyle, stadiaStyles } from "@/modules/map/map-config";

function declaration(path: string, selector: string, property: string) {
 const css = postcss.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
 let value: string | undefined;
 css.walkRules(rule => { if (rule.selector === selector && value === undefined) rule.walkDecls(property, decl => { value = decl.value; }); });
 return value;
}

describe("Trip theme integration", () => {
 it("form background/card/text follow global color-scheme while preserving Light values", () => {
  expect(declaration("../../app/trips/new/trip-form.css", ".trip-shell", "color-scheme")).toBe("light");
  expect(declaration("../../app/trips/new/trip-form.css", ".dark .trip-shell", "color-scheme")).toBe("dark");
  expect(declaration("../../app/trips/new/trip-form.css", ".trip-shell", "background")).toBe("light-dark(#f7f6f2, var(--background))");
  expect(declaration("../../app/trips/new/trip-form.css", ".trip-natural-language", "background")).toBe("var(--card)");
  expect(declaration("../../app/trips/new/trip-form.css", ".trip-shell", "color")).toBe("light-dark(#1d2521, var(--foreground))");
 });
 it("error/warning feedback has an adaptive surface, not an unconditional light fill", () => {
  expect(declaration("../../app/trips/new/trip-form.css", ".trip-natural-language-status-failure", "background")).toContain("light-dark(");
  expect(declaration("../../app/trips/new/trip-form.css", ".trip-clarification-panel", "background")).toContain("light-dark(");
 });
 it("planner loading/map overlay and status badges adapt without changing geometry", () => {
  expect(declaration("./trip-planner.css", ".planner-loading", "background")).toBe("var(--planner-surface)");
  expect(declaration("./trip-planner.css", ".planner-map-state", "background")).toContain("light-dark(");
  expect(declaration("./trip-planner.css", ".planner-badge-pass", "color")).toContain("light-dark(");
  expect(declaration("./trip-planner.css", ".planner-grid", "grid-template-columns")).toBe("minmax(0, 0.95fr) minmax(0, 1.05fr)");
 });
 it("standalone regeneration error can resolve its surface outside planner-page", () => {
  expect(declaration("./trip-planner.css", ".planner-error", "--planner-surface")).toBe("var(--card)");
 });
 it("floating regeneration progress can resolve its surface outside planner-page", () => {
  expect(declaration("./trip-planner.css", ".planner-progress", "--planner-surface")).toBe("var(--card)");
 });
 it("active day helper text uses dark ink on the pale dark-mode accent", () => {
  expect(declaration("./trip-planner.css", '.planner-day-tabs button[aria-selected="true"]', "color")).toBe("light-dark(#e2f2e8, #102018)");
 });
 it.each([
  ["system", false, "light"], ["system", true, "dark"], ["light", true, "light"], ["dark", false, "dark"], [null, true, "dark"], [null, false, "light"],
 ] as const)("actual next-themes pre-paint script resolves stored %s / OS dark=%s to %s", (stored, osDark, expected) => {
  const html = renderToStaticMarkup(createElement(ThemeProvider, { attribute: "class", defaultTheme: "system", enableSystem: true }, createElement("div", null, "Trip")));
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1]; expect(script).toBeTruthy();
  const classes = new Set<string>(); const style = { colorScheme: "" };
  runInNewContext(script!, { document: { documentElement: { classList: { remove: (...values: string[]) => values.forEach(value => classes.delete(value)), add: (value: string) => classes.add(value) }, style } }, localStorage: { getItem: () => stored }, window: { matchMedia: () => ({ matches: osDark }) } });
  expect([...classes]).toEqual([expected]); expect(style.colorScheme).toBe(expected);
 });
 it("uses existing Stadia styles for resolved system/manual themes", () => {
  expect(mapStyle("light")).toBe(stadiaStyles.light); expect(mapStyle("dark")).toBe(stadiaStyles.dark);
 });
});
