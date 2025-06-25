# 🧠 ChatSmith – AI Chat Assistant for VS Code

ChatSmith is a VS Code extension that opens an interactive AI-powered chat assistant panel. It supports:
- Conversational AI (Gemini) integrated in a sidebar
- Contextual workspace interaction
- `@filename` attachment support
- Clean React-based chat UI using WebView

---

## ✨ Features

- ✅ AI code generation via prompt
- ✅ Chat panel built with React + Vite
- ✅ Markdown + syntax highlighting in chat
- ✅ File mention support (`@filename`)
- ✅ Works inside VS Code WebView

---

## 📁 Project Structure

```
chatSmith/
├── chatSmith-backend/         # VS Code extension backend
│   ├── src/                   # Extension logic
│   │   └── extension.ts       # Activates command + WebView
│   ├── package.json           # VS Code extension manifest
│   ├── tsconfig.json          # TypeScript config for extension
│   └── ...                    
│
├── chatSmith-frontend/        # React chat interface
│   ├── src/                   # React components
│   ├── dist/                  # Compiled output
│   ├── index.html             # Vite entry
│   ├── vite.config.ts         # Vite config
│   ├── tsconfig.json          # Frontend TS config
│   └── scripts/               # Utility scripts
│       └── fix-cors.cjs.ts    # Fixes crossorigin errors in WebView
```

---

## 🚀 Getting Started

### 🔧 Prerequisites

- Node.js (v18+ recommended)
- VS Code
- `pnpm` or `npm`

---

## 🛠️ Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/udaypandey01/chatSmith.git
cd chatSmith
```

---

### 2. Setup frontend (React)

```bash
cd chatSmith-frontend
npm install
npm run build
npm run fix-cors     # Removes `crossorigin` attrs for WebView compatibility
```

> ✅ This generates `dist/index.html` which will be loaded in VS Code's WebView.

---

### 3. Setup backend (VS Code extension)

```bash
cd ../chatSmith-backend
npm install
npm run compile   # or setup prelaunch compile via VS Code launch.json
```

---

### 4. Launch the Extension

Open the root `chatSmith/` folder in **VS Code** and press **F5** to launch the extension in a new Extension Development Host window.

> Then open Command Palette (`Ctrl+Shift+P`) → run:  
> **`ChatSmith: Open Chat`**

---

## 🔑 Environment

You can replace the Gemini API key directly in `extension.ts`:
```ts
const apiKey = 'YOUR_GEMINI_API_KEY';
```

> Ideally, use environment variables or secrets manager for security.

---

## 💡 Future Enhancements

- Detect code context from current file
- Highlight syntax in code blocks
- Integrate with VS Code workspace APIs (like diagnostics)
- Add file upload logic for `@filename` mentions

---

## 🤝 Contributing

Feel free to fork, improve, and PR!

---

## 📜 License

MIT © Uday Pandey
