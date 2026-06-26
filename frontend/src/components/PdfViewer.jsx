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
        border: '1px solid rgba(122, 117, 107, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F2EAE0',
        height: '100%',
        boxShadow: '0 4px 30px rgba(122, 117, 107, 0.02), 0 10px 50px rgba(122, 117, 107, 0.05)',
        flexShrink: 0,
        animation: 'slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRadius: '32px',
        overflow: 'hidden',
    }

    const headerStyle = {
        padding: '20px 24px',
        borderBottom: '1px solid rgba(122, 117, 107, 0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#F2EAE0',
    }

    const titleStyle = {
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 700,
        color: '#2C2A27',
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
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: isHovered ? '#2C2A27' : '#7A756B',
        backgroundColor: isHovered ? '#FAF6EE' : 'transparent',
        transition: 'all 0.2s ease',
    })

    const iframeContainerStyle = {
        flex: 1,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
    }

    const iframeStyle = {
        width: '100%',
        height: '100%',
        border: '1px solid rgba(122, 117, 107, 0.2)',
        borderRadius: '24px',
        boxShadow: '0 4px 12px rgba(122,117,107,0.02)',
        backgroundColor: '#FAF6EE',
    }

    const handleExternalOpen = () => {
        window.open(pdfUrl, '_blank')
    }

    return (
        <div style={containerStyle}>
            {/* Header của cột PDF */}
            <div style={headerStyle}>
                <span style={titleStyle} title={fileName}>
                    <FileText 
                        size={18} 
                        strokeWidth={1.5} 
                        fill="#2C2A27" 
                        style={{ color: '#2C2A27', flexShrink: 0 }} 
                    />
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
                        <ExternalLink size={16} strokeWidth={2.5} />
                    </button>

                    {/* Nút đóng */}
                    <button
                        onClick={onClose}
                        style={actionButtonStyle(hoveredClose)}
                        onMouseEnter={() => setHoveredClose(true)}
                        onMouseLeave={() => setHoveredClose(false)}
                        title="Đóng trình xem"
                    >
                        <X size={18} strokeWidth={2.5} />
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