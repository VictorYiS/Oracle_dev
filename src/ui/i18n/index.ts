import { en, type Messages } from "./en";
import { zhCN } from "./zh-CN";

export type { Messages };

/** UI languages the engine ships, with their names written in that language. */
export const UI_LANGUAGES: Record<string, { name: string; messages: Messages }> = {
  en: { name: "English", messages: en },
  "zh-CN": { name: "中文", messages: zhCN },
};

export function messages(lang: string): Messages {
  return UI_LANGUAGES[lang]?.messages ?? en;
}
