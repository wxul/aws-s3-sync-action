import { createHash } from "etag-hash";
import { resolve, join } from "path";
import { readdirSync, statSync, existsSync } from "fs";

export function getEtag(buffer: Buffer) {
  return createHash().update(buffer).digest();
}

const BlockFiles = [".DS_Store"];
function readFiles(
  base: string,
  dir: string,
  operation?: (filename: string, dir: string) => void
) {
  const basepath = resolve(base, dir);
  const list = readdirSync(basepath);

  for (let index = 0; index < list.length; index++) {
    const name = list[index];
    const filepath = resolve(base, dir, name);
    if (statSync(filepath).isDirectory()) {
      readFiles(base, join(dir, name), operation);
    } else {
      if (typeof operation === "function" && !BlockFiles.includes(name))
        operation(name, dir);
    }
  }
}

export function getFiles(base: string) {
  let fileList: [string, string][] = [];
  readFiles(base, "", (filename, dir) => {
    fileList.push([filename, dir]);
  });
  return fileList;
}

export function getTotalCount(base: string) {
  let total = 0;
  readFiles(base, "", () => {
    total++;
  });
  return total;
}

export function checkFiles(base: string) {
  if (!existsSync(base)) {
    throw new Error(`Path ${base} not existed!`);
  }
  return true;
}

export function encodeUrl(str: string) {
  return str.replace(/[~]/gi, "%7E");
}

export function convertPath(str: string) {
  return str.replace(/\\/g, "/");
}

export function toPosixPath(pth: string): string {
  return pth.replace(/[\\]/g, "/");
}
