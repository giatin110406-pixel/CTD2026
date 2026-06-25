import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Mic, Paperclip, FileText, BarChart2, BookOpen, FileUp } from 'lucide-react'


const API_BASE_URL = 'http://127.0.0.1:8001';


function ChatWindow({ onViewPdf }) {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'bot', text: 'Xin chào! Tôi là trợ lý AI hỗ trợ nghiên cứu luận văn của bạn. Bạn cần hỏi gì về tài liệu hôm nay?' }
    ])
    const [input, setInput] = useState('')
    const [hoveredCardId, setHoveredCardId] = useState(null)
    const [isInputFocused, setIsInputFocused] = useState(false)
    const chatEndRef = useRef(null)


    // Các Hook State mới phục vụ cho tính năng So sánh đề tài
    const [isCompareMode, setIsCompareMode] = useState(false)
    const [compareForm, setCompareForm] = useState({ title: '', description: '' })
    const [compareResult, setCompareResult] = useState(null)
    const [isComparing, setIsComparing] = useState(false)




    // Tự động cuộn xuống cuối đoạn chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])


    // 1. HÀM GỌI API RAG THẬT TỪ BACKEND FASTAPI
    const triggerBotResponse = async (userText) => {
        // Tạo một ID tạm thời để hiển thị trạng thái Bot đang suy nghĩ
        const botLoadingId = Date.now() + 1;
        setMessages(prev => [...prev, {
            id: botLoadingId,
            sender: 'bot',
            text: 'Thesis Chatbot đang truy vấn kho dữ liệu FAISS và suy nghĩ...'
        }]);


        try {
            // Gọi sang API FastAPI cổng 8001 của bạn
            const response = await fetch(`${API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userText }) // Truyền key "message" khớp với ChatRequest trong main.py
            });


            if (!response.ok) throw new Error(`Lỗi Server Backend: ${response.status}`);


            const data = await response.json();


            // Cập nhật câu trả lời thật từ RAG đè vào dòng chữ đang suy nghĩ
            setMessages(prev => prev.map(msg => {
                if (msg.id === botLoadingId) {
                    let finalText = data.answer; // Lấy câu trả lời động từ Gemini


                    // Nếu backend tìm thấy nguồn trích dẫn, nối thêm vào cuối bong bóng chat
                    if (data.sources && data.sources.length > 0) {
                        finalText += '\n\n📚 **Nguồn trích dẫn tìm thấy:**';
                        data.sources.forEach((src, idx) => {
                            finalText += `\n[${idx + 1}] ${src.title} - ${src.authors} (${src.year})`;
                        });
                    }


                    // Tự động gán file tài liệu tham khảo nếu câu trả lời thuộc về chương nào đó
                    let citationPdf = "/documents/thamkhao.pdf";
                    if (userText.toLowerCase().includes("chương 1")) citationPdf = "/documents/chuong1.pdf";
                    if (userText.toLowerCase().includes("chương 2")) citationPdf = "/documents/chuong2.pdf";


                    return {
                        ...msg,
                        text: finalText,
                        citation: citationPdf // Giữ nguyên tính năng mở xem PDF bên phải của bạn
                    };
                }
                return msg;
            }));


        } catch (error) {
            console.error("Lỗi kết nối RAG:", error);
            setMessages(prev => prev.map(msg =>
                msg.id === botLoadingId
                    ? { ...msg, text: '❌ Không thể kết nối tới server Backend RAG. Bạn đã chạy lệnh uvicorn cổng 8001 chưa?' }
                    : msg
            ));
        }
    }


    // 2. HÀM XỬ LÝ KHI NGƯỜI DÙNG BẤM GỬI TIN NHẮN
    const handleSend = (e) => {
        if (e) e.preventDefault()
        if (!input.trim()) return


        const userMessage = { id: Date.now(), sender: 'user', text: input }
        setMessages(prev => [...prev, userMessage])
        const query = input
        setInput('')


        // Gọi hàm xử lý API thật
        triggerBotResponse(query)
    }


    /**
     * Chuyển đổi giữa chế độ Chat thường và So sánh đề tài.
     * Tự động xóa kết quả so sánh cũ khi quay lại chế độ Chat thường.
     * @param {boolean} newMode - Chế độ mới (true = So sánh, false = Chat thường)
     */
    const handleModeSwitch = (newMode) => {
        setIsCompareMode(newMode);
        if (newMode === false) {
            setCompareResult(null);
        }
    };


    /**
     * Gửi đề tài nghiên cứu lên backend để tìm kiếm các luận văn tương quan
     * và phân tích khoảng trống nghiên cứu (Giới hạn timeout 30 giây).
     */
    const handleCompare = async () => {
        if (!compareForm.title.trim()) {
            alert("Vui lòng nhập tiêu đề đề tài");
            return;
        }
        if (!compareForm.description.trim()) {
            alert("Vui lòng nhập mô tả đề tài");
            return;
        }
        if (compareForm.description.trim().length < 20) {
            alert("Mô tả quá ngắn (tối thiểu 20 ký tự)");
            return;
        }
        if (compareForm.description.trim().length > 1000) {
            alert("Mô tả quá dài (tối đa 1000 ký tự)");
            return;
        }


        setIsComparing(true);
        setCompareResult(null);


        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 giây timeout


        try {
            const response = await fetch(`${API_BASE_URL}/api/compare-topic`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: compareForm.title,
                    description: compareForm.description
                }),
                signal: controller.signal
            });


            clearTimeout(timeoutId);


            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Lỗi máy chủ khi đối chiếu dữ liệu.");
            }


            const data = await response.json();
            setCompareResult(data);


        } catch (error) {
            console.error("Lỗi đối chiếu đề tài:", error);
            if (error.name === 'AbortError') {
                alert("Yêu cầu quá hạn (Timeout): Quá trình xử lý phía máy chủ mất hơn 30 giây.");
            } else {
                alert(`Lỗi: ${error.message}`);
            }
        } finally {
            setIsComparing(false);
        }
    };




    const handleCardClick = (promptText) => {
        const userMessage = { id: Date.now(), sender: 'user', text: promptText }
        setMessages(prev => [...prev, userMessage])
        triggerBotResponse(promptText)
    }


    // Suggestions data matching mockup cards
    const suggestionCards = [
        {
            id: 1,
            title: "Tóm tắt chương luận văn",
            prompt: "Hãy tóm tắt nội dung chính và các đóng góp khoa học quan trọng của Luận văn Chương 1.",
            renderGraphic: () => (
                <div style={{ marginTop: '12px', fontSize: '11px', color: '#64748b', textAlign: 'left', backgroundColor: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '4px' }}>1. Khái quát chung:</div>
                    <div style={{ height: '4px', backgroundColor: '#cbd5e1', borderRadius: '2px', width: '90%', marginBottom: '4px' }}></div>
                    <div style={{ height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', width: '75%', marginBottom: '4px' }}></div>
                    <div style={{ height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', width: '85%' }}></div>
                </div>
            )
        },
        {
            id: 2,
            title: "Trích dẫn nguồn tài liệu",
            prompt: "Hướng dẫn tôi cách trích dẫn tài liệu tham khảo theo chuẩn APA cho các bài viết AI.",
            renderGraphic: () => (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '54px', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef4444', border: '1px solid #fee2e2', padding: '2px 4px', borderRadius: '4px', backgroundColor: '#fef2f2' }}>PDF</span>
                        <div style={{ height: '2px', backgroundColor: '#cbd5e1', width: '20px', marginTop: '4px' }}></div>
                    </div>
                    <div style={{ position: 'absolute', bottom: '6px', right: '6px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#0061c1', display: 'flex', alignItems: 'center', justifyStyle: 'center', color: '#ffffff', fontSize: '10px', fontWeight: 'bold', justifyContent: 'center' }}>+</div>
                </div>
            )
        },
        {
            id: 3,
            title: "Gợi ý dàn ý nghiên cứu",
            prompt: "Đề xuất dàn ý và bố cục chi tiết cho Chương 2 (Cơ sở lý thuyết của RAG).",
            renderGraphic: () => (
                <div style={{ marginTop: '12px', fontSize: '11px', color: '#64748b', textAlign: 'left', backgroundColor: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 600, color: '#0061c1', fontSize: '10px', marginBottom: '2px' }}>DÀN Ý ĐỀ XUẤT</div>
                    <div style={{ fontSize: '9px', lineHeight: '1.2' }}>
                        1. Tổng quan LLM<br />
                        2. Kiến trúc RAG cơ bản<br />
                        3. Vector Database...
                    </div>
                </div>
            )
        },
        {
            id: 4,
            title: "Trực quan số liệu biểu đồ",
            prompt: "Tạo biểu đồ trực quan hóa kết quả so sánh độ chính xác của RAG và Fine-tuning.",
            renderGraphic: () => (
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '54px', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ width: '6px', height: '20px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></div>
                    <div style={{ width: '6px', height: '35px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></div>
                    <div style={{ width: '6px', height: '15px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></div>
                    <div style={{ width: '6px', height: '28px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></div>
                    <div style={{ width: '6px', height: '42px', backgroundColor: '#3b82f6', borderRadius: '2px' }}></div>
                </div>
            )
        }
    ]


    // Styles
    const containerStyle = {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        height: '100%',
        position: 'relative',
    }


    const headerStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid #f1f5f9',
        backgroundColor: '#ffffff',
    }


    const headerLogoStyle = {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '20px',
        fontWeight: 600,
        background: 'linear-gradient(to right, #4285f4, #9b51e0, #e91e63)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    }


    const avatarStyle = {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        backgroundColor: '#f3705a',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: '14px',
        fontFamily: "'Outfit', sans-serif",
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    }


    const chatAreaStyle = {
        flex: 1,
        padding: '24px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    }


    const welcomeContainerStyle = {
        width: '100%',
        maxWidth: '820px',
        marginTop: '60px',
        textAlign: 'left',
        fontFamily: "'Outfit', sans-serif",
    }


    const welcomeTitleStyle = {
        fontSize: '44px',
        fontWeight: 500,
        margin: '0 0 8px 0',
        background: 'linear-gradient(45deg, #1a73e8, #9b51e0, #e91e63)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    }


    const welcomeSubtitleStyle = {
        fontSize: '40px',
        fontWeight: 500,
        color: '#c4c7c5',
        margin: '0 0 40px 0',
        lineHeight: 1.2,
    }


    const cardGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        width: '100%',
        marginBottom: '20px',
    }


    const cardStyle = (cardId) => ({
        padding: '16px',
        borderRadius: '16px',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '140px',
        border: '1px solid transparent',
        backgroundColor: hoveredCardId === cardId ? '#e3eaf2' : '#f0f4f9',
        transform: hoveredCardId === cardId ? 'translateY(-2px)' : 'none',
    })


    const messageListStyle = {
        width: '100%',
        maxWidth: '760px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        paddingBottom: '120px',
    }


    const msgBubbleStyle = (sender) => ({
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        alignSelf: sender === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
    })


    const msgContentStyle = (sender) => ({
        backgroundColor: sender === 'user' ? '#f0f4f9' : 'transparent',
        color: '#1f2937',
        padding: sender === 'user' ? '12px 18px' : '0px',
        borderRadius: '18px',
        fontSize: '15px',
        lineHeight: 1.6,
        whiteSpace: 'pre-line',
    })


    const botIconStyle = {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #1a73e8, #a855f7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        flexShrink: 0,
        boxShadow: '0 2px 6px rgba(168,85,247,0.2)',
    }


    const inputAreaContainerStyle = {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 24px 20px 24px',
        backgroundColor: 'linear-gradient(to top, #ffffff 80%, rgba(255,255,255,0))',
    }


    const inputFormStyle = {
        width: '100%',
        maxWidth: '760px',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#f0f4f9',
        borderRadius: '9999px',
        padding: '6px 16px',
        boxShadow: isInputFocused ? '0 1px 6px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.04)' : 'none',
        border: isInputFocused ? '1px solid #cbd5e1' : '1px solid transparent',
        transition: 'all 0.2s ease',
    }


    const inputFieldStyle = {
        flex: 1,
        border: 'none',
        backgroundColor: 'transparent',
        outline: 'none',
        padding: '12px 8px',
        fontSize: '15px',
        color: '#1f2937',
    }


    const actionButtonStyle = {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#444746',
        padding: '8px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.2s',
    }


    const warningTextStyle = {
        fontSize: '11px',
        color: '#64748b',
        marginTop: '8px',
        textAlign: 'center',
    }


    const citationBadgeStyle = {
        marginTop: '12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        color: '#1d4ed8',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s',
    }


    return (
        <div style={containerStyle}>
            {/* Top Header */}
            <div style={headerStyle}>
                <div style={headerLogoStyle}>
                    <Sparkles size={20} style={{ color: '#1a73e8' }} />
                    Thesis Chatbot <span style={{ fontSize: '12px', fontWeight: 500, backgroundColor: '#f0f4f9', color: '#1e293b', padding: '2px 8px', borderRadius: '9999px', marginLeft: '6px', border: '1px solid #cbd5e1' }}>Advanced</span>
                </div>
                <div style={avatarStyle}>S</div>
            </div>


            {/* TAB TOGGLE: Chuyển đổi giữa hai chế độ */}
            <div style={{
                display: 'flex',
                gap: '12px',
                padding: '12px 24px',
                borderBottom: '1px solid #f1f5f9',
                backgroundColor: '#ffffff'
            }}>
                <button
                    onClick={() => handleModeSwitch(false)}
                    style={{
                        padding: '8px 16px',
                        background: !isCompareMode ? '#1a73e8' : '#f1f5f9',
                        color: !isCompareMode ? 'white' : '#475569',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        fontSize: '14px'
                    }}
                >
                    💬 Chat thường
                </button>
                <button
                    onClick={() => handleModeSwitch(true)}
                    style={{
                        padding: '8px 16px',
                        background: isCompareMode ? '#1a73e8' : '#f1f5f9',
                        color: isCompareMode ? 'white' : '#475569',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        fontSize: '14px'
                    }}
                >
                    🔍 So sánh đề tài
                </button>
            </div>


            {isCompareMode ? (
                // CHẾ ĐỘ SO SÁNH (Chiếm toàn bộ không gian nội dung bên dưới)
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '24px',
                    overflowY: 'auto',
                    gap: '16px',
                    maxWidth: '820px',
                    margin: '0 auto',
                    width: '100%'
                }}>
                    <h3 style={{ margin: 0, color: '#1f2937', fontSize: '20px', fontWeight: 600 }}>📋 So sánh đề tài nghiên cứu</h3>

                    {/* Input Tiêu đề */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>Tiêu đề nghiên cứu dự kiến</label>
                        <input
                            type="text"
                            placeholder="Ví dụ: Ứng dụng trí tuệ nhân tạo để chẩn đoán hình ảnh y học"
                            value={compareForm.title}
                            onChange={(e) => setCompareForm({ ...compareForm, title: e.target.value })}
                            disabled={isComparing}
                            style={{
                                padding: '12px 16px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '14px',
                                outline: 'none'
                            }}
                        />
                    </div>


                    {/* Input Mô tả */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '14px', fontWeight: '600', color: '#475569' }}>Mô tả chi tiết mục đích, phương pháp nghiên cứu (20 - 1000 ký tự)</label>
                        <textarea
                            placeholder="Mô tả tóm tắt định hướng nghiên cứu, công nghệ áp dụng, mục tiêu đề tài..."
                            value={compareForm.description}
                            onChange={(e) => setCompareForm({ ...compareForm, description: e.target.value })}
                            disabled={isComparing}
                            style={{
                                padding: '12px 16px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '8px',
                                fontSize: '14px',
                                minHeight: '120px',
                                resize: 'vertical',
                                outline: 'none'
                            }}
                        />
                        <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'flex-end' }}>
                            {compareForm.description.length} / 1000 ký tự
                        </span>
                    </div>


                    {/* Nút gửi */}
                    <button
                        onClick={handleCompare}
                        disabled={isComparing}
                        style={{
                            padding: '12px',
                            backgroundColor: isComparing ? '#cbd5e1' : '#1a73e8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: '600',
                            cursor: isComparing ? 'not-allowed' : 'pointer',
                            transition: 'background-color 0.2s',
                            fontSize: '15px'
                        }}
                    >
                        {isComparing ? '⏳ Đang phân tích...' : '🚀 Bắt đầu đối so sánh đề tài'}
                    </button>


                    {/* Hiển thị Kết quả */}
                    {compareResult && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
                            {/* Mức độ trùng lặp */}
                            <div style={{
                                padding: '16px',
                                backgroundColor: '#fffbeb',
                                borderLeft: '4px solid #f59e0b',
                                borderRadius: '8px'
                            }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#b45309', fontSize: '16px', fontWeight: 600 }}>📊 Đánh giá trùng lặp</h4>
                                <p style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#d97706' }}>
                                    {compareResult.overlap_level}
                                </p>
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#78350f' }}>
                                    Độ tương tự cao nhất tìm thấy: {compareResult.top_match_similarity}%
                                </p>
                            </div>


                            {/* Danh sách đề tài liên quan */}
                            <div>
                                <h4 style={{ margin: '0 0 12px 0', color: '#1f2937', fontSize: '16px', fontWeight: 600 }}>📚 Top 5 thesis liên quan trong hệ thống</h4>
                                {compareResult.similar_theses.length === 0 ? (
                                    <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', textAlign: 'center', color: '#64748b' }}>
                                        Không tìm thấy đề tài liên quan tương tự nào.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {compareResult.similar_theses.slice(0, 5).map((thesis, idx) => (
                                            <div key={idx} style={{
                                                padding: '16px',
                                                backgroundColor: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px'
                                            }}>
                                                <h5 style={{ margin: '0 0 6px 0', color: '#1e3a8a', fontSize: '14px', fontWeight: 600 }}>
                                                    {idx + 1}. {thesis.title}
                                                </h5>
                                                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#475569' }}>
                                                    👤 Tác giả: {thesis.authors} | 📅 Năm: {thesis.year} | 📖 {thesis.journal}
                                                </p>
                                                <p style={{
                                                    margin: '0 0 10px 0',
                                                    fontSize: '13px',
                                                    color: '#334155',
                                                    lineHeight: '1.5',
                                                    backgroundColor: '#fff',
                                                    padding: '8px 12px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #f1f5f9'
                                                }}>
                                                    {thesis.summary}
                                                </p>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: '700',
                                                    backgroundColor: '#dbeafe',
                                                    color: '#1e40af',
                                                    padding: '4px 8px',
                                                    borderRadius: '6px'
                                                }}>
                                                    Độ giống nhau: {thesis.similarity}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>


                            {/* Phân tích khoảng trống của Gemini */}
                            <div>
                                <h4 style={{ margin: '0 0 12px 0', color: '#1f2937', fontSize: '16px', fontWeight: 600 }}>💡 Đánh giá khoảng trống nghiên cứu (Gemini AI gợi ý)</h4>
                                <div style={{
                                    padding: '16px',
                                    backgroundColor: '#f0fdf4',
                                    border: '1px solid #bbf7d0',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    color: '#166534',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.6'
                                }}>
                                    {compareResult.gap_analysis}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                // CHẾ ĐỘ CHAT THƯỜNG
                <>
                    {/* Chat Flow / Suggestions */}
                    <div style={chatAreaStyle}>
                        {messages.length <= 1 ? (
                            // Welcome screen (Gemini Advanced style)
                            <div style={welcomeContainerStyle}>
                                <h1 style={welcomeTitleStyle}>Xin chào, Sam</h1>
                                <h2 style={welcomeSubtitleStyle}>Hôm nay tôi có thể trợ giúp gì cho luận văn của bạn?</h2>


                                <div style={cardGridStyle}>
                                    {suggestionCards.map((card) => (
                                        <div
                                            key={card.id}
                                            style={cardStyle(card.id)}
                                            onMouseEnter={() => setHoveredCardId(card.id)}
                                            onMouseLeave={() => setHoveredCardId(null)}
                                            onClick={() => handleCardClick(card.prompt)}
                                        >
                                            <span style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b', lineHeight: 1.4 }}>
                                                {card.title}
                                            </span>
                                            {card.renderGraphic()}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            // Chat messages List
                            <div style={messageListStyle}>
                                {messages.map((msg) => (
                                    <div key={msg.id} style={msgBubbleStyle(msg.sender)}>
                                        {msg.sender === 'bot' && (
                                            <div style={botIconStyle}>
                                                <Sparkles size={16} />
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <div
                                                style={msgContentStyle(msg.sender)}
                                                onMouseEnter={(e) => {
                                                    if (msg.sender === 'user') e.currentTarget.style.backgroundColor = '#e8eff8'
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (msg.sender === 'user') e.currentTarget.style.backgroundColor = '#f0f4f9'
                                                }}
                                            >
                                                {msg.text}
                                            </div>


                                            {/* Nút xem tài liệu nếu có trích dẫn từ nguồn RAG */}
                                            {msg.sender === 'bot' && msg.citation && (
                                                <div>
                                                    <div
                                                        style={citationBadgeStyle}
                                                        onClick={() => onViewPdf(msg.citation)}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dbeafe'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
                                                    >
                                                        <FileText size={14} />
                                                        <span>Xem tài liệu nguồn: {msg.citation.split('/').pop()}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {msg.sender === 'user' && (
                                            <div style={{ ...avatarStyle, flexShrink: 0 }}>S</div>
                                        )}
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                        )}
                    </div>


                    {/* Input Form at bottom */}
                    <div style={inputAreaContainerStyle}>
                        <form onSubmit={handleSend} style={inputFormStyle}>
                            <button type="button" style={actionButtonStyle} title="Đính kèm tài liệu">
                                <Paperclip size={20} />
                            </button>
                            <input
                                type="text"
                                value={input}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Nhập câu hỏi tại đây..."
                                style={inputFieldStyle}
                            />
                            <button type="button" style={actionButtonStyle} title="Nhập giọng nói">
                                <Mic size={20} />
                            </button>
                            <button
                                type="submit"
                                style={{
                                    ...actionButtonStyle,
                                    color: input.trim() ? '#1a73e8' : '#444746',
                                    cursor: input.trim() ? 'pointer' : 'default'
                                }}
                                disabled={!input.trim()}
                                title="Gửi câu hỏi"
                            >
                                <Send size={20} />
                            </button>
                        </form>
                        <div style={warningTextStyle}>
                            Thesis Chatbot có thể đưa ra câu trả lời không chính xác, vui lòng đối chiếu dữ liệu với file nguồn PDF.
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}


export default ChatWindow

