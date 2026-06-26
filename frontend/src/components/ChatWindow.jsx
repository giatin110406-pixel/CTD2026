import React, { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Mic, Paperclip, FileText, BarChart2, BookOpen, FileUp, X } from 'lucide-react'


const API_BASE_URL = 'http://127.0.0.1:8001';


function ChatWindow({ setActivePdfName }) {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'bot', text: 'Xin chào! Tôi là trợ lý AI hỗ trợ nghiên cứu luận văn của bạn. Bạn cần hỏi gì về tài liệu hôm nay?' }
    ])
    const [input, setInput] = useState('')
    const [hoveredCardId, setHoveredCardId] = useState(null)
    const [isInputFocused, setIsInputFocused] = useState(false)
    const [isMicHovered, setIsMicHovered] = useState(false)
    const chatEndRef = useRef(null)

    // Các state và ref mới phục vụ cho tính năng Đính kèm tệp
    const [selectedFile, setSelectedFile] = useState(null)
    const [isUploading, setIsUploading] = useState(false)
    const fileInputRef = useRef(null)

    // Hàm định dạng dung lượng tệp
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Hàm kiểm tra định dạng và dung lượng tệp khi người dùng chọn tệp
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Các định dạng hợp lệ
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.docx', '.doc', '.txt'];
        const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        
        if (!allowedExtensions.includes(fileExtension)) {
            alert(`Định dạng tệp không được hỗ trợ! Chỉ cho phép đính kèm: ${allowedExtensions.join(', ')}`);
            e.target.value = '';
            return;
        }

        // Kích thước tối đa 5MB
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('Kích thước tệp vượt quá giới hạn cho phép (tối đa 5MB)!');
            e.target.value = '';
            return;
        }

        setSelectedFile(file);
    };

    // Hàm xóa tệp đã chọn khỏi State và Input
    const handleRemoveFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Giả lập gửi tệp bằng FormData lên API
    const mockUploadFile = async (file) => {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        console.log("=== GỬI DỮ LIỆU LÊN SERVER VIA FORM DATA ===");
        console.log("Tên tệp:", file.name);
        console.log("Kích thước tệp:", formatFileSize(file.size));
        console.log("Đã đóng gói FormData thành công!");

        return new Promise((resolve) => {
            setTimeout(() => {
                console.log("=== MOCK UPLOAD FILE THÀNH CÔNG ===");
                setIsUploading(false);
                resolve({ success: true, url: `/mock-uploads/${file.name}` });
            }, 1000);
        });
    };


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


            if (!response.ok) {
                let errDetail = `Lỗi Server Backend: ${response.status}`;
                try {
                    const errData = await response.json();
                    errDetail = errData.detail || errDetail;
                } catch (_) {}
                throw new Error(errDetail);
            }


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


                    // Tự động gán file tài liệu tham khảo thực tế từ RAG hoặc mock
                    let citationPdf = "thamkhao.pdf";
                    if (data.sources && data.sources.length > 0 && data.sources[0].pdf_name) {
                        citationPdf = data.sources[0].pdf_name;
                    } else {
                        if (userText.toLowerCase().includes("chương 1")) citationPdf = "chuong1.pdf";
                        if (userText.toLowerCase().includes("chương 2")) citationPdf = "chuong2.pdf";
                    }


                    return {
                        ...msg,
                        text: finalText,
                        citation: citationPdf // Tên file PDF thực tế được xem trong Modal
                    };
                }
                return msg;
            }));


        } catch (error) {
            console.error("Lỗi kết nối RAG:", error);
            const isNetworkError = error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Network request failed');
            const displayText = isNetworkError 
                ? '❌ Không thể kết nối tới server Backend RAG. Bạn đã chạy lệnh uvicorn cổng 8001 chưa?'
                : `❌ ${error.message}`;
            setMessages(prev => prev.map(msg =>
                msg.id === botLoadingId
                    ? { ...msg, text: displayText }
                    : msg
            ));
        }
    }


    // 2. HÀM XỬ LÝ KHI NGƯỜI DÙNG BẤM GỬI TIN NHẮN
    const handleSend = async (e) => {
        if (e) e.preventDefault()
        if (!input.trim() && !selectedFile) return

        let fileData = null;
        if (selectedFile) {
            fileData = {
                name: selectedFile.name,
                size: selectedFile.size,
                type: selectedFile.type
            };
            
            // Gọi hàm upload giả lập trước khi cập nhật hội thoại
            await mockUploadFile(selectedFile);
        }

        const userMessage = { 
            id: Date.now(), 
            sender: 'user', 
            text: input,
            file: fileData
        }
        setMessages(prev => [...prev, userMessage])
        const query = input
        setInput('')
        setSelectedFile(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }

        // Gọi hàm xử lý API thật
        if (query.trim()) {
            triggerBotResponse(query)
        } else if (fileData) {
            // Nếu người dùng chỉ gửi tệp đính kèm không kèm text
            const botLoadingId = Date.now() + 1;
            setMessages(prev => [...prev, {
                id: botLoadingId,
                sender: 'bot',
                text: `Đã nhận tệp đính kèm: **${fileData.name}**. Trợ lý AI đang phân tích tài liệu của bạn...`
            }]);
            setTimeout(() => {
                setMessages(prev => prev.map(msg => 
                    msg.id === botLoadingId 
                        ? { ...msg, text: `Tôi đã xử lý xong tệp **${fileData.name}** (${formatFileSize(fileData.size)}). Tài liệu này có chứa thông tin nào bạn muốn tôi giải đáp không?` }
                        : msg
                ));
            }, 1500);
        }
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
            renderGraphic: (isHovered) => (
                <div style={{ marginTop: '12px', fontSize: '11px', color: isHovered ? '#a1a1a1' : '#64748b', textAlign: 'left', backgroundColor: isHovered ? '#1a1a1a' : '#ffffff', padding: '8px', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.04)' }}>
                    <div style={{ fontWeight: 600, color: isHovered ? '#ffffff' : '#334155', marginBottom: '4px' }}>1. Khái quát chung:</div>
                    <div style={{ height: '4px', backgroundColor: isHovered ? '#333333' : '#cbd5e1', borderRadius: '2px', width: '90%', marginBottom: '4px' }}></div>
                    <div style={{ height: '4px', backgroundColor: isHovered ? '#222222' : '#e2e8f0', borderRadius: '2px', width: '75%', marginBottom: '4px' }}></div>
                    <div style={{ height: '4px', backgroundColor: isHovered ? '#222222' : '#e2e8f0', borderRadius: '2px', width: '85%' }}></div>
                </div>
            )
        },
        {
            id: 2,
            title: "Trích dẫn nguồn tài liệu",
            prompt: "Hướng dẫn tôi cách trích dẫn tài liệu tham khảo theo chuẩn APA cho các bài viết AI.",
            renderGraphic: (isHovered) => (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '54px', backgroundColor: isHovered ? '#1a1a1a' : '#ffffff', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.04)', position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: isHovered ? '#ffffff' : '#111111', border: isHovered ? '1px solid #333' : '1px solid #e2e8f0', padding: '2px 6px', borderRadius: '6px', backgroundColor: isHovered ? '#222' : '#f8fafc' }}>PDF</span>
                        <div style={{ height: '2px', backgroundColor: isHovered ? '#333' : '#cbd5e1', width: '20px', marginTop: '4px' }}></div>
                    </div>
                    <div style={{ position: 'absolute', bottom: '6px', right: '6px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: isHovered ? '#ffffff' : '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isHovered ? '#000000' : '#ffffff', fontSize: '10px', fontWeight: 'bold' }}>+</div>
                </div>
            )
        },
        {
            id: 3,
            title: "Gợi ý dàn ý nghiên cứu",
            prompt: "Đề xuất dàn ý và bố cục chi tiết cho Chương 2 (Cơ sở lý thuyết của RAG).",
            renderGraphic: (isHovered) => (
                <div style={{ marginTop: '12px', fontSize: '11px', color: isHovered ? '#a1a1a1' : '#64748b', textAlign: 'left', backgroundColor: isHovered ? '#1a1a1a' : '#ffffff', padding: '8px', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.04)' }}>
                    <div style={{ fontWeight: 700, color: isHovered ? '#ffffff' : '#000000', fontSize: '10px', marginBottom: '2px' }}>DÀN Ý ĐỀ XUẤT</div>
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
            renderGraphic: (isHovered) => (
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '54px', backgroundColor: isHovered ? '#1a1a1a' : '#ffffff', padding: '8px 12px', borderRadius: '12px', border: '1px solid rgba(0, 0, 0, 0.04)' }}>
                    <div style={{ width: '6px', height: '20px', backgroundColor: isHovered ? '#ffffff' : '#000000', borderRadius: '2px' }}></div>
                    <div style={{ width: '6px', height: '35px', backgroundColor: isHovered ? '#ffffff' : '#000000', borderRadius: '2px' }}></div>
                    <div style={{ width: '6px', height: '15px', backgroundColor: isHovered ? '#ffffff' : '#000000', borderRadius: '2px' }}></div>
                    <div style={{ width: '6px', height: '28px', backgroundColor: isHovered ? '#ffffff' : '#000000', borderRadius: '2px' }}></div>
                    <div style={{ width: '6px', height: '42px', backgroundColor: isHovered ? '#ffffff' : '#000000', borderRadius: '2px' }}></div>
                </div>
            )
        }
    ]


    // Styles
    // Styles
    const containerStyle = {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F2EAE0',
        height: '100%',
        position: 'relative',
        borderRadius: '32px',
        border: '1px solid rgba(122, 117, 107, 0.2)',
        boxShadow: '0 4px 30px rgba(122, 117, 107, 0.02), 0 10px 50px rgba(122, 117, 107, 0.05)',
        overflow: 'hidden',
    }


    const headerStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 24px',
        borderBottom: 'none',
        backgroundColor: '#F2EAE0',
    }


    const headerLogoStyle = {
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontSize: '20px',
        fontWeight: 800,
        color: '#2C2A27',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        letterSpacing: '-0.5px',
    }


    const avatarStyle = {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        backgroundColor: '#2C2A27',
        color: '#FAF6EE',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '13px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        border: '1px solid #FFD000',
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
        marginTop: '40px',
        textAlign: 'left',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
    }


    const welcomeTitleStyle = {
        fontSize: '44px',
        fontWeight: 700,
        margin: '0 0 8px 0',
        color: '#2C2A27',
        letterSpacing: '-1px',
    }


    const welcomeSubtitleStyle = {
        fontSize: '40px',
        fontWeight: 500,
        color: '#7A756B',
        margin: '0 0 40px 0',
        lineHeight: 1.2,
        letterSpacing: '-1px',
    }


    const cardGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        width: '100%',
        marginBottom: '20px',
    }


    const cardStyle = (cardId) => ({
        padding: '20px',
        borderRadius: '24px',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '150px',
        border: hoveredCardId === cardId ? '1px solid #FFD000' : '1px solid rgba(122, 117, 107, 0.2)',
        backgroundColor: hoveredCardId === cardId ? '#2C2A27' : '#FAF6EE',
        color: hoveredCardId === cardId ? '#ffffff' : '#2C2A27',
        transform: hoveredCardId === cardId ? 'translateY(-3px)' : 'none',
        boxShadow: hoveredCardId === cardId ? '0 10px 30px rgba(122, 117, 107, 0.08)' : 'none',
    })


    const messageListStyle = {
        width: '100%',
        maxWidth: '760px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        paddingBottom: '140px',
    }


    const msgBubbleStyle = (sender) => ({
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        alignSelf: sender === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
    })


    const msgContentStyle = (sender) => ({
        backgroundColor: sender === 'user' ? '#2C2A27' : '#FAF6EE',
        color: sender === 'user' ? '#ffffff' : '#2C2A27',
        padding: '12px 18px',
        borderRadius: sender === 'user' ? '16px 16px 4px 16px' : '16px',
        fontSize: '14.5px',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        border: sender === 'user' ? '1px solid #FFD000' : '1px solid rgba(122, 117, 107, 0.2)',
    })


    const botIconStyle = {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        backgroundColor: '#2C2A27',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFD000',
        flexShrink: 0,
        border: '1px solid rgba(122, 117, 107, 0.2)',
    }


    const inputAreaContainerStyle = {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 24px 20px 24px',
        backgroundColor: 'rgba(242, 234, 224, 0.85)',
        backdropFilter: 'blur(16px)',
        borderTop: 'none',
    }


    const inputFormStyle = {
        width: '100%',
        maxWidth: '760px',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#FAF6EE',
        borderRadius: '9999px',
        padding: '6px 16px',
        border: isInputFocused ? '1.5px solid #FFD000' : '1.5px solid rgba(122, 117, 107, 0.2)',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    }


    const inputFieldStyle = {
        flex: 1,
        border: 'none',
        backgroundColor: 'transparent',
        outline: 'none',
        padding: '12px 8px',
        fontSize: '15px',
        color: '#2C2A27',
    }


    const actionButtonStyle = (isDisabled = false) => ({
        background: 'none',
        border: 'none',
        cursor: isDisabled ? 'default' : 'pointer',
        color: '#2C2A27',
        padding: '8px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.2s',
        opacity: isDisabled ? 0.3 : 1,
    })


    const sendButtonStyle = (isActive) => ({
        backgroundColor: isActive ? '#2C2A27' : 'transparent',
        color: isActive ? '#ffffff' : '#7A756B',
        border: isActive ? '1px solid #FFD000' : 'none',
        cursor: isActive ? 'pointer' : 'default',
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    })


    const micButtonStyle = {
        backgroundColor: '#2C2A27',
        color: '#ffffff',
        border: '1px solid #FFD000',
        cursor: 'pointer',
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isMicHovered ? 0.8 : 1,
        marginLeft: '4px',
        marginRight: '4px',
    }


    const warningTextStyle = {
        fontSize: '11px',
        color: '#7A756B',
        marginTop: '8px',
        textAlign: 'center',
    }


    const citationBadgeStyle = {
        marginTop: '12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        backgroundColor: '#FAF6EE',
        border: '1px solid rgba(122, 117, 107, 0.2)',
        borderRadius: '9999px',
        color: '#2C2A27',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    }


    return (
        <div style={containerStyle}>
            {/* Top Header */}
            <div style={headerStyle}>
                <div style={headerLogoStyle}>
                    <Sparkles size={20} strokeWidth={1.5} fill="#2C2A27" style={{ color: '#2C2A27' }} />
                    Thesis Chatbot <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#2C2A27', color: '#ffffff', border: '1px solid #FFD000', padding: '2px 8px', borderRadius: '9999px', marginLeft: '6px', letterSpacing: '0.5px' }}>ADVANCED</span>
                </div>
                <div style={avatarStyle}>S</div>
            </div>


            {/* TAB TOGGLE: Segmented Control Nothing OS Vibe */}
            <div style={{
                display: 'inline-flex',
                alignSelf: 'flex-start',
                gap: '4px',
                padding: '4px',
                backgroundColor: '#FAF6EE',
                borderRadius: '9999px',
                margin: '16px 24px',
                border: '1px solid rgba(122, 117, 107, 0.2)'
            }}>
                <button
                    onClick={() => handleModeSwitch(false)}
                    style={{
                        padding: '8px 20px',
                        background: !isCompareMode ? '#2C2A27' : 'transparent',
                        color: !isCompareMode ? '#ffffff' : '#7A756B',
                        border: !isCompareMode ? '1px solid #FFD000' : 'none',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        fontSize: '13px',
                        boxShadow: !isCompareMode ? '0 2px 8px rgba(122, 117, 107, 0.1)' : 'none'
                    }}
                >
                    💬 Chat thường
                </button>
                <button
                    onClick={() => handleModeSwitch(true)}
                    style={{
                        padding: '8px 20px',
                        background: isCompareMode ? '#2C2A27' : 'transparent',
                        color: isCompareMode ? '#ffffff' : '#7A756B',
                        border: isCompareMode ? '1px solid #FFD000' : 'none',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        fontSize: '13px',
                        boxShadow: isCompareMode ? '0 2px 8px rgba(122, 117, 107, 0.1)' : 'none'
                    }}
                >
                    🔍 So sánh đề tài
                </button>
            </div>


            {isCompareMode ? (
                // CHẾ ĐỘ SO SÁNH
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '0 24px 24px 24px',
                    overflowY: 'auto',
                    gap: '16px',
                    maxWidth: '820px',
                    margin: '0 auto',
                    width: '100%'
                }}>
                    <h3 style={{ margin: 0, color: '#2C2A27', fontSize: '20px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>📋 So sánh đề tài nghiên cứu</h3>

                    {/* Input Tiêu đề */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#2C2A27' }}>Tiêu đề nghiên cứu dự kiến</label>
                        <input
                            type="text"
                            placeholder="Ví dụ: Ứng dụng trí tuệ nhân tạo để chẩn đoán hình ảnh y học"
                            value={compareForm.title}
                            onChange={(e) => setCompareForm({ ...compareForm, title: e.target.value })}
                            disabled={isComparing}
                            style={{
                                padding: '14px 18px',
                                border: '1.5px solid rgba(122, 117, 107, 0.2)',
                                borderRadius: '16px',
                                fontSize: '14.5px',
                                outline: 'none',
                                backgroundColor: '#FAF6EE',
                                color: '#2C2A27',
                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#FFD000'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(122, 117, 107, 0.2)'}
                        />
                    </div>


                    {/* Input Mô tả */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '13px', fontWeight: '700', color: '#2C2A27' }}>Mô tả chi tiết mục đích, phương pháp nghiên cứu (20 - 1000 ký tự)</label>
                        <textarea
                            placeholder="Mô tả tóm tắt định hướng nghiên cứu, công nghệ áp dụng, mục tiêu đề tài..."
                            value={compareForm.description}
                            onChange={(e) => setCompareForm({ ...compareForm, description: e.target.value })}
                            disabled={isComparing}
                            style={{
                                padding: '14px 18px',
                                border: '1.5px solid rgba(122, 117, 107, 0.2)',
                                borderRadius: '16px',
                                fontSize: '14.5px',
                                minHeight: '120px',
                                resize: 'vertical',
                                outline: 'none',
                                backgroundColor: '#FAF6EE',
                                color: '#2C2A27',
                                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#FFD000'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(122, 117, 107, 0.2)'}
                        />
                        <span style={{ fontSize: '11px', color: '#7A756B', alignSelf: 'flex-end', fontWeight: 600 }}>
                            {compareForm.description.length} / 1000 ký tự
                        </span>
                    </div>


                    {/* Nút gửi */}
                    <button
                        onClick={handleCompare}
                        disabled={isComparing}
                        style={{
                            padding: '14px',
                            backgroundColor: isComparing ? '#7A756B' : '#2C2A27',
                            color: 'white',
                            border: isComparing ? 'none' : '1px solid #FFD000',
                            borderRadius: '16px',
                            fontWeight: '700',
                            cursor: isComparing ? 'not-allowed' : 'pointer',
                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            fontSize: '15px'
                        }}
                    >
                        {isComparing ? '⏳ Đang phân tích...' : '🚀 Bắt đầu so sánh đề tài'}
                    </button>


                    {/* Hiển thị Kết quả */}
                    {compareResult && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
                            {/* Mức độ trùng lặp */}
                            <div style={{
                                padding: '20px',
                                backgroundColor: '#FAF6EE',
                                border: '1px solid rgba(122, 117, 107, 0.2)',
                                borderLeft: '4px solid #FFD000',
                                borderRadius: '24px'
                            }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#2C2A27', fontSize: '16px', fontWeight: 700 }}>📊 Đánh giá trùng lặp</h4>
                                <p style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#FFD000' }}>
                                    {compareResult.overlap_level}
                                </p>
                                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#7A756B', fontWeight: 500 }}>
                                    Độ tương tự cao nhất tìm thấy: {compareResult.top_match_similarity}%
                                </p>
                            </div>


                            {/* Danh sách đề tài liên quan */}
                            <div>
                                <h4 style={{ margin: '0 0 12px 0', color: '#2C2A27', fontSize: '16px', fontWeight: 700 }}>📚 Top 5 luận văn liên quan trong hệ thống</h4>
                                {compareResult.similar_theses.length === 0 ? (
                                    <div style={{ padding: '24px', backgroundColor: '#FAF6EE', borderRadius: '24px', border: '1px solid rgba(122, 117, 107, 0.2)', textAlign: 'center', color: '#7A756B', fontSize: '14px' }}>
                                        Không tìm thấy đề tài liên quan tương tự nào.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {compareResult.similar_theses.slice(0, 5).map((thesis, idx) => (
                                            <div key={idx} style={{
                                                padding: '20px',
                                                backgroundColor: '#FAF6EE',
                                                border: '1px solid rgba(122, 117, 107, 0.2)',
                                                borderRadius: '24px',
                                                boxShadow: '0 4px 20px rgba(122,117,107,0.02)'
                                            }}>
                                                <h5 style={{ margin: '0 0 6px 0', color: '#2C2A27', fontSize: '15px', fontWeight: 700 }}>
                                                    {idx + 1}. {thesis.title}
                                                </h5>
                                                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#7A756B', fontWeight: 500 }}>
                                                    👤 Tác giả: {thesis.authors} | 📅 Năm: {thesis.year} | 📖 {thesis.journal}
                                                </p>
                                                <p style={{
                                                    margin: '0 0 12px 0',
                                                    fontSize: '13.5px',
                                                    color: '#2C2A27',
                                                    lineHeight: '1.6',
                                                    backgroundColor: '#F2EAE0',
                                                    padding: '12px 16px',
                                                    borderRadius: '16px',
                                                    border: '1px solid rgba(122, 117, 107, 0.1)'
                                                }}>
                                                    {thesis.summary}
                                                </p>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: '700',
                                                    backgroundColor: '#2C2A27',
                                                    color: '#ffffff',
                                                    padding: '6px 12px',
                                                    borderRadius: '9999px',
                                                    border: '1px solid #FFD000'
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
                                <h4 style={{ margin: '0 0 12px 0', color: '#2C2A27', fontSize: '16px', fontWeight: 700 }}>💡 Đánh giá khoảng trống nghiên cứu (Gemini AI gợi ý)</h4>
                                <div style={{
                                    padding: '20px',
                                    backgroundColor: '#FAF6EE',
                                    border: '1px solid rgba(122, 117, 107, 0.2)',
                                    borderRadius: '24px',
                                    fontSize: '14.5px',
                                    color: '#2C2A27',
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
                            // Welcome screen (Nothing OS style)
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
                                            <span style={{ 
                                                fontSize: '14.5px', 
                                                fontWeight: 700, 
                                                color: hoveredCardId === card.id ? '#ffffff' : '#2C2A27', 
                                                lineHeight: 1.4 
                                            }}>
                                                {card.title}
                                            </span>
                                            {card.renderGraphic(hoveredCardId === card.id)}
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
                                                <Sparkles size={16} strokeWidth={2.5} />
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <div style={msgContentStyle(msg.sender)}>
                                                {msg.text && <div>{msg.text}</div>}
                                                {msg.file && (
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        backgroundColor: msg.sender === 'user' ? '#2C2A27' : '#FAF6EE',
                                                        border: '1px solid rgba(122, 117, 107, 0.2)',
                                                        borderRadius: '12px',
                                                        padding: '6px 12px',
                                                        marginTop: msg.text ? '8px' : '0px',
                                                        minWidth: '200px',
                                                    }}>
                                                        <FileText size={16} strokeWidth={2.5} style={{ color: msg.sender === 'user' ? '#ffffff' : '#2C2A27' }} />
                                                        <div style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', minWidth: 0 }}>
                                                            <span style={{ fontWeight: 600, color: msg.sender === 'user' ? '#ffffff' : '#2C2A27', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {msg.file.name}
                                                            </span>
                                                            <span style={{ color: msg.sender === 'user' ? '#FAF6EE' : '#7A756B', fontSize: '10px', fontWeight: 500 }}>
                                                                {formatFileSize(msg.file.size)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>


                                            {/* Nút xem tài liệu nếu có trích dẫn từ nguồn RAG */}
                                            {msg.sender === 'bot' && msg.citation && (
                                                <div>
                                                    <div
                                                        style={citationBadgeStyle}
                                                        onClick={() => setActivePdfName(msg.citation)}
                                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#2C2A27'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = '#FFD000'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FAF6EE'; e.currentTarget.style.color = '#2C2A27'; e.currentTarget.style.borderColor = 'rgba(122, 117, 107, 0.2)'; }}
                                                    >
                                                        <span>📎 Xem tài liệu nguồn: {msg.citation}</span>
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
                        {selectedFile && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                backgroundColor: '#FAF6EE',
                                border: '1px solid rgba(122, 117, 107, 0.2)',
                                borderRadius: '16px',
                                padding: '8px 16px',
                                marginBottom: '10px',
                                width: '100%',
                                maxWidth: '760px',
                                boxSizing: 'border-box'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    backgroundColor: '#2C2A27',
                                    color: '#ffffff',
                                    border: '1px solid #FFD000',
                                }}>
                                    <FileText size={18} strokeWidth={2.5} />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#2C2A27', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {selectedFile.name}
                                    </span>
                                    <span style={{ fontSize: '11px', color: '#7A756B', fontWeight: 500 }}>
                                        {formatFileSize(selectedFile.size)} {isUploading && '• Đang tải lên...'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleRemoveFile}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#7A756B',
                                        padding: '4px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'background-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#FAF6EE';
                                        e.currentTarget.style.color = '#ef4444';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = '#7A756B';
                                    }}
                                    title="Xóa tệp"
                                >
                                    <X size={16} strokeWidth={2.5} />
                                </button>
                            </div>
                        )}
                        <form onSubmit={handleSend} style={inputFormStyle}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileChange}
                                accept=".jpg,.jpeg,.png,.pdf,.docx,.doc,.txt"
                            />
                            <button 
                                type="button" 
                                style={actionButtonStyle(false)} 
                                title="Đính kèm tài liệu"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Paperclip size={20} strokeWidth={2} />
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
                            <button 
                                type="button" 
                                style={micButtonStyle} 
                                onMouseEnter={() => setIsMicHovered(true)}
                                onMouseLeave={() => setIsMicHovered(false)}
                                title="Nhập giọng nói"
                            >
                                <Mic size={18} strokeWidth={1.5} fill="#FFD000" />
                            </button>
                            <button
                                type="submit"
                                style={sendButtonStyle(input.trim())}
                                disabled={!input.trim()}
                                title="Gửi câu hỏi"
                            >
                                <Send size={18} strokeWidth={1.5} fill={input.trim() ? '#ffffff' : 'transparent'} />
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

