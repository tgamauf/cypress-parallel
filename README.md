# Cypress Parallel

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

Integration tests use the following configuration options in [cypress.json](
https://docs.cypress.io/guides/references/configuration#cypress-json) to search for tests: `integrationFolder`, 
`testFiles`, and `ignoreTestFiles`. As all of these are optional, the default folder `cypress/integration` and the 
default test file pattern `**/*.*` will be used if no configuration is found.

Component tests use the following configuration options in [cypress.json](
https://docs.cypress.io/guides/references/configuration#cypress-json) to search for tests: `componentFolder`, 
`testFiles`, and `ignoreTestFiles`. If the `componentFolder` option doesn't exist, the `component-tests` output parameter
won't be available. As the `testFiles` is optional, the default test file pattern `**/*.*` will be used if it isn't
found in the configuration file.


## Usage

```yaml
- uses tgamauf/cypress-parallel@v1
  with:
    # This is the directory of the Cypress config file. If it isn't provided the current
    #  working directory is used.
    working-directory: ""

    # Indicates if search should follow symbolic links, which can slow down execution in
    #  certain circumstances. Default: true.
    follow-symbolic-links: true
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
        uses: tgamauf/cypress-parallel@v1

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
        uses: cypress-io/github-action@v2
        with:
          install: false
          # To run component tests we need to use "cypress run-ct"
          command: npx cypress run-ct
          spec: ${{ matrix.spec }}
```

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE)