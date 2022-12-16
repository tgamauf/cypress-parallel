import {mkdirSync, rmSync, writeFileSync} from "fs";
import path from "path";
import * as sqrl from "squirrelly";

import parse from "../src/parsing";
import {CypressConfig, CypressJSConfigParser, CypressTSConfigParser} from "../src/cypressConfigParser";
import {createTestSpecs, getTestDir, mockGetInput, mockSetFailed, mockSetOutput} from "../src/test_utils";


jest.mock("@actions/core");

mockGetInput.mockReturnValue(""); // working-directory and count-runners input


const DEFAULT_E2E_FOLDER = "cypress/e2e/";
const DEFAULT_TEST_SPEC_NAMES = ["test1.cy.ts", "tests/test2.cy.ts"];
const DEFAULT_JS_CONFIG_TEMPLATE = `
module.exports = {
  {{@if(it.e2eEnabled)}}
  e2e: {
    {{@if(it.e2eSpecPattern)}}specPattern: "{{it.e2eSpecPattern}}",{{/if}}
    {{@if(it.e2eExcludeSpecPattern)}}excludeSpecPattern: "{{it.e2eExcludeSpecPattern}}",{{/if}}
  },
  {{/if}}
  {{@if(it.componentEnabled)}}
  component: {
    {{@if(it.componentSpecPattern)}}specPattern: "{{it.componentSpecPattern}}",{{/if}}
    {{@if(it.componentExcludeSpecPattern)}}excludeSpecPattern: "{{it.componentExcludeSpecPattern}}"{{/if}}
  }
  {{/if}}
}`;
const DEFAULT_TS_CONFIG_TEMPLATE = `
export default {
  {{@if(it.e2eEnabled)}}
  e2e: {
    {{@if(it.e2eSpecPattern)}}specPattern: "{{it.e2eSpecPattern}}",{{/if}}
    {{@if(it.e2eExcludeSpecPattern)}}excludeSpecPattern: "{{it.e2eExcludeSpecPattern}}",{{/if}}
  },
  {{/if}}
  {{@if(it.componentEnabled)}}
  component: {
    {{@if(it.componentSpecPattern)}}specPattern: "{{it.componentSpecPattern}}",{{/if}}
    {{@if(it.componentExcludeSpecPattern)}}excludeSpecPattern: "{{it.componentExcludeSpecPattern}}"{{/if}}
  }
  {{/if}}
}`;

// @ts-ignore this is marked as an unknown type, which is just not true
type TestCypressConfig = DeepPartial<CypressConfig>

function createCypressConfig(
  filename: string,
  template: string,
  path: string,
  config?: TestCypressConfig
) {
  const renderedTemplate = sqrl.render(
    template,
    {
      e2eEnabled: !!config?.e2e?.specPattern || !!config?.e2e?.excludeSpecPattern,
      e2eSpecPattern: config?.e2e?.specPattern,
      e2eExcludeSpecPattern: config?.e2e?.excludeSpecPattern,
      componentEnabled: !!config?.component?.specPattern || !!config?.component?.excludeSpecPattern,
      componentSpecPattern: config?.component?.specPattern,
      componentExcludeSpecPattern: config?.component?.excludeSpecPattern
    }
  );
  writeFileSync(`${path}/${filename}`, renderedTemplate);
}

function createJSCypressConfig(path: string, config?: TestCypressConfig) {
  createCypressConfig(
    CypressJSConfigParser.CONFIG_FILE_NAME_JS,
    DEFAULT_JS_CONFIG_TEMPLATE,
    path,
    config
  );
}

