#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function parsePatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) {
    throw new Error(
      `Unsupported version format "${version}". Expected semver like "0.1.0" for automatic patch bumps.`
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

const packageJsonPath = resolve(process.cwd(), "package.json");
const packageLockPath = resolve(process.cwd(), "package-lock.json");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const currentVersion = String(packageJson.version ?? "");
const parsed = parsePatchVersion(currentVersion);
const nextVersion = `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;

packageJson.version = nextVersion;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

if (existsSync(packageLockPath)) {
  const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
  packageLock.version = nextVersion;
  if (packageLock.packages && packageLock.packages[""]) {
    packageLock.packages[""].version = nextVersion;
  }
  writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8");
}

console.log(`[version] ${currentVersion} -> ${nextVersion}`);
