import "./tokens.css";
import "./styles.css";
import "./landing.css";
import { drawGuilloche } from "./guilloche.ts";
import { initNotice } from "./notice.ts";

document.querySelectorAll<HTMLElement>(".guilloche").forEach(drawGuilloche);
initNotice();
