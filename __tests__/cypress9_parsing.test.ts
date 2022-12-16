import {mkdirSync, rmSync, writeFileSync} from "fs";
import path from "path";

import parse from "../src/parsing";
import Cypress9ConfigParser from "../src/cypress9ConfigParser";
import {createTestSpecs, getTestDir, mockGetInput, mockSetFailed, mockSetOutput} from "../src/test_utils";


jest.mock("@actions/core");

mockGetInput.mockReturnValue(""); // working-directory and count-runners input


const DEFAULT_TEST_SPEC_NAMES = ["test1.spec.ts", "test2.ts"];

function createCypressConfig(path: string, config?: {
    componentFolder?: string,
    ignoreTestFiles?: string | string[],
    integrationFolder?: string,
    testFiles?: string | string[]
  }) {
  writeFileSync(`${path}/${Cypress9ConfigParser.CONFIG_FILE_NAME}`, JSON.stringify(config));
}

describe("Test parsing", () => {
  let baseDir;

  beforeEach(() => {
    baseDir = getTestDir();
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
    const testDir = path.join(baseDir, Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER);

    createCypressConfig(baseDir, {});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(
        Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER, item
      ))
    );
  });

  it("integration test path configured", async () => {
    const integrationFolder = "tests";
    const testDir = path.join(baseDir, integrationFolder);

    createCypressConfig(baseDir, {integrationFolder: integrationFolder});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(integrationFolder, item))
    );
  });

  it("test component test path configured", async () => {
    const componentFolder = "tests";
    const testDir = path.join(baseDir, componentFolder);

    createCypressConfig(baseDir, {componentFolder: componentFolder});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenNthCalledWith(1, "integration-tests", []);
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      2,
      "component-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(componentFolder, item))
    );
  });

  it("test file pattern configured", async () => {
    const testDir = path.join(baseDir, Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER);

    createCypressConfig(baseDir, {testFiles: "**/*.spec.ts"});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER, DEFAULT_TEST_SPEC_NAMES[0])]
    );
  });

  it("ignore pattern configured", async () => {
    const testDir = path.join(baseDir, Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER);

    createCypressConfig(baseDir, {ignoreTestFiles: "**/*.spec.ts"});
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER, DEFAULT_TEST_SPEC_NAMES[1])]
    );
  });

  it("specify working directory", async () => {
    // Create invalid Cypress config as a check
    createCypressConfig(baseDir, {integrationFolder: "invalid"});

    const workDirFolder = "cwd";
    const workDir = path.join(baseDir, workDirFolder);
    mkdirSync(workDir, {recursive: true});
    createCypressConfig(workDir, {});

    const testDir = path.join(workDir, Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER);
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetInput.mockReturnValueOnce(workDir); // first call is working-directory
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(
        Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER, item
      ))
    );
  });

  it("test count-runners specified", async () => {
    const testFilenames = ["t1.ts", "t2.ts", "t3.ts", "t4.ts", "t5.ts"];
    const testDir = path.join(baseDir, Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER);
    const checkTestGroups = [
      [testFilenames[0], testFilenames[1], testFilenames[2]]
        .map((p) => path.join(Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER, p)).join(","),
      [testFilenames[3], testFilenames[4]]
        .map((p) => path.join(Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER, p)).join(","),
    ]

    // Use the same test spec for integration and component tests
    createCypressConfig(baseDir, {componentFolder: Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER});
    createTestSpecs(testDir, testFilenames);

    mockGetInput
      .mockReturnValueOnce("")  // first call is working-directory
      .mockReturnValueOnce("2");    // second call is count-runners
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      1,
      "integration-tests",
      checkTestGroups
    );
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      2,
      "component-tests",
      checkTestGroups
    );
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
      const integrationTestFilenames = ["c.spec.ts", "d.ts", "tests.old/e.spec.tx"];
      const componentFolder = "src";
      const srcFilePaths = [
        "a/a.ts",
        "a/a.spec.ts",
        "a/a.test.ts",
        "a/a.old.spec.ts",
        "b/b.ts",
        "b/b.spec.ts.bak",
      ]

      createCypressConfig(baseDir, {
        componentFolder: componentFolder,
        ignoreTestFiles: ["**/*.old.spec.ts", "**/test.old/**" ],
        integrationFolder: integrationFolder,
        testFiles: ["**/*.spec.ts", "**/*.test.ts"]
      });

      createTestSpecs(integrationFolder, integrationTestFilenames);
      createTestSpecs(componentFolder, srcFilePaths);

      await parse();
      expect(mockSetFailed.mock.calls.length).toBe(0);
      expect(mockSetOutput).toHaveBeenNthCalledWith(
        1,
        "integration-tests",
        [path.join(integrationFolder, integrationTestFilenames[0])]
      );
      expect(mockSetOutput).toHaveBeenNthCalledWith(
        2,
        "component-tests",
        [srcFilePaths[1], srcFilePaths[2]].map(f => path.join(componentFolder, f))
      );
    }
  );

  it("no Cypress config", async () => {
    const testDir = path.join(baseDir, Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER);

    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed).toHaveBeenCalledWith(
      "No supported Cypress config file found."
    );
    expect(mockSetOutput.mock.calls.length).toBe(0);
  });
});
