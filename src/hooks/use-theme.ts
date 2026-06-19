import { useCallback, useEffect, useState } from "react";

// Tema do app: claro (padrão) ou escuro. A escolha é lembrada no navegador
// (localStorage) e aplicada como a classe "dark" no <html>. O "anti-flash"
// que aplica o tema antes da tela aparecer fica no __root.tsx.

const STORAGE_KEY = "conectachat-theme";
type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");

  // Ao montar, lê o tema que o anti-flash já aplicou no <html>.
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setThemeState(isDark ? "dark" : "light");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* navegador sem localStorage — ignora */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
