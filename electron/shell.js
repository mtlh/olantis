const desktop = window.olantisDesktop;
const iconPath = new URLSearchParams(window.location.search).get("icon");

if (iconPath) document.getElementById("brand-icon").src = iconPath;

document.getElementById("back-button").addEventListener("click", () => desktop.goBack());
document.getElementById("reload-button").addEventListener("click", () => desktop.reload());
document.getElementById("minimize-button").addEventListener("click", () => desktop.minimize());
document.getElementById("maximize-button").addEventListener("click", () => desktop.toggleMaximize());
document.getElementById("close-button").addEventListener("click", () => desktop.close());

const maximizeButton = document.getElementById("maximize-button");
const maximizeIcon = maximizeButton.querySelector("svg");

function updateMaximizeButton(maximized) {
  maximizeButton.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
  maximizeButton.title = maximized ? "Restore" : "Maximize";
  maximizeIcon.innerHTML = maximized
    ? '<path d="M4 2.5h5.5v5.5M7 4.5H2.5V10H8V7" />'
    : '<rect x="2.25" y="2.25" width="7.5" height="7.5" rx=".5" />';
}

desktop.isMaximized().then(updateMaximizeButton);
desktop.onMaximizedChange(updateMaximizeButton);
