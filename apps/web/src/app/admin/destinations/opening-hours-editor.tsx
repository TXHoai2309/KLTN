"use client";
import React from "react";
import { Clock3, Plus, Trash2, CircleHelp, CircleOff } from "lucide-react";
import { weekdayLabels, type DestinationInput } from "@/modules/destination/destination-contract";

type Days = DestinationInput["openingDays"];
export default function OpeningHoursEditor({ days, errors, onChange }: { days: Days; errors: Record<string, string>; onChange: (days: Days) => void }) {
  function updateDay(index: number, value: Partial<Days[number]>) {
    onChange(days.map((day, i) => i === index ? { ...day, ...value } : day));
  }
  function updateTime(index: number, slot: number, key: "opensAt" | "closesAt", value: string) {
    updateDay(index, { intervals: days[index]!.intervals.map((item, j) => j === slot ? { ...item, [key]: value } : item) });
  }
  return <div className="destination-week">
    {days.map((day, index) => {
      const dayErrors = Object.entries(errors).filter(([path]) => path === "openingDays" || path.startsWith(`openingDays.${index}.`) || path === `openingDays.${index}`);
      return <fieldset className={`destination-day is-${day.status.toLowerCase()}`} key={day.dayOfWeek}>
        <legend className="destination-sr-only">{weekdayLabels[index]}</legend>
        <div className="destination-day-heading"><div><h3>{weekdayLabels[index]}</h3><span className="destination-day-caption">{day.status === "OPEN" ? `${day.intervals.length} khung giờ` : day.status === "CLOSED" ? "Không hoạt động trong ngày" : "Chưa thiết lập giờ hoạt động"}</span></div>
          <div><label className="destination-sr-only" htmlFor={`status-${index}`}>Trạng thái {weekdayLabels[index]}</label><select id={`status-${index}`} value={day.status} aria-invalid={dayErrors.length > 0} aria-describedby={dayErrors.length ? `day-error-${index}` : undefined} onChange={event => {
            const status = event.target.value as typeof day.status;
            updateDay(index, { status, intervals: status === "OPEN" ? [{ opensAt: "07:00", closesAt: "17:00" }] : [] });
          }}><option value="OPEN">Mở cửa</option><option value="CLOSED">Đóng cả ngày</option><option value="UNKNOWN">Chưa có dữ liệu</option></select></div>
        </div>
        {day.status === "OPEN" ? <div className="destination-day-times">
          {day.intervals.map((interval, slot) => <div className="destination-interval" key={slot}>
            <div><label htmlFor={`time-${index}-${slot}-opensAt`}>Bắt đầu {slot + 1}</label><div className="destination-time-wrap"><Clock3 size={15} aria-hidden="true" /><input type="time" step={60} id={`time-${index}-${slot}-opensAt`} value={interval.opensAt} aria-invalid={dayErrors.length > 0} aria-describedby={dayErrors.length ? `day-error-${index}` : undefined} onInput={event => updateTime(index, slot, "opensAt", event.currentTarget.value)} onChange={event => updateTime(index, slot, "opensAt", event.target.value)} /></div></div>
            <span className="destination-time-separator" aria-hidden="true">—</span>
            <div><label htmlFor={`time-${index}-${slot}-closesAt`}>Kết thúc {slot + 1}</label><div className="destination-time-wrap"><Clock3 size={15} aria-hidden="true" />{interval.closesAt === "24:00" ? <input id={`time-${index}-${slot}-closesAt`} value="24:00" readOnly aria-invalid={dayErrors.length > 0} aria-describedby={dayErrors.length ? `day-error-${index}` : undefined} /> : <input type="time" step={60} id={`time-${index}-${slot}-closesAt`} value={interval.closesAt} aria-invalid={dayErrors.length > 0} aria-describedby={dayErrors.length ? `day-error-${index}` : undefined} onInput={event => updateTime(index, slot, "closesAt", event.currentTarget.value)} onChange={event => updateTime(index, slot, "closesAt", event.target.value)} />}</div>
              <label className="destination-end-day"><input type="checkbox" aria-label={`Cuối ngày (24:00), khung giờ ${slot + 1} ${weekdayLabels[index]}`} checked={interval.closesAt === "24:00"} onChange={event => updateTime(index, slot, "closesAt", event.target.checked ? "24:00" : "")} />Cuối ngày (24:00)</label></div>
            {day.intervals.length > 1 ? <button className="destination-remove" type="button" aria-label={`Xóa khung giờ ${slot + 1} ${weekdayLabels[index]}`} onClick={() => updateDay(index, { intervals: day.intervals.filter((_, j) => j !== slot) })}><Trash2 size={17} aria-hidden="true" /></button> : <span />}
          </div>)}
          <button className="destination-add-time" type="button" disabled={day.intervals.length >= 24} onClick={() => updateDay(index, { intervals: [...day.intervals, { opensAt: "", closesAt: "" }] })}><Plus size={16} aria-hidden="true" />Thêm khung giờ</button>
        </div> : <p className="destination-day-note">{day.status === "CLOSED" ? <CircleOff size={16} aria-hidden="true" /> : <CircleHelp size={16} aria-hidden="true" />}{day.status === "CLOSED" ? "Điểm đến đóng cửa cả ngày này." : "Chưa có dữ liệu. Không được coi là ngày đóng cửa."}</p>}
        {dayErrors.length > 0 && <p id={`day-error-${index}`} className="destination-error" role="alert">{[...new Set(dayErrors.map(([, message]) => message))].join(" ")}</p>}
      </fieldset>;
    })}
  </div>;
}
