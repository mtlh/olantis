const desktop = window.olantisDesktop;
const iconPath = new URLSearchParams(window.location.search).get("icon");

if (iconPath) {
  for (const id of ["brand-icon", "splash-icon"]) {
    const icon = document.getElementById(id);
    if (icon) icon.src = iconPath;
  }
}

const backButton = document.getElementById("back-button");
const forwardButton = document.getElementById("forward-button");

backButton.addEventListener("click", () => desktop.goBack());
forwardButton.addEventListener("click", () => desktop.goForward());

function updateNavButtons({ canGoBack, canGoForward }) {
  backButton.disabled = !canGoBack;
  forwardButton.disabled = !canGoForward;
}

desktop.navState().then(updateNavButtons);
desktop.onNavStateChange(updateNavButtons);

// The splash sits in this page, under the app view, so it must not stay in the
// DOM once the page is showing: Electron's draggable-region handling works at
// the window level, and a leftover full-window element is exactly what made
// every click in the app do nothing. Check the current state as well as listen,
// since the view can be revealed before this page has loaded.
function dismissSplash() {
  document.getElementById("splash")?.remove();
}

desktop.onAppReady(dismissSplash);
desktop.isAppReady().then((ready) => {
  if (ready) dismissSplash();
});

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
