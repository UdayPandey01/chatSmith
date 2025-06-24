import React, { useState, useEffect } from 'react';

declare global {
  interface Window {
    acquireVsCodeApi(): { postMessage: (message: unknown) => void };
  }
}

const vscode = window.acquireVsCodeApi();

function App() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');

  const send = () => {
    vscode.postMessage({ type: 'prompt', prompt: input });
    setMessages((prev) => [...prev, `You: ${input}`]);
    setInput('');
  };

  useEffect(() => {
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'response') {
        setMessages((prev) => [...prev, `AI: ${message.data}`]);
      }
    });
  }, []);

  return (
    <div style={{ padding: '1rem' }}>
      {messages.map((m, i) => (
        <p key={i}>{m}</p>
      ))}
      <textarea value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  );
}

export default App;
