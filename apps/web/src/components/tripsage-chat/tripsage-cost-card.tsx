import { Wallet } from "lucide-react";

import { COST_CATEGORIES, COST_CATEGORY_LABELS, formatVnd, type CostPart } from "@/modules/tripsage-chat/tripsage-cost";

/** Estimated cost table (ADR-42, ticket 03; compact aligned columns, budget row hidden when budget <= 0). */
export function TripsageCostCard({ cost }: { cost: CostPart }) {
  const groups = COST_CATEGORIES.map(category => ({ category, lines: cost.lines.filter(line => line.category === category) })).filter(group => group.lines.length);
  const hasBudgetCap = cost.budgetCap !== null && cost.budgetCap > 0;
  return (
    <section className="tripsage-cost" aria-label="Bảng chi phí ước tính">
      <h4><Wallet size={15} aria-hidden="true" className="inline mr-1.5" />Chi phí ước tính · {cost.travelers} người · {cost.days} ngày</h4>
      <div className="tripsage-md-table">
        <table className="tripsage-cost-table">
          <thead>
            <tr>
              <th scope="col">Khoản</th>
              <th scope="col">Cách tính</th>
              <th scope="col" className="tripsage-cost-amount">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => group.lines.map((line, index) => (
              <tr key={`${group.category}-${index}`}>
                <td>
                  {index === 0 && <strong className="tripsage-cost-cat">{COST_CATEGORY_LABELS[group.category]}</strong>}
                  <span>{line.label}</span>
                  {line.computed && <span className="assistant-muted"> (hệ thống tính)</span>}
                </td>
                <td className="assistant-muted">{line.basis ?? ""}</td>
                <td className="tripsage-cost-amount">{formatVnd(line.amount)}</td>
              </tr>
            )))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>Tổng cả nhóm</th>
              <td className="tripsage-cost-amount"><strong>{formatVnd(cost.total)}</strong></td>
            </tr>
            <tr>
              <th scope="row" colSpan={2}>Mỗi người mỗi ngày</th>
              <td className="tripsage-cost-amount">{formatVnd(cost.perPersonPerDay)}</td>
            </tr>
            {hasBudgetCap && (
              <tr>
                <th scope="row" colSpan={2}>So với ngân sách {formatVnd(cost.budgetCap!)}</th>
                <td className="tripsage-cost-amount">{cost.withinCap ? "Trong ngân sách" : `Vượt ${formatVnd(cost.overBy ?? 0)}`}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      <ul className="tripsage-cost-notes">
        {cost.assumptions.map((note, index) => <li key={index}>{note}</li>)}
        <li>Bảng giá tham khảo cập nhật {cost.priceReferenceDate.split("-").reverse().join("/")}. Đây là ước tính, chưa phải báo giá; ứng dụng không đặt chỗ.</li>
      </ul>
    </section>
  );
}
