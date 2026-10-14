import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { mvpFeatures } from "@/lib/mvp-features";
it("Culture presentation defaults OFF while legacy pages/APIs/schema remain", async () => {
  expect(mvpFeatures.culture).toBe(false);
  for (const path of [
    "../../components/header.tsx",
    "../../components/user-menu.tsx",
    "../../app/page.tsx",
    "../../app/explore/page.tsx",
    "../../app/explore/loading.tsx",
    "../../app/destinations/[id]/destination-detail.tsx",
    "../../app/favorites/favorites-view.tsx",
  ]) {
    expect(await readFile(new URL(path, import.meta.url), "utf8")).toContain(
      "mvpFeatures.culture",
    );
  }
  for (const path of [
    "../../app/culture/page.tsx",
    "../../app/culture/[slug]/page.tsx",
  ]) {
    expect(await readFile(new URL(path, import.meta.url), "utf8")).toContain(
      'if (!mvpFeatures.culture) redirect("/explore")',
    );
  }
  for (const path of [
    "../../app/api/culture/route.ts",
    "../../app/api/admin/culture/route.ts",
    "../culture/culture-service.ts",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    expect(source).not.toContain("mvpFeatures");
  }
});
