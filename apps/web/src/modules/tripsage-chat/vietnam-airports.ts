import { haversine } from "../trip-planner/planner-geography";

/**
 * Danh sách tĩnh sân bay dân dụng Việt Nam (mã IATA, tên, tọa độ) để server tự chọn
 * sân bay đi gần tọa độ nơi xuất phát nhất.
 *
 * LƯU Ý: Dữ liệu tĩnh — cần chủ dự án kiểm tra tọa độ và mã IATA trước khi nghiệm thu.
 */
export type VietnamAirport = {
  code: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
};

export const DESTINATION_AIRPORT_HAN = "HAN" as const;

export const VIETNAM_AIRPORTS: readonly VietnamAirport[] = [
  { code: "HAN", name: "Sân bay Quốc tế Nội Bài", city: "Hà Nội", latitude: 21.2212, longitude: 105.8072 },
  { code: "HPH", name: "Sân bay Quốc tế Cát Bi", city: "Hải Phòng", latitude: 20.8194, longitude: 106.7249 },
  { code: "VDO", name: "Sân bay Quốc tế Vân Đồn", city: "Quảng Ninh", latitude: 21.1178, longitude: 107.4142 },
  { code: "DIN", name: "Sân bay Điện Biên Phủ", city: "Điện Biên", latitude: 21.3975, longitude: 103.0078 },
  { code: "THD", name: "Sân bay Thọ Xuân", city: "Thanh Hóa", latitude: 19.9017, longitude: 105.4678 },
  { code: "VII", name: "Sân bay Quốc tế Vinh", city: "Nghệ An", latitude: 18.7376, longitude: 105.6708 },
  { code: "VDH", name: "Sân bay Đồng Hới", city: "Quảng Bình", latitude: 17.5150, longitude: 106.5906 },
  { code: "HUI", name: "Sân bay Quốc tế Phú Bài", city: "Huế", latitude: 16.4015, longitude: 107.7026 },
  { code: "DAD", name: "Sân bay Quốc tế Đà Nẵng", city: "Đà Nẵng", latitude: 16.0439, longitude: 108.1994 },
  { code: "VCL", name: "Sân bay Chu Lai", city: "Quảng Nam", latitude: 15.4061, longitude: 108.7056 },
  { code: "PXU", name: "Sân bay Pleiku", city: "Gia Lai", latitude: 14.0045, longitude: 108.0172 },
  { code: "UIH", name: "Sân bay Phù Cát", city: "Bình Định", latitude: 13.9550, longitude: 109.0422 },
  { code: "TBB", name: "Sân bay Tuy Hòa", city: "Phú Yên", latitude: 13.0496, longitude: 109.3337 },
  { code: "BMV", name: "Sân bay Buôn Ma Thuột", city: "Đắk Lắk", latitude: 12.6683, longitude: 108.1203 },
  { code: "CXR", name: "Sân bay Quốc tế Cam Ranh", city: "Khánh Hòa", latitude: 11.9982, longitude: 109.2194 },
  { code: "DLI", name: "Sân bay Liên Khương", city: "Lâm Đồng", latitude: 11.7506, longitude: 108.3736 },
  { code: "SGN", name: "Sân bay Quốc tế Tân Sơn Nhất", city: "TP Hồ Chí Minh", latitude: 10.8188, longitude: 106.6519 },
  { code: "VCA", name: "Sân bay Quốc tế Cần Thơ", city: "Cần Thơ", latitude: 10.0851, longitude: 105.7119 },
  { code: "VCS", name: "Sân bay Côn Đảo", city: "Bà Rịa - Vũng Tàu", latitude: 8.7318, longitude: 106.6289 },
  { code: "PQC", name: "Sân bay Quốc tế Phú Quốc", city: "Kiên Giang", latitude: 10.1698, longitude: 103.9931 },
  { code: "VKG", name: "Sân bay Rạch Giá", city: "Kiên Giang", latitude: 9.9597, longitude: 105.1339 },
  { code: "CAH", name: "Sân bay Cà Mau", city: "Cà Mau", latitude: 9.1756, longitude: 105.1794 },
];

const BY_CODE = new Map(VIETNAM_AIRPORTS.map(airport => [airport.code, airport]));

export function findVietnamAirportByCode(code: string): VietnamAirport | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

export function findNearestVietnamAirport(point: { latitude: number; longitude: number }): {
  airport: VietnamAirport;
  distanceKm: number;
} {
  let best = VIETNAM_AIRPORTS[0]!;
  let bestKm = haversine(point, best);
  for (let i = 1; i < VIETNAM_AIRPORTS.length; i += 1) {
    const candidate = VIETNAM_AIRPORTS[i]!;
    const km = haversine(point, candidate);
    if (km < bestKm) {
      best = candidate;
      bestKm = km;
    }
  }
  return { airport: best, distanceKm: Math.round(bestKm * 10) / 10 };
}
