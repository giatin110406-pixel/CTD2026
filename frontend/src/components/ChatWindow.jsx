import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Mic, Paperclip, FileText, BarChart2, BookOpen, FileUp } from 'lucide-react'

function ChatWindow({ onViewPdf }) {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'bot', text: 'Xin chào! Tôi là trợ lý AI hỗ trợ nghiên cứu luận văn của bạn. Bạn cần hỏi gì về tài liệu hôm nay?' }
    ])
    const [input, setInput] = useState('')
    const [hoveredCardId, setHoveredCardId] = useState(null)
    const [isInputFocused, setIsInputFocused] = useState(false)
    const chatEndRef = useRef(null)

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
            const response = await fetch('http://127.0.0.1:8001/api/chat', {
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
        </div>
    )
}

export default ChatWindow