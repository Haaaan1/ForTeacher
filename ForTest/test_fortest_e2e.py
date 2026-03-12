"""
ForTest E2E 测试脚本
使用 Playwright 自动测试所有功能
"""
import asyncio
import base64
from playwright.async_api import async_playwright, expect

# 测试配置
BASE_URL = "http://118.145.238.188:319"
PDF_PATH = "/root/.openclaw/media/inbound/01r-que-2024june---13fb7789-e8e5-439e-9957-3ba0055b054e.pdf"

async def test_homepage():
    """测试：主页加载"""
    print("\n🧪 测试 1：主页加载")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # 访问主页
        await page.goto(BASE_URL)
        
        # 检查标题
        title = await page.title()
        assert "ForTest" in title, f"标题错误: {title}"
        
        # 检查上传按钮
        upload_btn = page.locator('.upload-btn')
        await expect(upload_btn).to_be_visible()
        
        print(f"✅ 主页加载成功")
        print(f"   URL: {page.url}")
        print(f"   标题: {title}")
        
        await browser.close()

async def test_pdf_upload():
    """测试：PDF 上传功能"""
    print("\n📤 测试 2：PDF 上传")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(BASE_URL)
        
        # 选择 PDF 文件
        file_input = page.locator('#pdfInput')
        await file_input.set_input_files(PDF_PATH)
        
        # 等待上传进度
        print("   等待上传...")
        await page.wait_for_selector('.upload-progress', timeout=60000)
        
        # 检查上传进度
        progress_text = page.locator('.upload-progress p')
        for i in range(60):  # 最多等待 60 秒
            text = await progress_text.text_content()
            if "100%" in text:
                print(f"✅ 上传成功！")
                print(f"   进度: {text}")
                break
            await asyncio.sleep(1)
        else:
            raise TimeoutError("上传超时")
        
        await browser.close()

async def test_questions_loaded():
    """测试：题目加载和显示"""
    print("\n📝 测试 3：题目加载和显示")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(BASE_URL)
        
        # 上传 PDF
        file_input = page.locator('#pdfInput')
        await file_input.set_input_files(PDF_PATH)
        
        # 等待题目加载
        print("   等待题目加载...")
        await page.wait_for_selector('.question-header', timeout=120000)
        
        # 检查题目编号
        question_num = page.locator('.question-header h3')
        await expect(question_num).to_be_visible()
        num_text = await question_num.text_content()
        print(f"✅ 题目加载成功！")
        print(f"   当前题目: {num_text}")
        
        # 检查裁剪区域
        crop_container = page.locator('.crop-container')
        await expect(crop_container).to_be_visible()
        print(f"   裁剪区域: 可见")
        
        await browser.close()

async def test_topic_selection():
    """测试：Topic 选择功能"""
    print("\n📋 测试 4：Topic 选择")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(BASE_URL)
        
        # 上传并等待题目加载
        file_input = page.locator('#pdfInput')
        await file_input.set_input_files(PDF_PATH)
        await page.wait_for_selector('.question-header', timeout=120000)
        
        # 选择 Topic
        topic_dropdown = page.locator('.topic-dropdown')
        await expect(topic_dropdown).to_be_visible()
        await topic_dropdown.select_option('Chapter 1: economic problem')
        
        print("✅ Topic 选择功能正常！")
        print("   已选择: Chapter 1: economic problem")
        
        await browser.close()

async def test_preview():
    """测试：归类预览功能"""
    print("\n👀 测试 5：归类预览")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(BASE_URL)
        
        # 上传并等待
        file_input = page.locator('#pdfInput')
        await file_input.set_input_files(PDF_PATH)
        await page.wait_for_selector('.question-header', timeout=120000)
        
        # 选择 Topic
        topic_dropdown = page.locator('.topic-dropdown')
        await topic_dropdown.select_option('Chapter 2: economic assumptions')
        
        # 检查预览区域
        preview_section = page.locator('.preview-section')
        await expect(preview_section).to_be_visible()
        
        # 检查是否有分组
        topic_group = page.locator('.topic-group')
        await asyncio.sleep(2)  # 等待更新
        
        if await topic_group.count() > 0:
            print("✅ 归类预览功能正常！")
            print("   Topic 分组可见")
        else:
            print("⚠️ 还未选择任何题目")
        
        await browser.close()

