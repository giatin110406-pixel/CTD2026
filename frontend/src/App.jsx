import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import PdfViewer from './components/PdfViewer'

function App() {
  const [currentPdf, setCurrentPdf] = useState(null)

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: "'Inter', 'Outfit', sans-serif", backgroundColor: '#ffffff' }}>

      <Sidebar onSelectPdf={setCurrentPdf} currentPdf={currentPdf} />
      <ChatWindow onViewPdf={setCurrentPdf} />
      {currentPdf && (
        <PdfViewer pdfUrl={currentPdf} onClose={() => setCurrentPdf(null)} />
      )}
    </div>
  )
}

export default App
