# Cypress Parallel

| :exclamation:  This action currently does not support the `defineConfig` function in `cypress.config.*js` and `cypress.config.ts` config files and will fail if it is used. |
|--------------------------------------------------------------------|

This action allows you to easily execute [Cypress](https://www.cypress.io/) tests in parallel without the use of 
[Cypress Dashboard](https://www.cypress.io/dashboard/).

The action will search the working directory for the [Cypress config file](
https://docs.cypress.io/guides/references/configuration#cypress-json) and use the [folder/file configuration](
https://docs.cypress.io/guides/references/configuration#Folders-Files) to determine where to search for test files. The
action then provides the test files found as output parameter that can be used subsequently to execute the tests in 
parallel using a matrix strategy. As integration/end-to-end tests and component tests are run differently the action
provides two different output parameters:
- `integration-tests`: list of integration test specs that have been found
- `component-tests`: list of component test specs that have been found

### Cypress 9
Integration tests use the following configuration options in [cypress.json](
https://docs.cypress.io/guides/references/legacy-configuration#cypress-json) to search for tests: `integrationFolder`, 
`testFiles`, and `ignoreTestFiles`. As all of these are optional, the default folder `cypress/integration` and the 
default test file pattern `**/*.*` will be used if no configuration is found.

Component tests use the following configuration options in [cypress.json](
https://docs.cypress.io/guides/references/legacy-configuration#cypress-json) to search for tests: `componentFolder`, 
`testFiles`, and `ignoreTestFiles`. If the `componentFolder` option doesn't exist, the `component-tests` output parameter
won't be available. As the `testFiles` is optional, the default test file pattern `**/*.*` will be used if it isn't
found in the configuration file.

### Cypress 10+
Integration tests use the `e2e.specPattern` and `e2e.excludeSpecPattern` keys in [cypress.config.{js,mjs,cjs,ts}](
https://docs.cypress.io/guides/references/configuration#e2e) to search for tests. All of these are optional, the default
spec pattern `cypress/e2e/**/*.cy.{js,jsx,ts,tsx}` and exclude pattern `*.hot-update.js` will be used if no
configuration is found.

Component tests use the `component.specPattern` and `component.excludeSpecPattern` keys in
[cypress.config.{js,mjs,cjs,ts}](https://docs.cypress.io/guides/references/configuration#component) to search for tests.
All of these are optional, the default spec pattern `**/*.cy.{js,jsx,ts,tsx}` and exclude pattern `['/snapshots/*', 
'/image_snapshots/*']` will be used if no configuration is found. Note that the pattern specified for the e2e tests is
also automatically excluded, as noted in the docs.

## Usage

```yaml
- uses: tgamauf/cypress-parallel@v1
  with:
    # This is the directory of the Cypress config file. If it isn't provided the current
    #  working directory is used.
    working-directory:

    # Maximum number of test runners that should be used. This will split the tests, so
    #  they are distributed over the defined number of runners.
    count-runners:
```

## Example workflow

```yaml
name: Cypress test

on: [push]

jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      integration-tests: ${{ steps.parse.outputs.integration-tests }}
      component-tests: ${{ steps.parse.outputs.component-tests }}
    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Build
        uses: cypress-io/github-action@v2
        with:
          runTests: false
          build: npm run build
          
      - name: Save build folder
        uses: actions/upload-artifact@v2
        with:
          name: build
          if-no-files-found: error
          path: build
          retention-days: 1

      - name: Parse test files for parallelization
        id: parse
        uses: tgamauf/cypress-parallel@v2

  test-integration:
    runs-on: ubuntu-latest
    needs: prepare
    strategy:
      fail-fast: false
      matrix:
        # Run the tests in parallel, each with one of the prepared test specs
        spec: ${{ fromJson(needs.prepare.outputs.integration-tests) }}
    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Download the build folders
        uses: actions/download-artifact@v2
        with:
          name: build
          path: build
          
      - name: Execute tests
        uses: cypress-io/github-action@v2
        with:
          # We have already installed all dependencies above
          install: false
          # Use the spec provided to this worker to execute the test 
          spec: ${{ matrix.spec }}

  test-component:
    runs-on: ubuntu-latest
    needs: prepare
    strategy:
      fail-fast: false
      matrix:
        spec: ${{ fromJson(needs.prepare.outputs.component-tests) }}
    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Download the build folders
        uses: actions/download-artifact@v2
        with:
          name: build
          path: build
          
      - name: Execute tests
        uses: cypress-io/github-action@v2.0.0
        with:
          install: false
          # To run component tests we need to use "cypress run-ct"
          command: npx cypress run-ct
          spec: ${{ matrix.spec }}
```

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).