describe("Test parsing of JS config", () => {
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
    const testDir = path.join(baseDir, DEFAULT_E2E_FOLDER);

    createJSCypressConfig(baseDir);
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(DEFAULT_E2E_FOLDER, item))
    );
  });

  it("test file pattern configured", async () => {
    const testDir = path.join(baseDir, DEFAULT_E2E_FOLDER);
    const testSpecNames = ["test1.spec.ts", "test2.ts"];

    createJSCypressConfig(
      baseDir,
      {
        e2e: {
          specPattern: "**/*.spec.ts"
        }
      }
    );
    createTestSpecs(testDir, testSpecNames);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(DEFAULT_E2E_FOLDER, testSpecNames[0])]
    );
  });

  it("ignore pattern configured", async () => {
    const testDir = path.join(baseDir, DEFAULT_E2E_FOLDER);

    createJSCypressConfig(
      baseDir,
      {
        e2e: {
          excludeSpecPattern: "**/tests/*"
        }
      });
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(DEFAULT_E2E_FOLDER, DEFAULT_TEST_SPEC_NAMES[0])]
    );
  });

  it("specify working directory", async () => {
    // Create invalid Cypress config as a check
    createJSCypressConfig(
      baseDir,
      {
        e2e: {
          specPattern: "invalid"
        }
      }
    );

    const workDirFolder = "cwd";
    const workDir = path.join(baseDir, workDirFolder);
    mkdirSync(workDir, {recursive: true});
    createJSCypressConfig(workDir);

    const testDir = path.join(workDir, DEFAULT_E2E_FOLDER);
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetInput.mockReturnValueOnce(workDir); // first call is working-directory
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(
        DEFAULT_E2E_FOLDER, item
      ))
    );
  });

  it("test count-runners specified", async () => {
    const testFilenames = ["t1.cy.ts", "t2.cy.ts", "t3.cy.ts", "t4.cy.ts", "t5.cy.ts"];
    const e2eTestDir = path.join(baseDir, DEFAULT_E2E_FOLDER);
    const e2eCheckTestGroups = [
      [testFilenames[0], testFilenames[1], testFilenames[2]]
        .map((p) => path.join(DEFAULT_E2E_FOLDER, p)).join(","),
      [testFilenames[3], testFilenames[4]]
        .map((p) => path.join(DEFAULT_E2E_FOLDER, p)).join(","),
    ]
    const componentFolder = "component";
    const componentTestDir = path.join(baseDir, componentFolder);
    const componentCheckTestGroups = [
      [testFilenames[0], testFilenames[1], testFilenames[2]]
        .map((p) => path.join(componentFolder, p)).join(","),
      [testFilenames[3], testFilenames[4]]
        .map((p) => path.join(componentFolder, p)).join(","),
    ]


    // Use the same test spec for integration and component tests
    createJSCypressConfig(
      baseDir,
      {
        component: {
          specPattern: `${componentFolder}/*.cy.ts`
        }
      }
    );
    createTestSpecs(e2eTestDir, testFilenames);
    createTestSpecs(componentTestDir, testFilenames);

    mockGetInput
      .mockReturnValueOnce("")  // first call is working-directory
      .mockReturnValueOnce("2");    // second call is count-runners
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      1,
      "integration-tests",
      e2eCheckTestGroups
    );
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      2,
      "component-tests",
      componentCheckTestGroups
    );
  });

  it("integration and component tests with multiple testFiles and ignoreTestFiles patterns",
    async () => {
      // Create the following structure
      // ├── cypress.json
      // ├── src                      <- componentFolder
      // │   ├── a
      // │   │   ├── a.old.spec.ts    <- should be ignored by ignoreTestFiles pattern 1
      // │   │   ├── a.spec.ts        <- should be picked up by testFiles pattern
      // │   │   ├── a.test.ts        <- should be picked up by testFiles pattern
      // │   │   └── a.ts
      // │   └── b
      // │       ├── b.spec.ts.bak
      // │       └── b.ts
      // └── tests                    <- integrationFolder
      //      ├── c.spec.ts           <- should be picked up by testFiles pattern 1
      //      ├── d.ts
      //      └── tests.old           <- should be ignored by ignoreTestFiles pattern 2
      //          └── e.spec.ts


      const e2eFolder = "tests";
      const e2eTestFilenames = ["c.spec.ts", "d.ts", "tests.old/e.spec.tx"];
      const componentFolder = "src";
      const srcFilePaths = [
        "a/a.ts",
        "a/a1.spec.ts",
        "a/a2.spec.ts",
        "a/a.old.spec.ts",
        "b/b.ts",
        "b/b.spec.ts.bak",
      ]

      createJSCypressConfig(
        baseDir,
        {
        e2e: {
          specPattern: `${e2eFolder}/*.spec.ts`,
          excludeSpecPattern: "**/test.old/**"
        },
        component: {
          // only using one pattern here as the templating engine removes quotes, and
          //  it doesn't really matter anyway
          specPattern: `**/*.spec.ts`,
          excludeSpecPattern: "**/*.old.spec.ts"
        }
      });

      createTestSpecs(e2eFolder, e2eTestFilenames);
      createTestSpecs(componentFolder, srcFilePaths);

      await parse();
      expect(mockSetFailed.mock.calls.length).toBe(0);
      expect(mockSetOutput).toHaveBeenNthCalledWith(
        1,
        "integration-tests",
        [path.join(e2eFolder, e2eTestFilenames[0])]
      );
      expect(mockSetOutput).toHaveBeenNthCalledWith(
        2,
        "component-tests",
        [srcFilePaths[1], srcFilePaths[2]].map(f => path.join(componentFolder, f))
      );
    }
  );

  it("no Cypress config", async () => {
    const testDir = path.join(baseDir, DEFAULT_E2E_FOLDER);

    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed).toHaveBeenCalledWith(
      "No supported Cypress config file found."
    );
    expect(mockSetOutput.mock.calls.length).toBe(0);
  });
});


