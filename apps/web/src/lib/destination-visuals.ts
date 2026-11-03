export const KNOWN_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  "cổng trời quản bạ": { latitude: 23.0645, longitude: 104.9928 },
  "quản bạ": { latitude: 23.0645, longitude: 104.9928 },
  "núi đôi": { latitude: 23.0645, longitude: 104.9928 },
  "nhà vương": { latitude: 23.2612, longitude: 105.2536 },
  "dinh họ vương": { latitude: 23.2612, longitude: 105.2536 },
  "dinh vương": { latitude: 23.2612, longitude: 105.2536 },
  "cột cờ lũng cú": { latitude: 23.3615, longitude: 105.3195 },
  "lũng cú": { latitude: 23.3615, longitude: 105.3195 },
  "phố cổ đồng văn": { latitude: 23.2785, longitude: 105.3621 },
  "đồng văn": { latitude: 23.2785, longitude: 105.3621 },
  "đèo mã pí lèng": { latitude: 23.2389, longitude: 105.4194 },
  "mã pí lèng": { latitude: 23.2389, longitude: 105.4194 },
  "hẻm tu sản": { latitude: 23.2195, longitude: 105.429 },
  "sông nho quế": { latitude: 23.2195, longitude: 105.429 },
  "tu sản": { latitude: 23.2195, longitude: 105.429 },
  "mèo vạc": { latitude: 23.1633, longitude: 105.4106 },
  "yên minh": { latitude: 23.1167, longitude: 105.15 },
  "du già": { latitude: 22.95, longitude: 105.2 },
  "bắc mê": { latitude: 22.75, longitude: 105.3 },
  "bảo lâm": { latitude: 22.9167, longitude: 105.5 },
  "hà giang": { latitude: 22.8233, longitude: 104.9839 },
  "lùng tám": { latitude: 23.05, longitude: 105.03 },
  "thẩm mã": { latitude: 23.185, longitude: 105.185 },
  "hạ thành": { latitude: 22.81, longitude: 104.96 },
  "nặm đăm": { latitude: 23.045, longitude: 104.98 },
  "pả vi": { latitude: 23.17, longitude: 105.42 },
  "lô lô chải": { latitude: 23.36, longitude: 105.315 },
  "hoàng su phì": { latitude: 22.7, longitude: 104.6667 },
};

export function getDestinationCoordinates(
  name: string,
  area: string,
  lat?: number,
  lng?: number,
  index = 0
): { latitude: number; longitude: number } {
  if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
    return { latitude: lat, longitude: lng };
  }
  const n = (name || "").toLowerCase();
  const a = (area || "").toLowerCase();
  for (const [key, coords] of Object.entries(KNOWN_COORDINATES)) {
    if (n.includes(key) || a.includes(key)) return coords;
  }
  const fallbacks = [
    { latitude: 23.0645, longitude: 104.9928 },
    { latitude: 23.2612, longitude: 105.2536 },
    { latitude: 23.3615, longitude: 105.3195 },
    { latitude: 23.2785, longitude: 105.3621 },
    { latitude: 23.2389, longitude: 105.4194 },
    { latitude: 23.2195, longitude: 105.429 },
  ];
  return fallbacks[index % fallbacks.length]!;
}

export function getDestinationVisual(name: string, area = ""): { src: string; alt: string } {
  const n = (name || "").toLowerCase();
  const a = (area || "").toLowerCase();
  if (n.includes("lũng cú") || n.includes("lung cu") || n.includes("cột cờ")) {
    return { src: "/images/gallery/ha-giang-day3-lg.webp", alt: "Cột cờ Lũng Cú" };
  }
  if (n.includes("quản bạ") || n.includes("quan ba") || n.includes("cổng trời") || n.includes("núi đôi")) {
    return { src: "/images/gallery/ha-giang-twin-mountain.webp", alt: "Núi đôi Quản Bạ" };
  }
  if (n.includes("nho quế") || n.includes("nho que") || n.includes("mã pí lèng") || n.includes("ma pi leng") || n.includes("tu sản")) {
    return { src: "/images/ha-giang-hero.webp", alt: "Đèo Mã Pí Lèng và sông Nho Quế" };
  }
  if (n.includes("hạ thành") || n.includes("ha thanh") || n.includes("nặm đăm") || n.includes("nam dam")) {
    return { src: "/images/gallery/ha-giang-terraces-mist-huts.webp", alt: "Làng văn hóa du lịch cộng đồng" };
  }
  if (n.includes("dinh") || n.includes("vương") || n.includes("vuong") || n.includes("phố cổ") || n.includes("đồng văn")) {
    return { src: "/images/gallery/ha-giang-stone-village-plum.webp", alt: "Dinh thự họ Vương và kiến trúc cổ" };
  }
  if (n.includes("lô lô") || n.includes("lo lo") || n.includes("pả vi") || n.includes("pa vi") || n.includes("mèo vạc") || n.includes("meo vac")) {
    return { src: "/images/gallery/ha-giang-buckwheat-harvest.webp", alt: "Làng cổ và hoa tam giác mạch" };
  }
  if (n.includes("khâu vai") || n.includes("khau vai") || n.includes("chợ tình") || n.includes("tam giác mạch")) {
    return { src: "/images/gallery/ha-giang-buckwheat-slope.webp", alt: "Chợ phiên và triền hoa Hà Giang" };
  }
  if (n.includes("hoàng su phì") || n.includes("ruộng bậc thang") || a.includes("hoàng su phì")) {
    return { src: "/images/gallery/ha-giang-terraces-golden.webp", alt: "Ruộng bậc thang Hoàng Su Phì" };
  }
  return { src: "/images/gallery/ha-giang-stone-village-plum.webp", alt: name || "Điểm đến Hà Giang" };
}

export function inferDestinationArea(name: string, fallback = "Hà Giang"): string {
  const n = (name || "").toLowerCase();
  if (n.includes("quản bạ") || n.includes("núi đôi") || n.includes("cổng trời") || n.includes("lùng tám") || n.includes("nặm đăm")) {
    return "Quản Bạ";
  }
  if (n.includes("đồng văn") || n.includes("nhà vương") || n.includes("dinh họ vương") || n.includes("lũng cú") || n.includes("thẩm mã") || n.includes("lô lô")) {
    return "Đồng Văn";
  }
  if (n.includes("mèo vạc") || n.includes("mã pí lèng") || n.includes("nho quế") || n.includes("tu sản") || n.includes("pả vi") || n.includes("khâu vai")) {
    return "Mèo Vạc";
  }
  if (n.includes("yên minh")) {
    return "Yên Minh";
  }
  if (n.includes("du già")) {
    return "Du Già, Yên Minh";
  }
  if (n.includes("hoàng su phì")) {
    return "Hoàng Su Phì";
  }
  if (n.includes("bắc mê")) {
    return "Bắc Mê";
  }
  if (n.includes("hạ thành") || n.includes("km0") || n.includes("núi cấm")) {
    return "TP. Hà Giang";
  }
  return fallback;
}
