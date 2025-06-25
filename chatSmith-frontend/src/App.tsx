import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "./App.css";

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
  const [dark] = useState(true); 
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useDarkMode();

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

  const sendPrompt = async () => {
    if (prompt.trim() === "" || isLoading) return;
    setIsLoading(true);
    const atFiles = Array.from(prompt.matchAll(/@([\w\-./]+)/g)).map(
      (m) => m[1]
    );
    const validFiles = atFiles.filter((fname) => fileList.includes(fname));
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
      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-logo">
              <span className="logo-text">CS</span>
            </div>
            <h2>ChatSmith</h2>
            <p>How can I help you today?</p>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((msg, i) => (
              <div key={i} className={`message message-${msg.type}`}>
                <div className="message-avatar">
                  {msg.type === "user" ? (
                    <div className="avatar-user">U</div>
                  ) : (
                    <div className="avatar-bot">CS</div>
                  )}
                </div>
                <div className="message-content">
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
                  <div className="avatar-bot">CS</div>
                </div>
                <div className="message-content">
                  <div className="message-text">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
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
              placeholder="Message ChatSmith..."
              disabled={isLoading}
              className="message-input"
              rows={1}
            />

            {/* File Dropdown */}
            {showFileDropdown && fileList.length > 0 && (
              <div className="file-dropdown file-dropdown-top">
                <div className="dropdown-header">Select a file:</div>
                {fileList
                  .filter((f) => {
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

          <button
            onClick={sendPrompt}
            disabled={prompt.trim() === "" || isLoading}
            className="send-button"
            title="Send message"
          >
            ↑
          </button>
        </div>

        <div className="input-hint">
          Use <kbd>@filename</kbd> to reference files
        </div>
      </div>
    </div>
  );
}

export default App;