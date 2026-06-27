import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import VivaPanel from './components/VivaPanel'
import FormatChecker from './components/FormatChecker'
import { X, FileText } from 'lucide-react'


function App() {
  const [currentPdf, setCurrentPdf] = useState(null)
  const [currentView, setCurrentView] = useState('chat') // 'chat' or 'viva'
  const [activePdfName, setActivePdfName] = useState(null)

  return (
    <div 
      className="nothing-grid-bg"
      style={{ 
        display: 'flex', 
        width: '100vw', 
        height: '100vh', 
        overflow: 'hidden', 
        fontFamily: "'Plus Jakarta Sans', sans-serif", 
        backgroundColor: '#FAF6EE',
        padding: '20px',
        gap: '20px',
        boxSizing: 'border-box'
      }}
    >
      <Sidebar 
        onSelectPdf={setCurrentPdf} 
        currentPdf={currentPdf} 
        currentView={currentView} 
        onChangeView={setCurrentView} 
      />
      
      {currentView === 'chat' ? (
        <ChatWindow setActivePdfName={setActivePdfName} />
      ) : currentView === 'viva' ? (
        <VivaPanel currentPdf={currentPdf} />
      ) : (
        <FormatChecker />
      )}

      {/* Nothing UI Centered PDF Modal Pop-up */}
      {activePdfName !== null && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-md z-50 flex items-center justify-center animate-fade-in"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setActivePdfName(null)}
        >
          <div 
            className="rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-black/5 animate-slide-up"
            style={{
              width: '75%',
              height: '85vh',
              backgroundColor: '#F2EAE0',
              borderRadius: '32px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.1)',
              border: '1px solid rgba(0, 0, 0, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: '24px',
              boxSizing: 'border-box'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div 
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}
            >
              <span 
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 700,
                  color: '#2C2A27',
                  fontSize: '18px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '80%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                title={activePdfName}
              >
                <FileText size={16} style={{ color: '#2C2A27' }} /> {activePdfName}
              </span>
              
              {/* Special Circle Solid Close Button (Nothing UI style) */}
              <button
                onClick={() => setActivePdfName(null)}
                className="w-8 h-8 flex items-center justify-center"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#2C2A27',
                  color: '#FAF6EE',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFD000';
                  e.currentTarget.style.color = '#2C2A27';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#2C2A27';
                  e.currentTarget.style.color = '#FAF6EE';
                  e.currentTarget.style.transform = 'none';
                }}
                title="Đóng"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* PDF Display Area */}
            <div 
              className="rounded-[24px]"
              style={{
                flex: 1,
                borderRadius: '24px',
                overflow: 'hidden',
                border: '1px solid rgba(0, 0, 0, 0.05)',
                backgroundColor: '#FAF6EE'
              }}
            >
              <iframe
                src={`http://127.0.0.1:8002/api/pdf/${activePdfName}`}
                title="PDF Modal Viewer"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none'
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App


