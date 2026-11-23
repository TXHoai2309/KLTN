import { describe, expect, it } from "vitest";
import {
  cleanAreaDisplayLabel,
  cleanOvernightAreaLabel,
  cleanPlaceDisplayName,
  cleanTravelerDisplay,
  isGenericActivityPlaceName,
  resolveOvernightAreaLabel,
} from "./traveler-display-clean";

describe("Ticket 04: traveler display cleanup helpers", () => {
  it("strips [Tạm] prefix and normalizes spacing on place names", () => {
    expect(cleanPlaceDisplayName("[Tạm] Núi Đôi Cô Tiên")).toBe("Núi Đôi Cô Tiên");
    expect(cleanPlaceDisplayName("[tạm]  Cột cờ Lũng Cú")).toBe("Cột cờ Lũng Cú");
    expect(cleanPlaceDisplayName("[Tam] - Đèo Mã Pí Lèng")).toBe("Đèo Mã Pí Lèng");
    expect(cleanPlaceDisplayName("Phố cổ Đồng Văn")).toBe("Phố cổ Đồng Văn");
  });

  it("strips [Tam]/[Tạm]/[tạm]/[ Tạm ] prefixes from stop descriptions while preserving real content", () => {
    expect(cleanTravelerDisplay("[Tam] Điểm ngắm cảnh núi Đôi ở Quản Bạ…")).toBe(
      "Điểm ngắm cảnh núi Đôi ở Quản Bạ…",
    );
    expect(cleanTravelerDisplay("[Tam] Điểm dừng ngắn ở khu vực Yên Minh…")).toBe(
      "Điểm dừng ngắn ở khu vực Yên Minh…",
    );
    expect(cleanTravelerDisplay("[tạm] Mô tả chưa hoàn thiện")).toBe("Mô tả chưa hoàn thiện");
    expect(cleanTravelerDisplay("[ Tạm ] : Điểm check-in nổi tiếng")).toBe("Điểm check-in nổi tiếng");
    expect(cleanTravelerDisplay("  [ Tạm ] — Ngắm bình minh trên đèo")).toBe("Ngắm bình minh trên đèo");
    expect(cleanTravelerDisplay(null)).toBe("");
    expect(cleanTravelerDisplay(undefined)).toBe("");
  });

  it("hides generic placeholder 'khu vực hà giang' and capitalizes real Hà Giang areas", () => {
    expect(cleanAreaDisplayLabel("khu vực hà giang")).toBeNull();
    expect(cleanAreaDisplayLabel("Khu vực Hà Giang")).toBeNull();
    expect(cleanAreaDisplayLabel("khu vuc ha giang")).toBeNull();
    expect(cleanAreaDisplayLabel("   ")).toBeNull();
    expect(cleanAreaDisplayLabel(null)).toBeNull();

    expect(cleanAreaDisplayLabel("đồng văn")).toBe("Đồng Văn");
    expect(cleanAreaDisplayLabel("mèo vạc")).toBe("Mèo Vạc");
    expect(cleanAreaDisplayLabel("quản bạ")).toBe("Quản Bạ");
    expect(cleanAreaDisplayLabel("yên minh, hà giang")).toBe("Yên Minh, Hà Giang");
    expect(cleanAreaDisplayLabel("thị trấn đồng văn")).toBe("Thị trấn Đồng Văn");
  });

  it("formats overnight areas with proper capitalization", () => {
    expect(cleanOvernightAreaLabel("khu vực hà giang")).toBe("Hà Giang");
    expect(cleanOvernightAreaLabel("đồng văn")).toBe("Đồng Văn");
    expect(cleanOvernightAreaLabel("[Tạm] quản bạ")).toBe("Quản Bạ");
    expect(cleanOvernightAreaLabel("")).toBe("");
  });

  it("resolves specific overnight area from lastStopName when area is generic 'khu vực hà giang' (Bug D)", () => {
    expect(resolveOvernightAreaLabel("khu vực hà giang", "[Tam] Rừng thông Yên Minh")).toBe("Yên Minh");
    expect(resolveOvernightAreaLabel("Hà Giang", "Phố cổ Đồng Văn")).toBe("Đồng Văn");
    expect(resolveOvernightAreaLabel("khu vực hà giang", "[Tam] Thị trấn Mèo Vạc")).toBe("Mèo Vạc");
    expect(resolveOvernightAreaLabel("khu vực hà giang", "Đèo Mã Pì Lèng")).toBe("Mã Pí Lèng");
    expect(resolveOvernightAreaLabel("khu vực hà giang", "Làng văn hóa Nặm Đăm")).toBe("Nặm Đăm");
    expect(resolveOvernightAreaLabel("đồng văn", "Cột cờ Lũng Cú")).toBe("Đồng Văn");
  });

  it("detects meaningless generic activity names like 'Khu Vui Chơi'", () => {
    expect(isGenericActivityPlaceName("Khu Vui Chơi")).toBe(true);
    expect(isGenericActivityPlaceName("khu vui chơi giải trí")).toBe(true);
    expect(isGenericActivityPlaceName("Điểm tham quan")).toBe(true);
    expect(isGenericActivityPlaceName("Chợ đêm Đồng Văn")).toBe(false);
    expect(isGenericActivityPlaceName("Khu vui chơi trẻ em Hoa Đá")).toBe(false);
  });
});
