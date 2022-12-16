import path from "path";
import {mkdirSync, mkdtempSync, writeFileSync} from "fs";
import {getInput, setFailed, setOutput} from "@actions/core";
import {tmpdir} from "os";


const mockGetInput = getInput as jest.MockedFunction<typeof getInput>;
const mockSetFailed = setFailed as jest.MockedFunction<typeof setFailed>;
const mockSetOutput = setOutput as jest.MockedFunction<typeof setOutput>;

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

function getTestDir(): string {
  const tmpRoot = process.platform !== "darwin" ? tmpdir() : path.join("/private", tmpdir());
  // Setup temporary test directory and set it as our working directory
  return mkdtempSync(path.join(tmpRoot, "cypress-parallel_"));
}

export {
  createTestSpecs,
  getTestDir,
  mockGetInput,
  mockSetFailed,
  mockSetOutput
}
