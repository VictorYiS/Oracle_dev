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

/** Fill {placeholders}. Unknown placeholders stay visible so gaps show up in review. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}
