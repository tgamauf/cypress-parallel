import {mkdtempSync, readFileSync, writeFileSync} from "fs";
import path from "path";
import {tmpdir} from "os";
import ts from "typescript";
import {error, info} from "@actions/core";

import CypressBaseConfigParser from "./cypressBaseConfigParser";
import {TestFiles} from "./types";


// Relevant parts of the Cypress config:^
//  https://docs.cypress.io/guides/references/configuration#Testing-Type-Specific-Options
type SpecPattern = string | string[];
interface CypressConfig {
  e2e: {
    specPattern: SpecPattern;
    excludeSpecPattern: string[];
  },
  component: {
    specPattern: SpecPattern;
    excludeSpecPattern: string[];
  }
}


abstract class CypressConfigParser extends CypressBaseConfigParser {
  // Node modules are automatically excluded from the e2e spec pattern
  //  https://docs.cypress.io/guides/references/configuration#excludeSpecPattern
  private static readonly DEFAULT_EXCLUDE_SPEC_PATTERNS = ["**/node_modules/**"];

  public parseTests(): TestFiles {
    try {
      const config = this.loadConfig();

      const integrationTests = this.parseTestOfType(
        "",
        config.e2e.specPattern,
        config.e2e.excludeSpecPattern
      );
      const componentTests = this.parseTestOfType(
        "",
        config.component.specPattern,
        config.component.excludeSpecPattern
      );

      return {integrationTests, componentTests};
    } catch (e) {
      error(`Failed to parse cypress tests: ${e}`);
      return {integrationTests: [], componentTests: []};
    }
  }

  abstract loadConfig(): CypressConfig;

  protected processConfig(configFilePath: string): CypressConfig {
    if (configFilePath === null) {
      throw new Error("no supported config file found.")
    }
    const rawConfig = require(path.resolve(configFilePath));

    info(`Cypress config found at "${configFilePath}: ${JSON.stringify(rawConfig, null, 2)}`);

    // Account for the default key in the transpiled Typescript config
    let config;
    if ("default" in rawConfig) {
      config = rawConfig.default;
    } else {
      config = rawConfig;
    }

    // Default values as defined by Cypress:
    //  https://docs.cypress.io/guides/references/configuration#e2e
    let e2eSpecPattern = ["cypress/e2e/**/*.cy.{js,jsx,ts,tsx}"];
    let e2eExcludeSpecPattern = [
      ...CypressConfigParser.DEFAULT_EXCLUDE_SPEC_PATTERNS,
      "*.hot-update.js"
    ];
    if (config.e2e !== undefined) {
      if (config.e2e.specPattern !== undefined) {
        if (typeof config.e2e.specPattern === "string") {
          e2eSpecPattern = [config.e2e.specPattern];
        } else {
          e2eSpecPattern = config.e2e.specPattern;
        }
      }
      let excludeSpecPattern;
      if (typeof config.e2e.excludeSpecPattern === "string") {
        excludeSpecPattern = [config.e2e.excludeSpecPattern];
      } else {
        excludeSpecPattern = config.e2e.excludeSpecPattern
      }
      if (config.e2e.excludeSpecPattern !== undefined) {
        e2eExcludeSpecPattern = [
          ...CypressConfigParser.DEFAULT_EXCLUDE_SPEC_PATTERNS,
          ...excludeSpecPattern,
        ];
      }
    }

    let componentSpecPattern = ["**/*.cy.{js,jsx,ts,tsx}"];
    let componentExcludeSpecPattern = [
      ...CypressConfigParser.DEFAULT_EXCLUDE_SPEC_PATTERNS,
      ...e2eSpecPattern,
      "/snapshots/*",
      "/image_snapshots/*"
    ];
    if (config.component !== undefined) {
      if (config.component.specPattern !== undefined) {
        if (typeof config.component.specPattern === "string") {
          componentSpecPattern = [config.component.specPattern];
        } else {
          componentSpecPattern = config.component.specPattern;
        }
      }
      let excludeSpecPattern;
      if (config.component.excludeSpecPattern !== undefined) {
        if (typeof config.component.excludeSpecPattern === "string") {
          excludeSpecPattern = [config.component.excludeSpecPattern];
        } else {
          excludeSpecPattern = config.component.excludeSpecPattern
        }
        componentExcludeSpecPattern = [
          ...CypressConfigParser.DEFAULT_EXCLUDE_SPEC_PATTERNS,
          ...e2eSpecPattern,
          ...excludeSpecPattern,
        ];
      }
    }

    return {
      e2e: {
        specPattern: e2eSpecPattern,
        excludeSpecPattern: e2eExcludeSpecPattern,
      },
      component: {
        specPattern: componentSpecPattern,
        excludeSpecPattern: componentExcludeSpecPattern,
      }
    };
  }
}

