import React, { useState, useRef } from 'react'
import { FileText, Upload, Download, CheckCircle, AlertTriangle, Loader2, ArrowRight, BookOpen, Layout, Wrench, RefreshCw, X } from 'lucide-react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001';

function FormatChecker() {
    const [file, setFile] = useState(null)
    const [report, setReport] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isFixing, setIsFixing] = useState(false)
    const [dragActive, setDragActive] = useState(false)
    const fileInputRef = useRef(null)

    // Handlers for drag-and-drop
    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const validateAndSetFile = (selectedFile) => {
        const ext = selectedFile.name.split('.').pop().toLowerCase();
        if (ext !== 'docx' && ext !== 'pdf') {
            alert("Hệ thống chỉ hỗ trợ tệp định dạng Word (.docx) hoặc PDF (.pdf)!");
            return;
        }
        if (selectedFile.size > 15 * 1024 * 1024) {
            alert("Dung lượng tệp vượt quá giới hạn cho phép (tối đa 15MB)!");
            return;
        }
        setFile(selectedFile);
        setReport(null);
    };

    // Call API check-format
    const handleScanFile = async () => {
        if (!file) return;
        setIsLoading(true);
        setReport(null);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_BASE_URL}/api/check-format`, {
                method: 'POST',
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                },
                body: formData,
            });

            if (!response.ok) {
                let errorMsg = "Lỗi hệ thống khi quét định dạng.";
                try {
                    const errData = await response.json();
                    errorMsg = errData.detail || errorMsg;
                } catch (_) {}
                throw new Error(errorMsg);
            }

            const data = await response.json();
            setReport(data.report);
        } catch (error) {
            console.error("Scan error:", error);
            alert(`Lỗi quét tệp: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Call API fix-format
    const handleFixFile = async () => {
        if (!file || !file.name.endsWith('.docx')) return;
        setIsFixing(true);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_BASE_URL}/api/fix-format`, {
                method: 'POST',
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                },
                body: formData,
            });

            if (!response.ok) {
                let errorMsg = "Lỗi hệ thống khi tự động sửa.";
                try {
                    const errData = await response.json();
                    errorMsg = errData.detail || errorMsg;
                } catch (_) {}
                throw new Error(errorMsg);
            }

            // Read the binary stream and download file
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name.replace('.docx', '_fixed_UEH.docx');
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Fix error:", error);
            alert(`Lỗi sửa tệp: ${error.message}`);
        } finally {
            setIsFixing(false);
        }
    };

    const handleReset = () => {
        setFile(null);
        setReport(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Styles for Nothing UI
    const containerStyle = {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F2EAE0',
        height: '100%',
        borderRadius: '32px',
        border: '1px solid rgba(0, 0, 0, 0.04)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.02), 0 10px 50px rgba(0, 0, 0, 0.04)',
        padding: '24px',
        boxSizing: 'border-box',
        overflowY: 'auto'
    };

    const uploadZoneStyle = {
        width: '100%',
        maxWidth: '700px',
        margin: '20px auto',
        padding: '40px 24px',
        backgroundColor: dragActive ? '#f5f5f5' : '#FAF6EE',
        border: dragActive ? '2.5px dashed #2C2A27' : '2px dashed rgba(122, 117, 107, 0.25)',
        borderRadius: '24px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        boxSizing: 'border-box',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    };

    const reportCardStyle = {
        backgroundColor: '#FAF6EE',
        borderRadius: '24px',
        border: '1px solid rgba(122, 117, 107, 0.2)',
        padding: '20px 24px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        maxWidth: '900px',
        margin: '20px auto'
    };

    const ruleItemStyle = (isValid) => ({
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '16px',
        backgroundColor: '#F2EAE0',
        borderRadius: '16px',
        border: isValid ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
        borderLeft: isValid ? '4px solid #22c55e' : '4px solid #ef4444',
        boxSizing: 'border-box',
    });

    return (
        <div style={containerStyle}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#2C2A27', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.5px' }}>
                        <Layout size={20} /> Kiểm tra quy chuẩn luận văn <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#2C2A27', color: '#ffffff', padding: '2px 8px', borderRadius: '9999px', letterSpacing: '0.5px' }}>UEH STANDARD</span>
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#7A756B', fontWeight: 500 }}>
                        Quét định dạng lề trang, font chữ, giãn dòng, logo bìa và tài liệu tham khảo theo quy chuẩn UEH.
                    </p>
                </div>
                {file && (
                    <button
                        onClick={handleReset}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#FAF6EE', border: '1px solid rgba(122, 117, 107, 0.2)', borderRadius: '16px', color: '#2C2A27', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        <RefreshCw size={13} /> Chọn file khác
                    </button>
                )}
            </div>

            {/* Upload Zone & Actions */}
            {!file ? (
                <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={uploadZoneStyle}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(122, 117, 107, 0.4)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(122, 117, 107, 0.25)'}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                        accept=".docx,.pdf"
                    />
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#2C2A27', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                        <Upload size={28} style={{ color: '#ffffff' }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#2C2A27', display: 'block' }}>Kéo thả hoặc nhấp để tải file lên</span>
                        <span style={{ fontSize: '12px', color: '#7A756B', display: 'block', marginTop: '4px', fontWeight: 500 }}>Hỗ trợ định dạng Word (.docx) hoặc PDF (.pdf) • Tối đa 15MB</span>
                    </div>
                </div>
            ) : (
                <div style={{ width: '100%', maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Selected File Details */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', backgroundColor: '#FAF6EE', border: '1px solid rgba(122, 117, 107, 0.2)', padding: '16px 20px', borderRadius: '24px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#2C2A27', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileText size={20} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#2C2A27', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                            <div style={{ fontSize: '11.5px', color: '#7A756B', marginTop: '2px', fontWeight: 500 }}>{formatFileSize(file.size)}</div>
                        </div>
                        <button
                            onClick={handleReset}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7A756B', padding: '4px' }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Scan Button */}
                    {!report && !isLoading && (
                        <button
                            onClick={handleScanFile}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', backgroundColor: '#2C2A27', border: '1px solid #FFD000', borderRadius: '16px', color: '#ffffff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAF6EE'; e.currentTarget.style.color = '#2C2A27'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#2C2A27'; e.currentTarget.style.color = '#ffffff'; }}
                        >
                            Bắt đầu phân tích & kiểm tra định dạng
                        </button>
                    )}
                </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '16px' }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: '#2C2A27' }} />
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#2C2A27', display: 'block' }}>Đang quét định dạng file...</span>
                        <span style={{ fontSize: '12px', color: '#7A756B', display: 'block', marginTop: '4px', fontWeight: 500 }}>AI đang bóc tách trang bìa, tính toán lề trang và kiểm tra danh mục tài liệu tham khảo APA. Vui lòng đợi từ 15-30 giây.</span>
                    </div>
                </div>
            )}

            {/* Scan Report Display */}
            {report && (
                <div style={reportCardStyle}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 800, color: '#2C2A27', borderBottom: '1px solid rgba(122, 117, 107, 0.1)', paddingBottom: '12px' }}>
                        KẾT QUẢ QUÉT QUY CHUẨN UEH
                    </h3>

                    {/* Auto-fix DOCX action */}
                    {file && file.name.endsWith('.docx') && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F2EAE0', padding: '16px 20px', borderRadius: '18px', border: '1px solid rgba(122, 117, 107, 0.1)' }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <Wrench size={18} style={{ color: '#2C2A27', marginTop: '2px', flexShrink: 0 }} />
                                <div>
                                    <strong style={{ fontSize: '13.5px', color: '#2C2A27', display: 'block' }}>Tự động sửa định dạng (Auto-Fix)</strong>
                                    <span style={{ fontSize: '11.5px', color: '#7A756B', display: 'block', marginTop: '2px', fontWeight: 500 }}>Backend sẽ căn chỉnh lại lề trang (3.5cm/2cm), đưa font chữ body về Times New Roman 13pt và giãn dòng 1.2, đồng thời bảo vệ kích thước Heading của bạn.</span>
                                </div>
                            </div>
                            <button
                                onClick={handleFixFile}
                                disabled={isFixing}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#2C2A27', border: '1px solid #FFD000', borderRadius: '14px', color: '#ffffff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}
                                onMouseEnter={(e) => { if(!isFixing) { e.currentTarget.style.backgroundColor = '#FAF6EE'; e.currentTarget.style.color = '#2C2A27'; } }}
                                onMouseLeave={(e) => { if(!isFixing) { e.currentTarget.style.backgroundColor = '#2C2A27'; e.currentTarget.style.color = '#ffffff'; } }}
                            >
                                {isFixing ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" /> Đang định dạng...
                                    </>
                                ) : (
                                    <>
                                        <Download size={14} /> Sửa & Tải bản chuẩn (.docx)
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Rule 1: Paper Size */}
                    <div style={ruleItemStyle(report.is_paper_size_valid)}>
                        {report.is_paper_size_valid ? (
                            <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <div>
                            <strong style={{ fontSize: '13.5px', color: '#2C2A27', display: 'block' }}>Khổ giấy (Paper Size)</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#7A756B', lineHeight: 1.4, fontWeight: 500 }}>{report.paper_size_feedback}</p>
                        </div>
                    </div>

                    {/* Rule 2: Margins */}
                    <div style={ruleItemStyle(report.is_margins_valid)}>
                        {report.is_margins_valid ? (
                            <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <div>
                            <strong style={{ fontSize: '13.5px', color: '#2C2A27', display: 'block' }}>Căn lề lề trang (Margins)</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#7A756B', lineHeight: 1.4, fontWeight: 500 }}>{report.margins_feedback}</p>
                        </div>
                    </div>

                    {/* Rule 3: Font Family */}
                    <div style={ruleItemStyle(report.is_font_family_valid)}>
                        {report.is_font_family_valid ? (
                            <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <div>
                            <strong style={{ fontSize: '13.5px', color: '#2C2A27', display: 'block' }}>Font chữ (Font style)</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#7A756B', lineHeight: 1.4, fontWeight: 500 }}>{report.font_family_feedback}</p>
                        </div>
                    </div>

                    {/* Rule 4: Font Size */}
                    <div style={ruleItemStyle(report.is_font_size_valid)}>
                        {report.is_font_size_valid ? (
                            <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <div>
                            <strong style={{ fontSize: '13.5px', color: '#2C2A27', display: 'block' }}>Cỡ chữ (Font size)</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#7A756B', lineHeight: 1.4, fontWeight: 500 }}>{report.font_size_feedback}</p>
                        </div>
                    </div>

                    {/* Rule 5: Line Spacing */}
                    <div style={ruleItemStyle(report.is_spacing_valid)}>
                        {report.is_spacing_valid ? (
                            <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <div>
                            <strong style={{ fontSize: '13.5px', color: '#2C2A27', display: 'block' }}>Khoảng cách dòng (Line Spacing)</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#7A756B', lineHeight: 1.4, fontWeight: 500 }}>{report.spacing_feedback}</p>
                        </div>
                    </div>

                    {/* Rule 6: Logo Cover page check */}
                    <div style={ruleItemStyle(report.is_logo_valid)}>
                        {report.is_logo_valid ? (
                            <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <div>
                            <strong style={{ fontSize: '13.5px', color: '#2C2A27', display: 'block' }}>Logo UEH & Thẩm mỹ trang bìa</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#7A756B', lineHeight: 1.4, fontWeight: 500 }}>{report.logo_feedback}</p>
                        </div>
                    </div>

                    {/* Rule 7: References (APA 7th check) */}
                    <div style={ruleItemStyle(report.is_citations_valid)}>
                        {report.is_citations_valid ? (
                            <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                        ) : (
                            <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                        )}
                        <div>
                            <strong style={{ fontSize: '13.5px', color: '#2C2A27', display: 'block' }}>Danh mục tài liệu tham khảo (APA 7th Check)</strong>
                            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#7A756B', lineHeight: 1.4, fontWeight: 500 }}>{report.citations_feedback}</p>
                        </div>
                    </div>


                    {/* Citation side-by-side analysis (UX Improvement) */}
                    {report.citations_errors && report.citations_errors.length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800, color: '#2C2A27', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <BookOpen size={16} /> CHI TIẾT SỬA LỖI TRÍCH DẪN APA 7TH
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                {report.citations_errors.map((item, idx) => (
                                    <div key={idx} style={{ padding: '16px', backgroundColor: '#F2EAE0', borderRadius: '18px', border: '1px solid rgba(122, 117, 107, 0.15)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {/* Original */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bản gốc bị lỗi:</span>
                                            <div style={{ padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderLeft: '4px solid #ef4444', borderRadius: '6px', fontSize: '13px', color: '#2C2A27', fontStyle: 'italic', wordBreak: 'break-all' }}>
                                                {item.original}
                                            </div>
                                        </div>
                                        {/* Reason */}
                                        <div style={{ fontSize: '12px', color: '#7A756B', paddingLeft: '4px', fontWeight: 600 }}>
                                            💡 Lỗi phát hiện: {item.reason}
                                        </div>
                                        {/* Suggested */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Đề xuất sửa đổi (APA 7th):</span>
                                            <div style={{ padding: '8px 12px', backgroundColor: 'rgba(34, 197, 94, 0.05)', borderLeft: '4px solid #22c55e', borderRadius: '6px', fontSize: '13px', color: '#2C2A27', fontWeight: 600, wordBreak: 'break-all' }}>
                                                {item.suggested}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default FormatChecker;
