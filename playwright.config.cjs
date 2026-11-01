// Library regression suite. Runs against the built dist/ files with Bootstrap 5 from
// node_modules, so run `npm run build` before `npm test`.
const { defineConfig, devices } = require('playwright/test');

const port = Number(process.env.MDS_TEST_PORT || 4179);

module.exports = defineConfig({
  testDir: './test',
  testMatch: '*.spec.cjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]] : 'list',
  outputDir: 'test-results/artifacts',
  use: { locale: 'fa-IR', baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: 'node test/serve.cjs',
    url: `http://127.0.0.1:${port}/test/harness.html`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Touch emulation. This is Playwright's WebKit/Chromium with a phone viewport and touch
    // events, not Safari on iOS or Chrome on Android.
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
