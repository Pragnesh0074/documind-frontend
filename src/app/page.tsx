'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'bot';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: 'Welcome to DocuMind. Upload a PDF to start our conversation.' }
  ]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [pdfUploaded, setPdfUploaded] = useState(false);
  const [fileName, setFileName] = useState('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isChatting]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setPdfUploaded(true);
        setMessages([...messages, { role: 'bot', content: `Success! I've analyzed **${file.name}**. You can now ask questions about its content.` }]);
      } else {
        alert('Upload failed. Please ensure the backend is running.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Connection error. Is the FastAPI backend active?');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isChatting) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatting(true);

    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessages(prev => [...prev, { role: 'bot', content: data.answer }]);
      } else {
        setMessages(prev => [...prev, { role: 'bot', content: 'I encountered an error. Please try rephrasing.' }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', content: 'Backend connection lost.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="app-wrapper">
      {/* Premium Sidebar */}
      <aside className="sidebar">
        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', background: 'var(--primary)', borderRadius: '8px' }}></div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>DocuMind</h2>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>AI-Powered RAG System</p>
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '16px' }}>Active Document</p>
          {pdfUploaded ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <p style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📄 {fileName}</p>
            </div>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>No document active</p>
          )}
        </div>

        <div style={{ marginTop: 'auto', padding: '16px', background: 'rgba(139, 92, 246, 0.1)', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)' }}>Powered by Gemini 1.5</p>
        </div>
      </aside>

      {/* Main Container */}
      <main className="main-chat-container">
        <header className="chat-header">
          <h1>AI Workspace</h1>
          {pdfUploaded && <div className="status-badge"><span style={{ width: '6px', height: '6px', background: 'var(--accent)', borderRadius: '50%' }}></span> System Online</div>}
        </header>

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`msg-bubble ${msg.role}`}>
              {msg.content}
            </div>
          ))}
          {isChatting && (
            <div className="msg-bubble bot" style={{ display: 'flex', gap: '4px', padding: '12px 20px' }}>
              <div className="dot"></div><div className="dot"></div><div className="dot"></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-wrapper">
          <div className="input-glass">
            <textarea 
              placeholder={pdfUploaded ? "Ask a question..." : "Please upload a document first"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!pdfUploaded || isChatting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={1}
            />
            <button className="send-action" onClick={handleSendMessage} disabled={!pdfUploaded || isChatting || !input.trim()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>

        {/* Upload Modal Overlay */}
        {!pdfUploaded && !isUploading && (
          <div className="modal-overlay">
            <div className="upload-glass-card">
              <div className="pulse-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '12px' }}>Initialize Chat</h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '32px' }}>Upload a PDF to create a localized knowledge base for your AI assistant.</p>
              
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" style={{ display: 'none' }} />
                <p style={{ fontWeight: 600 }}>Click to choose PDF</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '8px' }}>Supports documents up to 50MB</p>
              </div>
            </div>
          </div>
        )}

        {isUploading && (
          <div className="modal-overlay">
            <div className="upload-glass-card">
              <div className="pulse-icon" style={{ animation: 'none' }}>
                <div className="dot" style={{ background: 'var(--primary)', width: '12px', height: '12px' }}></div>
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>Processing Knowledge</h2>
              <p style={{ color: 'var(--text-dim)' }}>Chunking text and generating vector embeddings...</p>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .dot {
          width: 8px;
          height: 8px;
          background: var(--text-dim);
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }
      `}</style>
    </div>
  );
}
