# Shadow Desktop E2E Tests

This directory contains end-to-end tests for the Shadow Desktop application using WebDriver and WebdriverIO.

## Prerequisites

1. Install Rust and Cargo
2. Install Node.js and pnpm
3. Install tauri-driver:
   ```bash
   cargo install tauri-driver --locked
   ```

## Setup

```bash
cd e2e-tests
pnpm install
```

## Running Tests

### Run all tests
```bash
pnpm test
```

### Run specific test file
```bash
pnpm test -- --spec specs/navigation.e2e.js
```

### Run tests with debug output
```bash
DEBUG=1 pnpm test
```

## Test Structure

```
e2e-tests/
├── package.json
├── specs/
│   ├── app.e2e.js          # Basic app launch tests
│   ├── navigation.e2e.js   # Navigation tests
│   └── providers.e2e.js    # Provider management tests
└── README.md
```

## Writing Tests

Tests use WebdriverIO with Mocha framework. Here's a basic example:

```javascript
describe('My Test Suite', () => {
  it('should do something', async () => {
    const element = await $('selector');
    await element.waitForExist();
    expect(await element.isDisplayed()).toBe(true);
  });
});
```

## WebDriver Configuration

The WebDriver configuration is in `../wdio.conf.js`. Key settings:

- **Host**: 127.0.0.1
- **Port**: 4444
- **Application**: `../src-tauri/target/debug/shadow-desktop`
- **Driver**: tauri-driver (installed via Cargo)

## CI/CD

For CI/CD, use the following GitHub Actions workflow:

```yaml
name: E2E Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y webkit2gtk-driver xvfb
      - name: Install tauri-driver
        run: cargo install tauri-driver --locked
      - name: Run tests
        run: xvfb-run pnpm test:e2e
```

## Troubleshooting

### Tests hang or timeout
- Ensure the application binary exists at the configured path
- Check that tauri-driver is installed and in PATH
- Verify the application builds successfully

### Element not found
- Use browser.pause() to add delays
- Check selectors match the actual DOM structure
- Use browser.debug() to inspect the page

### WebDriver connection errors
- Ensure no other WebDriver instances are running
- Check port 4444 is available
- Verify tauri-driver is running
