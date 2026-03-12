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

        questions = []
        question_num = 0

        for page in pages:
            # 这里需要 OCR 来识别文字
            # MVP 版本：使用简单的边界分割
            # 实际应该调用 OCR 服务

            # 模拟识别结果（实际项目中需要集成 OCR）
            # 假设每页有 3-4 道题
            num_questions_on_page = 3
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

@app.route('/api/generate-pdf', methods=['POST'])
def generate_pdf():
    """生成归类后的 PDF"""
    try:
        data = request.json
        questions = data.get('questions', [])

        # 创建 PDF
        doc = fitz.open()

        # 按题目编号排序
        questions_sorted = sorted(questions, key=lambda x: x['number'])

        # 创建标题页
        page = doc.new_page()
        page.insert_text((50, 50), "ForTest - 试卷题目归类", fontsize=24)
        page.insert_text((50, 80), f"总题数: {len(questions_sorted)}", fontsize=14)

        # 按题目添加页面
        for i, q in enumerate(questions_sorted):
            page = doc.new_page()

            # 标题
            topic_name = q.get('topic', '未归类')
            page.insert_text((50, 50), f"题目 {q['number']}", fontsize=16, fontname="helv")
            page.insert_text((50, 75), f"Topic: {topic_name}", fontsize=12, fontname="helv", color=(0.5, 0.5, 0.5))

            # 如果有截图，插入图片
            if 'crop_image' in q and q.get('crop_image'):
                try:
                    crop_image = q['crop_image']
                    # 解码 base64 图片
                    if ',' in crop_image:
                        img_data = base64.b64decode(crop_image.split(',')[1])
                    else:
                        img_data = base64.b64decode(crop_image)
                    
                    img = Image.open(io.BytesIO(img_data))

                    # 插入图片
                    rect = fitz.Rect(50, 100, 550, 700)
                    page.insert_image(rect, img)
                except Exception as e:
                    print(f"Warning: Failed to process image for question {q.get('number', '?')}: {e}")

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
    app.run(host='0.0.0.0', debug=True, port=5000)
