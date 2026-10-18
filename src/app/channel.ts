// Which distribution channel is this build running in? (design doc §11.1)
// claude.ai Artifact views expose `window.claude.use`; everything else is a static host or dev.

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

declare global {
  interface Window {
    claude?: ClaudeRuntime;
  }
}

export type Channel = "artifact" | "static" | "dev";

export function detectChannel(): Channel {
  if (typeof window.claude?.use === "function") return "artifact";
  return import.meta.env.DEV ? "dev" : "static";
}

/** True when this view can ask Claude on the viewer's own account (Artifact `sample` capability). */
export async function hasClaudeSampling(timeoutMs = 12_000): Promise<boolean> {
  if (typeof window.claude?.use !== "function") return false;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    const sample = await Promise.race([window.claude.use("sample"), timeout]);
    return typeof sample === "function";
  } catch {
    return false;
  }
}
