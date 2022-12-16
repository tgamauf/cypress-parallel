import {readFileSync} from "fs";
import {error, info} from "@actions/core";

import CypressBaseConfigParser from "./cypressBaseConfigParser";
import {TestFiles} from "./types";


// Relevant parts of the Cypress config:
//  https://docs.cypress.io/guides/references/configuration#Folders-Files
interface CypressConfig {
  componentFolder?: string;
  ignoreTestFiles?: string | string[];
  integrationFolder: string;
  testFiles: string | string[];
}

export default class Cypress9ConfigParser extends CypressBaseConfigParser {
  public static readonly CONFIG_FILE_NAME = "cypress.json";
  public static readonly VALID_CONFIG_FILE_NAMES = [Cypress9ConfigParser.CONFIG_FILE_NAME];

  // Defaults for Cypress config:
  //  https://docs.cypress.io/guides/references/configuration#Folders-Files
  public static DEFAULT_INTEGRATION_FOLDER = "cypress/integration";
  public static DEFAULT_TEST_FILES = "**/*.*";

  public parseTests(): TestFiles {
    try {
      const config = this.loadConfig();

      const integrationTests = this.parseTestOfType(
        config.integrationFolder,
        config.testFiles,
        config.ignoreTestFiles
      );

      let componentTests;
      if (config.componentFolder) {
        componentTests = this.parseTestOfType(
          config.componentFolder,
          config.testFiles,
          config.ignoreTestFiles
        );
      }

      return {integrationTests, componentTests};
    } catch (e) {
      error(`Failed to parse cypress tests: ${e}`);
      return {integrationTests: [], componentTests: []};
    }
  }

  private loadConfig(): CypressConfig {
    const configFilePath = Cypress9ConfigParser.getConfigFile(this.workingDirectory);
    let config;
    if (configFilePath) {
      const data = readFileSync(configFilePath);
      config = JSON.parse(data.toString());
    } else {
      throw new Error("no supported config file found.")
    }

    info(`JSON Cypress config found: ${JSON.stringify(config, null, 2)}`);

    return {
      integrationFolder: Cypress9ConfigParser.DEFAULT_INTEGRATION_FOLDER,
      testFiles: Cypress9ConfigParser.DEFAULT_TEST_FILES,
      ...config,
    };
  }
}
