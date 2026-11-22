import type { ReactNode } from "react";

/** Presentation only: the server's one-line itinerary summary is split into an intro, one row per day and
 * the follow-up notes. Every character of the message is kept; nothing is parsed into new facts. */
const DAY = /(?:^|[\s,;:])ngày (\d+): (.+?)(?=; ngày \d+:|\.(?:\s|$)| để |$)/gu;
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("vi") + text.slice(1);

export function parsePlanMessage(message: string) {
  const matches = [...message.matchAll(DAY)].filter(match => match[2].includes("→") || match[2].trim().length > 0);
  if (!matches.length) return null;
  const first = matches[0], last = matches[matches.length - 1];
  const intro = message.slice(0, first.index).trim().replace(/[,:;]+$/u, "");
  const rest = message.slice(last.index! + last[0].length).trim();
  const days = matches.map(match => ({ day: match[1], stops: match[2].split("→").map(stop => stop.trim()).filter(Boolean) }));
  const notes = rest.split(/(?<=[.!?])\s+/u).map(note => note.trim().replace(/^\.\s*/u, "")).filter(Boolean).map(capitalize);
  return { intro, days, notes };
}

function badges(notes: readonly string[]): ReactNode {
  const text = notes.join(" ");
  const items = [
    /chưa lưu/iu.test(text) && "Chưa lưu",
    /giờ mở cửa/iu.test(text) && /(kiểm tra|chưa)/iu.test(text) && "Cần kiểm tra giờ mở cửa",
  ].filter(Boolean) as string[];
  return items.length ? <div className="assistant-plan-badges">{items.map(item => <span key={item} className="assistant-plan-badge">{item}</span>)}</div> : null;
}

/** `proposalBelow`: the full proposal card follows this message, so the days and the "not saved" status are not repeated here. */
export function AssistantPlanMessage({ message, proposalBelow = false }: { message: string; proposalBelow?: boolean }) {
  const parsed = parsePlanMessage(message);
  if (!parsed) return <p>{message}</p>;
  if (proposalBelow) {
    const notes = parsed.notes.filter(note => !/^Lịch này chưa lưu/iu.test(note));
    return <div className="assistant-plan-message">
      <p className="assistant-plan-intro">{parsed.intro ? `${parsed.intro}, mình đã xếp lịch chi tiết bên dưới.` : "Mình đã xếp lịch chi tiết bên dưới."}</p>
      {notes.map((note, index) => <p key={index} className="assistant-plan-note">{note}</p>)}
    </div>;
  }
  return <div className="assistant-plan-message">
    {parsed.intro && <p className="assistant-plan-intro">{parsed.intro}:</p>}
    <ol className="assistant-plan-days">{parsed.days.map(item => <li key={item.day} className="assistant-plan-day">
      <span className="assistant-plan-day-label">Ngày {item.day}</span>
      <ol className="assistant-plan-stops">{item.stops.map((stop, index) => <li key={index}>{stop}</li>)}</ol>
    </li>)}</ol>
    {badges(parsed.notes)}
    {parsed.notes.map((note, index) => <p key={index} className="assistant-plan-note">{note}</p>)}
  </div>;
}
