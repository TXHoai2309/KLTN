"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";

interface Scenario {
  id: string;
  chipLabel: string;
  topic: string;
  question: string;
  speaker: string;
  answer: string;
  citation: {
    source: string;
    page: string;
    verifiedText: string;
  };
}

const SCENARIOS: Scenario[] = [
  {
    id: "weather-flowers",
    chipLabel: "Mùa hoa & Thời tiết",
    topic: "Thời tiết & Mùa hoa",
    question: "Tháng 10 đi Hà Giang có hoa tam giác mạch chưa và cần chuẩn bị thời tiết thế nào?",
    speaker: "Trợ lý Hà Giang Travel",
    answer: "Tháng 10 là thời điểm tam giác mạch bắt đầu nở rộ tuyệt đẹp ở Đồng Văn, Lũng Cú và thung lũng Sủng Là. Tiết trời vào thu se lạnh, nhiệt độ ban ngày 18–24°C có nắng hanh vàng, nhưng đêm và sáng sớm xuống khoảng 13–15°C kèm sương mù dày trên các cung đèo. Bạn nên chuẩn bị áo khoác gió chống nước, áo giữ nhiệt và giày có độ bám tốt.",
    citation: {
      source: "Sách Dư địa chí & Mùa hoa Cao nguyên đá",
      page: "Chương III, tr. 84",
      verifiedText: "Hoa tam giác mạch chính vụ nở rực rỡ từ tuần thứ hai của tháng 10 đến hết tháng 11 tại thung lũng Sủng Là và chân đèo Mã Pí Lèng.",
    },
  },
  {
    id: "ma-pi-leng-pass",
    chipLabel: "An toàn đèo Mã Pí Lèng",
    topic: "Kinh nghiệm đèo Mã Pí Lèng",
    question: "Đi xe máy qua đèo Mã Pí Lèng lần đầu cần lưu ý an toàn những gì?",
    speaker: "Trợ lý Hà Giang Travel",
    answer: "Đèo Mã Pí Lèng dài 20km uốn lượn bên vực sâu sông Nho Quế. Lần đầu đi bạn nên chọn xe số hoặc côn tay thay vì xe ga, kiểm tra kỹ hệ thống phanh trước và sau, duy trì số 2 hoặc 3 khi lên cũng như xuống dốc để hãm động cơ. Luôn bật đèn xe, bấm còi cảnh báo trước các khúc cua khuất và chỉ dừng ngắm cảnh tại điểm có hộ lan.",
    citation: {
      source: "Cẩm nang An toàn Cung đường Phượt Vùng cao",
      page: "Mục 4.2 · Quy chuẩn đổ đèo",
      verifiedText: "Tuyệt đối không rà phanh liên tục hoặc về số mo (N) khi đổ dốc để tránh trơ má phanh gây mất kiểm soát phương tiện.",
    },
  },
  {
    id: "dong-van-market",
    chipLabel: "Chợ phiên Đồng Văn",
    topic: "Chợ phiên Đồng Văn",
    question: "Chợ phiên Đồng Văn họp vào ngày nào và có gì đặc sắc?",
    speaker: "Trợ lý Hà Giang Travel",
    answer: "Chợ phiên Đồng Văn họp cố định vào mỗi sáng Chủ nhật hàng tuần ngay trung tâm phố cổ. Từ tờ mờ sáng, đồng bào H'Mông, Dao, Tày diện trang phục truyền thống rực rỡ gùi nông sản về chợ. Bạn có thể ghé khu ẩm thực thưởng thức bát thắng cố bốc khói nghi ngút, bánh tam giác mạch nướng than hồng và chén rượu ngô men lá nồng ấm.",
    citation: {
      source: "Văn hóa Dân gian & Chợ phiên Hà Giang",
      page: "Chương V, tr. 142",
      verifiedText: "Chợ phiên Đồng Văn là trung tâm sinh hoạt cộng đồng giàu bản sắc, lưu giữ vẹn nguyên phong tục giao thương truyền thống.",
    },
  },
];

type SimulationPhase = "typing_question" | "thinking" | "streaming_answer" | "done";

