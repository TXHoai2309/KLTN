import { Wallet } from "lucide-react";

import { COST_CATEGORIES, COST_CATEGORY_LABELS, formatVnd, type CostPart } from "@/modules/tripsage-chat/tripsage-cost";

/** Estimated cost table (ADR-42, ticket 03). Totals and fuel come from the server; every amount is labeled an estimate. */
export function TripsageCostCard({ cost }: { cost: CostPart }) {
  const groups = COST_CATEGORIES.map(category => ({ category, lines: cost.lines.filter(line => line.category === category) })).filter(group => group.lines.length);
  return (
    <section className="tripsage-cost" aria-label="Bảng chi phí ước tính">
      <h4><Wallet size={16} aria-hidden="true" className="inline mr-1" />Chi phí ước tính · {cost.travelers} người · {cost.days} ngày</h4>
      <div className="tripsage-md-table"><table>
        <thead><tr><th scope="col">Khoản</th><th scope="col">Cách tính</th><th scope="col" className="text-right">Số tiền</th></tr></thead>
        <tbody>
          {groups.map(group => group.lines.map((line, index) => (
            <tr key={`${group.category}-${index}`}>
              <td>{index === 0 && <strong>{COST_CATEGORY_LABELS[group.category]}</strong>}{index === 0 && <br />}{line.label}{line.computed && <span className="assistant-muted"> (hệ thống tính)</span>}</td>
              <td className="assistant-muted">{line.basis ?? ""}</td>
              <td className="text-right">{formatVnd(line.amount)}</td>
            </tr>
          )))}
        </tbody>
        <tfoot>
          <tr><th scope="row" colSpan={2}>Tổng cả nhóm</th><td className="text-right"><strong>{formatVnd(cost.total)}</strong></td></tr>
          <tr><th scope="row" colSpan={2}>Mỗi người mỗi ngày</th><td className="text-right">{formatVnd(cost.perPersonPerDay)}</td></tr>
          {cost.budgetCap !== null && (
            <tr><th scope="row" colSpan={2}>So với ngân sách {formatVnd(cost.budgetCap)}</th><td className="text-right">{cost.withinCap ? "Trong ngân sách" : `Vượt ${formatVnd(cost.overBy ?? 0)}`}</td></tr>
          )}
        </tfoot>
      </table></div>
      <ul className="tripsage-cost-notes">
        {cost.assumptions.map((note, index) => <li key={index}>{note}</li>)}
        <li>Bảng giá tham khảo cập nhật {cost.priceReferenceDate.split("-").reverse().join("/")}. Đây là ước tính, chưa phải báo giá; ứng dụng không đặt chỗ.</li>
      </ul>
    </section>
  );
}
