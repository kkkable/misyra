import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { readText, repoRoot } from "../toolchain/helpers.mjs";

const updaterWorkflowPath = join(repoRoot, ".github", "workflows", "update-image-baselines.yml");

test("the explicit image-baseline updater is runnable before merge without normal CI writes", () => {
  const source = readText(updaterWorkflowPath);

  assert.match(
    source,
    /^\s{2}workflow_dispatch:\s*$/m,
    "the updater must retain its normal explicit workflow_dispatch entry point once it reaches main",
  );
  assert.match(
    source,
    /^\s{2}pull_request_review:\s*$/m,
    "the branch-only updater needs an explicit pre-merge review-command entry point",
  );
  assert.match(
    source,
    /^\s{4}types:\s*\[submitted\]\s*$/m,
    "only submitted PR reviews may invoke the pre-merge updater path",
  );
  assert.match(
    source,
    /github\.event\.review\.body\s*==\s*['"]\/update-image-baselines['"]/,
    "the pre-merge updater must require the exact /update-image-baselines review command",
  );
  assert.match(
    source,
    /github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/,
    "the review-command updater must refuse forked PR code",
  );
  assert.match(
    source,
    /github\.event\.review\.author_association/,
    "the review-command updater must gate the command to a trusted repository association",
  );
  assert.doesNotMatch(
    source,
    /^\s{2}(?:push|pull_request):\s*$/m,
    "the baseline writer must never become a normal push/pull_request CI path",
  );
});
