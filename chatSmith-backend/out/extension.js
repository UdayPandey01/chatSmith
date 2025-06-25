"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const glob = __importStar(require("glob"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function fetchGeminiReply(prompt) {
    const apiKey = "AIzaSyBqn3tr6Xl0oDn6n4XXxu9j7hiJJN4M58c";
    const response = await (0, node_fetch_1.default)(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
        }),
    });
    console.log("Gemini API response status:", response.status);
    if (response.status === 401) {
        const errorText = await response.text();
        console.error("Gemini API 401 error:", errorText);
        return "Gemini API 401 Unauthorized: " + errorText;
    }
    else if (!response.ok) {
        const errorText = await response.text();
        console.error(`Gemini API error (${response.status}):`, errorText);
        return `Gemini API error (${response.status}): ${errorText}`;
    }
    const data = (await response.json());
    return (data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No response from Gemini.");
}
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("chatSmith.openChat", () => {
        const panel = vscode.window.createWebviewPanel("chatSmith", "AI Chat Assistant", vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, "..", "chatSmith-frontend", "dist")),
                vscode.Uri.file(path.join(context.extensionPath, "..", "chatSmith-frontend", "dist", "assets")),
            ],
        });
        const htmlPath = path.join(context.extensionPath, "..", "chatSmith-frontend", "dist", "index.html");
        let html = fs.readFileSync(htmlPath, "utf8");
        html = html.replace(/(src|href)="([^"]+)"/g, (_, attr, src) => {
            const cleanSrc = src.replace(/^\.?\/?/, "");
            const resourcePath = vscode.Uri.file(path.join(context.extensionPath, "..", "chatSmith-frontend", "dist", cleanSrc));
            return `${attr}="${panel.webview.asWebviewUri(resourcePath)}"`;
        });
        panel.webview.html = html;
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === "prompt") {
                let prompt = msg.prompt;
                if (msg.attachments &&
                    Array.isArray(msg.attachments) &&
                    msg.attachments.length > 0) {
                    let fileSection = msg.attachments
                        .map((f) => `\n\n---\nFilename: ${f.filename}\nContent:\n${f.content}\n---`)
                        .join("");
                    prompt += `\n\nThe following files are attached for reference:${fileSection}`;
                    console.log("[Backend] Received attachments:", msg.attachments);
                }
                const reply = await fetchGeminiReply(prompt);
                panel.webview.postMessage({ type: "response", data: reply });
            }
            else if (msg.type === "listFiles") {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const projectRoot = workspaceFolders && workspaceFolders.length > 0
                    ? workspaceFolders[0].uri.fsPath
                    : context.extensionPath;
                console.log("[Backend] Using projectRoot for file listing:", projectRoot);
                const files = glob.sync("**/*.{ts,tsx,js,jsx,py,java,go,cpp,c,h,md,json,css,html,png,jpg,jpeg,gif,svg}", {
                    cwd: projectRoot,
                    ignore: ["node_modules/**", "dist/**", "build/**", ".git/**"],
                });
                console.log("[Backend] Found files:", files);
                panel.webview.postMessage({ type: "fileList", files });
            }
            else if (msg.type === "getFileContent" && msg.filename) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const projectRoot = workspaceFolders && workspaceFolders.length > 0
                    ? workspaceFolders[0].uri.fsPath
                    : context.extensionPath;
                const filePath = path.join(projectRoot, msg.filename);
                console.log("[Backend] getFileContent request for filename:", msg.filename);
                console.log("[Backend] Resolved filePath:", filePath);
                try {
                    const content = fs.readFileSync(filePath, "utf8");
                    console.log("[Backend] Successfully read file content for:", msg.filename);
                    panel.webview.postMessage({
                        type: "fileContent",
                        filename: msg.filename,
                        content,
                    });
                }
                catch (err) {
                    console.error("[Backend] Error reading file content for:", msg.filename, err.message);
                    panel.webview.postMessage({
                        type: "fileContent",
                        filename: msg.filename,
                        content: null,
                        error: err.message,
                    });
                }
            }
            else if (msg.type === "file") {
                console.log("[Backend] Received file upload:", msg.filename, "size:", msg.content.length);
                panel.webview.postMessage({
                    type: "fileReceived",
                    filename: msg.filename,
                });
            }
        });
    }));
}
