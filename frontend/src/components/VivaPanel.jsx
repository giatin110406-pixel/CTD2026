import React, { useState, useEffect, useRef } from 'react'
import { Send, Sparkles, Mic, HelpCircle, RefreshCw, Award, CheckCircle, AlertTriangle, Play, X, User, Shield, GraduationCap, FileText, Download, Lightbulb } from 'lucide-react'



const API_BASE_URL = 'http://127.0.0.1:8002';

const examiners = [
    { 
        id: 'examiner_methodology', 
        name: 'GS. Gordon Nghiêm Túc', 
        role: 'Chuyên gia Phương pháp luận & Thống kê Y sinh', 
        avatar: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Gordon_Ramsay_colour_Allan_Warren.jpg',
        bgColor: '#F2EAE0',
        color: '#2C2A27',
        accentColor: '#FFD000',
        description: 'Khắt khe số liệu, thiết kế nghiên cứu và chọn mẫu. Rất thẳng tính, đanh thép.'
    },
    { 
        id: 'examiner_novelty', 
        name: 'PGS. Elon Đột Phá', 
        role: 'Chuyên gia Phản biện Tạp chí & Tính mới', 
        avatar: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Elon_Musk_Royal_Society.jpg',
        bgColor: '#FAF6EE',
        color: '#2C2A27',
        accentColor: '#FFD000',
        description: 'Ám ảnh tư duy First Principles và Research Gap. Tránh cải tiến nửa vời.'
    },
    { 
        id: 'examiner_practical', 
        name: 'TS. Shark Thực Chiến', 
        role: 'Chuyên gia Lâm sàng & Tính thực tiễn', 
        avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&h=256&q=80',
        bgColor: '#F2EAE0',
        color: '#2C2A27',
        accentColor: '#FFD000',
        description: 'Thực tế, thực dụng. Chỉ quan tâm tính khả thi và ứng dụng lâm sàng.'
    }
];

