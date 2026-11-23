import type { AccessLegPart } from "@/modules/tripsage-chat/tripsage-access-leg";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  formatSavingsShortVnd,
  formatVnd,
  resolveBudgetSavingsChips,
  type CostPart,
} from "@/modules/tripsage-chat/tripsage-cost";
import { costPin } from "@/modules/trip-save/trip-pin-builders";
import { PinButton, type PinControl } from "./tripsage-pin-button";

/** Estimated cost table (design §3.8 & §2, Bug H: no nested scroll, warning badge + immediate savings chips, collapsible notes). */
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
  const groups = COST_CATEGORIES.map(category => ({
    category,
    lines: cost.lines.filter(line => line.category === category),
  })).filter(group => group.lines.length);
  const hasBudgetCap = cost.budgetCap !== null && cost.budgetCap > 0;
  const isOverBudget = hasBudgetCap && cost.withinCap === false && (cost.overBy ?? 0) > 0;
  const isIncomplete = cost.isIncomplete === true || Boolean(cost.missingItems?.length);
  const savingsChips = resolveBudgetSavingsChips(cost, accessLeg);
  return (
    <section className="tripsage-cost" aria-label="Bảng chi phí ước tính">
      <header className="tripsage-cost-head">
        <h4 className="tripsage-cost-title">Chi phí ước tính</h4>
        <div className="tripsage-cost-total-row">
          <strong className="tripsage-cost-total-amount">{formatVnd(cost.total)}</strong>
          {isIncomplete && (
            <span className="tripsage-cost-warn-badge" data-testid="cost-incomplete-badge">
              Chưa đầy đủ
            </span>
          )}
          {isOverBudget && (
            <span className="tripsage-cost-warn-badge" data-testid="cost-over-budget-badge">
              Vượt ngân sách {formatSavingsShortVnd(cost.overBy!)}
            </span>
          )}
        </div>
        <p className="tripsage-cost-sub">
          cả nhóm {cost.travelers} người · {formatVnd(cost.perPersonPerDay)}/người/ngày
        </p>
        {isIncomplete && cost.missingItems && cost.missingItems.length > 0 && (
          <p className="tripsage-cost-sub" data-testid="cost-missing-items">
            Chưa tính: {cost.missingItems.join(", ")}
          </p>
        )}
      </header>

      {savingsChips.length > 0 && onSelectSavingsOption && (
        <div className="tripsage-savings-chips" role="group" aria-label="Gợi ý giảm chi phí ước tính">
          <span className="tripsage-savings-title">Gợi ý giảm chi phí (ước tính, bấm để thử):</span>
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

      <div className="tripsage-cost-table-wrap">
        <table className="tripsage-cost-table">
          <thead>
            <tr>
              <th scope="col">Khoản</th>
              <th scope="col" className="tripsage-cost-basis-col">Cách tính</th>
              <th scope="col" className="tripsage-cost-amount">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group =>
              group.lines.map((line, index) => (
                <tr key={`${group.category}-${index}`}>
                  <td className="tripsage-cost-item-cell">
                    {index === 0 && (
                      <span className="tripsage-cost-cat">{COST_CATEGORY_LABELS[group.category]}</span>
                    )}
                    <div className="tripsage-cost-item-line">
                      {(index > 0 || line.label !== COST_CATEGORY_LABELS[group.category]) && (
                        <span className="tripsage-cost-item-name">{line.label}</span>
                      )}
                      {line.computed && (
                        <span className="tripsage-cost-computed-tag"> (hệ thống tính)</span>
                      )}
                    </div>
                    {line.basis && <span className="tripsage-cost-basis-mobile">{line.basis}</span>}
                  </td>
                  <td className="tripsage-cost-basis-desktop">{line.basis ?? ""}</td>
                  <td className="tripsage-cost-amount">{formatVnd(line.amount)}</td>
                </tr>
              )),
            )}
          </tbody>
          <tfoot>
            <tr className="tripsage-cost-total-foot tripsage-cost-tfoot-first">
              <th scope="row">Tổng cả nhóm</th>
              <td className="tripsage-cost-basis-desktop" aria-hidden="true" />
              <td className="tripsage-cost-amount">
                <strong>{formatVnd(cost.total)}</strong>
              </td>
            </tr>
            <tr className="tripsage-cost-total-foot">
              <th scope="row">Mỗi người mỗi ngày</th>
              <td className="tripsage-cost-basis-desktop" aria-hidden="true" />
              <td className="tripsage-cost-amount">{formatVnd(cost.perPersonPerDay)}</td>
            </tr>
            {hasBudgetCap && (
              <tr className={`tripsage-cost-budget-foot${isOverBudget ? " is-over-budget" : ""}`}>
                <th scope="row">So với ngân sách {formatVnd(cost.budgetCap!)}</th>
                <td className="tripsage-cost-basis-desktop" aria-hidden="true" />
                <td className="tripsage-cost-amount">
                  {cost.withinCap === true
                    ? "Trong ngân sách"
                    : cost.withinCap === false
                      ? `Vượt ${formatVnd(cost.overBy ?? 0)}`
                      : "Chưa đủ giá để kết luận"}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <details className="tripsage-cost-notes-details">
        <summary className="tripsage-cost-notes-summary">Ghi chú cách tính</summary>
        <ul className="tripsage-cost-notes">
          {cost.assumptions.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
          <li>
            Bảng giá tham khảo cập nhật {cost.priceReferenceDate.split("-").reverse().join("/")}. Đây là ước tính, chưa phải báo giá; ứng dụng không đặt chỗ.
          </li>
        </ul>
      </details>

      {pins && (
        <div className="tripsage-cost-footer">
          <PinButton item={costPin(cost)} control={pins} label="bảng chi phí" />
        </div>
      )}
    </section>
  );
}
