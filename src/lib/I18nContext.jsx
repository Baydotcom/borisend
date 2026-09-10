import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { getTranslations, supportedLanguages } from "./i18n";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState("en");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadLang = async () => {
      try {
        const me = await base44.auth.me();
        if (me?.language) setLangState(me.language);
      } catch {
        // not logged in yet — default to en
      }
      setLoaded(true);
    };
    loadLang();
  }, []);

  useEffect(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key) => {
      const dict = getTranslations(lang);
      return dict[key] || getTranslations("en")[key] || key;
    },
    [lang]
  );

  const setLang = useCallback(async (newLang) => {
    setLangState(newLang);
    const dir = newLang === "ar" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = newLang;
    try {
      await base44.auth.updateMe({ language: newLang });
    } catch {
      // might not be logged in
    }
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <I18nContext.Provider value={{ t, lang, dir, setLang, supportedLanguages, loaded }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}