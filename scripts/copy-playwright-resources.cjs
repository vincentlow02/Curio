#!/usr/bin/env node
/**
 * Copy playwright-core resources to the standalone build output.
 * This ensures browsers.json and other necessary files are available in Vercel production.
 */

const fs = require("fs");
const path = require("path");

const files = [
  "browsers.json",
  "package.json",
];

const sourceDir = "node_modules/playwright-core";
const targetDir = ".next/standalone/node_modules/playwright-core";

// Ensure target directory exists
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`✓ Created ${targetDir}`);
}

// Copy files
for (const file of files) {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✓ Copied ${file}`);
  } else {
    console.warn(`⚠ Source file not found: ${sourcePath}`);
  }
}

console.log("✓ Playwright resources copied successfully");
