const storageKey = "proton-bridge-theme";

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem("${storageKey}");
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (stored === "light" || stored === "dark") {
      root.classList.add(stored);
      root.style.colorScheme = stored;
      return;
    }

    const resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  } catch {
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
