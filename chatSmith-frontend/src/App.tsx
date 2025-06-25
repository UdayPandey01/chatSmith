import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// Use real VS Code API if available
const vscode = (
  window as unknown as {
    acquireVsCodeApi?: () => { postMessage: (msg: unknown) => void };
  }
).acquireVsCodeApi
  ? (
      window as unknown as {
        acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };
      }
    ).acquireVsCodeApi()
  : {
      postMessage: (msg: unknown) => console.log("Mock vscode message:", msg),
    };

function useDarkMode() {
  const [dark] = useState(true); // Default to dark mode, remove setDark
  useEffect(() => {
    document.body.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  return dark;
}

interface FileAttachment {
  filename: string;
  content: string;
  isImage?: boolean;
  size?: number;
}

interface Message {
  type: "user" | "bot" | "file";
  text?: string;
  filename?: string;
  timestamp: Date;
  attachments?: FileAttachment[];
}

function App() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileList, setFileList] = useState<string[]>([]);
  const [showFileDropdown, setShowFileDropdown] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showFileModal, setShowFileModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useDarkMode();

  // Fetch file list from backend on mount and when input is focused
  useEffect(() => {
    vscode.postMessage({ type: "listFiles" });
    const handler = (event: MessageEvent) => {
      console.log("[Frontend] Received message:", event.data);
      if (event.data.type === "fileList") {
        console.log("[Frontend] Received fileList:", event.data.files);
        setFileList(event.data.files);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";

    const cursor = textarea.selectionStart;
    const before = e.target.value.slice(0, cursor);
    const match = /@([\w\-./]*)$/.exec(before);

    if (match) {
      setFileQuery(match[1]);
      setShowFileDropdown(true);
      const rect = textarea.getBoundingClientRect();
      setDropdownPos({
        top: rect.top + window.scrollY - 200,
        left: rect.left + window.scrollX + 20,
      });
    } else {
      setShowFileDropdown(false);
    }
  };

  const handleTextareaFocus = () => {
    vscode.postMessage({ type: "listFiles" });
  };

  const insertAtCursor = (filename: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const before = value.slice(0, start).replace(/@([\w\-./]*)$/, "@");
    const after = value.slice(end);
    const newValue = before + filename + " " + after;
    setPrompt(newValue);
    setShowFileDropdown(false);
    setTimeout(() => {
      textarea.focus();
      const newPos = before.length + filename.length + 1;
      textarea.selectionStart = textarea.selectionEnd = newPos;
    }, 0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    console.log("[Frontend] handleFileSelect files:", files);
    if (files.length > 0) {
      setPendingFiles(files);
      setShowFileModal(true);
    }
  };

  const handleFileAction = async (action: string) => {
    if (pendingFiles.length === 0) return;

    setShowFileModal(false);
    setIsLoading(true);

    const attachments: FileAttachment[] = [];
    for (const file of pendingFiles) {
      const isImage = file.type.startsWith("image/");
      let content = "";

      if (isImage) {
        content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      } else {
        content = await file.text();
      }

      attachments.push({
        filename: file.name,
        content,
        isImage,
        size: file.size,
      });
    }

    console.log("[Frontend] Sending attachments:", attachments);

    let actionPrompt = "";
    switch (action) {
      case "analyze":
        actionPrompt =
          "Please analyze the uploaded file(s) and provide insights about the code structure, potential improvements, and any issues you notice.";
        break;
      case "review":
        actionPrompt =
          "Please review the uploaded file(s) for code quality, best practices, security issues, and suggest improvements.";
        break;
      case "explain":
        actionPrompt =
          "Please explain what the uploaded file(s) do, including the main functionality and how the code works.";
        break;
      case "refactor":
        actionPrompt =
          "Please suggest refactoring improvements for the uploaded file(s) to make the code more maintainable and efficient.";
        break;
      default:
        actionPrompt =
          prompt || "What would you like me to do with these files?";
    }

    const userMessage: Message = {
      type: "user",
      text: actionPrompt,
      timestamp: new Date(),
      attachments,
    };

    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setPendingFiles([]);
    vscode.postMessage({ type: "prompt", prompt: actionPrompt, attachments });
  };

  const sendPrompt = async () => {
    if (prompt.trim() === "" || isLoading) return;
    setIsLoading(true);
    // Find all @filename in prompt
    const atFiles = Array.from(prompt.matchAll(/@([\w\-./]+)/g)).map(
      (m) => m[1]
    );
    const validFiles = atFiles.filter((fname) => fileList.includes(fname));
    // Request file content from backend for each file
    const fileContents: Record<string, string | null> = {};
    if (validFiles.length > 0) {
      await Promise.all(
        validFiles.map(
          (fname) =>
            new Promise<void>((resolve) => {
              const handler = (event: MessageEvent) => {
                const msg = event.data;
                if (msg.type === "fileContent" && msg.filename === fname) {
                  fileContents[fname] = msg.content;
                  window.removeEventListener("message", handler);
                  resolve();
                }
              };
              window.addEventListener("message", handler);
              vscode.postMessage({ type: "getFileContent", filename: fname });
            })
        )
      );
    }
    const attachments: FileAttachment[] = validFiles.map((fname) => ({
      filename: fname,
      content: fileContents[fname] ?? "(Could not fetch file content)",
      isImage: false,
    }));
    const userMessage: Message = {
      type: "user",
      text: prompt,
      timestamp: new Date(),
      attachments,
    };
    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    vscode.postMessage({ type: "prompt", prompt, attachments });
  };

  // Listen for backend messages (fileList, response, etc.)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "fileList") {
        console.log("[Frontend] Received fileList:", msg.files);
        setFileList(msg.files);
      } else if (msg.type === "response") {
        console.log("[Frontend] Received response:", msg.data);
        setMessages((prev) => [
          ...prev,
          {
            type: "bot",
            text: msg.data,
            timestamp: new Date(),
          },
        ]);
        setIsLoading(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="header-left">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7L12 12L22 7L12 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 17L12 22L22 17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 12L12 17L22 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1>ChatSmith</h1>
        </div>
        <div className="header-right">
          <span className="message-count">
            {messages.filter((m) => m.type === "user").length} messages
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-logo">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2>Welcome to ChatSmith</h2>
            <p>
              Your AI coding assistant is ready to help. Start by asking a
              question or uploading a file.
            </p>
            <div className="suggestion-cards">
              <div className="suggestion-card">
                <div className="card-icon">💡</div>
                <div className="card-content">
                  <div className="card-title">Generate Code</div>
                  <div className="card-desc">
                    Create new functions, components, or entire files
                  </div>
                </div>
              </div>
              <div className="suggestion-card">
                <div className="card-icon">🔍</div>
                <div className="card-content">
                  <div className="card-title">Analyze Files</div>
                  <div className="card-desc">
                    Review code quality and suggest improvements
                  </div>
                </div>
              </div>
              <div className="suggestion-card">
                <div className="card-icon">🚀</div>
                <div className="card-content">
                  <div className="card-title">Refactor Code</div>
                  <div className="card-desc">
                    Optimize and modernize your codebase
                  </div>
                </div>
              </div>
              <div className="suggestion-card">
                <div className="card-icon">🐛</div>
                <div className="card-content">
                  <div className="card-title">Debug Issues</div>
                  <div className="card-desc">
                    Find and fix bugs in your code
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((msg, i) => (
              <div key={i} className={`message message-${msg.type}`}>
                <div className="message-avatar">
                  {msg.type === "user" ? (
                    <div className="avatar-user">U</div>
                  ) : (
                    <div className="avatar-bot">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M12 2L2 7L12 12L22 7L12 2Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2 17L12 22L22 17"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M2 12L12 17L22 12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">
                      {msg.type === "user" ? "You" : "ChatSmith"}
                    </span>
                    <span className="message-time">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="attachments">
                      {msg.attachments.map((attachment, idx) => (
                        <div key={idx} className="attachment">
                          <div className="attachment-icon">
                            {attachment.isImage ? "🖼️" : "📄"}
                          </div>
                          <div className="attachment-info">
                            <div className="attachment-name">
                              {attachment.filename}
                            </div>
                            {attachment.size && (
                              <div className="attachment-size">
                                {formatFileSize(attachment.size)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="message-text">
                    {msg.type === "bot" ? (
                      <ReactMarkdown
                        components={{
                          code: (props: unknown) => {
                            const { className, children } = props as {
                              className?: string;
                              children?: React.ReactNode;
                              inline?: boolean;
                            };
                            const match = /language-(\w+)/.exec(
                              className || ""
                            );
                            const isInline = (props as { inline?: boolean })
                              .inline;
                            return !isInline && match ? (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{
                                  borderRadius: "8px",
                                  margin: "12px 0",
                                  background: "#1a1a1a",
                                }}
                                {...(props as Record<string, unknown>)}
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            ) : (
                              <code
                                className="inline-code"
                                {...(props as Record<string, unknown>)}
                              >
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {msg.text || ""}
                      </ReactMarkdown>
                    ) : (
                      <span>{msg.text}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="message message-bot">
                <div className="message-avatar">
                  <div className="avatar-bot">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 2L2 7L12 12L22 7L12 2Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M2 17L12 22L22 17"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M2 12L12 17L22 12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-sender">ChatSmith</span>
                  </div>
                  <div className="message-text">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span style={{ marginLeft: "12px", opacity: 0.7 }}>
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="input-area">
        <div className="input-container">
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handleTextareaChange}
              onFocus={handleTextareaFocus}
              onKeyPress={handleKeyPress}
              placeholder="Ask ChatSmith anything..."
              disabled={isLoading}
              className="message-input"
              rows={1}
            />

            {/* File Dropdown */}
            {showFileDropdown && fileList.length > 0 && (
              <div
                className="file-dropdown"
                style={{
                  top: dropdownPos?.top || 0,
                  left: dropdownPos?.left || 0,
                }}
              >
                <div className="dropdown-header">Select a file:</div>
                {fileList
                  .filter((f) => {
                    // Normalize slashes and case for matching
                    const normF = f.replace(/\\/g, "/").toLowerCase();
                    const normQ = fileQuery.replace(/\\/g, "/").toLowerCase();
                    return normF.includes(normQ);
                  })
                  .slice(0, 16)
                  .map((f) => (
                    <div
                      key={f}
                      className="dropdown-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertAtCursor(f);
                      }}
                    >
                      <div className="file-icon">📄</div>
                      <span>{f}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="input-actions">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="action-button"
              title="Attach file"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21.44 11.05L12.25 20.24C11.12 21.37 9.47 22 7.76 22C6.05 22 4.4 21.37 3.27 20.24C2.14 19.11 1.51 17.46 1.51 15.75C1.51 14.04 2.14 12.39 3.27 11.26L12.46 2.07C13.2 1.33 14.21 0.91 15.26 0.91C16.31 0.91 17.32 1.33 18.06 2.07C18.8 2.81 19.22 3.82 19.22 4.87C19.22 5.92 18.8 6.93 18.06 7.67L8.87 16.86C8.5 17.23 8 17.44 7.47 17.44C6.94 17.44 6.44 17.23 6.07 16.86C5.7 16.49 5.49 15.99 5.49 15.46C5.49 14.93 5.7 14.43 6.07 14.06L14.56 5.57"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              onClick={sendPrompt}
              disabled={prompt.trim() === "" || isLoading}
              className="send-button"
              title="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M22 2L11 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 2L15 22L11 13L2 9L22 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="input-hint">
          Press <kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for new line
          • Use <kbd>@filename</kbd> to reference files
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: "none" }}
        accept=".js,.jsx,.ts,.tsx,.py,.java,.go,.cpp,.c,.h,.md,.json,.css,.html,.txt,.png,.jpg,.jpeg,.gif,.svg"
      />

      {/* File Upload Modal */}
      {showFileModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>What would you like to do with these files?</h3>
              <button
                onClick={() => setShowFileModal(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>

            <div className="modal-files">
              {pendingFiles.map((file, idx) => (
                <div key={idx} className="modal-file">
                  <div className="file-icon">
                    {file.type.startsWith("image/") ? "🖼️" : "📄"}
                  </div>
                  <div className="file-details">
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{formatFileSize(file.size)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button
                onClick={() => handleFileAction("analyze")}
                className="action-btn primary"
              >
                🔍 Analyze Files
              </button>
              <button
                onClick={() => handleFileAction("review")}
                className="action-btn"
              >
                ✅ Code Review
              </button>
              <button
                onClick={() => handleFileAction("explain")}
                className="action-btn"
              >
                💡 Explain Code
              </button>
              <button
                onClick={() => handleFileAction("refactor")}
                className="action-btn"
              >
                🔧 Suggest Refactoring
              </button>
              <button
                onClick={() => handleFileAction("custom")}
                className="action-btn secondary"
              >
                💬 Custom Request
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #0d1117;
          color: #e6edf3;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
            "Noto Sans", Helvetica, Arial, sans-serif;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid #21262d;
          background: #0d1117;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #7c3aed, #3b82f6);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .chat-header h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #e6edf3;
        }

        .message-count {
          font-size: 14px;
          color: #7d8590;
          padding: 6px 12px;
          background: #21262d;
          border-radius: 16px;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 0;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: 48px 24px;
          text-align: center;
        }

        .empty-logo {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #7c3aed, #3b82f6);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          margin-bottom: 24px;
        }

        .empty-state h2 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #e6edf3;
        }

        .empty-state p {
          margin: 0 0 32px 0;
          font-size: 16px;
          color: #7d8590;
          max-width: 480px;
          line-height: 1.5;
        }

        .suggestion-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          max-width: 800px;
          width: 100%;
        }

        .suggestion-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 20px;
          background: #161b22;
          border: 1px solid #21262d;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .suggestion-card:hover {
          background: #21262d;
          border-color: #30363d;
          transform: translateY(-2px);
        }

        .card-icon {
          font-size: 24px;
          margin-top: 2px;
        }

        .card-content {
          flex: 1;
        }

        .card-title {
          font-weight: 600;
          color: #e6edf3;
          margin-bottom: 4px;
          font-size: 14px;
        }

        .card-desc {
          font-size: 13px;
          color: #7d8590;
          line-height: 1.4;
        }

        .message-list {
          padding: 0;
        }

        .message {
          display: flex;
          gap: 12px;
          padding: 16px 24px;
          border-bottom: 1px solid #21262d;
        }

        .message:last-child {
          border-bottom: none;
        }

        .message-avatar {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
        }

        .avatar-user {
          width: 32px;
          height: 32px;
          background: #238636;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 14px;
        }

        .avatar-bot {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #7c3aed, #3b82f6);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .message-content {
          flex: 1;
          min-width: 0;
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .message-sender {
          font-weight: 600;
          color: #e6edf3;
          font-size: 14px;
        }

        .message-time {
          font-size: 12px;
          color: #7d8590;
        }

        .attachments {
          margin-bottom: 12px;
        }

        .attachment {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #161b22;
          border: 1px solid #21262d;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .attachment-icon {
          font-size: 16px;
        }

        .attachment-info {
          flex: 1;
        }

        .attachment-name {
          font-size: 14px;
          color: #e6edf3;
          font-weight: 500;
        }

        .attachment-size {
          font-size: 12px;
          color: #7d8590;
        }

        .message-text {
          color: #e6edf3;
          line-height: 1.6;
          font-size: 14px;
        }

        .message-text h1,
        .message-text h2,
        .message-text h3 {
          color: #e6edf3;
          margin: 16px 0 8px 0;
        }

        .message-text h1 {
          font-size: 20px;
          border-bottom: 1px solid #21262d;
          padding-bottom: 8px;
        }

        .message-text h2 {
          font-size: 18px;
        }

        .message-text h3 {
          font-size: 16px;
        }

        .message-text p {
          margin: 8px 0;
        }

        .message-text ul,
        .message-text ol {
          margin: 8px 0;
          padding-left: 20px;
        }

        .message-text li {
          margin: 4px 0;
        }

        .inline-code {
          background: #161b22;
          color: #f85149;
          padding: 2px 4px;
          border-radius: 4px;
          font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono",
            monospace;
          font-size: 13px;
        }

        .typing-indicator {
          display: inline-flex;
          gap: 4px;
          align-items: center;
        }

        .typing-indicator span {
          width: 6px;
          height: 6px;
          background: #7d8590;
          border-radius: 50%;
          animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes typing {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-10px);
            opacity: 1;
          }
        }

        .input-area {
          padding: 16px 24px;
          background: #0d1117;
          border-top: 1px solid #21262d;
          position: sticky;
          bottom: 0;
        }

        .input-container {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }

        .input-wrapper {
          flex: 1;
          position: relative;
        }

        .message-input {
          width: 100%;
          background: #161b22;
          border: 1px solid #21262d;
          border-radius: 12px;
          padding: 12px 16px;
          color: #e6edf3;
          font-size: 14px;
          font-family: inherit;
          resize: none;
          outline: none;
          transition: border-color 0.2s ease;
          line-height: 1.4;
          min-height: 44px;
          max-height: 200px;
        }

        .message-input:focus {
          border-color: #7c3aed;
        }

        .message-input::placeholder {
          color: #7d8590;
        }

        .message-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .file-dropdown {
          position: absolute;
          background: #161b22;
          border: 1px solid #21262d;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          z-index: 1000;
          max-height: 200px;
          overflow-y: auto;
          min-width: 200px;
        }

        .dropdown-header {
          padding: 8px 12px;
          font-size: 12px;
          color: #7d8590;
          border-bottom: 1px solid #21262d;
          font-weight: 600;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
          color: #e6edf3;
        }

        .dropdown-item:hover {
          background: #21262d;
        }

        .file-icon {
          font-size: 14px;
          opacity: 0.7;
        }

        .input-actions {
          display: flex;
          gap: 8px;
        }

        .action-button,
        .send-button {
          width: 44px;
          height: 44px;
          border: 1px solid #21262d;
          border-radius: 12px;
          background: #161b22;
          color: #7d8590;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-button:hover {
          background: #21262d;
          color: #e6edf3;
        }

        .send-button {
          background: #7c3aed;
          color: white;
          border-color: #7c3aed;
        }

        .send-button:hover:not(:disabled) {
          background: #6d28d9;
        }

        .send-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .input-hint {
          margin-top: 8px;
          font-size: 12px;
          color: #7d8590;
          text-align: center;
        }

        .input-hint kbd {
          background: #21262d;
          color: #e6edf3;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-family: inherit;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: #161b22;
          border: 1px solid #21262d;
          border-radius: 16px;
          padding: 24px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal-header h3 {
          margin: 0;
          color: #e6edf3;
          font-size: 18px;
        }

        .modal-close {
          background: none;
          border: none;
          color: #7d8590;
          font-size: 24px;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }

        .modal-close:hover {
          background: #21262d;
          color: #e6edf3;
        }

        .modal-files {
          margin-bottom: 24px;
        }

        .modal-file {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #0d1117;
          border: 1px solid #21262d;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .file-details {
          flex: 1;
        }

        .file-name {
          font-weight: 500;
          color: #e6edf3;
          font-size: 14px;
        }

        .file-size {
          font-size: 12px;
          color: #7d8590;
        }

        .modal-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border: 1px solid #21262d;
          border-radius: 8px;
          background: #0d1117;
          color: #e6edf3;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
          font-weight: 500;
        }

        .action-btn:hover {
          background: #21262d;
          border-color: #30363d;
        }

        .action-btn.primary {
          background: #7c3aed;
          border-color: #7c3aed;
          color: white;
        }

        .action-btn.primary:hover {
          background: #6d28d9;
        }

        .action-btn.secondary {
          background: #21262d;
          border-color: #30363d;
        }

        .action-btn.secondary:hover {
          background: #30363d;
        }

        /* Scrollbar styles */
        .messages-container::-webkit-scrollbar,
        .file-dropdown::-webkit-scrollbar {
          width: 8px;
        }

        .messages-container::-webkit-scrollbar-track,
        .file-dropdown::-webkit-scrollbar-track {
          background: #0d1117;
        }

        .messages-container::-webkit-scrollbar-thumb,
        .file-dropdown::-webkit-scrollbar-thumb {
          background: #21262d;
          border-radius: 4px;
        }

        .messages-container::-webkit-scrollbar-thumb:hover,
        .file-dropdown::-webkit-scrollbar-thumb:hover {
          background: #30363d;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .chat-header {
            padding: 12px 16px;
          }

          .message {
            padding: 12px 16px;
          }

          .input-area {
            padding: 12px 16px;
          }

          .suggestion-cards {
            grid-template-columns: 1fr;
          }

          .modal-content {
            width: 95%;
            padding: 20px;
          }

          .modal-actions {
            gap: 6px;
          }

          .action-btn {
            padding: 10px 14px;
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
