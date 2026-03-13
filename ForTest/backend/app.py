from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import base64
import io
import os
from PIL import Image
import fitz  # PyMuPDF
import re

app = Flask(__name__)
CORS(app)

# 默认 Topic 模板
DEFAULT_TOPICS = [
    "Chapter 1: economic problem",
    "Chapter 2: economic assumptions",
    "Chapter 3: demand curve & Chapter 4: factors that may shift demand curve",
    "Chapter 5:the supply curve & Chapter 6: factors that may shift the supply curve",
    "Chapter 7: market equilibrium",
    "Chapter 8: Price Elasticity of Demand",
    "Chapter 9: Price Elasticity of supply",
    "Chapter 10: income elasticity of demand",
    "Chapter 11: mixed economy",
    "Chapter 12: privatization",
    "Chapter 13: externalities",
    "Chapter 14: factors of production and sectors of economy",
    "Chapter 15: productivity and division labour",
    "Chapter 16: business costs, revenues and profit",
    "Chapter 17: economies and diseconomies of scale",
    "Chapter 18: competitive markets",
    "Chapter 19: advantages and disadvantages of large and small firms",
    "Chapter 20: monopoly",
    "Chapter 21: oligopoly",
    "Chapter 22: labour market",
    "Chapter 23: impact of changes in supply and demand for labour and trade union activity in labour markets",
    "Chapter 24: government intervention"
]

@app.route('/api/topics', methods=['GET'])
def get_topics():
    """获取默认 Topic 列表"""
    return jsonify({'topics': DEFAULT_TOPICS})

