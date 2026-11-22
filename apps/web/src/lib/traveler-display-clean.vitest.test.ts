import { describe, expect, it } from "vitest";
import {
  cleanAreaDisplayLabel,
  cleanOvernightAreaLabel,
  cleanPlaceDisplayName,
  isGenericActivityPlaceName,
} from "./traveler-display-clean";

describe("Ticket 04: traveler display cleanup helpers", () => {
  it("strips [Tạm] prefix and normalizes spacing on place names", () => {
    expect(cleanPlaceDisplayName("[Tạm] Núi Đôi Cô Tiên")).toBe("Núi Đôi Cô Tiên");
    expect(cleanPlaceDisplayName("[tạm]  Cột cờ Lũng Cú")).toBe("Cột cờ Lũng Cú");
    expect(cleanPlaceDisplayName("[Tam] - Đèo Mã Pí Lèng")).toBe("Đèo Mã Pí Lèng");
    expect(cleanPlaceDisplayName("Phố cổ Đồng Văn")).toBe("Phố cổ Đồng Văn");
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

  it("detects meaningless generic activity names like 'Khu Vui Chơi'", () => {
    expect(isGenericActivityPlaceName("Khu Vui Chơi")).toBe(true);
    expect(isGenericActivityPlaceName("khu vui chơi giải trí")).toBe(true);
    expect(isGenericActivityPlaceName("Điểm tham quan")).toBe(true);
    expect(isGenericActivityPlaceName("Chợ đêm Đồng Văn")).toBe(false);
    expect(isGenericActivityPlaceName("Khu vui chơi trẻ em Hoa Đá")).toBe(false);
  });
});
