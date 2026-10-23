// Adds the web sub-path only for the website build (WEB_BASE_URL=/freefood, set in
// .github/workflows/web.yml), so native builds and EAS updates are unaffected. Everything else is in app.json.
module.exports = ({ config }) =>
  process.env.WEB_BASE_URL
    ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.WEB_BASE_URL } }
    : config;