function VivaPanel({ currentPdf }) {
    const [isSessionStarted, setIsSessionStarted] = useState(false)
    const [history, setHistory] = useState([])
    const [currentExaminerId, setCurrentExaminerId] = useState(null)
    const [userAnswer, setUserAnswer] = useState('')
    const [isFinished, setIsFinished] = useState(false)
    const [scorecard, setScorecard] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isMicrophoneActive, setIsMicrophoneActive] = useState(false)
    const [showScorecardModal, setShowScorecardModal] = useState(false)
    const [isCompletelyNew, setIsCompletelyNew] = useState(false)
    const [similarityScore, setSimilarityScore] = useState(0.0)
    const [uploadedFile, setUploadedFile] = useState(null)
    const [pdfContext, setPdfContext] = useState('')

    const chatEndRef = useRef(null)

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history, isLoading])

    // Lấy tiêu đề PDF từ đường dẫn hoặc tệp tải lên
    const getPdfTitle = () => {
        if (uploadedFile) {
            return uploadedFile.name.replace('.pdf', '');
        }
        if (!currentPdf) return "Tổng quan Đề tài Nghiên cứu của tôi";
        if (currentPdf.includes("chuong1")) return "Luận văn Tốt nghiệp - Chương 1";
        if (currentPdf.includes("chuong2")) return "Luận văn Tốt nghiệp - Chương 2";
        if (currentPdf.includes("thamkhao")) return "Tài liệu tham khảo AI & RAG";
        return currentPdf.split('/').pop().replace('.pdf', '');
    };

    // Hàm định dạng dung lượng tệp
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Bắt đầu phiên chất vấn phản biện
    const startVivaSession = async () => {
        setIsLoading(true);
        setIsSessionStarted(true);
        setIsFinished(false);
        setScorecard(null);
        setHistory([]);
        setPdfContext('');
        
        let titleToSubmit = getPdfTitle();
        if (uploadedFile) {
            titleToSubmit = uploadedFile.name.replace('.pdf', '');
        }

        const formData = new FormData();
        formData.append('pdf_title', titleToSubmit);
        if (uploadedFile) {
            formData.append('file', uploadedFile);
        }
        formData.append('pdf_url', currentPdf || '');

        try {
            const response = await fetch(`${API_BASE_URL}/api/viva/start`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                let errorDetail = "Lỗi không xác định từ máy chủ.";
                try {
                    const errData = await response.json();
                    errorDetail = errData.detail || JSON.stringify(errData);
                } catch (_) {
                    try {
                        errorDetail = await response.text();
                    } catch (__) {}
                }
                throw new Error(`HTTP ${response.status}: ${errorDetail}`);
            }

            const data = await response.json();
            setCurrentExaminerId(data.current_examiner_id);
            setIsCompletelyNew(data.is_completely_new);
            setSimilarityScore(data.top_similarity);
            setPdfContext(data.pdf_context || '');
            
            // Khởi tạo lịch sử trò chuyện
            setHistory(data.history || [
                { sender: 'bot', examiner_id: data.current_examiner_id, text: data.question }
            ]);
        } catch (error) {
            console.error("Lỗi khởi động phản biện:", error);
            alert(`Lỗi khởi động phản biện: ${error.message}`);
            setIsSessionStarted(false);
        } finally {
            setIsLoading(false);
        }
    };

    // Gửi câu trả lời của sinh viên lên hội đồng
    const handleSendAnswer = async (e) => {
        if (e) e.preventDefault();
        if (!userAnswer.trim() || isLoading) return;

        const currentAnswer = userAnswer.trim();
        setUserAnswer('');

        // Cập nhật câu trả lời của sinh viên vào UI trước
        const updatedHistory = [
            ...history,
            { sender: 'user', text: currentAnswer }
        ];
        setHistory(updatedHistory);
        setIsLoading(true);

        let titleToSubmit = getPdfTitle();
        if (uploadedFile) {
            titleToSubmit = uploadedFile.name.replace('.pdf', '');
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/viva/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    history: updatedHistory.map(item => ({
                        sender: item.sender,
                        examiner_id: item.examiner_id || null,
                        text: item.text
                    })),
                    user_answer: currentAnswer,
                    current_examiner_id: currentExaminerId,
                    pdf_title: titleToSubmit,
                    pdf_url: currentPdf,
                    pdf_context: pdfContext
                })
            });

            if (!response.ok) {
                let errorDetail = "Lỗi không xác định từ máy chủ.";
                try {
                    const errData = await response.json();
                    errorDetail = errData.detail || JSON.stringify(errData);
                } catch (_) {
                    try {
                        errorDetail = await response.text();
                    } catch (__) {}
                }
                throw new Error(`HTTP ${response.status}: ${errorDetail}`);
            }

            const data = await response.json();

            if (data.is_finished) {
                // Kết thúc buổi phản biện
                setIsFinished(true);
                setScorecard(data.scorecard);
                setShowScorecardModal(true);
                setHistory(prev => [
                    ...prev,
                    { 
                        sender: 'bot', 
                        examiner_id: 'host', 
                        text: `Buổi phản biện đã kết thúc! Hội đồng đã hoàn thành việc chấm điểm và đánh giá đề tài của bạn. Điểm số đề xuất: ${data.scorecard.score}/10.\n\nNhấp vào nút "Xem bảng điểm kết quả" bên dưới để xem phân tích chi tiết.` 
                    }
                ]);
            } else {
                // Nhận câu hỏi tiếp theo
                setCurrentExaminerId(data.current_examiner_id);
                setHistory(prev => [
                    ...prev,
                    { 
                        sender: 'bot', 
                        examiner_id: data.current_examiner_id, 
                        text: data.question 
                    }
                ]);
            }
        } catch (error) {
            console.error("Lỗi gửi câu trả lời:", error);
            alert(`Lỗi gửi câu trả lời: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Giả lập Micro
    const toggleMicrophone = () => {
        if (!isMicrophoneActive) {
            setIsMicrophoneActive(true);
            const mockAnswers = [
                "Tôi xin cảm ơn ý kiến chất vấn của thầy. Về phương pháp thống kê chọn mẫu, chúng tôi áp dụng phương pháp chọn mẫu thuận tiện do hạn chế về thời gian, tuy nhiên để đảm bảo tính khách quan chúng tôi đã đối chiếu dữ liệu thu thập với các nghiên cứu tương tự trong cùng phân hệ lâm sàng.",
                "Dạ thưa PGS, điểm đột phá của nghiên cứu nằm ở việc chúng tôi ứng dụng kiến trúc RAG tích hợp FAISS vào luồng dữ liệu y khoa tiếng Việt, giúp giảm thời gian truy xuất thông tin của bác sĩ xuống dưới 1.5 giây, đây là điểm các nghiên cứu trước chưa giải quyết trọn vẹn.",
                "Về khả năng áp dụng thực tế của khuyến nghị y tế này, nghiên cứu của chúng tôi đã tính đến điều kiện nhân lực tại các tuyến bệnh viện huyện nghèo bằng cách tối giản hóa giao diện tương tác, chỉ cần chạy trên các máy tính cấu hình cơ bản không cần GPU rời."
            ];
            // Chọn ngẫu nhiên câu trả lời mẫu
            const randomIndex = Math.floor(Math.random() * mockAnswers.length);
            setTimeout(() => {
                setUserAnswer(mockAnswers[randomIndex]);
                setIsMicrophoneActive(false);
            }, 2000);
        } else {
            setIsMicrophoneActive(false);
        }
    };

    // CSS styles dynamic pulse for Nothing UI
    const styleSheet = `
        @keyframes pulse-viva {
            0% { box-shadow: 0 0 10px rgba(0, 0, 0, 0.05); border-color: rgba(0, 0, 0, 0.1); }
            50% { box-shadow: 0 0 20px rgba(0, 0, 0, 0.25); border-color: rgba(0, 0, 0, 0.8); }
            100% { box-shadow: 0 0 10px rgba(0, 0, 0, 0.05); border-color: rgba(0, 0, 0, 0.1); }
        }
        .viva-active-card {
            animation: pulse-viva 2s infinite ease-in-out !important;
            border: 2px solid #000000 !important;
            transform: translateY(-2px) !important;
            background-color: #ffffff !important;
        }
        .viva-inactive-card {
            opacity: 0.55;
        }
    `;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', height: '100%', position: 'relative', borderRadius: '32px', border: '1px solid rgba(0, 0, 0, 0.04)', boxShadow: '0 4px 30px rgba(0, 0, 0, 0.02), 0 10px 50px rgba(0, 0, 0, 0.04)', overflow: 'hidden' }}>
            <style>{styleSheet}</style>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: 'none', backgroundColor: '#ffffff' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#111111', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.5px' }}>
                        <Shield size={20} style={{ color: '#111111' }} /> Hội đồng phản biện ảo <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#000000', color: '#ffffff', padding: '2px 8px', borderRadius: '9999px', letterSpacing: '0.5px' }}>AI VIVA PANEL</span>
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                        Đang bảo vệ: <strong style={{ color: '#111111' }}>{getPdfTitle()}</strong>
                    </p>
                </div>
                {isSessionStarted && (
                    <button
                        onClick={startVivaSession}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#F5F5F7', border: '1px solid rgba(0, 0, 0, 0.04)', borderRadius: '16px', color: '#111111', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F5F5F7'}
                    >
                        <RefreshCw size={14} strokeWidth={2.5} /> Làm lại từ đầu
                    </button>
                )}
            </div>

            {!isSessionStarted ? (
                // MÀN HÌNH WELCOME
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center', maxWidth: '800px', margin: '0 auto', overflowY: 'auto' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#000000', display: 'flex', alignItems: 'center', color: '#ffffff', justifyContent: 'center', marginBottom: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
                        <GraduationCap size={40} style={{ color: '#ffffff' }} />
                    </div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#111111', marginBottom: '12px', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px' }}>
                        Bảo vệ thử luận văn của bạn trước Hội đồng AI
                    </h1>
                    <p style={{ fontSize: '15px', color: '#64748b', lineHeight: 1.6, marginBottom: '24px', fontWeight: 500 }}>
                        Bạn sẽ đối chất lần lượt với 3 vị Giám khảo AI tượng trưng cho 3 trường phái học thuật: 
                        Phương pháp luận (GS. Gordon Ramsay style), Tính mới (PGS. Elon Musk style) và Tính thực tiễn (TS. Shark Hưng style).
                        Các câu hỏi sẽ được sinh tự động dựa trên tài liệu PDF bạn đã nạp kết hợp dữ liệu RAG.
                    </p>

                    {/* Khung tải lên tệp luận văn PDF mới */}
                    <div 
                        style={{
                            width: '100%',
                            maxWidth: '500px',
                            margin: '0 auto 16px auto',
                            padding: '24px',
                            backgroundColor: '#ffffff',
                            border: '2px dashed rgba(0, 0, 0, 0.1)',
                            borderRadius: '24px',
                            cursor: 'pointer',
                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '10px',
                            position: 'relative',
                            boxSizing: 'border-box'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#FFD000';
                            e.currentTarget.style.backgroundColor = '#FAF6EE';
                        }}
                        onMouseLeave={(e) => {
                            if (!uploadedFile) {
                                e.currentTarget.style.borderColor = 'rgba(122, 117, 107, 0.2)';
                                e.currentTarget.style.backgroundColor = '#FAF6EE';
                            }
                        }}
                        onClick={() => document.getElementById('viva-file-import')?.click()}
                    >
                        <input
                            type="file"
                            id="viva-file-import"
                            style={{ display: 'none' }}
                            accept=".pdf"
                            onChange={(e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
                                    alert("Chỉ chấp nhận tệp định dạng PDF!");
                                    return;
                                }
                                if (file.size > 10 * 1024 * 1024) {
                                    alert("Kích thước tệp tối đa là 10MB!");
                                    return;
                                }
                                setUploadedFile(file);
                            }}
                        />
                        
                        {uploadedFile ? (
                            <>
                                <FileText size={32} style={{ color: '#2C2A27' }} />
                                <div style={{ textAlign: 'center', width: '100%' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#2C2A27', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px', margin: '0 auto' }}>
                                        {uploadedFile.name}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#7A756B', marginTop: '2px', fontWeight: 500 }}>
                                        {formatFileSize(uploadedFile.size)} • Sẵn sàng phản biện
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setUploadedFile(null);
                                        const el = document.getElementById('viva-file-import');
                                        if (el) el.value = '';
                                    }}
                                    style={{
                                        position: 'absolute',
                                        top: '12px',
                                        right: '12px',
                                        background: '#F2EAE0',
                                        border: '1px solid rgba(122, 117, 107, 0.2)',
                                        borderRadius: '50%',
                                        width: '28px',
                                        height: '28px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fca5a5'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F2EAE0'}
                                >
                                    <X size={14} strokeWidth={2.5} />
                                </button>
                            </>
                        ) : (
                            <>
                                <Download size={28} style={{ color: '#2C2A27' }} />
                                <div style={{ textAlign: 'center' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#2C2A27' }}>Import/Tải lên tệp luận văn PDF của bạn</span>
                                    <span style={{ fontSize: '11.5px', color: '#7A756B', display: 'block', marginTop: '2px', fontWeight: 500 }}>Kéo thả hoặc nhấp để chọn tệp (Tối đa 10MB)</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Hiển thị tệp hiện hành nếu không upload */}
                    {!uploadedFile && (
                        <div style={{ width: '100%', maxWidth: '500px', padding: '14px 18px', backgroundColor: '#FAF6EE', border: '1px solid rgba(122, 117, 107, 0.2)', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'left', marginBottom: '24px', boxSizing: 'border-box' }}>
                            <FileText size={20} style={{ color: '#2C2A27' }} />
                            <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#2C2A27', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getPdfTitle()}</div>
                                <div style={{ fontSize: '11px', color: '#7A756B', fontWeight: 500 }}>{currentPdf ? "Tệp PDF từ Sidebar đang được đính kèm" : "Mặc định: Sử dụng đề tài luận văn nghiên cứu chung"}</div>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={startVivaSession}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 28px', backgroundColor: '#2C2A27', border: '1px solid #FFD000', borderRadius: '16px', color: '#ffffff', fontSize: '16px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(122,117,107,0.1)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF6EE'; e.currentTarget.style.color = '#2C2A27'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2C2A27'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.transform = 'none'; }}
                    >
                        <Play size={18} fill="#FFD000" strokeWidth={2.5} style={{ color: '#FFD000' }} /> Bắt đầu buổi bảo vệ phản biện
                    </button>
                </div>
            ) : (
                // MÀN HÌNH CHẤT VẤN CHÍNH
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    
                    {/* CỘT TRÁI: DANH SÁCH GIÁM KHẢO */}
                    <div style={{ width: '360px', borderRight: 'none', backgroundColor: '#FAF6EE', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 700, color: '#2C2A27', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Hội đồng giám khảo ảo
                        </h4>
                        
                        {/* Status badge của tài liệu nghiên cứu */}
                        <div style={{ padding: '14px', borderRadius: '24px', backgroundColor: '#F2EAE0', border: '1px solid rgba(122, 117, 107, 0.2)', fontSize: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            {history.length === 0 ? (
                                <>
                                    <RefreshCw size={16} style={{ color: '#7A756B', flexShrink: 0, marginTop: '2px', animation: 'spin 2s linear infinite' }} />
                                    <div>
                                        <strong style={{ color: '#2C2A27' }}>Đang kết nối hội đồng...</strong>
                                        <p style={{ margin: '2px 0 0 0', color: '#7A756B', lineHeight: 1.3 }}>Hội đồng đang đọc tài liệu, đối khớp dữ liệu RAG và chuẩn bị câu hỏi phản biện. Vui lòng đợi khoảng 10-15 giây.</p>
                                    </div>
                                </>
                            ) : isCompletelyNew ? (
                                <>
                                    <AlertTriangle size={16} style={{ color: '#FFD000', flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <strong style={{ color: '#2C2A27' }}>Phát hiện đề tài mới!</strong>
                                        <p style={{ margin: '2px 0 0 0', color: '#7A756B', lineHeight: 1.3 }}>RAG không tìm thấy nghiên cứu nào tương đồng trong kho vector. Hội đồng sẽ thử thách sâu về tính khả thi và cơ sở.</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={16} style={{ color: '#FFD000', flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <strong style={{ color: '#2C2A27' }}>Đã đối khớp dữ liệu RAG</strong>
                                        <p style={{ margin: '2px 0 0 0', color: '#7A756B', lineHeight: 1.3 }}>Độ tương đồng cơ sở dữ liệu đạt {similarityScore.toFixed(1)}%. Hội đồng sẽ hỏi xoáy sâu vào điểm đột phá.</p>
                                    </div>
                                </>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
                            {examiners.map(ex => {
                                const isActive = currentExaminerId === ex.id && !isFinished;
                                return (
                                    <div
                                        key={ex.id}
                                        className={isActive ? 'active-examiner viva-active-card' : 'viva-inactive-card'}
                                        style={{
                                            padding: '16px',
                                            borderRadius: '24px',
                                            border: isActive ? '1.5px solid #FFD000' : '1.5px solid rgba(122, 117, 107, 0.2)',
                                            backgroundColor: '#FAF6EE',
                                            transition: 'all 0.3s ease',
                                            position: 'relative',
                                        }}
                                    >
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <img 
                                                src={ex.avatar} 
                                                alt={ex.name}
                                                style={{ 
                                                    width: '44px', 
                                                    height: '44px', 
                                                    borderRadius: '12px', 
                                                    objectFit: 'cover',
                                                    boxShadow: '0 2px 4px rgba(122,117,107,0.03)'
                                                }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <h5 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#2C2A27' }}>
                                                    {ex.name}
                                                </h5>
                                                <span style={{ fontSize: '11px', color: '#7A756B', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {ex.role}
                                                </span>
                                            </div>
                                        </div>
                                        <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: '#7A756B', lineHeight: 1.4, borderTop: '1px solid rgba(122, 117, 107, 0.2)', paddingTop: '8px' }}>
                                            {ex.description}
                                        </p>
                                        {isActive && (
                                            <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '9px', fontWeight: 800, backgroundColor: '#2C2A27', color: '#ffffff', border: '1px solid #FFD000', padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span className="nothing-red-dot"></span> Đang hỏi
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* CỘT PHẢI: KHUNG ĐẤU TRƯỜNG PHẢN BIỆN */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#F2EAE0' }}>
                        
                        {/* Conversation Box */}
                        <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {history.map((msg, index) => {
                                const isUser = msg.sender === 'user';
                                const examiner = examiners.find(ex => ex.id === msg.examiner_id) || {
                                    name: 'Hội đồng',
                                    avatar: 'cap',
                                    bgColor: '#F2EAE0'
                                };
                                return (
                                    <div 
                                        key={index} 
                                        style={{ 
                                            display: 'flex', 
                                            gap: '12px', 
                                            maxWidth: '80%', 
                                            alignSelf: isUser ? 'flex-end' : 'flex-start',
                                            flexDirection: isUser ? 'row-reverse' : 'row'
                                        }}
                                    >
                                        {/* Avatar */}
                                        {isUser ? (
                                            <div style={{ 
                                                width: '36px', 
                                                height: '36px', 
                                                borderRadius: '50%', 
                                                backgroundColor: '#2C2A27', 
                                                color: '#ffffff',
                                                border: '1px solid #FFD000',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                flexShrink: 0
                                            }}>
                                                S
                                            </div>
                                        ) : (
                                            examiner.avatar.startsWith('http') ? (
                                                <img 
                                                    src={examiner.avatar} 
                                                    alt={examiner.name}
                                                    style={{ 
                                                        width: '36px', 
                                                        height: '36px', 
                                                        borderRadius: '50%', 
                                                        objectFit: 'cover',
                                                        flexShrink: 0,
                                                        boxShadow: '0 2px 4px rgba(122,117,107,0.03)'
                                                    }}
                                                />
                                            ) : (
                                                <div style={{ 
                                                    width: '36px', 
                                                    height: '36px', 
                                                    borderRadius: '50%', 
                                                    backgroundColor: '#2C2A27', 
                                                    color: '#FFD000',
                                                    border: '1px solid #FFD000',
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center', 
                                                    flexShrink: 0
                                                }}>
                                                    {examiner.avatar === 'cap' ? (
                                                        <GraduationCap size={20} style={{ color: '#FFD000' }} />
                                                    ) : (
                                                        <Shield size={20} style={{ color: '#FFD000' }} />
                                                    )}
                                                </div>
                                            )
                                        )}
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            {!isUser && (
                                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#7A756B', marginBottom: '4px', marginLeft: '4px' }}>
                                                    {examiner.name}
                                                </span>
                                            )}
                                            <div style={{
                                                backgroundColor: isUser ? '#2C2A27' : '#FAF6EE',
                                                color: isUser ? '#ffffff' : '#2C2A27',
                                                padding: '12px 16px',
                                                borderRadius: isUser ? '16px 16px 4px 16px' : '16px',
                                                fontSize: '14.5px',
                                                lineHeight: 1.6,
                                                whiteSpace: 'pre-wrap',
                                                boxShadow: '0 1px 2px rgba(122,117,107,0.02)',
                                                border: isUser ? '1px solid #FFD000' : '1px solid rgba(122, 117, 107, 0.2)'
                                            }}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {isLoading && (
                                <div style={{ display: 'flex', gap: '12px', alignSelf: 'flex-start' }}>
                                    <div style={{ 
                                        width: '36px', 
                                        height: '36px', 
                                        borderRadius: '50%', 
                                        backgroundColor: '#2C2A27', 
                                        color: '#FFD000',
                                        border: '1px solid #FFD000',
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        fontSize: '16px',
                                        animation: 'spin 2s linear infinite'
                                    }}>
                                        <GraduationCap size={20} style={{ color: '#FFD000' }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#7A756B', marginBottom: '4px' }}>Hội đồng AI</span>
                                        <div style={{ backgroundColor: '#FAF6EE', padding: '12px 16px', borderRadius: '18px 18px 18px 4px', border: '1px solid rgba(122, 117, 107, 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ width: '6px', height: '6px', backgroundColor: '#7A756B', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out' }}></span>
                                            <span style={{ width: '6px', height: '6px', backgroundColor: '#7A756B', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out 0.2s' }}></span>
                                            <span style={{ width: '6px', height: '6px', backgroundColor: '#7A756B', borderRadius: '50%', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out 0.4s' }}></span>
                                            {history.length === 0 && (
                                                <span style={{ fontSize: '13px', color: '#7A756B', marginLeft: '6px', fontWeight: 500 }}>
                                                    Đang đọc tài liệu và chuẩn bị câu hỏi phản biện đầu tiên...
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div style={{ padding: '16px 24px 20px 24px', backgroundColor: 'rgba(242, 234, 224, 0.85)', backdropFilter: 'blur(16px)', borderTop: 'none' }}>
                            {isFinished ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                                    <button
                                        onClick={() => setShowScorecardModal(true)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 28px', backgroundColor: '#2C2A27', border: '1px solid #FFD000', borderRadius: '16px', color: '#ffffff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(122,117,107,0.1)' }}
                                    >
                                        <Award size={18} strokeWidth={2.5} /> Xem bảng điểm / Kết quả đánh giá
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleSendAnswer} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    backgroundColor: '#FAF6EE',
                                    borderRadius: '9999px',
                                    padding: '6px 16px',
                                    border: '1.5px solid rgba(122, 117, 107, 0.2)',
                                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                }}>
                                    <button 
                                        type="button" 
                                        onClick={toggleMicrophone}
                                        style={{ 
                                            background: '#2C2A27', 
                                            border: isMicrophoneActive ? '1px solid #FFD000' : '1px solid transparent', 
                                            cursor: 'pointer', 
                                            color: '#ffffff', 
                                            width: '36px', 
                                            height: '36px', 
                                            borderRadius: '50%', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                            marginRight: '4px',
                                        }}
                                        title="Giả lập Microphone"
                                    >
                                        <Mic size={18} strokeWidth={1.5} fill="#FFD000" className={isMicrophoneActive ? 'pulse-mic' : ''} />
                                    </button>
                                    <input
                                        type="text"
                                        value={userAnswer}
                                        onChange={(e) => setUserAnswer(e.target.value)}
                                        disabled={isLoading}
                                        placeholder={isMicrophoneActive ? "Đang lắng nghe giọng nói phản biện của bạn..." : "Nhập câu trả lời phản biện của bạn trước hội đồng..."}
                                        style={{ 
                                            flex: 1, 
                                            border: 'none',
                                            backgroundColor: 'transparent',
                                            outline: 'none',
                                            padding: '12px 8px',
                                            fontSize: '14.5px',
                                            color: '#2C2A27',
                                        }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!userAnswer.trim() || isLoading}
                                        style={{ 
                                            backgroundColor: (!userAnswer.trim() || isLoading) ? 'transparent' : '#2C2A27', 
                                            border: (!userAnswer.trim() || isLoading) ? 'none' : '1px solid #FFD000', 
                                            cursor: (!userAnswer.trim() || isLoading) ? 'default' : 'pointer', 
                                            color: (!userAnswer.trim() || isLoading) ? '#7A756B' : '#ffffff', 
                                            width: '36px', 
                                            height: '36px', 
                                            borderRadius: '50%', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                        }}
                                        title="Gửi câu trả lời"
                                    >
                                        <Send size={18} strokeWidth={1.5} fill={userAnswer.trim() ? '#ffffff' : 'transparent'} />
                                    </button>
                                </form>
                            )}
                            <div style={{ fontSize: '11px', color: '#7A756B', marginTop: '8px', textAlign: 'center', fontWeight: 500 }}>
                                Hãy chuẩn bị câu trả lời ngắn gọn, thẳng thắn, có số liệu và căn cứ từ tài liệu luận văn đã chọn.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SCORECARD MODAL */}
            {showScorecardModal && scorecard && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyStyle: 'center', justifyContent: 'center', zIndex: 999 }}>
                    <div style={{ backgroundColor: '#F2EAE0', borderRadius: '32px', border: '1px solid rgba(122, 117, 107, 0.2)', width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(122,117,107,0.05), 0 10px 10px -5px rgba(122,117,107,0.02)', overflow: 'hidden' }}>
                        
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid rgba(122, 117, 107, 0.2)', backgroundColor: '#F2EAE0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Award size={22} strokeWidth={2.5} style={{ color: '#FFD000' }} />
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#2C2A27', fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.5px' }}>
                                    KẾT QUẢ ĐÁNH GIÁ CỦA HỘI ĐỒNG PHẢN BIỆN
                                </h3>
                            </div>
                            <button 
                                onClick={() => setShowScorecardModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2C2A27', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyStyle: 'center' }}
                            >
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            
                            {/* Score Display Row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyStyle: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px', backgroundColor: '#FAF6EE', borderRadius: '24px', border: '1px solid rgba(122, 117, 107, 0.2)' }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#7A756B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                                    ĐIỂM SỐ LUẬN VĂN ĐỀ XUẤT
                                </span>
                                <div style={{ fontSize: '48px', fontWeight: 800, color: '#2C2A27', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'baseline' }}>
                                    {scorecard.score}
                                    <span style={{ fontSize: '20px', fontWeight: 600, color: '#7A756B', marginLeft: '4px' }}>/ 10</span>
                                </div>
                                <span style={{ fontSize: '12.5px', color: '#2C2A27', marginTop: '6px', fontWeight: 700 }}>
                                    {scorecard.score >= 8.5 ? "Xếp loại: Xuất sắc" : scorecard.score >= 7.0 ? "Xếp loại: Khá" : "Xếp loại: Trung bình - Cần sửa chữa lớn"}
                                </span>
                            </div>

                            {/* Strengths & Weaknesses (Side-by-side) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                {/* Strengths */}
                                <div style={{ padding: '20px', backgroundColor: '#FAF6EE', border: '1.5px solid #FFD000', borderRadius: '24px' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 700, color: '#2C2A27', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <CheckCircle size={14} style={{ color: '#FFD000' }} /> Điểm mạnh ghi nhận
                                    </h4>
                                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#2C2A27', display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 500 }}>
                                        {scorecard.strengths?.map((str, i) => (
                                            <li key={i}>{str}</li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Weaknesses */}
                                <div style={{ padding: '20px', backgroundColor: '#FAF6EE', border: '1.5px solid #7A756B', borderRadius: '24px' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 700, color: '#7A756B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <AlertTriangle size={14} style={{ color: '#7A756B' }} /> Điểm yếu & Lỗ hổng cần sửa
                                    </h4>
                                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#7A756B', display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: 500 }}>
                                        {scorecard.weaknesses?.map((weak, i) => (
                                            <li key={i}>{weak}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Ideal Answers Table */}
                            <div>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: '#2C2A27', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Lightbulb size={14} style={{ color: '#2C2A27' }} /> Gợi ý câu trả lời chuẩn học thuật từ chuyên gia
                                </h4>
                                <div style={{ border: '1px solid rgba(122, 117, 107, 0.2)', borderRadius: '24px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F2EAE0', borderBottom: '1px solid rgba(122, 117, 107, 0.2)' }}>
                                                <th style={{ padding: '14px 18px', fontWeight: 700, color: '#2C2A27', width: '40%' }}>Câu hỏi chất vấn từ hội đồng</th>
                                                <th style={{ padding: '14px 18px', fontWeight: 700, color: '#2C2A27' }}>Mẫu câu trả lời khuyên dùng</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {scorecard.ideal_answers?.map((item, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid rgba(122, 117, 107, 0.2)', verticalAlign: 'top' }}>
                                                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#2C2A27', backgroundColor: '#FAF6EE' }}>
                                                        {item.question}
                                                    </td>
                                                    <td style={{ padding: '14px 18px', color: '#2C2A27', lineHeight: 1.6, whiteSpace: 'pre-line', fontWeight: 500, backgroundColor: '#FAF6EE' }}>
                                                        {item.answer}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(122, 117, 107, 0.2)', backgroundColor: '#F2EAE0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={() => {
                                    setShowScorecardModal(false);
                                    startVivaSession();
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', backgroundColor: '#FAF6EE', border: '1px solid rgba(122, 117, 107, 0.2)', borderRadius: '16px', color: '#2C2A27', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <RefreshCw size={14} strokeWidth={2.5} /> Phản biện lại
                            </button>
                            <button
                                onClick={() => setShowScorecardModal(false)}
                                style={{ padding: '10px 20px', backgroundColor: '#2C2A27', border: '1px solid #FFD000', borderRadius: '16px', color: '#ffffff', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Đóng lại
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default VivaPanel
