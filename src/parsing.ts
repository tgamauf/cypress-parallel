import {debug, error, getBooleanInput, getInput, info, notice, setFailed, setOutput,} from "@actions/core";
import {create as createGlobber} from "@actions/glob";
import {readFileSync, existsSync} from "fs";
import * as path from "path";


const CYPRESS_CONFIG_FILE_NAME_PRE_V10 = "cypress.json";
const CYPRESS_CONFIG_FILE_NAME_V10_JS = "cypress.config.js";
const CYPRESS_CONFIG_FILE_NAME_V10_TS = "cypress.config.ts";

// Defaults for Cypress config:
//  https://docs.cypress.io/guides/references/configuration#Folders-Files
const DEFAULT_INTEGRATION_FOLDER = "cypress/integration";
const DEFAULT_TEST_FILES = "**/*.*";


interface Config {
  workingDirectory: string;
  followSymbolicLinks: boolean;
  countRunners: number;
}

// Relevant parts of the Cypress config:
//  https://docs.cypress.io/guides/references/configuration#Folders-Files
interface CypressConfig {
  componentFolder?: string;
  ignoreTestFiles?: string | string[];
  integrationFolder: string;
  testFiles: string | string[];
}

interface TestFiles {
  integrationTests: string[];
  componentTests?: string[];
}

export default async function parse(): Promise<void> {
  const config: Config = {
    workingDirectory: getInput("working-directory"),
    followSymbolicLinks: getBooleanInput("follow-symbolic-links"),
    countRunners: Number(getInput("count-runners"))
  };

  try {
    info(`Configuration: ${JSON.stringify(config, null, 2)}`);

    let workingDirectory;
    if (config.workingDirectory) {
      workingDirectory = config.workingDirectory;
    } else {
      workingDirectory = await findWorkingDirectory();
    }

    if (!workingDirectory) {
      setFailed("Cypress config file could not be found.");
      return;
    }

    info(`Working directory: ${workingDirectory}`);

    // Change to the working directory
    process.chdir(workingDirectory);

    const cypressConfig = await loadCypressConfig();
    if (!cypressConfig) {
      setFailed("Could not load Cypress config.");
      return;
    }
    info(`Cypress config: ${JSON.stringify(cypressConfig, null, 2)}`);

    const {integrationTests, componentTests} = await parseTests(config, cypressConfig);

    if ((integrationTests.length === 0)
        && (!componentTests || (componentTests?.length === 0))) {
      setFailed("No tests found");
      return;
    }

    const integrationTestGroups = createTestGroups(config.countRunners, integrationTests);
    setOutput("integration-tests", integrationTestGroups);
    notice(`Integration tests found: ${
      JSON.stringify(integrationTestGroups, null, 2)}`);

    if (componentTests) {
      const componentTestGroups = createTestGroups(config.countRunners, componentTests);
      setOutput("component-tests", componentTestGroups);
      notice(`Component tests found: ${
        JSON.stringify(componentTestGroups, null, 2)}`);
    }
  } catch (e) {
    setFailed(`Action failed with error: ${e}`);
  }
}

async function findWorkingDirectory(): Promise<string | null> {
  const globber = await createGlobber(`**/${CYPRESS_CONFIG_FILE_NAME_PRE_V10}`);
  const results = await globber.glob();

  debug(`Old-style Cypress config files found: ${JSON.stringify(results, null, 2)}`);

  if (results.length == 0) {
    const globber = await createGlobber(`**/${CYPRESS_CONFIG_FILE_NAME_V10_JS}\n**/${CYPRESS_CONFIG_FILE_NAME_V10_TS}`);
    const results = await globber.glob();

    debug(`New-style Cypress config files found: ${JSON.stringify(results, null, 2)}`);

    if (results.length == 0) {  
      error("No Cypress config file found.");
      return null;
    }
    if (results.length > 1) {
      error("Multiple Cypress config files found.");
      return null;
    }

    return path.dirname(results[0]);
  }
  if (results.length > 1) {
    error("Multiple Cypress config files found.");
    return null;
  }

  return path.dirname(results[0]);
}