class CypressJSConfigParser extends CypressConfigParser {
  public static readonly CONFIG_FILE_NAME_JS = "cypress.config.js";
  public static readonly CONFIG_FILE_NAME_MJS = "cypress.config.mjs";
  public static readonly CONFIG_FILE_NAME_CJS = "cypress.config.cjs";
  public static readonly VALID_CONFIG_FILE_NAMES = [
    CypressJSConfigParser.CONFIG_FILE_NAME_JS,
    CypressJSConfigParser.CONFIG_FILE_NAME_MJS,
    CypressJSConfigParser.CONFIG_FILE_NAME_CJS
  ];

  public loadConfig(): CypressConfig {
    const configFilePath = CypressJSConfigParser.getConfigFile(this.workingDirectory);
    let config;
    if (configFilePath) {
      config = this.processConfig(configFilePath)
    } else {
      throw new Error("no supported config file found.")
    }

    return config;
  }
}

class CypressTSConfigParser extends CypressConfigParser {
  public static readonly CONFIG_FILE_NAME = "cypress.config.ts";
  public static readonly VALID_CONFIG_FILE_NAMES = [CypressTSConfigParser.CONFIG_FILE_NAME];

  public loadConfig(): CypressConfig {
    const configFilePath = CypressTSConfigParser.getConfigFile(this.workingDirectory);
    let config;
    if (configFilePath) {
      const jsConfigFilePath = this.transpileTypescriptConfig(configFilePath);
      config = this.processConfig(jsConfigFilePath)
    } else {
      throw new Error("no supported config file found.")
    }

    return config;
  }

  private transpileTypescriptConfig(configFilePath): string {
    // Create a unique file name for the config file in the temp directory
      // On MacOS the paths are somehow broken - tmpdir returns a path in /var,
    //  but the absolute paths that are returned by the tests are /private/var.
    //  So let's add this here so our checks work as intended ...
    const tmpRoot = process.platform !== "darwin"
      ? tmpdir() : path.join("/private", tmpdir());
    const jsConfigPath = path.join(
      mkdtempSync(path.join(tmpRoot, "cypress-parallel_")),
      CypressJSConfigParser.CONFIG_FILE_NAME_JS
    );

    // Transpile the TypeScript config file to Javascript
    const tsConfigFileText = readFileSync(configFilePath).toString();
    const results = ts.transpileModule(
      tsConfigFileText,
      { compilerOptions: { module: ts.ModuleKind.CommonJS }}
    )

    if (results.diagnostics && results.diagnostics.length > 0) {
      this.reportDiagnostics(results.diagnostics);
      throw new Error(`Failed to transpile Cypress typescript config at "${path.join(process.cwd(), configFilePath)}"`);
    }

    // Write the Javascript config file to disk and then load it in order to parse
    //  the content
    writeFileSync(jsConfigPath, results.outputText);

    // This will leave the file in the temp directory indefinitely, but considering the
    //  ephemeral nature of GitHub Action workers are run on it is an acceptable tradeoff
    return jsConfigPath;
  }

  private reportDiagnostics(diagnostics: ts.Diagnostic[]): void {
    diagnostics.forEach(diagnostic => {
        let message = "Error";
        if (diagnostic.file && (diagnostic.start != null)) {
            let {line, character} = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            message += ` ${diagnostic.file.fileName} (${line + 1},${character + 1})`;
        }
        message += ": " + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        console.log(message);
    });
  }
}

export {CypressJSConfigParser, CypressTSConfigParser};
export type {SpecPattern, CypressConfig}
