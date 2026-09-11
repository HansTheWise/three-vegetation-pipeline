import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'vegetation-package-'));
const consumerRoot = join(temporaryRoot, 'consumer');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required to run the package smoke test.');

try {
  cpSync(join(repositoryRoot, 'tests', 'package-consumer'), consumerRoot, { recursive: true });
  const packResult = JSON.parse(runNpm(['pack', '--json', '--pack-destination', temporaryRoot]));
  const packagedFiles = packResult[0].files.map((file) => file.path);
  if (packagedFiles.some((path) => /campus|i-caka/i.test(path))) {
    throw new Error('Package archive contains a project-specific file.');
  }
  const packageArchive = join(temporaryRoot, packResult[0].filename);
  const threeArchive = packDependency('three');
  const threeTypesArchive = packDependency(join('@types', 'three'));
  runNpm([
    'install',
    '--ignore-scripts',
    '--no-package-lock',
    packageArchive,
    threeArchive,
    threeTypesArchive,
  ], consumerRoot);

  runNode([
    join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--project',
    join(consumerRoot, 'tsconfig.json'),
  ], consumerRoot);
  runNode([
    join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build',
  ], consumerRoot);
  runNode([
    join(consumerRoot, 'node_modules', 'three-vegetation-pipeline', 'tooling', 'veg-compile.mjs'),
    '--help',
  ], consumerRoot);
  verifyTypeScriptConfigImport();

  process.stdout.write('Package smoke test passed.\n');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function runNpm(arguments_, cwd = repositoryRoot) {
  return execFileSync(process.execPath, [npmCli, ...arguments_], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function runNode(arguments_, cwd) {
  execFileSync(process.execPath, arguments_, { cwd, stdio: 'inherit' });
}

function packDependency(path) {
  const result = JSON.parse(runNpm(
    ['pack', '--json', '--pack-destination', temporaryRoot],
    join(repositoryRoot, 'node_modules', path),
  ));
  return join(temporaryRoot, result[0].filename);
}

function verifyTypeScriptConfigImport() {
  const result = spawnSync(process.execPath, [
    join(consumerRoot, 'node_modules', 'three-vegetation-pipeline', 'tooling', 'veg-compile.mjs'),
    '--config',
    join(consumerRoot, 'compiler.config.ts'),
  ], { cwd: consumerRoot, encoding: 'utf8' });
  if (result.status !== 1 || !result.stderr.includes('Missing required argument "--input"')) {
    throw new Error(`CLI did not import an erasable TypeScript config:\n${result.stderr}`);
  }
}
