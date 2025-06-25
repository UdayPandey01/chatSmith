import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import fetch from "node-fetch"; // Make sure to install: npm install node-fetch
import * as glob from "glob";

// 🧠 Gemini API Helper
type GeminiApiResponse = {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
};

async function fetchGeminiReply(prompt: string): Promise<string> {
  const apiKey = "AIzaSyDxlgh8E3OiTej0V6chAO_sW-G-l3MnWFg"; // 🔐 Replace with your actual key or use env

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  console.log("Gemini API response status:", response.status);
  if (response.status === 401) {
    const errorText = await response.text();
    console.error("Gemini API 401 error:", errorText);
    return "❌ Gemini API 401 Unauthorized: " + errorText;
  } else if (!response.ok) {
    const errorText = await response.text();
    console.error(`Gemini API error (${response.status}):`, errorText);
    return `❌ Gemini API error (${response.status}): ${errorText}`;
  }

  const data = (await response.json()) as GeminiApiResponse;
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "❌ No response from Gemini."
  );
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("chatSmith.openChat", () => {
      const panel = vscode.window.createWebviewPanel(
        "chatSmith",
        "AI Chat Assistant",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(
              path.join(
                context.extensionPath,
                "..",
                "chatSmith-frontend",
                "dist"
              )
            ),
            vscode.Uri.file(
              path.join(
                context.extensionPath,
                "..",
                "chatSmith-frontend",
                "dist",
                "assets"
              )
            ),
          ],
        }
      );

      const htmlPath = path.join(
        context.extensionPath,
        "..",
        "chatSmith-frontend",
        "dist",
        "index.html"
      );

      let html = fs.readFileSync(htmlPath, "utf8");

      // Fix asset paths for VS Code WebView
      html = html.replace(/(src|href)="([^"]+)"/g, (_, attr, src) => {
        const cleanSrc = src.replace(/^\.?\/?/, "");
        const resourcePath = vscode.Uri.file(
          path.join(
            context.extensionPath,
            "..",
            "chatSmith-frontend",
            "dist",
            cleanSrc
          )
        );
        return `${attr}="${panel.webview.asWebviewUri(resourcePath)}"`;
      });

      panel.webview.html = html;

      // Listen for prompt messages from frontend
      panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "prompt") {
          let prompt = msg.prompt;
          // If attachments are present, append a summary to the prompt
          if (
            msg.attachments &&
            Array.isArray(msg.attachments) &&
            msg.attachments.length > 0
          ) {
            const fileList = msg.attachments
              .map((f: any) => f.filename)
              .join(", ");
            console.log("[Backend] Received attachments:", msg.attachments);
            prompt += `\n\n(Reference files: ${fileList})`;
            // Optionally, save or process files here
            msg.attachments.forEach((f: any) => {
              // Example: save to temp dir, analyze, etc.
              // fs.writeFileSync(path.join(os.tmpdir(), f.filename), f.isImage ? Buffer.from(f.content.split(",")[1], 'base64') : f.content);
            });
          }
          const reply = await fetchGeminiReply(prompt);
          panel.webview.postMessage({ type: "response", data: reply });
        } else if (msg.type === "listFiles") {
          // Use the open workspace folder for file listing
          const workspaceFolders = vscode.workspace.workspaceFolders;
          const projectRoot =
            workspaceFolders && workspaceFolders.length > 0
              ? workspaceFolders[0].uri.fsPath
              : context.extensionPath;
          console.log(
            "[Backend] Using projectRoot for file listing:",
            projectRoot
          );
          const files = glob.sync(
            "**/*.{ts,tsx,js,jsx,py,java,go,cpp,c,h,md,json,css,html,png,jpg,jpeg,gif,svg}",
            {
              cwd: projectRoot,
              ignore: ["node_modules/**", "dist/**", "build/**", ".git/**"],
            }
          );
          console.log("[Backend] Found files:", files);
          panel.webview.postMessage({ type: "fileList", files });
        } else if (msg.type === "getFileContent" && msg.filename) {
          // Read file content and send back to frontend
          const workspaceFolders = vscode.workspace.workspaceFolders;
          const projectRoot =
            workspaceFolders && workspaceFolders.length > 0
              ? workspaceFolders[0].uri.fsPath
              : context.extensionPath;
          const filePath = path.join(projectRoot, msg.filename);
          try {
            const content = fs.readFileSync(filePath, "utf8");
            panel.webview.postMessage({
              type: "fileContent",
              filename: msg.filename,
              content,
            });
          } catch (err: any) {
            panel.webview.postMessage({
              type: "fileContent",
              filename: msg.filename,
              content: null,
              error: err.message,
            });
          }
        } else if (msg.type === "file") {
          console.log(
            "[Backend] Received file upload:",
            msg.filename,
            "size:",
            msg.content.length
          );
          panel.webview.postMessage({
            type: "fileReceived",
            filename: msg.filename,
          });
        }
      });
    })
  );
}
