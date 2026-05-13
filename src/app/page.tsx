'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

type MessageRole = 'user' | 'bot';
type DocumentStatus = 'queued' | 'processing' | 'processed' | 'failed' | 'cancelled';

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  streaming?: boolean;
}

interface UploadedDocument {
  id: string;
  filename: string;
  display_name: string;
  size: number;
  status: DocumentStatus;
  pages: number;
  chunks: number;
  error?: string;
  previewUrl?: string;
}

interface UploadJob {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled';
  total_files: number;
  processed_files: number;
  failed_files: number;
  processed_pages: number;
  total_chunks: number;
  active_file?: string | null;
  documents: UploadedDocument[];
  error?: string;
}

interface UploadErrorResponse {
  detail?: string | Array<{ msg?: string }>;
  error?: string;
}

interface DocumentListResponse {
  documents?: UploadedDocument[];
}

const DEFAULT_API_BASE =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:8000'
    : 'https://documind-backend-840827516066.europe-west1.run.app';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_BASE;

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatDocName = (name: string) => {
  return name
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const statusLabel = (status: DocumentStatus) => {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Indexing';
    case 'processed':
      return 'Ready';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const getUploadErrorMessage = (data: UploadErrorResponse) => {
  if (typeof data.error === 'string') return data.error;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail.map((item) => item.msg).filter(Boolean).join(', ');
  }
  return 'Upload failed';
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [deletingDocumentIds, setDeletingDocumentIds] = useState<string[]>([]);
  const [isDeletingLastDocument, setIsDeletingLastDocument] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const pollingRunRef = useRef(0);

  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'processed'),
    [documents],
  );
  const hasDocuments = documents.length > 0;
  const hasReadyDocuments = readyDocuments.length > 0;
  const isDeletingAnyDocument = deletingDocumentIds.length > 0;
  const isDocumentProcessing = documents.some((document) =>
    ['queued', 'processing'].includes(document.status),
  );
  const isInputDisabled =
    isChatting ||
    isUploading ||
    isDeletingAnyDocument ||
    isDeletingLastDocument ||
    isDocumentProcessing ||
    !hasReadyDocuments;

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const appendBotMessage = (content: string) => {
    setMessages((current) => {
      const lastMessage = current[current.length - 1];
      if (lastMessage?.role === 'bot' && lastMessage.content === content) {
        return current;
      }

      return [...current, { id: createId(), role: 'bot', content }];
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isChatting]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const mergeServerDocuments = useCallback((serverDocuments: UploadedDocument[]) => {
    setDocuments((currentDocuments) => {
      const nextById = new Map(currentDocuments.map((document) => [document.id, document]));
      const serverKeys = new Set(
        serverDocuments.map((document) => `${document.filename}:${document.size}`),
      );

      currentDocuments.forEach((document) => {
        if (document.id.startsWith('local-') && serverKeys.has(`${document.filename}:${document.size}`)) {
          nextById.delete(document.id);
        }
      });

      serverDocuments.forEach((document) => {
        const existing = nextById.get(document.id);
        nextById.set(document.id, {
          ...existing,
          ...document,
          previewUrl: existing?.previewUrl || `${API_BASE}/documents/${document.id}/file`,
        });
      });

      return Array.from(nextById.values());
    });
  }, []);

  const syncDocumentsFromServer = useCallback(
    (serverDocuments: UploadedDocument[], removedDocument?: UploadedDocument) => {
      if (removedDocument?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(removedDocument.previewUrl);
        previewUrlsRef.current = previewUrlsRef.current.filter(
          (url) => url !== removedDocument.previewUrl,
        );
      }

      const previewById = new Map(documents.map((document) => [document.id, document.previewUrl]));
      const previewByKey = new Map(
        documents.map((document) => [`${document.filename}:${document.size}`, document.previewUrl]),
      );

      const nextDocuments = serverDocuments.map((document) => ({
        ...document,
        previewUrl:
          previewById.get(document.id) ||
          previewByKey.get(`${document.filename}:${document.size}`) ||
          `${API_BASE}/documents/${document.id}/file`,
      }));

      setDocuments(nextDocuments);

      if (nextDocuments.length === 0) {
        setInput('');
        setMessages([]);
      }
    },
    [documents],
  );

  const removeDocumentLocally = useCallback(
    (documentToDelete: UploadedDocument) => {
      if (documentToDelete.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(documentToDelete.previewUrl);
        previewUrlsRef.current = previewUrlsRef.current.filter(
          (url) => url !== documentToDelete.previewUrl,
        );
      }

      const nextDocuments = documents.filter((document) => document.id !== documentToDelete.id);
      setDocuments(nextDocuments);

      if (nextDocuments.length === 0) {
        setInput('');
        setMessages([]);
      }
    },
    [documents],
  );

  const listServerDocuments = useCallback(async () => {
    const response = await fetch(`${API_BASE}/documents`);
    if (!response.ok) return [];

    const data = (await response.json()) as DocumentListResponse;
    return data.documents || [];
  }, []);

  const resolveChatDocumentIds = useCallback(async () => {
    const visibleReadyDocuments = documents.filter((document) => document.status === 'processed');
    if (!visibleReadyDocuments.length) return undefined;

    if (visibleReadyDocuments.every((document) => !document.id.startsWith('local-'))) {
      return visibleReadyDocuments.map((document) => document.id);
    }

    try {
      const serverDocuments = await listServerDocuments();
      if (!serverDocuments.length) {
        return undefined;
      }

      const resolvedIds = visibleReadyDocuments
        .map(
          (document) =>
            serverDocuments.find((serverDocument) => serverDocument.id === document.id) ||
            serverDocuments.find(
              (serverDocument) =>
                serverDocument.filename === document.filename &&
                serverDocument.size === document.size,
            ) ||
            null,
        )
        .filter((document): document is UploadedDocument => Boolean(document))
        .map((document) => document.id);

      return resolvedIds.length === visibleReadyDocuments.length ? resolvedIds : undefined;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }, [documents, listServerDocuments]);

  const pollUploadStatus = useCallback(
    async (jobId: string) => {
      const runId = pollingRunRef.current;

      try {
        for (let attempt = 0; attempt < 900; attempt += 1) {
          if (pollingRunRef.current !== runId) return;
          await sleep(900);

          const response = await fetch(`${API_BASE}/upload/status/${jobId}`);
          if (!response.ok) throw new Error('Unable to read upload status');

          const job = (await response.json()) as UploadJob;
          mergeServerDocuments(job.documents || []);

          const activeFile = job.active_file ? ` ${job.active_file}` : '';
          setUploadStatus(
            job.status === 'processing'
              ? `Indexing${activeFile} · ${job.processed_pages} pages · ${job.total_chunks} chunks`
              : statusLabel(job.status as DocumentStatus),
          );

          if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)) {
            const readyCount = (job.documents || []).filter(
              (document) => document.status === 'processed',
            ).length;
            const failedCount = (job.documents || []).filter(
              (document) => document.status === 'failed',
            ).length;

            appendBotMessage(
              failedCount > 0
                ? `${readyCount} PDF${readyCount === 1 ? '' : 's'} ${readyCount === 1 ? 'is' : 'are'} ready. ${failedCount} ${failedCount === 1 ? 'couldn’t be processed' : 'couldn’t be processed'}.`
                : readyCount === 1
                  ? 'Your PDF is ready. You can start asking questions now.'
                  : 'Your PDFs are ready. You can ask questions across all of them now.',
            );
            break;
          }
        }
      } catch (error) {
        console.error(error);
        appendBotMessage('The upload started, but I could not refresh its processing status.');
      } finally {
        if (pollingRunRef.current === runId) {
          setIsUploading(false);
          setUploadStatus('');
        }
      }
    },
    [mergeServerDocuments],
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    const pdfFiles = selectedFiles.filter((file) => file.name.toLowerCase().endsWith('.pdf'));

    if (!pdfFiles.length) return;

    pollingRunRef.current += 1;
    setIsUploading(true);
    setUploadStatus(`Queued ${pdfFiles.length} PDF${pdfFiles.length === 1 ? '' : 's'}`);

    const localDocuments: UploadedDocument[] = pdfFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.push(previewUrl);

      return {
        id: `local-${createId()}`,
        filename: file.name,
        display_name: formatDocName(file.name),
        size: file.size,
        status: 'queued',
        pages: 0,
        chunks: 0,
        previewUrl,
      };
    });

    setDocuments((current) => [...current, ...localDocuments]);
    appendBotMessage(
      pdfFiles.length === 1
        ? 'Got your PDF. I’m reading it now, and you’ll be able to ask questions as soon as it’s ready.'
        : `Got your ${pdfFiles.length} PDFs. I’m reading them now, and you’ll be able to ask questions as soon as they’re ready.`,
    );

    const createFormData = (fieldName: 'files' | 'file') => {
      const formData = new FormData();
      pdfFiles.forEach((file) => formData.append(fieldName, file));
      return formData;
    };

    try {
      let response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: createFormData('files'),
      });

      let data = (await response.json()) as UploadJob & UploadErrorResponse & { message?: string };

      if (!response.ok && response.status === 422) {
        response = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          body: createFormData('file'),
        });
        data = (await response.json()) as UploadJob & UploadErrorResponse & { message?: string };
      }

      if (!response.ok) {
        throw new Error(getUploadErrorMessage(data));
      }

      if (!data.job_id) {
        setIsUploading(false);
        setUploadStatus('');
        setDocuments((current) =>
          current.map((document) =>
            localDocuments.some((localDocument) => localDocument.id === document.id)
              ? { ...document, status: 'processed' }
              : document,
          ),
        );
        try {
          const serverDocuments = await listServerDocuments();
          if (serverDocuments.length) {
            mergeServerDocuments(serverDocuments);
          }
        } catch (error) {
          console.error(error);
        }
        appendBotMessage(
          data.message ||
            (localDocuments.length === 1
              ? 'Your PDF is ready. You can start asking questions now.'
              : 'Your PDFs are ready. You can ask questions across all of them now.'),
        );
        return;
      }

      const previewByKey = new Map(localDocuments.map((document) => [`${document.filename}:${document.size}`, document.previewUrl]));
      const serverDocuments = (data.documents || []).map((document) => ({
        ...document,
        previewUrl: previewByKey.get(`${document.filename}:${document.size}`) || `${API_BASE}/documents/${document.id}/file`,
      }));

      mergeServerDocuments(serverDocuments);
      void pollUploadStatus(data.job_id);
    } catch (error) {
      console.error(error);
      setIsUploading(false);
      setUploadStatus('');
      setDocuments((current) =>
        current.map((document) =>
          localDocuments.some((localDocument) => localDocument.id === document.id)
            ? { ...document, status: 'failed', error: 'Upload failed' }
            : document,
        ),
      );
      appendBotMessage(
        `Upload failed. ${error instanceof Error ? error.message : 'Please make sure the FastAPI backend is running.'}`,
      );
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    const documentToDelete = documents.find((document) => document.id === documentId);
    if (!documentToDelete) return;
    if (deletingDocumentIds.includes(documentId)) return;

    const deletingFinalDocument = documents.length === 1;
    setDeletingDocumentIds((current) => [...current, documentId]);
    if (deletingFinalDocument) {
      setIsDeletingLastDocument(true);
    }

    try {
      const serverDocuments = await listServerDocuments();
      const matchedServerDocument =
        serverDocuments.find((document) => document.id === documentId) ||
        serverDocuments.find(
          (document) =>
            document.filename === documentToDelete.filename &&
            document.size === documentToDelete.size,
        ) ||
        null;

      let deleteTargetId = documentId;

      if (matchedServerDocument) {
        deleteTargetId = matchedServerDocument.id;
      }

      const response = await fetch(`${API_BASE}/documents/${deleteTargetId}`, {
        method: 'DELETE',
      });

      if (!response.ok && documents.length === 1) {
        const clearResponse = await fetch(`${API_BASE}/documents`, {
          method: 'DELETE',
        });

        if (clearResponse.ok) {
          syncDocumentsFromServer([], documentToDelete);
          return;
        }
      }

      if (!response.ok && documents.length > 1) {
        if (matchedServerDocument) {
          const remainingServerDocuments = serverDocuments.filter(
            (document) => document.id !== matchedServerDocument.id,
          );
          syncDocumentsFromServer(remainingServerDocuments, documentToDelete);
        } else {
          removeDocumentLocally(documentToDelete);
        }
        return;
      }

      if (!response.ok && documentToDelete.id.startsWith('local-') && documents.length === 1) {
        removeDocumentLocally(documentToDelete);
        return;
      }

      if (!response.ok) {
        throw new Error('Could not remove this PDF');
      }

      const data = (await response.json()) as DocumentListResponse;
      if (data.documents) {
        syncDocumentsFromServer(data.documents, documentToDelete);
        return;
      }

      removeDocumentLocally(documentToDelete);
    } catch (error) {
      console.error(error);
      appendBotMessage(
        documents.length > 1
          ? 'I could not remove that PDF right now. If this keeps happening, restart the backend once and try again.'
          : 'I could not remove that PDF right now. Please try again.',
      );
    } finally {
      setDeletingDocumentIds((current) => current.filter((id) => id !== documentId));
      if (deletingFinalDocument) {
        setIsDeletingLastDocument(false);
      }
    }
  };

  const updateStreamingMessage = (messageId: string, content: string, streaming = true) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, content, streaming } : message,
      ),
    );
  };

  const handleSendMessage = async () => {
    const question = input.trim();
    if (!question || isChatting || !hasReadyDocuments) return;

    const userMessage: Message = { id: createId(), role: 'user', content: question };
    const botMessageId = createId();
    setInput('');
    setMessages((current) => [
      ...current,
      userMessage,
      { id: botMessageId, role: 'bot', content: '', streaming: true },
    ]);
    setIsChatting(true);

    try {
      const activeDocumentIds = await resolveChatDocumentIds();

      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          document_ids: activeDocumentIds && activeDocumentIds.length ? activeDocumentIds : undefined,
        }),
      });

      if (!response.ok || !response.body) {
        if (response.status === 404 || response.status === 405) {
          const fallbackResponse = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: question,
              document_ids: activeDocumentIds && activeDocumentIds.length ? activeDocumentIds : undefined,
            }),
          });
          const fallbackData = await fallbackResponse.json();
          if (!fallbackResponse.ok) {
            throw new Error(fallbackData.detail || fallbackData.error || 'Chat request failed');
          }
          updateStreamingMessage(botMessageId, fallbackData.answer || 'I could not find an answer in the uploaded PDF.', false);
          return;
        }
        const errorText = await response.text();
        throw new Error(errorText || 'Chat request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamedContent += decoder.decode(value, { stream: true });
        updateStreamingMessage(botMessageId, streamedContent, true);
      }

      streamedContent += decoder.decode();
      updateStreamingMessage(botMessageId, streamedContent || 'I could not find an answer in the uploaded PDFs.', false);
    } catch (error) {
      console.error(error);
      updateStreamingMessage(
        botMessageId,
        'I encountered an error while answering. Please try again.',
        false,
      );
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="app-wrapper">
      <main className="main-chat-container">
        {isDeletingLastDocument && (
          <div className="screen-loader-overlay">
            <div className="screen-loader-card">
              <span className="loader-spinner" />
              <strong>Removing your PDF...</strong>
              <span>Taking you back to the main page</span>
            </div>
          </div>
        )}

        <header className="chat-header">
          <div className="logo-group">
            <Image src="/docbot-logo-v2.png" alt="DocBot Logo" width={32} height={32} className="logo-img" priority />
            <h1>DocBot</h1>
          </div>

          {hasDocuments && (
            <div className="header-actions">
              <div className="status-badge">
                <span className={isUploading || isDeletingAnyDocument ? 'status-dot pulsing' : 'status-dot'} />
                {isDeletingLastDocument
                  ? 'Removing PDF...'
                  : isUploading
                    ? uploadStatus || 'Indexing PDFs'
                    : `${readyDocuments.length}/${documents.length} ready`}
              </div>
            </div>
          )}
        </header>

        <div className={hasDocuments ? 'workspace with-docs' : 'workspace'}>
          <section className="chat-pane">
            <div className="chat-messages">
              {messages.map((message) => (
                <div key={message.id} className={`msg-bubble ${message.role} ${message.streaming ? 'streaming' : ''}`}>
                  {message.content ? (
                    <>
                      {message.content}
                      {message.streaming && <span className="stream-cursor" />}
                    </>
                  ) : (
                    <span className="typing-dots" aria-label="DocBot is typing">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                </div>
              ))}

              {!hasDocuments && !isUploading && (
                <div className="empty-state-container">
                  <div className="upload-glass-card">
                    <div className="pulse-icon">
                      <Image src="/docbot-logo-v2.png" alt="DocBot" width={48} height={48} className="card-logo-img" loading="eager" />
                    </div>
                    <h2>Chat with your Document</h2>
                    <p>Drop in any PDF — a book, report, contract, or notes — and just ask questions like you&apos;re talking to someone who read it for you.</p>

                    <div className="feature-chips">
                      <div className="chip">📄 Any PDF file</div>
                      <div className="chip">🧠 Smart answers</div>
                      <div className="chip">🔒 Private &amp; secure</div>
                      <div className="chip">⚡ Big books too</div>
                    </div>

                    <label className="upload-zone">
                      <span className="upload-text">Click here to upload your PDF</span>
                      <span className="upload-subtext">Works with files up to 50MB</span>
                      <input className="native-file-input" type="file" onChange={handleFileUpload} accept=".pdf" multiple />
                    </label>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {hasDocuments && (
              <div className="chat-input-wrapper">
                <div className={input.trim() ? 'input-glass typing-active' : 'input-glass'}>
                  <textarea
                    placeholder={
                      isUploading || isDocumentProcessing
                        ? 'Reading your PDF...'
                        : hasReadyDocuments
                          ? 'Ask across your PDFs...'
                          : 'Waiting for your PDF...'
                    }
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    disabled={isInputDisabled}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={1}
                  />
                  <button className="send-action" onClick={handleSendMessage} disabled={isInputDisabled || !input.trim()} title="Send message">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </section>

          {hasDocuments && (
            <aside className="document-panel">
              <div className="document-panel-header">
                <div>
                  <span className="panel-kicker">Documents</span>
                  <strong>{documents.length} PDF{documents.length === 1 ? '' : 's'}</strong>
                </div>
                <label className={isUploading ? 'icon-btn disabled' : 'icon-btn'} title="Add PDFs">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                  {!isUploading && (
                    <input className="native-file-input" type="file" onChange={handleFileUpload} accept=".pdf" multiple />
                  )}
                </label>
              </div>

              <div className="document-list">
                {documents.map((document) => {
                  const isDeletingDocument = deletingDocumentIds.includes(document.id);

                  return (
                    <div key={document.id} className="doc-row">
                      <div className="doc-row-main">
                        <span className="doc-file-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                          </svg>
                        </span>
                        <span className="doc-meta">
                          <strong>{document.display_name}</strong>
                          <span>
                            {formatFileSize(document.size)} · {statusLabel(document.status)}
                            {document.pages > 0 ? ` · ${document.pages} pages` : ''}
                          </span>
                        </span>
                        <span className={`doc-status ${document.status}`} />
                      </div>
                      <div className="doc-row-actions">
                        {document.previewUrl && (
                          <a
                            href={document.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={isDeletingDocument ? 'doc-open-btn disabled' : 'doc-open-btn'}
                            title={`Open ${document.display_name}`}
                            onClick={(event) => {
                              if (isDeletingDocument) {
                                event.preventDefault();
                              }
                            }}
                            aria-disabled={isDeletingDocument}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <path d="M15 3h6v6" />
                              <path d="M10 14L21 3" />
                            </svg>
                          </a>
                        )}
                        <button
                          type="button"
                          className="doc-delete-btn"
                          onClick={() => handleDeleteDocument(document.id)}
                          title={`Remove ${document.display_name}`}
                          disabled={
                            document.status === 'queued' ||
                            document.status === 'processing' ||
                            isDeletingDocument
                          }
                        >
                          {isDeletingDocument ? (
                            <span className="mini-spinner" />
                          ) : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M8 6V4h8v2" />
                              <path d="M19 6l-1 14H6L5 6" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
