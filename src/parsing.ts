import {
  debug, error,
  getBooleanInput,
  getInput,
  info,
  notice,
  setFailed,
  setOutput,
} from "@actions/core";
import {create as createGlobber} from "@actions/glob";
import {readFileSync} from "fs";
import * as path from "path";


const CYPRESS_CONFIG_FILE_NAME = "cypress.json";

// Defaults for Cypress config:
//  https://docs.cypress.io/guides/references/configuration#Folders-Files
const DEFAULT_INTEGRATION_FOLDER = "cypress/integration";
const DEFAULT_TEST_FILES = "**/*.*";


interface Config {
  workingDirectory: string;
  followSymbolicLinks: boolean;
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
    followSymbolicLinks: getBooleanInput("follow-symbolic-links")
  }

  try {
    info(`Configuration: ${JSON.stringify(config, null, 2)}`);

    let cypressConfigFilePath;
    if (config.workingDirectory) {
      cypressConfigFilePath = path.join(config.workingDirectory, CYPRESS_CONFIG_FILE_NAME);
    } else {
      cypressConfigFilePath = await findCypressConfigFile();
    }

    if (!cypressConfigFilePath) {
      setFailed("Cypress config file could not be found.");
      return;
    }

    const cypressConfig = await loadCypressConfig(cypressConfigFilePath);

    if (!cypressConfig) {
      setFailed("Could not load Cypress config.");
      return;
    }

    info(`Using Cypress config at "${cypressConfigFilePath}"`);
    info(`Cypress config: ${JSON.stringify(cypressConfig)}`);

    const {integrationTests, componentTests} = await parseTests(config, cypressConfig);

    if ((integrationTests.length === 0)
        && (!componentTests || (componentTests?.length === 0))) {
      setFailed("No tests found");
      return;
    }

    setOutput("integration-tests", integrationTests);

    notice(`Integration tests found: ${JSON.stringify(integrationTests)}`);

    if (componentTests) {
      setOutput("component-tests", componentTests);

      notice(`Component tests found: ${JSON.stringify(componentTests)}`);
    }
  } catch (e) {
    setFailed(`Action failed with error: ${e}`);
  }
}

async function loadCypressConfig(configFilePath: string): Promise<CypressConfig | null> {
  try {
    const data = readFileSync(configFilePath);
    const config = JSON.parse(data.toString());

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

async function findCypressConfigFile(): Promise<string | null> {
  const globber = await createGlobber(`**/${CYPRESS_CONFIG_FILE_NAME}`);
  const results = await globber.glob();

  debug(`Cypress config files found: ${JSON.stringify(results, null, 2)}`);

  if (!results) {
    error("No Cypress config file found.");
    return null;
  }
  if (results.length > 1) {
    error("Multiple Cypress config file found.");
    return null;
  }

  return results[0];
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

export type { TestFiles };

export { CYPRESS_CONFIG_FILE_NAME, DEFAULT_INTEGRATION_FOLDER, DEFAULT_TEST_FILES };
