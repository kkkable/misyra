/**
 * Runtime proof that a public package import through declared exports works.
 *
 * Importing `@misyra/toolchain-fixture` resolves through its exports map to
 * the built dist/ entry point, which itself imports @misyra/test-config
 * through that package's public exports. Builds the fixture first when the
 * dist/ output is missing so the proof also works on clean checkouts.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!existsSync(join(packageDir, "dist", "index.js"))) {
  const result = spawnSync(
    process.execPath,
    [join(packageDir, "scripts", "build.mjs"), "--skip-proof"],
    { cwd: packageDir, encoding: "utf8", stdio: "inherit" },
  );
  if (result.status !== 0) {
    process.stderr.write(
      "public import proof failed: toolchain-fixture build did not emit dist/\n",
    );
    process.exit(result.status ?? 1);
  }
}

// Keep the specifier opaque to the type checker so the generated dist/
// artifacts are never pulled into repository-wide typechecking. At runtime
// this remains a genuine public ESM import through the package exports map.
const publicSpecifier = "@misyra/toolchain-fixture";
const { toolchainFixture } = await import(publicSpecifier);

if (toolchainFixture?.name !== "@misyra/toolchain-fixture") {
  const payload = JSON.stringify(toolchainFixture);
  process.stderr.write(`public import proof failed: unexpected fixture payload: ${payload}\n`);
  process.exit(1);
}
process.stdout.write("public import ok\n");
