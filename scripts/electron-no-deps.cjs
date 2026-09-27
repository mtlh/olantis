module.exports = async function skipDesktopDependencyInstall() {
  // The Electron shell uses only Electron built-ins; the parent web app's
  // dependencies must not be copied into the packaged desktop application.
  return false;
};
