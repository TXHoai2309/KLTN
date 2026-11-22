import { Wallet } from "lucide-react";

import type { AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";
import { computeBudgetSavingsChips, COST_CATEGORIES, COST_CATEGORY_LABELS, formatVnd, type CostPart } from "@/modules/tripsage-chat/tripsage-cost";
import { costPin } from "@/modules/trip-save/trip-pin-builders";
import { PinButton, type PinControl } from "./tripsage-pin-button";

/** Estimated cost table (ADR-42, ticket 03; compact aligned columns, budget row hidden when budget <= 0). */
export function TripsageCostCard({
  cost,
  pins,
  accessLeg,
  onSelectSavingsOption,
}: {
  cost: CostPart;
  pins?: PinControl;
  accessLeg?: AccessLegPart | null;
  onSelectSavingsOption?: (prompt: string) => void;
}) {
  const groups = COST_CATEGORIES.map(category => ({ category, lines: cost.lines.filter(line => line.category === category) })).filter(group => group.lines.length);
  const hasBudgetCap = cost.budgetCap !== null && cost.budgetCap > 0;
  const savingsChips = computeBudgetSavingsChips(cost, accessLeg);
  return (
    <section className="tripsage-cost" aria-label="Bảng chi phí ước tính">
      <header className="tripsage-cost-head">
        <h4><Wallet size={15} aria-hidden="true" />Chi phí ước tính · {cost.travelers} người · {cost.days} ngày</h4>
        <p className="tripsage-cost-total">
          <strong>{formatVnd(cost.total)}</strong>
          <span>cả nhóm · {formatVnd(cost.perPersonPerDay)}/người/ngày{hasBudgetCap ? ` · ${cost.withinCap ? "trong ngân sách" : `vượt ${formatVnd(cost.overBy ?? 0)}`}` : ""}</span>
        </p>
      </header>
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
                  {(index > 0 || line.label !== COST_CATEGORY_LABELS[group.category]) &&<span>{line.label}</span>}
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
      {savingsChips.length > 0 && onSelectSavingsOption && (
        <div className="tripsage-savings-chips" role="group" aria-label="Gợi ý giảm chi phí ước tính">
          <span className="tripsage-savings-title">Gợi ý giảm chi phí (chọn để điều chỉnh lịch):</span>
          <div className="tripsage-savings-list">
            {savingsChips.map(chip => (
              <button
                key={chip.id}
                type="button"
                className="tripsage-savings-chip"
                onClick={() => onSelectSavingsOption(chip.prompt)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <PinButton item={costPin(cost)} control={pins} label="bảng chi phí" />
    </section>
  );
}
