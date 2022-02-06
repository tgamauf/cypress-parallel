import {mkdir, mkdtemp, rm, symlink, writeFile} from "fs/promises";
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

async function createCypressConfig(path: string, config?: {
    componentFolder?: string,
    ignoreTestFiles?: string | string[],
    integrationFolder?: string,
    testFiles?: string | string[]
  }) {
  await writeFile(`${path}/${CYPRESS_CONFIG_FILE_NAME}`, JSON.stringify(config));
}

async function createTestSpecs(testDir: string, testFilenames: string[]) {
  if (!testDir) {
    throw new Error("No test directory provided");
  }
  if (!testFilenames) {
    throw new Error("No test filenames provided");
  }

  for (const name of testFilenames) {
    const filePath = path.join(testDir, path.dirname(name));
    await mkdir(filePath, {recursive: true});
    await writeFile(path.join(testDir, name), "test");
  }
}

describe("Test parsing", () => {
  let baseDir;

  beforeEach(async () => {
    // Setup temporary test directory and set it as our working directory
    baseDir = await mkdtemp(path.join(tmpdir(), "cypress-parallel_"));
    process.chdir(baseDir);
  });
  afterEach(async () => {
    // Clean up temporary test directory
    await rm(baseDir, { recursive: true, force: true });
  })

  it("default config", async () => {
    const testDir = path.join(baseDir, DEFAULT_INTEGRATION_FOLDER);

    await createCypressConfig(baseDir, {});
    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

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

    await createCypressConfig(baseDir, {integrationFolder: integrationFolder});
    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

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

    await createCypressConfig(baseDir, {componentFolder: componentFolder});
    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

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

    await createCypressConfig(baseDir, {testFiles: "**/*.spec.ts"});
    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

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

    await createCypressConfig(baseDir, {ignoreTestFiles: "**/*.spec.ts"});
    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(testDir, DEFAULT_TEST_SPEC_NAMES[1])]
    );
  });

  it("custom Cypress config file location specified", async () => {
    await createCypressConfig(baseDir, {});

    // Change working directory so the Cypress config shouldn't be found
    const workingFolder = "cwd";
    await mkdir(workingFolder);
    process.chdir(workingFolder)

    const testDir = path.join(baseDir, workingFolder, DEFAULT_INTEGRATION_FOLDER);
    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce(path.join("..", CYPRESS_CONFIG_FILE_NAME));
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

    await mkdir(realTestDir, {recursive: true});
    await symlink(realTestDir, testDir);

    await createCypressConfig(baseDir, {integrationFolder: integrationFolder});
    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

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

    await mkdir(realTestDir, {recursive: true});
    await symlink(realTestDir, testDir);

    await createCypressConfig(baseDir, {integrationFolder: integrationFolder});
    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

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

      await createCypressConfig(baseDir, {
        componentFolder: componentFolder,
        ignoreTestFiles: ["**/*.old.spec.ts", "**/test.old/" ],
        integrationFolder: integrationFolder,
        testFiles: ["**/*.spec.ts", "**/*.test.ts"]
      });

      await createTestSpecs(integrationFolder, integrationTestFilenames);
      await createTestSpecs(componentFolder, srcFilePaths);

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

    await createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetBooleanInput.mockReturnValueOnce(true);
    mockGetInput.mockReturnValueOnce("");
    await parse();
    expect(mockSetFailed).toHaveBeenCalledWith(
      "Cypress config file could not be found."
    );
    expect(mockSetOutput.mock.calls.length).toBe(0);
  });
});
