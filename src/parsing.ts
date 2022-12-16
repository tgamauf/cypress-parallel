import {getBooleanInput, getInput, info, notice, setFailed, setOutput,} from "@actions/core";

import {Config} from "./types";
import {CypressJSConfigParser, CypressTSConfigParser} from "./cypressConfigParser";
import CypressBaseConfigParser from "./cypressBaseConfigParser";
import Cypress9ConfigParser from "./cypress9ConfigParser";


async function parserFactory(config: Config): Promise<CypressBaseConfigParser | null> {
  if (await CypressTSConfigParser.hasConfigFile(config.workingDirectory)) {
    return new CypressTSConfigParser(config);
  } else if (await CypressJSConfigParser.hasConfigFile(config.workingDirectory)) {
    return new CypressJSConfigParser(config);
  } else if (await Cypress9ConfigParser.hasConfigFile(config.workingDirectory)) {
    return new Cypress9ConfigParser(config);
  } else {
    return null;
  }
}

export default async function parse(): Promise<void> {
  const config: Config = {
    workingDirectory: getInput("working-directory"),
    countRunners: Number(getInput("count-runners"))
  };

  try {
    info(`Configuration: ${JSON.stringify(config, null, 2)}`);

    const parser = await parserFactory(config);
    if (!parser) {
      setFailed("No supported Cypress config file found.");
      return;
    }

    const {integrationTests, componentTests} = await parser.parseTests();

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