@app.route('/api/upload-pdf', methods=['POST'])
def upload_pdf():
    """上传 PDF 并转换为图片"""
    try:
        data = request.json
        pdf_base64 = data.get('pdf_base64')

        if not pdf_base64:
            return jsonify({'error': 'No PDF data provided'}), 400

        # 解码 base64
        pdf_data = base64.b64decode(pdf_base64.split(',')[1] if ',' in pdf_base64 else pdf_base64)

        # 打开 PDF
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        pages_images = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x 分辨率提高清晰度
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='PNG')
            img_base64 = base64.b64encode(img_byte_arr.getvalue()).decode()

            pages_images.append({
                'page_num': page_num + 1,
                'image': f"data:image/png;base64,{img_base64}",
                'width': pix.width,
                'height': pix.height
            })

        doc.close()

        return jsonify({
            'pages': pages_images,
            'total_pages': len(pages_images)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect-questions', methods=['POST'])
def detect_questions():
    """检测题目边界（简单规则识别）"""
    try:
        data = request.json
        pages = data.get('pages', [])
        page_question_counts = data.get('page_question_counts', {})

        questions = []
        question_num = 0

        for page in pages:
            # 这里需要 OCR 来识别文字
            # MVP 版本：使用简单的边界分割
            # 实际应该调用 OCR 服务

            # 关键逻辑：支持前端按页传入题目数，默认值为 3
            page_num = page.get('page_num')
            num_questions_on_page = 3
            if isinstance(page_question_counts, dict):
                custom_count = page_question_counts.get(str(page_num), page_question_counts.get(page_num))
                if isinstance(custom_count, int):
                    num_questions_on_page = max(1, min(12, custom_count))
            height = page['height']
            width = page['width']

            for i in range(num_questions_on_page):
                question_num += 1
                # 简单的垂直分割
                segment_height = height / num_questions_on_page

                questions.append({
                    'id': f"q{question_num}",
                    'number': question_num,
                    'page_num': page['page_num'],
                    'bounding_box': {
                        'x': 0,
                        'y': i * segment_height,
                        'width': width,
                        'height': segment_height
                    },
                    'topic': None,  # 待用户选择
                    'image': page['image']  # 暂时使用整页图片
                })

        return jsonify({'questions': questions})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

def decode_base64_image(image_data):
    if not image_data:
        return None
    if ',' in image_data:
        return base64.b64decode(image_data.split(',')[1])
    return base64.b64decode(image_data)

def build_question_image_bytes(question):
    crop_image = question.get('crop_image')
    if crop_image:
        return decode_base64_image(crop_image)

    page_image = question.get('image')
    if not page_image:
        return None

    page_bytes = decode_base64_image(page_image)
    if not page_bytes:
        return None

    bbox = question.get('bounding_box')
    if not bbox:
        return page_bytes

    try:
        img = Image.open(io.BytesIO(page_bytes))
        img_width, img_height = img.size

        x = max(0, int(bbox.get('x', 0)))
        y = max(0, int(bbox.get('y', 0)))
        w = max(1, int(bbox.get('width', img_width)))
        h = max(1, int(bbox.get('height', img_height)))

        right = min(img_width, x + w)
        bottom = min(img_height, y + h)
        if right <= x or bottom <= y:
            return page_bytes

        # 关键逻辑：当未提供前端裁剪图时，后端按边界框自动裁剪，保证 PDF 不为空
        cropped = img.crop((x, y, right, bottom))
        output = io.BytesIO()
        cropped.save(output, format='PNG')
        return output.getvalue()
    except Exception:
        return page_bytes

@app.route('/api/generate-pdf', methods=['POST'])
def generate_pdf():
    """生成归类后的 PDF"""
    try:
        data = request.json
        questions = data.get('questions', [])

        # 创建 PDF
        doc = fitz.open()

        # 关键逻辑：只导出已打 Topic 标签的题目
        tagged_questions = []
        for q in questions:
            topic_raw = q.get('topic')
            topic_name = topic_raw.strip() if isinstance(topic_raw, str) else ''
            if topic_name:
                normalized_question = dict(q)
                normalized_question['topic'] = topic_name
                tagged_questions.append(normalized_question)

        # 按题号排序后再按 topic 分组
        questions_sorted = sorted(tagged_questions, key=lambda x: x['number'])
        grouped_questions = {}
        for q in questions_sorted:
            topic_name = q['topic']
            if topic_name not in grouped_questions:
                grouped_questions[topic_name] = []
            grouped_questions[topic_name].append(q)

        if len(questions_sorted) == 0:
            page = doc.new_page()
            page.insert_text((50, 50), "ForTest - Categorized Questions", fontsize=24)
            page.insert_text((50, 90), "No tagged question found. Please assign topics first.", fontsize=14, fontname="helv")
            pdf_bytes = doc.tobytes()
            doc.close()
            return send_file(
                io.BytesIO(pdf_bytes),
                mimetype='application/pdf',
                as_attachment=True,
                download_name='fortest_categorized.pdf'
            )

        # 关键逻辑：按 Chapter 数字排序，避免 Chapter 10 排在 Chapter 2 前面
        def chapter_sort_key(topic_name):
            match = re.search(r'Chapter\s+(\d+)', topic_name, re.IGNORECASE)
            if match:
                return (0, int(match.group(1)), topic_name.lower())
            return (1, 10**9, topic_name.lower())
        sorted_topics = sorted(grouped_questions.keys(), key=chapter_sort_key)
        
        def wrap_text_lines(text, max_width, fontname, fontsize):
            words = text.split(' ')
            lines = []
            current = ""
            for word in words:
                candidate = word if current == "" else f"{current} {word}"
                if fitz.get_text_length(candidate, fontname=fontname, fontsize=fontsize) <= max_width:
                    current = candidate
                else:
                    if current:
                        lines.append(current)
                    if fitz.get_text_length(word, fontname=fontname, fontsize=fontsize) <= max_width:
                        current = word
                    else:
                        chunk = ""
                        for ch in word:
                            ch_candidate = f"{chunk}{ch}"
                            if fitz.get_text_length(ch_candidate, fontname=fontname, fontsize=fontsize) <= max_width:
                                chunk = ch_candidate
                            else:
                                if chunk:
                                    lines.append(chunk)
                                chunk = ch
                        current = chunk
            if current:
                lines.append(current)
            return lines if lines else [""]

        page = doc.new_page()
        page_width = page.rect.width
        page_height = page.rect.height

        title = "ForTest Categorized Report"
        text_width = fitz.get_text_length(title, fontname="helv", fontsize=28)
        page.insert_text(((page_width - text_width) / 2, 150), title, fontsize=28, fontname="helv")

        subtitle = f"Questions: {len(questions_sorted)}  |  Topics: {len(sorted_topics)}"
        sub_width = fitz.get_text_length(subtitle, fontname="helv", fontsize=14)
        page.insert_text(((page_width - sub_width) / 2, 190), subtitle, fontsize=14, fontname="helv", color=(0.4, 0.4, 0.4))

        page.draw_line((100, 220), (page_width - 100, 220), color=(0.8, 0.8, 0.8), width=1)

        summary_start_y = 260
        left_margin = 110
        count_x = page_width - 120
        topic_x = left_margin + 20
        topic_max_width = count_x - topic_x - 16
        page.insert_text((left_margin, summary_start_y - 20), "Overview:", fontsize=16, fontname="helv")

        cursor_y = summary_start_y
        for topic_name in sorted_topics:
            count = len(grouped_questions[topic_name])
            topic_lines = wrap_text_lines(f"- {topic_name}", topic_max_width, "helv", 12)
            for line_index, line in enumerate(topic_lines):
                page.insert_text((topic_x, cursor_y), line, fontsize=12, fontname="helv")
                if line_index == 0:
                    page.insert_text((count_x, cursor_y), f"{count}", fontsize=12, fontname="helv")
                cursor_y += 18
            cursor_y += 6
            if cursor_y > page_height - 100:
                page.insert_text((left_margin + 20, cursor_y), "...", fontsize=12)
                break

        footer = "Generated by ForTest AI"
        foot_width = fitz.get_text_length(footer, fontname="helv", fontsize=10)
        page.insert_text(((page_width - foot_width) / 2, page_height - 50), footer, fontsize=10, fontname="helv", color=(0.6, 0.6, 0.6))


        def create_topic_header(doc, topic_name):
            p = doc.new_page()
            header_left = 40
            header_right = p.rect.width - 40
            header_lines = wrap_text_lines(topic_name, header_right - header_left, "helv", 16)
            visible_lines = header_lines[:3]
            if len(header_lines) > 3:
                visible_lines = header_lines[:2] + [f"{header_lines[2]}..."]
            line_height = 19
            header_top = 22
            header_bottom = max(60, header_top + len(visible_lines) * line_height + 12)
            p.draw_rect((0, 0, p.rect.width, header_bottom), color=(0.95, 0.95, 0.95), fill=(0.95, 0.95, 0.95))
            for idx, line in enumerate(visible_lines):
                p.insert_text((header_left, header_top + idx * line_height), line, fontsize=16, fontname="helv", color=(0.2, 0.2, 0.2))
            return p, header_bottom + 25

        for topic_name in sorted_topics:
            topic_questions = grouped_questions[topic_name]
            # 按题号排序
            topic_questions.sort(key=lambda x: x['number'])
            
            page, cursor_y = create_topic_header(doc, topic_name)
            
            for q in topic_questions:
                try:
                    # 预估当前题目所需高度
                    # 标题高度 + 图片高度 + 间距
                    q_title = f"Q{q['number']}"  # 简化为 Q1, Q2...
                    title_height = 20
                    gap = 10
                    bottom_margin = 20
                    
                    img_data = build_question_image_bytes(q)
                    display_width = 0
                    display_height = 0
                    
                    if img_data:
                        img = Image.open(io.BytesIO(img_data))
                        w, h = img.size
                        # 限制最大宽度为页面宽度减边距
                        max_w = page.rect.width - 80
                        # 限制最大高度（比如半页），防止单图过大
                        max_h = 600 
                        
                        scale = min(max_w/w, max_h/h, 1.0)
                        display_width = w * scale
                        display_height = h * scale
                    else:
                        display_height = 20 # 无图占位
                    
                    total_needed = title_height + display_height + gap + bottom_margin
                    
                    # 检查是否需要换页
                    if cursor_y + total_needed > page.rect.height - 50:
                        page, cursor_y = create_topic_header(doc, topic_name)
                    
                    # 绘制题目
                    # 1. 题号背景圆角矩形（模拟）或直接文字加粗
                    # page.draw_rect((40, cursor_y, 80, cursor_y + 20), color=(0.9, 0.9, 0.9), fill=(0.9, 0.9, 0.9))
                    page.insert_text((40, cursor_y + 15), q_title, fontsize=14, fontname="helv", color=(0, 0, 0))
                    
                    cursor_y += title_height + gap
                    
                    # 2. 图片
                    if img_data and display_width > 0:
                        rect = fitz.Rect(40, cursor_y, 40 + display_width, cursor_y + display_height)
                        page.insert_image(rect, stream=img_data)
                        cursor_y += display_height
                    else:
                        page.insert_text((40, cursor_y + 10), "[No question image]", fontsize=10, color=(0.5, 0.5, 0.5))
                        cursor_y += 20
                        
                    cursor_y += bottom_margin
                    
                    # 分割线（可选，题目间加虚线）
                    if cursor_y < page.rect.height - 50:
                        page.draw_line((40, cursor_y - 10), (page.rect.width - 40, cursor_y - 10), color=(0.9, 0.9, 0.9), width=0.5)

                except Exception as e:
                    print(f"Error drawing question {q.get('number')}: {e}")

        # 保存到内存
        pdf_bytes = doc.tobytes()
        doc.close()

        # 返回 PDF
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype='application/pdf',
            as_attachment=True,
            download_name='fortest_categorized.pdf'
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5001)
