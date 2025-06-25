"use strict";
// chatSmith-frontend/scripts/fix-cors.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const htmlPath = path_1.default.join(__dirname, "..", "..", "dist", "index.html");
let html = fs_1.default.readFileSync(htmlPath, "utf8");
// Remove crossorigin attributes
html = html.replace(/\s+crossorigin(="[^"]*")?/g, "");
fs_1.default.writeFileSync(htmlPath, html);
console.log("✅ Removed crossorigin attributes from index.html");
