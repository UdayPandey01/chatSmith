import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch'; // Make sure to install: npm install node-fetch

// 🧠 Gemini API Helper
async function fetchGeminiReply(prompt: string): Promise<string> {
  const apiKey = 'YOUR_GEMINI_API_KEY'; // 🔐 Replace with your actual key or use env

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '❌ No response from Gemini.';
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('your-extension.openChat', () => {
      const panel = vscode.window.createWebviewPanel(
        'chatSmith',
        'AI Chat Assistant',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'chatSmith-frontend/dist')),
          ],
        }
      );

      const htmlPath = path.join(
        context.extensionPath,
        'chatSmith-frontend',
        'dist',
        'index.html'
      );

      let html = fs.readFileSync(htmlPath, 'utf8');

      // Fix asset paths for VS Code WebView
      html = html.replace(/(src|href)="(.+?)"/g, (_, attr, src) => {
        const resourcePath = vscode.Uri.file(
          path.join(context.extensionPath, 'chatSmith-frontend', 'dist', src)
        ).with({ scheme: 'vscode-resource' });
        return `${attr}="${panel.webview.asWebviewUri(resourcePath)}"`;
      });

      panel.webview.html = html;

      // Listen for prompt messages from frontend
      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'prompt') {
          const reply = await fetchGeminiReply(msg.prompt);
          panel.webview.postMessage({ type: 'response', data: reply });
        }
      });
    })
  );
}
