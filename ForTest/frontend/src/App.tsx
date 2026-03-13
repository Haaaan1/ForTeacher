import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactCrop, { Crop } from 'react-image-crop';
import { PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button, Form, ListGroup, Modal, Toast, ToastContainer } from 'react-bootstrap';
import './App.css';

const API_URL = '/api';

interface Question {
  id: string;
  number: number;
  page_num: number;
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  topic: string | null;
  image: string;
  crop_image?: string;
}

interface Page {
  page_num: number;
  image: string;
  width: number;
  height: number;
}

function App() {
  // 状态
  const [topics, setTopics] = useState<string[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentViewPageNum, setCurrentViewPageNum] = useState(1);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [pageQuestionCounts, setPageQuestionCounts] = useState<Record<number, number>>({});
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [successToastMessage, setSuccessToastMessage] = useState('');

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = src;
    });
  };

  const cropQuestionFromBoundingBox = async (question: Question): Promise<string | undefined> => {
    const page = pages.find(p => p.page_num === question.page_num);
    if (!page) return undefined;

    try {
      const image = await loadImage(page.image);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      const scaleX = image.naturalWidth / page.width;
      const scaleY = image.naturalHeight / page.height;

      const x = Math.max(0, Math.floor(question.bounding_box.x * scaleX));
      const y = Math.max(0, Math.floor(question.bounding_box.y * scaleY));
      const width = Math.max(1, Math.floor(question.bounding_box.width * scaleX));
      const height = Math.max(1, Math.floor(question.bounding_box.height * scaleY));

      const safeWidth = Math.min(width, image.naturalWidth - x);
      const safeHeight = Math.min(height, image.naturalHeight - y);
      if (safeWidth <= 0 || safeHeight <= 0) return undefined;

      canvas.width = safeWidth;
      canvas.height = safeHeight;
      ctx.drawImage(image, x, y, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight);
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to crop by bounding box:', error);
      return undefined;
    }
  };

  const buildQuestionsForPdf = async (): Promise<Question[]> => {
    const baseQuestions = questions.map(q => ({ ...q }));
    const canvas = canvasRef.current;

    // 关键逻辑：优先保存当前题目正在编辑的裁剪结果，避免最后一题丢失
    if (canvas && canvas.width > 0 && canvas.height > 0 && currentQuestionIndex >= 0 && baseQuestions[currentQuestionIndex]) {
      baseQuestions[currentQuestionIndex].crop_image = canvas.toDataURL('image/png');
    }

    const finalizedQuestions = await Promise.all(
      baseQuestions.map(async (q) => {
        if (q.crop_image) return q;
        const fallbackCrop = await cropQuestionFromBoundingBox(q);
        if (!fallbackCrop) return q;
        return { ...q, crop_image: fallbackCrop };
      })
    );

    return finalizedQuestions;
  };

  // 加载默认 Topics
  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const response = await axios.get(`${API_URL}/topics`);
      setTopics(response.data.topics);
    } catch (error) {
      console.error('Failed to load topics:', error);
      // 使用默认 topics
      setTopics([
        "Chapter 1: economic problem",
        "Chapter 2: economic assumptions",
        "Chapter 3: demand curve & Chapter 4: factors that may shift demand curve",
        "Chapter 5:the supply curve & Chapter 6: factors that may shift supply curve",
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
      ]);
    }
  };

  // 上传 PDF（改进版）
  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 显示文件大小
    const fileSizeKB = (file.size / 1024).toFixed(2);
    console.log(`File size: ${fileSizeKB} KB`);
    setUploadStatus(`正在上传 (${fileSizeKB} KB)...`);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;

      try {
        const response = await axios.post(`${API_URL}/upload-pdf`, {
          pdf_base64: base64
        }, {
          timeout: 120000,
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded)
            );
            setUploadProgress(percentCompleted);
            console.log(`Upload progress: ${percentCompleted}%`);
          }
        });

        setPages(response.data.pages);
        setCurrentViewPageNum(1);

        // 立即重置进度条和状态，避免卡顿感
        setUploadProgress(0);
        setUploadStatus('正在处理题目...');

        // 自动检测题目
        await detectQuestions(response.data.pages);

        // 清除状态
        setUploadStatus('');
      } catch (error: any) {
        console.error('Upload failed:', error);
        setUploadProgress(0);
        setUploadStatus('');

        // 详细的错误处理
        if (error.code === 'ECONNABORTED') {
          alert('上传超时，请检查网络连接或重试');
        } else if (error.response?.status === 413) {
          alert('文件过大，请上传更小的 PDF');
        } else if (error.message === 'Network Error') {
          alert('网络连接失败，请检查网络设置');
        } else {
          alert(`上传失败: ${error.message || '未知错误'}`);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // 检测题目
  const detectQuestions = async (pagesData: Page[], customCounts: Record<number, number> = {}) => {
    try {
      const response = await axios.post(`${API_URL}/detect-questions`, {
        pages: pagesData,
        page_question_counts: customCounts
      });

      const newQuestions = response.data.questions as Question[];

      // 智能合并策略：保留未变更页面的 Topic 和裁剪信息
      // 1. 找出哪些页面的题目数发生了变化（或者这是第一次检测）
      // 2. 对于没变化的页面，尝试保留原有的题目数据
      
      setQuestions(prevQuestions => {
        if (prevQuestions.length === 0) return newQuestions;

        // 建立旧题目的索引：page_num -> questions
        const oldQuestionsByPage: Record<number, Question[]> = {};
        prevQuestions.forEach(q => {
          if (!oldQuestionsByPage[q.page_num]) {
            oldQuestionsByPage[q.page_num] = [];
          }
          oldQuestionsByPage[q.page_num].push(q);
        });

        // 遍历新题目，尝试从旧题目中恢复状态
        return newQuestions.map(newQ => {
          const oldPageQuestions = oldQuestionsByPage[newQ.page_num];
          
          // 如果该页曾经有题目，且题目数量一致（说明没改动数量），则尝试按顺序恢复 topic 和 crop_image
          // 注意：如果用户修改了题目数，这页的题目 ID 可能会变，或者数量变了，这时候就用新的（重置状态）
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const customCount = customCounts[newQ.page_num];
          
          // 逻辑：如果该页不在 customCounts 里（说明是默认），或者数量没变... 
          // 简化逻辑：只要该页的旧题目数量 == 新题目数量，就认为可以继承
          if (oldPageQuestions && oldPageQuestions.length > 0) {
             // 找到当前新题目在该页是第几个
             const indexInPage = newQuestions.filter(q => q.page_num === newQ.page_num && q.number < newQ.number).length;
             
             if (indexInPage < oldPageQuestions.length) {
                // 对应旧题目
                const oldQ = oldPageQuestions[indexInPage];
                // 如果题目数量没变（比较该页总数），则继承
                const newPageCount = newQuestions.filter(q => q.page_num === newQ.page_num).length;
                if (oldPageQuestions.length === newPageCount) {
                  return {
                    ...newQ,
                    topic: oldQ.topic,
                    crop_image: oldQ.crop_image
                  };
                }
             }
          }
          return newQ;
        });
      });

      // 如果是第一次加载（currentIndex=0），或者重置后索引越界，修正索引
      setCurrentQuestionIndex(prev => {
         if (prev >= response.data.questions.length) return 0;
         return prev;
      });

      // 设置初始 crop (如果是首次)
      if (questions.length === 0 && response.data.questions[0]) {
        const q = response.data.questions[0];
        setCurrentViewPageNum(q.page_num);
        setCrop({
          unit: '%',
          x: 0,
          y: (q.bounding_box.y / pagesData[0].height) * 100,
          width: 100,
          height: (q.bounding_box.height / pagesData[0].height) * 100
        });
      }
    } catch (error) {
      console.error('Detection failed:', error);
      alert('题目检测失败');
    }
  };

  // 处理单页重新识别
  const handleRescanPage = async (pageNum: number, count: number) => {
    // 1. 保存当前进度（裁剪图等）
    await saveCroppedImage();

    // 2. 更新配置
    const newCounts = { ...pageQuestionCounts, [pageNum]: count };
    setPageQuestionCounts(newCounts);

    // 3. 重新检测
    // 注意：detectQuestions 会处理合并逻辑
    await detectQuestions(pages, newCounts);
    
    alert(`第 ${pageNum} 页已按 ${count} 题重新识别`);
  };

  // 页面导航
  const handlePrevPage = async () => {
    const prevPageNum = currentViewPageNum - 1;
    if (prevPageNum < 1) return;
    
    jumpToPage(prevPageNum);
  };

  const handleNextPage = async () => {
    const nextPageNum = currentViewPageNum + 1;
    if (nextPageNum > pages.length) return;
    
    jumpToPage(nextPageNum);
  };

  const jumpToPage = async (pageNum: number) => {
    // 先保存当前
    await saveCroppedImage();
    // 关键逻辑：翻页只切换页面，不切换题号
    setCurrentViewPageNum(pageNum);
  };


  // 选择 Topic
  const handleTopicSelect = async (topic: string) => {
    // 先保存当前裁剪
    await saveCroppedImage();

    const updatedQuestions = [...questions];
    updatedQuestions[currentQuestionIndex].topic = topic;
    setQuestions(updatedQuestions);
  };

  // 添加新 Topic
  const handleAddTopic = () => {
    if (!newTopic.trim()) return;

    const updatedTopics = [...topics, newTopic];
    setTopics(updatedTopics);
    setNewTopic('');
    setShowTopicModal(false);

    // 自动选择新添加的 Topic
    handleTopicSelect(newTopic);
  };

  // 上一题
  const handlePrevQuestion = async () => {
    if (currentQuestionIndex > 0) {
      // 先保存当前题目的裁剪
      await saveCroppedImage();

      const nextIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(nextIndex);
      setCurrentViewPageNum(questions[nextIndex].page_num);
      updateCropForQuestion(nextIndex);
    }
  };

  // 下一题
  const handleNextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      // 先保存当前题目的裁剪
      await saveCroppedImage();

      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setCurrentViewPageNum(questions[nextIndex].page_num);
      updateCropForQuestion(nextIndex);
    }
  };

  // 更新 crop 区域
  const updateCropForQuestion = (index: number) => {
    const q = questions[index];
    const page = pages.find(p => p.page_num === q.page_num);
    if (page) {
      setCrop({
        unit: '%',
        x: 0,
        y: (q.bounding_box.y / page.height) * 100,
        width: 100,
        height: (q.bounding_box.height / page.height) * 100
      });
    }
  };

  // 生成 PDF（修复版）
  const handleGeneratePdf = async () => {
    try {
      const questionsForPdf = await buildQuestionsForPdf();
      setQuestions(questionsForPdf);
      console.log('Generating PDF with questions:', questionsForPdf.length);

      const response = await axios.post(`${API_URL}/generate-pdf`, {
        questions: questionsForPdf
      }, {
        responseType: 'blob',
        timeout: 120000
      });

      // 下载 PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'fortest_categorized.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 清理
      window.URL.revokeObjectURL(url);
      // 关键提示：使用内置 Toast，替代浏览器 alert
      setSuccessToastMessage('PDF 生成成功，已开始下载');
      setShowSuccessToast(true);
    } catch (error: any) {
      console.error('PDF generation failed:', error);

      if (error.code === 'ECONNABORTED') {
        alert('生成 PDF 超时，请稍后重试');
      } else if (error.response?.status === 413) {
        alert('数据过大，请减少题目数量');
      } else if (error.response?.status === 500) {
        alert('服务器错误，请联系管理员');
      } else {
        alert(`PDF 生成失败: ${error.message || '未知错误'}`);
      }
    }
  };

  // Canvas 图像处理
  useEffect(() => {
    if (!completedCrop || !imgRef.current || !canvasRef.current) {
      return;
    }

    const image = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }, [completedCrop]);

  // 保存当前题目的裁剪图片（返回 Promise）
  const saveCroppedImage = (): Promise<void> => {
    return new Promise(async (resolve) => {
      if (currentQuestionIndex < 0 || !questions[currentQuestionIndex]) {
        resolve();
        return;
      }

      let croppedImageData: string | undefined;

      try {
        const canvas = canvasRef.current;
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          croppedImageData = canvas.toDataURL('image/png');
        } else {
          // 关键逻辑：没有手动裁剪数据时，自动按题目边界生成截图
          croppedImageData = await cropQuestionFromBoundingBox(questions[currentQuestionIndex]);
        }

        if (croppedImageData) {
          setQuestions(prev => {
            const updated = [...prev];
            updated[currentQuestionIndex] = {
              ...updated[currentQuestionIndex],
              crop_image: croppedImageData
            };
            return updated;
          });
        }
      } catch (error) {
        console.error('Failed to save cropped image:', error);
      }

      setTimeout(resolve, 50);
    });
  };

  const currentQuestion = questions[currentQuestionIndex];
  const currentPage = pages.find(p => p.page_num === currentViewPageNum);

  // 按题目编号排序显示
  const sortedQuestions = [...questions].sort((a, b) => a.number - b.number);

  // 按 Topic 分组
  const groupedQuestions: Record<string, Question[]> = {};
  sortedQuestions.forEach(q => {
    if (q.topic) {
      if (!groupedQuestions[q.topic]) {
        groupedQuestions[q.topic] = [];
      }
      groupedQuestions[q.topic].push(q);
    }
  });

  return (
    <div className="App">
      <header className="header">
        <h1>📝 ForTest - 试卷题目归类</h1>
      </header>

      {!questions.length && (
        <div className="upload-section">
          <div className="upload-box">
            <h2>上传试卷 PDF</h2>
            <input
              type="file"
              accept=".pdf"
              onChange={handlePdfUpload}
              style={{ display: 'none' }}
              id="pdfInput"
            />
            <label htmlFor="pdfInput" className="upload-btn">
              选择 PDF 文件
            </label>
            <p className="upload-hint">支持自动识别题目，可调整边界</p>
            {uploadProgress > 0 && (
              <div className="upload-progress">
                <p>{uploadStatus} {uploadProgress}%</p>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <div className="main-content">
          <div className="left-panel">
            <div className="question-header">
              <h3>题目 {currentQuestion?.number}</h3>
              <p>第 {currentQuestion?.page_num} 页</p>
            </div>

            <div className="crop-container">
              {currentPage && (
                <div className="page-controls">
                  <div className="page-nav">
                    <Button 
                      variant="outline-secondary" 
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={currentPage.page_num <= 1}
                    >
                      ◀ 上一页
                    </Button>
                    <span className="page-info">第 {currentPage.page_num} / {pages.length} 页</span>
                    <Button 
                      variant="outline-secondary" 
                      size="sm"
                      onClick={handleNextPage}
                      disabled={currentPage.page_num >= pages.length}
                    >
                      下一页 ▶
                    </Button>
                  </div>
                  
                  <div className="page-settings">
                     <span className="setting-label">当前页题目数:</span>
                     <Form.Control
                       type="number"
                       min="1"
                       max="10"
                       size="sm"
                       className="count-input"
                       defaultValue={pageQuestionCounts[currentPage.page_num] || 3}
                       key={`count-${currentPage.page_num}`} // 强制重新渲染以更新 defaultValue
                       onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                         const val = parseInt(e.target.value);
                         if (val > 0 && val !== (pageQuestionCounts[currentPage.page_num] || 3)) {
                           if (window.confirm(`确定要将第 ${currentPage.page_num} 页重新识别为 ${val} 道题吗？\n注意：这将重置该页已有的 Topic 和截图。`)) {
                             handleRescanPage(currentPage.page_num, val);
                           } else {
                             // 恢复显示
                             e.target.value = (pageQuestionCounts[currentPage.page_num] || 3).toString();
                           }
                         }
                       }}
                       onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                         if (e.key === 'Enter') {
                           e.currentTarget.blur();
                         }
                       }}
                     />
                  </div>
                </div>
              )}

              {currentPage && (
                <div className="image-wrapper">
                  <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => setCompletedCrop(c)}
                  >
                    <img
                      ref={imgRef}
                      src={currentPage.image}
                      alt="Question"
                      style={{ maxWidth: '100%' }}
                    />
                  </ReactCrop>
                </div>
              )}
              <canvas
                ref={canvasRef}
                style={{ display: 'none' }}
              />
            </div>

            <div className="controls">
              <Button
                variant="outline-secondary"
                onClick={handlePrevQuestion}
                disabled={currentQuestionIndex === 0}
              >
                ← 上一题
              </Button>

              <Button
                variant="outline-secondary"
                onClick={handleNextQuestion}
                disabled={currentQuestionIndex === questions.length - 1}
              >
                下一题 →
              </Button>

              <Button
                variant="success"
                onClick={handleGeneratePdf}
              >
                📥 生成归类 PDF
              </Button>
            </div>
          </div>

          <div className="right-panel">
            <div className="topic-selector">
              <h3>选择 Topic</h3>
              {currentQuestion?.topic && (
                <div className="current-topic-badge">
                  当前: {currentQuestion.topic}
                </div>
              )}
              <Form.Select
                value={currentQuestion?.topic || ''}
                onChange={(e) => handleTopicSelect(e.target.value)}
                className="topic-dropdown"
                size="sm"
              >
                <option value="">-- 选择 Topic --</option>
                {topics.map((topic, index) => (
                  <option key={index} value={topic}>
                    {topic}
                  </option>
                ))}
              </Form.Select>

              <Button
                variant="outline-primary"
                onClick={() => setShowTopicModal(true)}
                className="add-topic-btn"
                size="sm"
              >
                + 新增 Topic
              </Button>
            </div>

            <div className="preview-section">
              <h3>归类预览</h3>
              {Object.keys(groupedQuestions).length === 0 && (
                <p className="no-data">暂无归类数据</p>
              )}

              {Object.entries(groupedQuestions).map(([topic, qs]) => (
                <div key={topic} className="topic-group">
                  <h4>📁 {topic}</h4>
                  <ListGroup>
                    {qs.map(q => (
                      <ListGroup.Item key={q.id}>
                        题目 {q.number}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Modal show={showTopicModal} onHide={() => setShowTopicModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>新增 Topic</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Control
            type="text"
            placeholder="输入 Topic 名称"
            value={newTopic}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTopic(e.target.value)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowTopicModal(false)}>
            取消
          </Button>
          <Button variant="primary" onClick={handleAddTopic}>
            添加
          </Button>
        </Modal.Footer>
      </Modal>

      <ToastContainer position="bottom-end" className="p-3">
        <Toast
          show={showSuccessToast}
          onClose={() => setShowSuccessToast(false)}
          delay={2500}
          autohide
          bg="success"
        >
          <Toast.Header closeButton>
            <strong className="me-auto">提示</strong>
          </Toast.Header>
          <Toast.Body className="text-white">{successToastMessage}</Toast.Body>
        </Toast>
      </ToastContainer>
    </div>
  );
}

export default App;
