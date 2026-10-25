"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

interface Scenario {
  id: string;
  topic: string;
  question: string;
  speaker: string;
  answer: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "weather-flowers",
    topic: "Thời tiết & Mùa hoa",
    question: "Tháng 10 đi Hà Giang có hoa tam giác mạch chưa và cần chuẩn bị thời tiết thế nào?",
    speaker: "Trợ lý Hà Giang Travel",
    answer: "Tháng 10 là thời điểm tam giác mạch bắt đầu nở rộ tuyệt đẹp ở Đồng Văn, Lũng Cú và thung lũng Sủng Là. Tiết trời vào thu se lạnh, nhiệt độ ban ngày dao động 18–24°C có nắng hanh vàng, nhưng đêm và sáng sớm xuống khoảng 13–15°C kèm sương mù dày trên các cung đèo. Bạn nên chuẩn bị áo khoác gió chống nước, áo giữ nhiệt, găng tay lái xe và giày có độ bám tốt để di chuyển an toàn.",
  },
  {
    id: "ma-pi-leng-pass",
    topic: "Kinh nghiệm đèo Mã Pí Lèng",
    question: "Đi xe máy qua đèo Mã Pí Lèng lần đầu cần lưu ý an toàn những gì?",
    speaker: "Trợ lý Hà Giang Travel",
    answer: "Đèo Mã Pí Lèng dài 20km uốn lượn bên vực sâu sông Nho Quế. Lần đầu đi bạn nên chọn xe số hoặc côn tay thay vì xe ga, kiểm tra kỹ hệ thống phanh trước và sau, duy trì số 2 hoặc 3 khi lên dốc cũng như về dốc để hãm động cơ. Luôn bật đèn xe, bấm còi cảnh báo trước các khúc cua khuất và chỉ dừng ngắm cảnh tại các điểm dừng chân mở rộng có hộ lan bảo vệ an toàn.",
  },
  {
    id: "dong-van-market",
    topic: "Chợ phiên Đồng Văn",
    question: "Chợ phiên Đồng Văn họp vào ngày nào và có gì đặc sắc?",
    speaker: "Trợ lý Hà Giang Travel",
    answer: "Chợ phiên Đồng Văn họp cố định vào mỗi sáng Chủ nhật hàng tuần ngay trung tâm phố cổ. Từ tờ mờ sáng, đồng bào các dân tộc H'Mông, Dao, Lô Lô, Tày diện trang phục truyền thống rực rỡ gùi nông sản về chợ. Bạn có thể ghé khu ẩm thực thưởng thức bát thắng cố bốc khói nghi ngút, bánh tam giác mạch nướng than hồng và chén rượu ngô men lá nồng ấm cùng bà con bản địa.",
  },
];

type SimulationPhase = "typing_question" | "thinking" | "streaming_answer" | "done";

export default function HomeAssistantSimulation() {
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);
  const [phase, setPhase] = useState<SimulationPhase>("typing_question");
  const [displayedQuestion, setDisplayedQuestion] = useState("");
  const [displayedAnswer, setDisplayedAnswer] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  const scenario = SCENARIOS[activeScenarioIdx];
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Dọn dẹp timer khi unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Xử lý chuyển đổi kịch bản
  function selectScenario(index: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveScenarioIdx(index);
    setPhase("typing_question");
    setDisplayedQuestion("");
    setDisplayedAnswer("");
  }

  // Effect chạy vòng lặp gõ câu hỏi -> suy nghĩ -> trả lời
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // Kiểm tra prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayedQuestion(scenario.question);
      setDisplayedAnswer(scenario.answer);
      setPhase("done");
      return;
    }

    if (phase === "typing_question") {
      setDisplayedAnswer("");
      if (displayedQuestion.length < scenario.question.length) {
        timerRef.current = setTimeout(() => {
          setDisplayedQuestion(scenario.question.slice(0, displayedQuestion.length + 1));
        }, 30);
      } else {
        // Gõ xong câu hỏi -> chuyển sang trạng thái suy nghĩ
        timerRef.current = setTimeout(() => {
          setPhase("thinking");
        }, 400);
      }
    } else if (phase === "thinking") {
      timerRef.current = setTimeout(() => {
        setPhase("streaming_answer");
      }, 650);
    } else if (phase === "streaming_answer") {
      if (displayedAnswer.length < scenario.answer.length) {
        // Streaming tốc độ tự nhiên 2-3 ký tự mỗi nhịp cho câu trả lời dài
        const step = Math.min(3, scenario.answer.length - displayedAnswer.length);
        timerRef.current = setTimeout(() => {
          setDisplayedAnswer(scenario.answer.slice(0, displayedAnswer.length + step));
        }, 20);
      } else {
        // Trả lời xong
        setPhase("done");
      }
    } else if (phase === "done") {
      // Dừng lại đọc trong 6 giây rồi chuyển kịch bản kế tiếp nếu không bị hover/pause
      if (!isPaused) {
        timerRef.current = setTimeout(() => {
          const nextIdx = (activeScenarioIdx + 1) % SCENARIOS.length;
          selectScenario(nextIdx);
        }, 6000);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, displayedQuestion, displayedAnswer, scenario, isPaused, activeScenarioIdx]);

  return (
    <div
      className="home-ai-mockup home-ai-interactive-mockup"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Minh họa tương tác Trợ lý AI Hà Giang"
    >
      <div className="home-mockup-header">
        <div className="home-mockup-brand">
          <span className="home-mockup-dot-indicator" aria-hidden="true" />
          <Sparkles size={16} className="home-mockup-sparkle" aria-hidden="true" />
          <strong>Trợ lý AI Hà Giang</strong>
        </div>
        <div className="home-mockup-badge-group">
          <span className="home-mockup-badge home-mockup-badge-lavender">Hội thoại mô phỏng trực tiếp</span>
        </div>
      </div>

      <div className="home-ai-conversation" aria-live="polite">
        {/* Bong bóng câu hỏi người dùng */}
        <div className="home-ai-turn home-ai-user-turn">
          <div className="home-ai-user-bubble">
            <p>
              {displayedQuestion}
              {phase === "typing_question" && <span className="home-ai-typing-cursor" aria-hidden="true" />}
            </p>
          </div>
        </div>

        {/* Bong bóng câu trả lời AI */}
        {phase !== "typing_question" && (
          <div className="home-ai-turn home-ai-bot-turn">
            <div className="home-ai-bot-bubble">
              <div className="home-ai-speaker">
                <Sparkles size={14} className="home-ai-speaker-icon" aria-hidden="true" />
                <span>{scenario.speaker}</span>
              </div>

              {phase === "thinking" ? (
                <div className="home-ai-thinking-state" aria-label="Đang tra cứu dữ liệu...">
                  <span className="home-ai-thinking-text">Đang đối chiếu tài liệu kiểm chứng</span>
                  <span className="home-ai-thinking-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : (
                <p className="home-ai-answer-text">
                  {displayedAnswer}
                  {phase === "streaming_answer" && <span className="home-ai-typing-cursor" aria-hidden="true" />}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
