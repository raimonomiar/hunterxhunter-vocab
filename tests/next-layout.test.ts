import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("root layout typechecks before Next generates route helpers", () => {
  const nextDirectory = path.resolve(".next");
  const backupDirectory = path.resolve(`.next-typecheck-test-${process.pid}`);
  const hadGeneratedTypes = fs.existsSync(nextDirectory);

  if (hadGeneratedTypes) {
    if (fs.existsSync(backupDirectory)) {
      throw new Error(`Refusing to overwrite ${backupDirectory}`);
    }
    fs.renameSync(nextDirectory, backupDirectory);
  }

  try {
    execFileSync("npm", ["run", "typecheck"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
  } finally {
    if (hadGeneratedTypes) {
      fs.renameSync(backupDirectory, nextDirectory);
    }
  }
});
