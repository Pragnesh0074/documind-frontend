'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';

interface Message {
  role: 'user' | 'bot';
  content: string;
}

const formatDocName = (name: string) => {
  return name
    .replace(/\.[^/.]+$/, "") // Remove extension
    .replace(/[_-]/g, " ")     // Replace _ and - with space
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setPdfUploaded(true);
        const displayName = formatDocName(file.name);
        setFileName(displayName);
        // Clear previous chat and show only the new success message
        setMessages([{ role: 'bot', content: `Success! I've analyzed "${displayName}". You can now ask questions about its content.` }]);
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

  const handleRemoveFile = () => {
    setPdfUploaded(false);
    setFileName('');
    setMessages([]);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isChatting) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatting(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chat`, {
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
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: 'Backend connection lost.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="app-wrapper">
      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" style={{ display: 'none' }} />

      {/* Main Container */}
      <main className="main-chat-container">
        <header className="chat-header">
          <div className="logo-group">
            <Image src="/docbot-logo-v2.png" alt="DocBot Logo" width={32} height={32} className="logo-img" priority />
            <h1>DocBot</h1>
          </div>
          
          {pdfUploaded && (
            <div className="file-controls">
              <div className="active-file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span>{fileName}</span>
              </div>
              <div className="control-buttons">
                <button className="control-btn" onClick={() => fileInputRef.current?.click()} title="Change File">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                  </svg>
                  Change
                </button>
                <button className="control-btn danger" onClick={handleRemoveFile} title="Remove File">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
              <div className="status-badge"><span style={{ width: '6px', height: '6px', background: 'var(--accent)', borderRadius: '50%' }}></span> System Online</div>
            </div>
          )}
        </header>

        <div className="chat-messages">
          {messages.filter(msg => msg.content).map((msg, i) => (
            <div key={i} className={`msg-bubble ${msg.role}`}>
              {msg.content}
            </div>
          ))}

          {/* Empty State - Clean Centered Layout */}
          {!pdfUploaded && !isUploading && (
            <div className="empty-state-container">
              <div className="upload-glass-card">
                <div className="pulse-icon">
                  <Image src="/docbot-logo-v2.png" alt="DocBot" width={48} height={48} className="card-logo-img" loading="eager" />
                </div>
                <h2>Chat with your Document</h2>
                <p>Drop in any PDF — a book, report, contract, or notes — and just ask questions like you&apos;re talking to someone who read it for you.</p>

                {/* Pinned How-it-works */}
                <div className="pinned-banner">
                  <span className="pin-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3a2 2 0 0 1 2 2v1l1 1v2h-7v6l1 3H10l1-3v-6H4V7l1-1V5a2 2 0 0 1 2-2h10z"/></svg>
                  </span>
                  <span><strong>How it works:</strong> Upload a PDF → DocBot reads it → Ask anything and get instant answers.</span>
                </div>

                {/* Feature Chips */}
                <div className="feature-chips">
                  <div className="chip">📄 Any PDF file</div>
                  <div className="chip">🧠 Smart answers</div>
                  <div className="chip">🔒 Private & secure</div>
                  <div className="chip">⚡ Big books too</div>
                </div>

                <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                  <p className="upload-text">Click here to upload your PDF</p>
                  <p className="upload-subtext">Works with files up to 50MB</p>
                </div>
              </div>
            </div>
          )}

          {isChatting && (
            <div className="msg-bubble bot" style={{ display: 'flex', gap: '4px', padding: '12px 20px' }}>
              <div className="dot"></div><div className="dot"></div><div className="dot"></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {pdfUploaded && (
          <div className="chat-input-wrapper">
            <div className="input-glass">
              <textarea 
                placeholder="Ask a question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isChatting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
              />
              <button className="send-action" onClick={handleSendMessage} disabled={isChatting || !input.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        )}

        {isUploading && (
          <div className="upload-overlay-loading">
            <div className="upload-glass-card" style={{ maxWidth: '320px', textAlign: 'center' }}>
              <div className="pulse-icon">
                <Image src="/docbot-logo-v2.png" alt="Processing" width={40} height={40} className="card-logo-img" />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>Processing Knowledge</h2>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '16px' }}>Chunking text and generating vector embeddings...</p>
              <div className="loading-bar-container">
                <div className="loading-bar-shimmer"></div>
              </div>
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