function createTSCypressConfig(path: string, config?: TestCypressConfig) {
  createCypressConfig(
    CypressTSConfigParser.CONFIG_FILE_NAME,
    DEFAULT_TS_CONFIG_TEMPLATE,
    path,
    config
  );
}
describe("Test parsing of TS config", () => {
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
    const testDir = path.join(baseDir, DEFAULT_E2E_FOLDER);

    createTSCypressConfig(baseDir);
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(DEFAULT_E2E_FOLDER, item))
    );
  });

  it("test file pattern configured", async () => {
    const testDir = path.join(baseDir, DEFAULT_E2E_FOLDER);
    const testSpecNames = ["test1.spec.ts", "test2.ts"];

    createTSCypressConfig(
      baseDir,
      {
        e2e: {
          specPattern: "**/*.spec.ts"
        }
      }
    );
    createTestSpecs(testDir, testSpecNames);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(DEFAULT_E2E_FOLDER, testSpecNames[0])]
    );
  });

  it("ignore pattern configured", async () => {
    const testDir = path.join(baseDir, DEFAULT_E2E_FOLDER);

    createTSCypressConfig(
      baseDir,
      {
        e2e: {
          excludeSpecPattern: "**/tests/*"
        }
      });
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      [path.join(DEFAULT_E2E_FOLDER, DEFAULT_TEST_SPEC_NAMES[0])]
    );
  });

  it("specify working directory", async () => {
    // Create invalid Cypress config as a check
    createTSCypressConfig(
      baseDir,
      {
        e2e: {
          specPattern: "invalid"
        }
      }
    );

    const workDirFolder = "cwd";
    const workDir = path.join(baseDir, workDirFolder);
    mkdirSync(workDir, {recursive: true});
    createTSCypressConfig(workDir);

    const testDir = path.join(workDir, DEFAULT_E2E_FOLDER);
    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    mockGetInput.mockReturnValueOnce(workDir); // first call is working-directory
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenCalledWith(
      "integration-tests",
      DEFAULT_TEST_SPEC_NAMES.map((item) => path.join(
        DEFAULT_E2E_FOLDER, item
      ))
    );
  });

  it("test count-runners specified", async () => {
    const testFilenames = ["t1.cy.ts", "t2.cy.ts", "t3.cy.ts", "t4.cy.ts", "t5.cy.ts"];
    const e2eTestDir = path.join(baseDir, DEFAULT_E2E_FOLDER);
    const e2eCheckTestGroups = [
      [testFilenames[0], testFilenames[1], testFilenames[2]]
        .map((p) => path.join(DEFAULT_E2E_FOLDER, p)).join(","),
      [testFilenames[3], testFilenames[4]]
        .map((p) => path.join(DEFAULT_E2E_FOLDER, p)).join(","),
    ]
    const componentFolder = "component";
    const componentTestDir = path.join(baseDir, componentFolder);
    const componentCheckTestGroups = [
      [testFilenames[0], testFilenames[1], testFilenames[2]]
        .map((p) => path.join(componentFolder, p)).join(","),
      [testFilenames[3], testFilenames[4]]
        .map((p) => path.join(componentFolder, p)).join(","),
    ]


    // Use the same test spec for integration and component tests
    createTSCypressConfig(
      baseDir,
      {
        component: {
          specPattern: `${componentFolder}/*.cy.ts`
        }
      }
    );
    createTestSpecs(e2eTestDir, testFilenames);
    createTestSpecs(componentTestDir, testFilenames);

    mockGetInput
      .mockReturnValueOnce("")  // first call is working-directory
      .mockReturnValueOnce("2");    // second call is count-runners
    await parse();
    expect(mockSetFailed.mock.calls.length).toBe(0);
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      1,
      "integration-tests",
      e2eCheckTestGroups
    );
    expect(mockSetOutput).toHaveBeenNthCalledWith(
      2,
      "component-tests",
      componentCheckTestGroups
    );
  });

  it("integration and component tests with multiple testFiles and ignoreTestFiles patterns",
    async () => {
      // Create the following structure
      // ├── cypress.json
      // ├── src                      <- componentFolder
      // │   ├── a
      // │   │   ├── a.old.spec.ts    <- should be ignored by ignoreTestFiles pattern 1
      // │   │   ├── a.spec.ts        <- should be picked up by testFiles pattern
      // │   │   ├── a.test.ts        <- should be picked up by testFiles pattern
      // │   │   └── a.ts
      // │   └── b
      // │       ├── b.spec.ts.bak
      // │       └── b.ts
      // └── tests                    <- integrationFolder
      //      ├── c.spec.ts           <- should be picked up by testFiles pattern 1
      //      ├── d.ts
      //      └── tests.old           <- should be ignored by ignoreTestFiles pattern 2
      //          └── e.spec.ts


      const e2eFolder = "tests";
      const e2eTestFilenames = ["c.spec.ts", "d.ts", "tests.old/e.spec.tx"];
      const componentFolder = "src";
      const srcFilePaths = [
        "a/a.ts",
        "a/a1.spec.ts",
        "a/a2.spec.ts",
        "a/a.old.spec.ts",
        "b/b.ts",
        "b/b.spec.ts.bak",
      ]

      createTSCypressConfig(baseDir, {
        e2e: {
          specPattern: `${e2eFolder}/*.spec.ts`,
          excludeSpecPattern: "**/test.old/**"
        },
        component: {
          // only using one pattern here as the templating engine removes quotes, and
          //  it doesn't really matter anyway
          specPattern: `**/*.spec.ts`,
          excludeSpecPattern: "**/*.old.spec.ts"
        }
      });

      createTestSpecs(e2eFolder, e2eTestFilenames);
      createTestSpecs(componentFolder, srcFilePaths);

      await parse();
      expect(mockSetFailed.mock.calls.length).toBe(0);
      expect(mockSetOutput).toHaveBeenNthCalledWith(
        1,
        "integration-tests",
        [path.join(e2eFolder, e2eTestFilenames[0])]
      );
      expect(mockSetOutput).toHaveBeenNthCalledWith(
        2,
        "component-tests",
        [srcFilePaths[1], srcFilePaths[2]].map(f => path.join(componentFolder, f))
      );
    }
  );

  it("no Cypress config", async () => {
    const testDir = path.join(baseDir, DEFAULT_E2E_FOLDER);

    createTestSpecs(testDir, DEFAULT_TEST_SPEC_NAMES);

    await parse();
    expect(mockSetFailed).toHaveBeenCalledWith(
      "No supported Cypress config file found."
    );
    expect(mockSetOutput.mock.calls.length).toBe(0);
  });
});
