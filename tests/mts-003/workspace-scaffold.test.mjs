import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const expectedWorkspaces = [
  'apps/mobile',
  'apps/api',
  'apps/worker',
  'packages/domain',
  'packages/contracts',
  'packages/database',
  'packages/localization',
  'packages/testing',
  'packages/config',
  'packages/design-tokens',
];

const forbiddenDomainImports = [
  'react',
  'react-native',
  'expo',
  'fastify',
  'drizzle',
  '@azure/',
  '@google/',
  'googleapis',
  '@apple/',
  'openai',
];

function collectSourceFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolute);
    return /\.(?:ts|tsx|mts|cts)$/.test(entry.name) ? [absolute] : [];
  });
}

function collectImportSpecifiers(source) {
  const importPattern =
    /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

  return [...source.matchAll(importPattern)].map((match) => match[1].toLowerCase());
}

function isForbiddenDomainImport(specifier, forbiddenImport) {
  if (forbiddenImport.endsWith('/')) return specifier.startsWith(forbiddenImport);

  if (specifier === forbiddenImport || specifier.startsWith(`${forbiddenImport}/`)) return true;

  if (forbiddenImport === 'expo') return specifier.startsWith('expo-');
  if (forbiddenImport === 'drizzle') return specifier.startsWith('drizzle-');

  return false;
}

test('workspace shells expose build and typecheck scripts', () => {
  for (const workspace of expectedWorkspaces) {
    const packageJsonPath = join(root, workspace, 'package.json');
    assert.equal(existsSync(packageJsonPath), true, `${workspace} package.json must exist`);

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    assert.equal(typeof packageJson.scripts?.build, 'string', `${workspace} must define build`);
    assert.equal(
      typeof packageJson.scripts?.typecheck,
      'string',
      `${workspace} must define typecheck`,
    );
  }
});

test('domain workspace contains no framework or provider imports', () => {
  const domainSource = join(root, 'packages', 'domain', 'src');
  assert.equal(existsSync(domainSource), true, 'packages/domain/src must exist');

  const sourceFiles = collectSourceFiles(domainSource);
  assert.ok(sourceFiles.length > 0, 'domain workspace must contain a source shell');

  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    const specifiers = collectImportSpecifiers(source);

    for (const specifier of specifiers) {
      for (const forbiddenImport of forbiddenDomainImports) {
        assert.equal(
          isForbiddenDomainImport(specifier, forbiddenImport),
          false,
          `${relative(root, file)} must not import ${specifier}`,
        );
      }
    }
  }
});

test('mobile route inventory exposes exactly the approved four root tabs', () => {
  const tabsDirectory = join(root, 'apps', 'mobile', 'app', '(tabs)');
  assert.equal(existsSync(tabsDirectory), true, 'Expo Router root tabs directory must exist');

  const routeFiles = readdirSync(tabsDirectory)
    .filter((name) => name.endsWith('.tsx') && name !== '_layout.tsx')
    .sort();

  assert.deepEqual(routeFiles, ['ai-planner.tsx', 'index.tsx', 'progress.tsx', 'settings.tsx']);

  const layoutPath = join(tabsDirectory, '_layout.tsx');
  assert.equal(existsSync(layoutPath), true, 'root tab layout must exist');
  const layoutSource = readFileSync(layoutPath, 'utf8');

  for (const title of ['Calendar', 'AI Planner', 'Progress', 'Settings']) {
    assert.match(layoutSource, new RegExp(`title:\\s*['\\"]${title}['\\"]`));
  }
});
