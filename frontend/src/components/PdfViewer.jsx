import React, { useState } from 'react'
import { X, ExternalLink, FileText, Minimize2 } from 'lucide-react'

function PdfViewer({ pdfUrl, onClose }) {
    const [hoveredClose, setHoveredClose] = useState(false)
    const [hoveredExternal, setHoveredExternal] = useState(false)
    
    // Trích xuất tên tài liệu từ đường dẫn URL
    const fileName = pdfUrl ? decodeURIComponent(pdfUrl.split('/').pop()) : 'Tài liệu.pdf'

    // Styles
    const containerStyle = {
        width: '480px',
        borderLeft: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#f8fafc',
        height: '100%',
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.05)',
        flexShrink: 0,
        animation: 'slideIn 0.3s ease',
    }

    const headerStyle = {
        padding: '16px 20px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#ffffff',
    }

    const titleStyle = {
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 600,
        color: '#1e293b',
        fontSize: '15px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '320px',
    }

    const actionContainerStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    }

    const actionButtonStyle = (isHovered) => ({
        background: 'none',
        border: 'none',
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: '#64748b',
        backgroundColor: isHovered ? '#f1f5f9' : 'transparent',
        transition: 'all 0.2s ease',
    })

    const iframeContainerStyle = {
        flex: 1,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
    }

    const iframeStyle = {
        width: '100%',
        height: '100%',
        border: '1px solid #cbd5e1',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        backgroundColor: '#ffffff',
    }

    const handleExternalOpen = () => {
        window.open(pdfUrl, '_blank')
    }

    return (
        <div style={containerStyle}>
            {/* Header của cột PDF */}
            <div style={headerStyle}>
                <span style={titleStyle} title={fileName}>
                    <FileText size={18} style={{ color: '#1a73e8', flexShrink: 0 }} />
                    {fileName}
                </span>
                
                <div style={actionContainerStyle}>
                    {/* Nút mở trong tab mới */}
                    <button
                        onClick={handleExternalOpen}
                        style={actionButtonStyle(hoveredExternal)}
                        onMouseEnter={() => setHoveredExternal(true)}
                        onMouseLeave={() => setHoveredExternal(false)}
                        title="Mở trong tab mới"
                    >
                        <ExternalLink size={16} />
                    </button>

                    {/* Nút đóng */}
                    <button
                        onClick={onClose}
                        style={actionButtonStyle(hoveredClose)}
                        onMouseEnter={() => setHoveredClose(true)}
                        onMouseLeave={() => setHoveredClose(false)}
                        title="Đóng trình xem"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Nội dung nhúng file PDF */}
            <div style={iframeContainerStyle}>
                <iframe
                    src={pdfUrl}
                    title="PDF Viewer"
                    style={iframeStyle}
                />
            </div>
        </div>
    )
}

export default PdfViewer