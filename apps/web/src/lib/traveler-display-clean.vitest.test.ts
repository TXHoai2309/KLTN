import { describe, expect, it } from "vitest";
import {
  cleanAreaDisplayLabel,
  cleanDocumentSourceTitle,
  cleanOvernightAreaLabel,
  cleanPlaceDisplayName,
  cleanTravelerDisplay,
  cleanTravelerProse,
  isGenericActivityPlaceName,
  resolveOvernightAreaLabel,
} from "./traveler-display-clean";

describe("Ticket 04: traveler display cleanup helpers", () => {
  it("strips [Tạm] prefix and normalizes spacing and place capitalization on place names", () => {
    expect(cleanPlaceDisplayName("[Tạm] Núi Đôi Cô Tiên")).toBe("Núi Đôi Cô Tiên");
    expect(cleanPlaceDisplayName("[tạm]  Cột cờ Lũng Cú")).toBe("Cột cờ Lũng Cú");
    expect(cleanPlaceDisplayName("[Tam] - Đèo Mã Pí Lèng")).toBe("Đèo Mã Pì Lèng");
    expect(cleanPlaceDisplayName("Đèo Mã Pì Lèng")).toBe("Đèo Mã Pì Lèng");
    expect(cleanPlaceDisplayName("Phố cổ Đồng Văn")).toBe("Phố cổ Đồng Văn");
    expect(cleanPlaceDisplayName("Đình Chiều Lầu Thi")).toBe("Đỉnh Chiêu Lầu Thi");
  });

  it("standardizes RAG document source titles via cleanDocumentSourceTitle (P6)", () => {
    expect(cleanDocumentSourceTitle("Cột cờ lũng cú")).toBe("Cột cờ Lũng Cú");
    expect(cleanDocumentSourceTitle("Ruộng bậc thang hoàng su phì")).toBe("Ruộng bậc thang Hoàng Su Phì");
    expect(cleanDocumentSourceTitle("Cổng trời quản bạ")).toBe("Cổng trời Quản Bạ");
    expect(cleanDocumentSourceTitle("Chợ tình khâu vai")).toBe("Chợ tình Khâu Vai");
    expect(cleanDocumentSourceTitle("Di tích lịch sử căng bắc mê")).toBe("Di tích lịch sử Căng Bắc Mê");
    expect(cleanDocumentSourceTitle("Dinh thự họ vương")).toBe("Dinh thự họ Vương");
    expect(cleanDocumentSourceTitle("Đình Chiều Lầu Thi")).toBe("Đỉnh Chiêu Lầu Thi");
    expect(cleanDocumentSourceTitle("Đèo Mã Pí Lèng")).toBe("Đèo Mã Pì Lèng");
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

  it("Bug 9: resolves commune/town overnight area (chosen lodging -> address/area -> nearest town) and never uses landmark, pass, or river names", () => {
    expect(resolveOvernightAreaLabel("khu vực hà giang", "[Tam] Rừng thông Yên Minh")).toBe("Yên Minh");
    expect(resolveOvernightAreaLabel("Hà Giang", "Phố cổ Đồng Văn")).toBe("Đồng Văn");
    expect(resolveOvernightAreaLabel("khu vực hà giang", "[Tam] Thị trấn Mèo Vạc")).toBe("Mèo Vạc");
    expect(resolveOvernightAreaLabel("khu vực hà giang", "Làng văn hóa Nặm Đăm")).toBe("Nặm Đăm");
    expect(resolveOvernightAreaLabel("đồng văn", "Cột cờ Lũng Cú")).toBe("Đồng Văn");

    // Dinh thự họ Vương -> Sà Phìn (from address), NOT "Dinh thự họ Vương"
    expect(
      resolveOvernightAreaLabel("khu vực hà giang", "Dinh thự họ Vương", {
        address: "Thôn Sà Phìn, xã Sà Phìn, tỉnh Tuyên Quang (trước đây thuộc huyện Đồng Văn, tỉnh Hà Giang)",
        latitude: 23.2562848,
        longitude: 105.2621257,
      }),
    ).toBe("Sà Phìn");

    // Sông Nho Quế -> Mèo Vạc (from address), NOT "Sông Nho Quế"
    expect(
      resolveOvernightAreaLabel("khu vực hà giang", "Sông Nho Quế", {
        address: "Khu vực bến thuyền Nho Quế 1, xã Mèo Vạc, tỉnh Tuyên Quang",
        latitude: 23.1907068,
        longitude: 105.4694776,
      }),
    ).toBe("Mèo Vạc");

    // Đèo Mã Pì Lèng -> Đồng Văn (from address or nearest town), NEVER "Mã Pí Lèng"
    expect(
      resolveOvernightAreaLabel("khu vực hà giang", "Đèo Mã Pì Lèng", {
        address: "Quốc lộ 4C (Đường Hạnh Phúc), tuyến Đồng Văn – Mèo Vạc, Xã Đồng Văn, Tỉnh Tuyên Quang",
        latitude: 23.24,
        longitude: 105.4,
      }),
    ).toBe("Đồng Văn");
    expect(
      resolveOvernightAreaLabel("khu vực hà giang", "Đèo Mã Pì Lèng", {
        latitude: 23.24,
        longitude: 105.4,
      }),
    ).toBe("Đồng Văn");

    // Chosen lodging naming a commune takes top priority
    expect(
      resolveOvernightAreaLabel("khu vực hà giang", "Dinh thự họ Vương", {
        chosenLodgingName: "Sà Phìn Homestay",
        address: "Huyện Đồng Văn, Hà Giang",
      }),
    ).toBe("Sà Phìn");

    // Without address or coords, never return raw landmark/river/pass name
    expect(resolveOvernightAreaLabel("khu vực hà giang", "Dinh thự họ Vương")).not.toBe("Dinh thự họ Vương");
    expect(resolveOvernightAreaLabel("khu vực hà giang", "Sông Nho Quế")).not.toBe("Sông Nho Quế");
    expect(resolveOvernightAreaLabel("khu vực hà giang", "Đèo Mã Pì Lèng")).not.toBe("Mã Pí Lèng");
  });

  it("detects meaningless generic activity names like 'Khu Vui Chơi'", () => {
    expect(isGenericActivityPlaceName("Khu Vui Chơi")).toBe(true);
    expect(isGenericActivityPlaceName("khu vui chơi giải trí")).toBe(true);
    expect(isGenericActivityPlaceName("Điểm tham quan")).toBe(true);
    expect(isGenericActivityPlaceName("Chợ đêm Đồng Văn")).toBe(false);
    expect(isGenericActivityPlaceName("Khu vui chơi trẻ em Hoa Đá")).toBe(false);
  });

  it("Point 3: strips inline [Tam]/[Tạm] prefixes from prose while keeping newlines intact", () => {
    expect(cleanTravelerProse("Điểm đầu tiên ngày 2 là [Tam] Thị trấn Mèo Vạc…")).toBe(
      "Điểm đầu tiên ngày 2 là Thị trấn Mèo Vạc…",
    );
    expect(cleanTravelerProse("- **[Tạm] Núi Đôi Cô Tiên** (09:21)\n- [Tam] Thị trấn Mèo Vạc (08:00)")).toBe(
      "- **Núi Đôi Cô Tiên** (09:21)\n- Thị trấn Mèo Vạc (08:00)",
    );
    expect(cleanTravelerDisplay("Điểm 1: [Tam] Chợ Đồng Văn")).toBe("Điểm 1: Chợ Đồng Văn");
  });
});
