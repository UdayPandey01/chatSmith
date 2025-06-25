// chatSmith-frontend/scripts/fix-cors.ts

import fs from "fs";
import path from "path";

const htmlPath = path.join(__dirname, "..", "..", "dist", "index.html");

let html = fs.readFileSync(htmlPath, "utf8");

// Remove crossorigin attributes
html = html.replace(/\s+crossorigin(="[^"]*")?/g, "");

fs.writeFileSync(htmlPath, html);

console.log("✅ Removed crossorigin attributes from index.html");
