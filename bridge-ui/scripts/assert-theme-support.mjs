import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assertIncludes(relativePath, expected) {
  const source = read(relativePath);
  for (const text of expected) {
    if (!source.includes(text)) {
      throw new Error(`${relativePath} is missing ${JSON.stringify(text)}`);
    }
  }
}

assertIncludes("src/app/layout.tsx", [
  "suppressHydrationWarning",
  "<ThemeScript",
]);

assertIncludes("src/app/globals.css", [
  "@media (prefers-color-scheme: dark)",
  ".dark",
  ".light",
]);

assertIncludes("src/components/theme-toggle.tsx", [
  '"use client"',
  "data-theme-toggle",
  "localStorage",
  "matchMedia",
  "System",
  "Light",
  "Dark",
]);

assertIncludes("src/app/page.tsx", ["ThemeToggle"]);
assertIncludes("src/app/terminal/page.tsx", ["ThemeToggle"]);

console.log("Theme support assertions passed");
