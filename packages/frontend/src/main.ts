import "./shared.css";

document.querySelector<HTMLParagraphElement>("#year")!.textContent =
  new Date().getFullYear().toString();
