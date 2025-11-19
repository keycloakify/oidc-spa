export function ensureNonBlankPaint() {
    const html = document.documentElement;

    const marker = document.createElement("span");
    marker.textContent = "\u00A0";

    marker.style.position = "fixed";
    marker.style.top = "0px";
    marker.style.left = "0px";

    html.prepend(marker);
}
