import { render } from "preact";
import { App } from "./ui/App";
import "./ui/styles.css";

const root = document.getElementById("app")!;
root.replaceChildren(); // drop the static "loading" fallback
render(<App />, root);
