// Applies the saved theme before first paint so there is no light/dark flash. A file (not inline) so the
// Content-Security-Policy can forbid inline scripts.
try {
  var s = JSON.parse(localStorage.getItem("pennywise_settings_v1") || "{}").state || {};
  var dark = s.appearance === "dark" || (s.appearance !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
