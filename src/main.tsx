import { render } from "preact";
import { DEFAULT_PACK } from "./app/config";
import { loadBundledPack } from "./app/packs";
import { App } from "./ui/App";
import "./ui/styles.css";

const root = document.getElementById("app")!;
root.replaceChildren(); // drop the static "still deploying" fallback
render(<App pack={loadBundledPack(DEFAULT_PACK)} />, root);
