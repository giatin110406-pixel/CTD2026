import React, { useState } from 'react'
import { Menu, Plus, HelpCircle, History, Settings, FileText, GraduationCap, MessageSquare } from 'lucide-react'

function Sidebar({ onSelectPdf, currentPdf, currentView, onChangeView }) {
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
        borderRadius: '32px',
        border: '1px solid rgba(122, 117, 107, 0.2)',
        backgroundColor: '#F2EAE0',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        width: isCollapsed ? '76px' : '340px',
        userSelect: 'none',
        boxShadow: '0 4px 30px rgba(122, 117, 107, 0.02), 0 10px 50px rgba(122, 117, 107, 0.05)',
        overflow: 'hidden',
    }

    const iconStripStyle = {
        width: '76px',
        backgroundColor: '#F2EAE0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 0',
        flexShrink: 0,
        borderRight: '1px solid rgba(122, 117, 107, 0.2)',
    }

    const iconButtonStyle = (iconName, isActive = false) => ({
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: isActive ? '#ffffff' : '#2C2A27',
        backgroundColor: isActive 
            ? '#2C2A27' 
            : (hoveredIcon === iconName ? '#FAF6EE' : 'transparent'),
        border: isActive ? '1px solid #FFD000' : '1px solid transparent',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        marginBottom: '16px',
        position: 'relative',
    })

    const contentPanelStyle = {
        flex: 1,
        padding: '24px 20px',
        display: isCollapsed ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
    }

    const headerStyle = {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '18px',
        fontWeight: 700,
        color: '#2C2A27',
        margin: '0 0 4px 0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    }

    const subheaderStyle = {
        fontSize: '12px',
        color: '#7A756B',
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
        padding: '16px',
        backgroundColor: isActive 
            ? '#2C2A27' 
            : (hoveredDocId === doc.id ? '#FAF6EE' : '#F2EAE0'),
        borderRadius: '24px',
        border: isActive ? '1.5px solid #FFD000' : '1px solid rgba(122, 117, 107, 0.2)',
        marginBottom: '12px',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transform: hoveredDocId === doc.id ? 'translateY(-2px)' : 'none',
        boxShadow: hoveredDocId === doc.id ? '0 4px 12px rgba(122, 117, 107, 0.05)' : 'none',
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
                        <Menu size={20} strokeWidth={2.5} />
                    </div>

                    {/* Chat Mode Button */}
                    <div 
                        style={iconButtonStyle('chat', currentView === 'chat')}
                        onMouseEnter={() => setHoveredIcon('chat')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        onClick={() => onChangeView('chat')}
                        title="Trò chuyện AI"
                        className={currentView === 'chat' ? 'active-pulse' : ''}
                    >
                        <MessageSquare 
                            size={20} 
                            strokeWidth={1.5} 
                            fill={currentView === 'chat' ? '#ffffff' : (hoveredIcon === 'chat' ? '#2C2A27' : 'transparent')} 
                            style={{ color: currentView === 'chat' ? '#ffffff' : '#2C2A27' }} 
                        />
                    </div>

                    {/* Viva Panel Button */}
                    <div 
                        style={iconButtonStyle('viva', currentView === 'viva')}
                        onMouseEnter={() => setHoveredIcon('viva')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        onClick={() => onChangeView('viva')}
                        title="Hội đồng phản biện ảo"
                        className={currentView === 'viva' ? 'active-pulse' : ''}
                    >
                        <GraduationCap 
                            size={20} 
                            strokeWidth={1.5} 
                            fill={currentView === 'viva' ? '#ffffff' : (hoveredIcon === 'viva' ? '#2C2A27' : 'transparent')} 
                            style={{ color: currentView === 'viva' ? '#ffffff' : '#2C2A27' }} 
                        />
                    </div>

                    {/* New Conversation + Button */}
                    <div 
                        style={iconButtonStyle('plus', false)}
                        onMouseEnter={() => setHoveredIcon('plus')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        onClick={handleNewChat}
                        title="Hội thoại mới"
                    >
                        <Plus size={20} strokeWidth={3} style={{ color: '#2C2A27' }} />
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
                        <HelpCircle size={20} strokeWidth={1.5} fill={hoveredIcon === 'help' ? '#2C2A27' : 'transparent'} />
                    </div>
                    <div 
                        style={iconButtonStyle('history')}
                        onMouseEnter={() => setHoveredIcon('history')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        title="Lịch sử hoạt động"
                    >
                        <History size={20} strokeWidth={2.5} />
                    </div>
                    <div 
                        style={iconButtonStyle('settings')}
                        onMouseEnter={() => setHoveredIcon('settings')}
                        onMouseLeave={() => setHoveredIcon(null)}
                        title="Cài đặt"
                    >
                        <Settings size={20} strokeWidth={1.5} fill={hoveredIcon === 'settings' ? '#2C2A27' : 'transparent'} />
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
                                    <FileText 
                                        size={18} 
                                        strokeWidth={1.5} 
                                        fill={isActive ? '#ffffff' : (hoveredDocId === doc.id ? '#2C2A27' : 'transparent')} 
                                        style={{ color: isActive ? '#ffffff' : '#2C2A27', flexShrink: 0 }} 
                                    />
                                    <span style={{ 
                                        fontWeight: isActive ? 700 : 500, 
                                        color: isActive ? '#ffffff' : '#2C2A27',
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
                                    color: isActive ? '#FAF6EE' : '#7A756B',
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