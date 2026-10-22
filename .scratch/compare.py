import re
import json

with open('d:/KLTN/KLTN/.scratch/dong_van_extracted.txt', 'r', encoding='utf-8') as f:
    raw_doc = f.read()

paragraphs = [p.strip() for p in raw_doc.split('\n\n') if p.strip()]

paragraphs_lower = [p.lower() for p in paragraphs]

sentences = [
    {
        "id": 1,
        "text": "Cao nguyên đá Đồng Văn nằm ở vùng cực Bắc của Hà Giang, nổi bật với những dãy núi đá vôi xám trải rộng, thung lũng sâu và địa hình karst hình thành qua thời gian địa chất lâu dài."
    },
    {
        "id": 2,
        "text": "Khu vực này thường được nhắc đến qua bốn huyện cũ là Quản Bạ, Yên Minh, Đồng Văn và Mèo Vạc; năm 2010, nơi đây được UNESCO công nhận là Công viên địa chất toàn cầu, đầu tiên của Việt Nam."
    },
    {
        "id": 3,
        "text": "Điểm cuốn hút không chỉ nằm ở cảnh quan đá."
    },
    {
        "id": 4,
        "text": "Trên hành trình, bạn có thể bắt gặp những bản làng nép giữa núi, nhà trình tường, hàng rào đá và nếp sống của các cộng đồng dân tộc địa phương."
    },
    {
        "id": 5,
        "text": "Một số điểm thường được kết hợp tham quan là phố cổ Đồng Văn, dinh thự họ Vương ở Sà Phìn, cột cờ Lũng Cú, đèo Mã Pí Lèng và khu vực sông Nho Quế."
    },
    {
        "id": 6,
        "text": "Nếu muốn cảm nhận trọn vẹn, hãy dành vài ngày để đi chậm, dừng ở các điểm ngắm cảnh và ghé thăm bản làng thay vì chỉ chạy qua các cung đường nổi tiếng."
    },
    {
        "id": 7,
        "text": "Đường miền núi có nhiều đoạn quanh co, nên chọn phương tiện và lịch trình phù hợp với kinh nghiệm của bạn; nếu chưa quen lái đường đèo, cân nhắc đi cùng tài xế hoặc người dẫn đường có kinh nghiệm."
    },
    {
        "id": 8,
        "text": "Đây là gợi ý tham khảo; tình trạng đường sá, dịch vụ, thời tiết và giờ hoạt động có thể thay đổi, nên bạn hãy kiểm tra thông tin trực tiếp trước chuyến đi."
    }
]

with open('d:/KLTN/KLTN/.scratch/report.txt', 'w', encoding='utf-8') as out:
    out.write("TOTAL PARAGRAPHS IN DOCX: " + str(len(paragraphs)) + "\n\n")
    for s in sentences:
        out.write(f"--- SENTENCE {s['id']} ---\n")
        out.write(s['text'] + "\n")
        
        # Check specific key entities
        # Print matching paragraphs
        matches = []
        for i, p in enumerate(paragraphs):
            p_low = p.lower()
            # check intersection of meaningful words
            words = set(re.findall(r'[a-zà-ỹ0-9]+', s['text'].lower())) - {'là', 'của', 'ở', 'và', 'có', 'thể', 'với', 'những', 'các', 'được', 'này', 'nơi', 'qua', 'cho', 'để', 'khi', 'nếu', 'thay', 'vì', 'chỉ', 'nên', 'bạn', 'đây'}
            common = words.intersection(set(re.findall(r'[a-zà-ỹ0-9]+', p_low)))
            if len(common) >= 3:
                matches.append((len(common), common, i, p))
        
        matches.sort(key=lambda x: x[0], reverse=True)
        out.write(f"Found {len(matches)} potential matching paragraphs:\n")
        for score, common_words, p_idx, p_text in matches[:4]:
            out.write(f"  [Para {p_idx} | Overlap {score} words: {', '.join(sorted(list(common_words))[:8])}]\n")
            out.write(f"    Text: {p_text[:200]}...\n")
        out.write("\n")

print("Done writing report")
