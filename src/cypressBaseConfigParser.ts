import {Config, TestFiles} from "./types";
import {debug, error} from "@actions/core";
import path from "path";
import fs from "fs";
import minimatch from "minimatch";

export default abstract class CypressBaseConfigParser {
  public static readonly VALID_CONFIG_FILE_NAMES: Array<string> = [];
  protected readonly workingDirectory: string;

  constructor(config: Config) {
    this.workingDirectory = CypressBaseConfigParser.getWorkingDirectory(
      config.workingDirectory
    );
  }

  private static getWorkingDirectory(workingDirectory: string): string {
    return workingDirectory ? workingDirectory : process.cwd();
  }

  public static async hasConfigFile(workingDirectory: string): Promise<boolean> {
    const configFilePath = await this.getConfigFile(workingDirectory);

    return !!configFilePath;
  };

  public static getConfigFile(workingDirectory: string): string | null {
    const cwd = this.getWorkingDirectory(workingDirectory);
    const results = this.glob(cwd, this.VALID_CONFIG_FILE_NAMES);

    debug(`Cypress config files found: ${JSON.stringify(results, null, 2)}`);

    if (results.length == 0) {
      debug(`No config file of type ${JSON.stringify(this.VALID_CONFIG_FILE_NAMES)} found at ${cwd}.`);
      return null;
    }
    if (results.length > 1) {
      error("Multiple Cypress config files found.");
      return null;
    }

    return path.join(workingDirectory, results[0]);
  }
  private static glob(root: string, pattern: string[], ignorePattern: string[] = []): string[] {
    if (!fs.existsSync(root)) {
      return [];
    }

    function listFiles(dir: string): string[] {
      const files: string[] = [];

      const entries = fs.readdirSync(dir, {withFileTypes: true});
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...listFiles(entryPath));
        } else if (entry.isFile()) {
          // We add the file relative to the root as otherwise the patterns wouldn't work
          files.push(path.relative(root, entryPath));
        }
      }

      return files;
    }

    let files = listFiles(root);
    files = files.filter(f => pattern.some(p => minimatch(f, p,{dot: true, matchBase: true})))
    for (const p of ignorePattern) {
      files = files.filter(minimatch.filter(`!${p}`, {dot: true, matchBase: true}));
    }

    return files;
  }

  abstract parseTests(): TestFiles;

  protected parseTestOfType(
    testFolder: string,
    specPattern: string | string[],
    excludeSpecPattern?: string | string[]
  ): string[] {
    let filePatterns;
    if (Array.isArray(specPattern)) {
      filePatterns = specPattern;
    } else {
      filePatterns = [specPattern];
    }
    let ignoreFilePatterns;
    if (excludeSpecPattern) {
      if (Array.isArray(excludeSpecPattern)) {
        ignoreFilePatterns = excludeSpecPattern;
      } else {
        ignoreFilePatterns = [excludeSpecPattern];
      }
    }
    const files = CypressBaseConfigParser.glob(path.join(this.workingDirectory, testFolder), filePatterns, ignoreFilePatterns);

    return files.map(f => path.join(testFolder, f));
  }
}
