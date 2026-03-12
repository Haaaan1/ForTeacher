import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactCrop, { Crop } from 'react-image-crop';
import { PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button, Form, ListGroup, Modal } from 'react-bootstrap';
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
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        setUploadStatus('');

        // 自动检测题目
        await detectQuestions(response.data.pages);
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
  const detectQuestions = async (pagesData: Page[]) => {
    try {
      const response = await axios.post(`${API_URL}/detect-questions`, {
        pages: pagesData
      });

      setQuestions(response.data.questions);
      setCurrentQuestionIndex(0);

      // 设置初始 crop
      if (response.data.questions[0]) {
        const q = response.data.questions[0];
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

  // 选择 Topic
  const handleTopicSelect = (topic: string) => {
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
  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      updateCropForQuestion(currentQuestionIndex - 1);
    }
  };

  // 下一题
  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      updateCropForQuestion(currentQuestionIndex + 1);
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
      // 收集所有裁剪后的图片
      const updatedQuestions = [...questions].map(q => {
        // 如果有 crop_image 则使用，已经处理好了
        return q;
      });

      console.log('Generating PDF with questions:', updatedQuestions.length);

      const response = await axios.post(`${API_URL}/generate-pdf`, {
        questions: updatedQuestions
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
      alert('PDF 生成成功！');
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

  const currentQuestion = questions[currentQuestionIndex];
  const currentPage = pages.find(p => p.page_num === currentQuestion?.page_num);

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
    </div>
  );
}

export default App;