async function loadCypressConfig(): Promise<CypressConfig | null> {
  try {
    if (existsSync(CYPRESS_CONFIG_FILE_NAME_PRE_V10)) {
      const data = readFileSync(CYPRESS_CONFIG_FILE_NAME_PRE_V10);
      const config = JSON.parse(data.toString());
    } else if (existsSync(CYPRESS_CONFIG_FILE_NAME_V10_JS)) {
      const config = require(CYPRESS_CONFIG_FILE_NAME_PRE_V10);
    } else if (existsSync(CYPRESS_CONFIG_FILE_NAME_V10_TS)) {
      throw new Error(CYPRESS_CONFIG_FILE_NAME_V10_TS + ' is not supported yet.')
    } else {
      throw new Error('No supported config file found.')
    }

    return {
      integrationFolder: DEFAULT_INTEGRATION_FOLDER,
      testFiles: DEFAULT_TEST_FILES,
      ...config,
    };
  } catch (e) {
    error(`Failed to load Cypress config: ${e}`);
    return null;
  }
}

async function parseTests(
  config: Config,
  cypressConfig: CypressConfig
): Promise<TestFiles> {
  const integrationTests = await parseTestOfType(
    config,
    cypressConfig.integrationFolder,
    cypressConfig.testFiles,
    cypressConfig.ignoreTestFiles
  );

  let componentTests;
  if (cypressConfig.componentFolder) {
    componentTests = await parseTestOfType(
      config,
      cypressConfig.componentFolder,
      cypressConfig.testFiles,
      cypressConfig.ignoreTestFiles
    );
  }

  return { integrationTests, componentTests };
}

async function parseTestOfType(
  config: Config,
  testFolder: string,
  testFiles: string | string[],
  ignoreTestFiles?: string | string[]
): Promise<string[]> {
  const globPattern = createGlobPattern(testFolder, testFiles, ignoreTestFiles);
  const globber = await createGlobber(
    globPattern,
    {followSymbolicLinks: config.followSymbolicLinks}
  );

  return await globber.glob();
}

function createGlobPattern(
  testFolder: string,
  testFiles: string | string[],
  ignoreTestFiles?: string | string[]
): string {
  // Create the basic patterns
  let filePatterns;
  if (Array.isArray(testFiles)) {
    filePatterns = testFiles;
  } else {
    filePatterns = [testFiles];
  }

  // Extend it by the ignore patterns
  let patterns = filePatterns.map((p) => path.join(testFolder, p));
  if (ignoreTestFiles) {
    let ignoreFilePatterns;
    if (Array.isArray(ignoreTestFiles)) {
      ignoreFilePatterns = ignoreTestFiles;
    } else {
      ignoreFilePatterns = [ignoreTestFiles];
    }
    patterns = [
      ...patterns,
      ...ignoreFilePatterns.map((p) => { return `!${path.join(testFolder, p)}` })
    ]
  }

  debug(`Test file glob patterns for folder ${testFolder}: ${
    JSON.stringify(patterns, null, 2)}`);

  return patterns.join("\n");
}

function createTestGroups(groupCount: number, tests: string[]): string[] {
  // If the group count isn't valid, just return the tests
  if ((isNaN(groupCount)) || groupCount <= 0) {
    return tests;
  }

  // Group the tests into "groupCount" chunks and then join each group with ",",
  //  as this is how the Cypress "run" commend requires the "spec" input if
  //  multiple tests are specified
  const testCountByChunk = Math.ceil(tests.length / groupCount);
  return tests.reduce((groups: string[][], item, index) => {
    const chunkIndex = Math.floor(index / testCountByChunk)

    if (!groups[chunkIndex]) {
      groups[chunkIndex] = [] // start a new chunk
    }

    groups[chunkIndex].push(item)

    return groups
  }, []).map((group) => group.join(","))
}

export type { TestFiles };

export { CYPRESS_CONFIG_FILE_NAME_PRE_V10, DEFAULT_INTEGRATION_FOLDER, DEFAULT_TEST_FILES };