export default function HomeAssistantSimulation() {
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);
  const [phase, setPhase] = useState<SimulationPhase>("typing_question");
  const [displayedQuestion, setDisplayedQuestion] = useState("");
  const [displayedAnswer, setDisplayedAnswer] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const scenario = SCENARIOS[activeScenarioIdx];
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // IntersectionObserver: Chỉ khởi động tiến trình gõ kịch bản khi khối chat AI lọt vào tầm nhìn
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function selectScenario(index: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveScenarioIdx(index);
    setPhase("typing_question");
    setDisplayedQuestion("");
    setDisplayedAnswer("");
  }

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayedQuestion(scenario.question);
      setDisplayedAnswer(scenario.answer);
      setPhase("done");
      return;
    }

    // Tạm dừng chạy timer gõ chữ khi người dùng chưa cuộn tới hoặc đã cuộn ra khỏi vùng nhìn thấy
    if (!isVisible) {
      return;
    }

    if (phase === "typing_question") {
      setDisplayedAnswer("");
      if (displayedQuestion.length < scenario.question.length) {
        timerRef.current = setTimeout(() => {
          setDisplayedQuestion(scenario.question.slice(0, displayedQuestion.length + 1));
        }, 25);
      } else {
        timerRef.current = setTimeout(() => {
          setPhase("thinking");
        }, 350);
      }
    } else if (phase === "thinking") {
      timerRef.current = setTimeout(() => {
        setPhase("streaming_answer");
      }, 550);
    } else if (phase === "streaming_answer") {
      if (displayedAnswer.length < scenario.answer.length) {
        const step = Math.min(3, scenario.answer.length - displayedAnswer.length);
        timerRef.current = setTimeout(() => {
          setDisplayedAnswer(scenario.answer.slice(0, displayedAnswer.length + step));
        }, 18);
      } else {
        setPhase("done");
      }
    } else if (phase === "done") {
      if (!isPaused) {
        timerRef.current = setTimeout(() => {
          const nextIdx = (activeScenarioIdx + 1) % SCENARIOS.length;
          selectScenario(nextIdx);
        }, 5000);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isVisible, phase, displayedQuestion, displayedAnswer, scenario, isPaused, activeScenarioIdx]);

  return (
    <div
      ref={terminalRef}
      className="home-concierge-terminal"
      aria-label="Minh họa tương tác Trợ lý AI Hà Giang"
    >
      {/* Terminal Top Bar */}
      <div className="home-terminal-header">
        <div className="home-terminal-brand">
          <span className="home-terminal-beacon" aria-hidden="true" />
          <Sparkles size={15} className="home-terminal-sparkle" aria-hidden="true" />
          <span className="home-terminal-title">Trợ lý AI Hà Giang</span>
          <span className="home-terminal-rag-tag">RAG VERIFIED</span>
        </div>
        <div className="home-terminal-status">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>Đối chiếu nguồn thời gian thực</span>
        </div>
      </div>

      {/* Conversation Thread */}
      <div className="home-terminal-body" aria-live="polite">
        {/* User Question */}
        <div className="home-terminal-user-row">
          <div className="home-terminal-user-bubble">
            <p>
              {displayedQuestion}
              {phase === "typing_question" && <span className="home-ai-typing-cursor" aria-hidden="true" />}
            </p>
          </div>
        </div>

        {/* AI Answer */}
        {phase !== "typing_question" && (
          <div className="home-terminal-bot-row">
            <div className="home-terminal-bot-bubble">
              <div className="home-terminal-bot-speaker">
                <Sparkles size={13} aria-hidden="true" />
                <span>{scenario.speaker}</span>
              </div>

              {phase === "thinking" ? (
                <div className="home-terminal-thinking">
                  <span className="home-terminal-thinking-text">Đang đối chiếu tài liệu thư viện Hà Giang</span>
                  <span className="home-terminal-thinking-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : (
                <p className="home-terminal-answer-text">
                  {displayedAnswer}
                  {phase === "streaming_answer" && <span className="home-ai-typing-cursor" aria-hidden="true" />}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompt Selector Chips (Bấm thử ngay) */}
      <div
        className="home-terminal-prompts-bar"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <span className="home-terminal-prompts-hint">Bấm thử câu hỏi:</span>
        <div className="home-terminal-chips-group">
          {SCENARIOS.map((item, idx) => {
            const isSelected = activeScenarioIdx === idx;
            return (
              <button
                key={item.id}
                type="button"
                className={`home-terminal-chip ${isSelected ? "is-active" : ""}`}
                onClick={() => selectScenario(idx)}
                aria-label={`Thử câu hỏi: ${item.topic}`}
              >
                <span>{item.chipLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
