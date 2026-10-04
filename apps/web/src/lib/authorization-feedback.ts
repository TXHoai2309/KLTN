export function authorizationFeedback(status: number | undefined): string | null {
  if (status === 401) return "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.";
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy dữ liệu được phép truy cập.";
  return null;
}
