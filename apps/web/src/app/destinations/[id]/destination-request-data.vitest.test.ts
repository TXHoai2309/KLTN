import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/server/http/app-error";

const reads = vi.hoisted(() => ({ destination: vi.fn(), editorial: vi.fn(), missing: new Error("framework notFound") }));
vi.mock("@/services", () => ({ db: {} }));
vi.mock("@/modules/destination/public-destination-service", () => ({ getPublicDestination: reads.destination }));
vi.mock("@/modules/destination-editorial/editorial-service", () => ({ readPublicEditorial: reads.editorial }));
vi.mock("next/navigation", () => ({ notFound: () => { throw reads.missing; } }));
vi.mock("./destination-detail", () => ({ default: () => null, DetailState: () => null }));
import Page from "./page";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const request = () => ({ params: Promise.resolve({ id: "public-fixture" }), searchParams: Promise.resolve({ returnTo: "/explore?q=fixture" }) });
beforeEach(() => {
  vi.clearAllMocks();
  reads.destination.mockResolvedValue({ id: "public-fixture" });
  reads.editorial.mockResolvedValue(null);
});

it("starts both independently guarded public reads before either finishes, then renders their combined result", async () => {
  const destination = deferred<object>(), editorial = deferred<object>();
  reads.destination.mockReturnValue(destination.promise);
  reads.editorial.mockReturnValue(editorial.promise);
  let returned = false;
  const page = Page(request()).then(value => { returned = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  try {
    expect(reads.destination).toHaveBeenCalledWith("public-fixture", expect.anything());
    expect(reads.editorial).toHaveBeenCalledWith("public-fixture", expect.anything());
    expect(returned).toBe(false);
  } finally {
    destination.resolve({ id: "public-fixture" });
    editorial.resolve({ layout: "published fixture" });
  }
  const element = await page;
  expect(element.props.destination).toEqual({ id: "public-fixture" });
  expect(element.props.editorial).toEqual({ layout: "published fixture" });
  expect(element.props.returnTo).toBe("/explore?q=fixture");
});

it("keeps standard detail when the editorial service returns its null fallback", async () => {
  const element = await Page(request());
  expect(element.props.destination).toEqual({ id: "public-fixture" });
  expect(element.props.editorial).toBeNull();
});

it("never renders the editorial result when canonical detail is unavailable", async () => {
  reads.destination.mockRejectedValue(new AppError("DESTINATION_UNAVAILABLE", "Unavailable", 410));
  reads.editorial.mockResolvedValue({ layout: "must not escape" });
  const element = await Page(request());
  expect(element.props.state).toBe("unavailable");
  expect(element.props).not.toHaveProperty("editorial");
  expect(element.props).not.toHaveProperty("destination");
});

it("preserves canonical not-found and database-error control flow", async () => {
  reads.destination.mockRejectedValueOnce(new AppError("DESTINATION_NOT_FOUND", "Missing", 404));
  await expect(Page(request())).rejects.toBe(reads.missing);
  const outage = new Error("synthetic database outage");
  reads.destination.mockRejectedValueOnce(outage);
  await expect(Page(request())).rejects.toBe(outage);
});
