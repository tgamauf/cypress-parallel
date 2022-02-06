import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from "fs";
import * as path from "path";
import {tmpdir} from "os";

import {getBooleanInput, getInput, setFailed, setOutput} from "@actions/core";

import parse, {CYPRESS_CONFIG_FILE_NAME, DEFAULT_INTEGRATION_FOLDER} from "../lib/parsing";


jest.mock("@actions/core");

const mockGetBooleanInput = getBooleanInput as jest.MockedFunction<typeof getBooleanInput>;
const mockGetInput = getInput as jest.MockedFunction<typeof getInput>;
const mockSetFailed = setFailed as jest.MockedFunction<typeof setFailed>;
const mockSetOutput = setOutput as jest.MockedFunction<typeof setOutput>;


const DEFAULT_TEST_SPEC_NAMES = ["test1.spec.ts", "test2.ts"];

function createCypressConfig(path: string, config?: {
    componentFolder?: string,
    ignoreTestFiles?: string | string[],
    integrationFolder?: string,
    testFiles?: string | string[]
  }) {
  writeFileSync(`${path}/${CYPRESS_CONFIG_FILE_NAME}`, JSON.stringify(config));
}

function createTestSpecs(testDir: string, testFilenames: string[]) {
  if (!testDir) {
    throw new Error("No test directory provided");
  }
  if (!testFilenames) {
    throw new Error("No test filenames provided");
  }

  for (const name of testFilenames) {
    const filePath = path.join(testDir, path.dirname(name));
    mkdirSync(filePath, {recursive: true});
    writeFileSync(path.join(testDir, name), "test");
  }
}

describe("Test parsing", () => {
  let baseDir;

  beforeEach(() => {
    // On MacOS the paths are somehow broken - tmpdir returns a path in /var,
    //  but the absolute paths that are returned by the tests are /private/var.
    //  So let's add this here so our checks work as intended ...
    const tmpRoot = process.platform !== "darwin"
      ? tmpdir() : path.join("/private", tmpdir());

    // Setup temporary test directory and set it as our working directory
    baseDir = mkdtempSync(path.join(tmpRoot, "cypress-parallel_"));
    process.chdir(baseDir);
  });
  afterEach(() => {
    // Clean up temporary test directory, but ignore if it doesn't work as we
    //  use a temporary directory anyway
    try {
      rmSync(baseDir, {recursive: true, force: true});
    } catch (e) {}
  })

  it("default config", async () => {
    const testDir = path.join(baseDir, DEFAULT_INTEGRATION_FOLDER);

    createCypressConfig(baseDir, {});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(testDir, item))
    );
  });

  it("integration test path configured", async () => {
    const integrationFolder = "tests";
    const testDir = path.join(baseDir, integrationFolder);

    createCypressConfig(baseDir, {integrationFolder: integrationFolder});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(testDir, item))
    );
  });

  it("test component test path configured", async () => {
    const componentFolder = "tests";
    const testDir = path.join(baseDir, componentFolder);

    createCypressConfig(baseDir, {componentFolder: componentFolder});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenNthCalledWith(1, "integration-tests", []);
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      2,
      "component-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(testDir, item))
    );
  });

  it("test file pattern configured", async () => {
    const testDir = path.join(baseDir, DEFAULT_INTEGRATION_FOLDER);

    createCypressConfig(baseDir, {testFiles: "**/*.spec.ts"});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(testDir, DEFAULT_TEST_SPEC_NAMES[0])]
    );
  });

  it("ignore pattern configured", async () => {
    const testDir = path.join(baseDir, DEFAULT_INTEGRATION_FOLDER);

    createCypressConfig(baseDir, {ignoreTestFiles: "**/*.spec.ts"});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(testDir, DEFAULT_TEST_SPEC_NAMES[1])]
    );
  });

  it("specify working directory", async () => {
    await createCypressConfig(baseDir, {});

    // Change working directory so the Cypress config shouldn't be found
    const workingFolder = "cwd";
    mkdirSync(workingFolder);
    process.chdir(workingFolder)

    const testDir = path.join(baseDir, workingFolder, DEFAULT_INTEGRATION_FOLDER);
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("../");
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(testDir, item))
    );
  });

  it("tests at symlink", async () => {
    const integrationFolder = "symlinked";
    const testDir = path.join(baseDir, integrationFolder);
    const realTestDir = path.join(baseDir, "tests");

    mkdirSync(realTestDir, {recursive: true});
    symlinkSync(realTestDir, testDir);

    createCypressConfig(baseDir, {integrationFolder: integrationFolder});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(testDir, item))
    );
  });

  it("tests at symlink with follow-symbolic-links disabled", async () => {
    const integrationFolder = "symlinked";
    const testDir = path.join(baseDir, integrationFolder);
    const realTestDir = path.join(baseDir, "tests");

    mkdirSync(realTestDir, {recursive: true});
    symlinkSync(realTestDir, testDir);

    createCypressConfig(baseDir, {integrationFolder: integrationFolder});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(false);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed).toHaveBeenCalledWith("No tests found");
    expect(mockSetOutput.mock.calls.length).toBe(0);
  });

  it("integration and component tests with multiple testFiles and ignoreTestFiles patterns",
    async () => {
      // Create the following structure
      // ├── cypress.json
      // ├── src                      <- componentFolder
      // │   ├── a
      // │   │   ├── a.old.spec.ts    <- should be ignored by ignoreTestFiles pattern 1
      // │   │   ├── a.spec.ts        <- should be picked up by testFiles pattern 1
      // │   │   ├── a.test.ts        <- should be picked up by testFiles pattern 2
      // │   │   └── a.ts
      // │   └── b
      // │       ├── b.spec.ts.bak
      // │       └── b.ts
      // └── tests                    <- integrationFolder
      //      ├── c.spec.ts           <- should be picked up by testFiles pattern 1
      //      ├── d.ts
      //      └── tests.old           <- should be ignored by ignoreTestFiles pattern 2
      //          └── e.spec.ts


      const integrationFolder = "tests";
      const integrationTestFilenames = ["c.spec.ts", "d.ts"];
      const componentFolder = "src";
      const srcFilePaths = [
        "a/a.ts",
        "a/a.spec.ts",
        "a/a.old.spec.ts",
        "b/b.ts",
        "b/b.spec.ts.bak",
      ]

      createCypressConfig(baseDir, {
        componentFolder: componentFolder,
        ignoreTestFiles: ["**/*.old.spec.ts", "**/test.old/" ],
        integrationFolder: integrationFolder,
        testFiles: ["**/*.spec.ts", "**/*.test.ts"]
      });

      createTestSpecs(integrationFolder, integrationTestFilenames);
      createTestSpecs(componentFolder, srcFilePaths);

      mockGetBooleanInput.mockReturnValueOnce(true);
      mockGetInput.mockReturnValueOnce("");
      await parse();
      expect(mockSetFailed.mock.calls.length).toBe(0);
      expect(mockSetOutput).toHaveBeenNthCalledWith(
        1,
        "integration-tests",
        [path.join(baseDir, integrationFolder, integrationTestFilenames[0])]
      );
      expect(mockSetOutput).toHaveBeenNthCalledWith(
        2,
        "component-tests",
        [path.join(baseDir, componentFolder, srcFilePaths[1])]
      );
    }
  );

  it("no Cypress config", async () => {
    const testDir = path.join(baseDir, DEFAULT_INTEGRATION_FOLDER);

    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed).toHaveBeenCalledWith(
      "Cypress config file could not be found."
    );
    expect(mockSetOutput.mock.calls.length).toBe(0);
  });
});
