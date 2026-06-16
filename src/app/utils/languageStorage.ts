"use client";

const LANGUAGE_STORAGE_KEY = "textdiff_preferred_language";

export const getPreferredLanguage = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to read preferred language:", error);
    return null;
  }
};

export const setPreferredLanguage = (language: string): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    console.error("Failed to save preferred language:", error);
  }
};

export const clearPreferredLanguage = (): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear preferred language:", error);
  }
};

// Extract the locale segment from a pathname like "/zh/foo" -> "zh".
export const getCurrentLanguageFromPath = (pathname: string): string => {
  const match = pathname.match(/^\/([a-z]{2}(-[a-z]+)?)/i);
  return match ? match[1] : "en";
};

export const isValidLanguage = (language: string, validLanguages: string[]): boolean => {
  return validLanguages.includes(language);
};