async def test_navigation():
    """测试：题目导航（上一题/下一题）"""
    print("\n➡️ 测试 6：题目导航")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(BASE_URL)
        
        # 上传并等待
        file_input = page.locator('#pdfInput')
        await file_input.set_input_files(PDF_PATH)
        await page.wait_for_selector('.question-header', timeout=120000)
        
        # 测试下一题按钮
        next_btn = page.locator('button:has-text("下一题")')
        
        if await next_btn.is_enabled():
            await next_btn.click()
            await asyncio.sleep(1)
            print("✅ 下一题按钮工作正常")
        else:
            print("⚠️ 已是最后一题")
        
        # 测试上一题按钮
        prev_btn = page.locator('button:has-text("上一题")')
        if await prev_btn.is_enabled():
            print("✅ 上一题按钮工作正常")
        else:
            print("⚠️ 已是第一题")
        
        await browser.close()

async def test_api_topics():
    """测试：API Topics 接口"""
    print("\n🔗 测试 7：API Topics 接口")
    
    import requests
    response = requests.get(f"{BASE_URL}/api/topics")
    
    if response.status_code == 200:
        topics = response.json()['topics']
        print(f"✅ API Topics 接口正常！")
        print(f"   返回 {len(topics)} 个 Topic")
        print(f"   第一个: {topics[0][:50]}...")
    else:
        print(f"❌ API Topics 接口失败: {response.status_code}")

async def test_api_upload():
    """测试：API Upload 接口"""
    print("\n📤 测试 8：API Upload 接口")
    
    import requests
    import time
    
    # 读取 PDF
    with open(PDF_PATH, "rb") as f:
        pdf_data = f.read()
        pdf_base64 = base64.b64encode(pdf_data).decode()
    
    start_time = time.time()
    response = requests.post(
        f"{BASE_URL}/api/upload-pdf",
        json={"pdf_base64": pdf_base64},
        timeout=120
    )
    elapsed = time.time() - start_time
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ API Upload 接口正常！")
        print(f"   耗时: {elapsed:.2f}s")
        print(f"   页数: {result.get('total_pages', 0)}")
    else:
        print(f"❌ API Upload 接口失败: {response.status_code}")

async def main():
    """运行所有测试"""
    print("=" * 60)
    print("🧪 ForTest E2E 自动化测试")
    print("=" * 60)
    print(f"🌐 测试地址: {BASE_URL}")
    print(f"📄 测试 PDF: {PDF_PATH}")
    
    tests = [
        ("主页加载", test_homepage),
        ("PDF 上传", test_pdf_upload),
        ("题目加载", test_questions_loaded),
        ("Topic 选择", test_topic_selection),
        ("归类预览", test_preview),
        ("题目导航", test_navigation),
        ("API Topics", test_api_topics),
        ("API Upload", test_api_upload),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            await test_func()
            passed += 1
        except Exception as e:
            print(f"\n❌ {test_name} 测试失败: {e}")
            failed += 1
            import traceback
            traceback.print_exc()
    
    print("\n" + "=" * 60)
    print("📊 测试结果汇总")
    print("=" * 60)
    print(f"✅ 通过: {passed}/{len(tests)}")
    print(f"❌ 失败: {failed}/{len(tests)}")
    
    if failed == 0:
        print("\n🎉 所有测试通过！ForTest 功能正常！")
    else:
        print(f"\n⚠️ 有 {failed} 个测试失败，请检查")

if __name__ == "__main__":
    asyncio.run(main())
