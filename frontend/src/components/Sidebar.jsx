import React, { useState } from 'react'
import { Menu, Plus, HelpCircle, History, Settings, FileText } from 'lucide-react'

function Sidebar({ onSelectPdf, currentPdf }) {
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [hoveredDocId, setHoveredDocId] = useState(null)
    const [hoveredIcon, setHoveredIcon] = useState(null)

    const documents = [
        { id: 1, title: "Luận văn Tốt nghiệp - Chương 1.pdf", url: "/documents/chuong1.pdf", size: "2.4 MB", pages: 18 },
        { id: 2, title: "Luận văn Tốt nghiệp - Chương 2.pdf", url: "/documents/chuong2.pdf", size: "3.1 MB", pages: 25 },
        { id: 3, title: "Tài liệu tham khảo AI & RAG.pdf", url: "/documents/thamkhao.pdf", size: "1.8 MB", pages: 12 },
    ]

    const handleNewChat = () => {
        alert("Bắt đầu cuộc hội thoại mới với AI Assistant!")
    }

    // Styles
    const containerStyle = {
        display: 'flex',
        height: '100%',
        borderRight: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        transition: 'width 0.3s ease',
        width: isCollapsed ? '64px' : '320px',
        userSelect: 'none',
    }

    const iconStripStyle = {
        width: '64px',
        backgroundColor: '#f0f4f9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 0',
        flexShrink: 0,
        borderRight: '1px solid #e2e8f0',
    }

    const iconButtonStyle = (iconName, isSpecial = false) => ({
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: '#444746',
        backgroundColor: isSpecial 
            ? (hoveredIcon === iconName ? '#e8eef6' : '#dde3ea') 
            : (hoveredIcon === iconName ? '#e2e8f0' : 'transparent'),
        transition: 'all 0.2s ease',
        marginBottom: '16px',
        boxShadow: isSpecial ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
    })

    const contentPanelStyle = {
        flex: 1,
        padding: '24px 16px',
        display: isCollapsed ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    }

    const headerStyle = {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '18px',
        fontWeight: 600,
        color: '#1e293b',
        margin: '0 0 4px 0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    }

    const subheaderStyle = {
        fontSize: '12px',
        color: '#64748b',
        marginBottom: '24px',
    }

    const docListStyle = {
        listStyle: 'none',
        padding: 0,
        margin: 0,
        overflowY: 'auto',
        flex: 1,
    }

    const docCardStyle = (doc, isActive) => ({
        padding: '14px 16px',
        backgroundColor: isActive 
            ? '#e8f0fe' 
            : (hoveredDocId === doc.id ? '#f8fafc' : '#ffffff'),
        borderRadius: '12px',
        border: isActive ? '1px solid #aecbfa' : '1px solid #e2e8f0',
        marginBottom: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        transform: hoveredDocId === doc.id ? 'translateY(-2px)' : 'none',
        boxShadow: hoveredDocId === doc.id ? '0 4px 12px rgba(0, 0, 0, 0.05)' : 'none',
    })

    return (
        <div style={containerStyle}>
            {/* Left Column: Icons Strip */}
            <div style={iconStripStyle}>
                <div>
                    {/* Hamburger Menu to Toggle Collapse */}
                    <div 
                        style={iconButtonStyle('menu')}
                        onMouseEnter={() => setHoveredIcon('menu')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        title={isCollapsed ? "Mở rộng" : "Thu gọn"}
                    >
                        <Menu size={20} />
                    </div>

                    {/* New Conversation + Button */}
                    <div 
                        style={iconButtonStyle('plus', true)}
                        onMouseEnter={() => setHoveredIcon('plus')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        onClick={handleNewChat}
                        title="Hội thoại mới"
                    >
                        <Plus size={20} style={{ color: '#0061c1' }} />
                    </div>
                </div>

                {/* Bottom Actions */}
                <div>
                    <div 
                        style={iconButtonStyle('help')}
                        onMouseEnter={() => setHoveredIcon('help')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        title="Trợ giúp"
                    >
                        <HelpCircle size={20} />
                    </div>
                    <div 
                        style={iconButtonStyle('history')}
                        onMouseEnter={() => setHoveredIcon('history')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        title="Lịch sử hoạt động"
                    >
                        <History size={20} />
                    </div>
                    <div 
                        style={iconButtonStyle('settings')}
                        onMouseEnter={() => setHoveredIcon('settings')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        title="Cài đặt"
                    >
                        <Settings size={20} />
                    </div>
                </div>
            </div>

            {/* Right Column: Documents List */}
            <div style={contentPanelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={headerStyle}>📚 Tài liệu RAG</h3>
                </div>
                <div style={subheaderStyle}>Chọn file PDF để đính kèm ngữ cảnh RAG</div>
                
                <ul style={docListStyle}>
                    {documents.map((doc) => {
                        const isActive = currentPdf === doc.url
                        return (
                            <li
                                key={doc.id}
                                onClick={() => onSelectPdf(doc.url)}
                                style={docCardStyle(doc, isActive)}
                                onMouseEnter={() => setHoveredDocId(doc.id)}
                                onMouseLeave={() => setHoveredDocId(null)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <FileText size={18} style={{ color: isActive ? '#1a73e8' : '#64748b', flexShrink: 0 }} />
                                    <span style={{ 
                                        fontWeight: isActive ? 600 : 500, 
                                        color: isActive ? '#1967d2' : '#334155',
                                        fontSize: '14px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {doc.title}
                                    </span>
                                </div>
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    fontSize: '11px', 
                                    color: isActive ? '#70a5f9' : '#94a3b8',
                                    paddingLeft: '28px'
                                }}>
                                    <span>{doc.size}</span>
                                    <span>{doc.pages} trang</span>
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </div>
        </div>
    )
}

export default Sidebar