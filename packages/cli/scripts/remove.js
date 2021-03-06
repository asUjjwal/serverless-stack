"use strict";

const path = require("path");
const chalk = require("chalk");
const { logger } = require("@serverless-stack/core");

const paths = require("./util/paths");
const { synth, parallelDestroy, destroy: cdkDestroy } = require("./util/cdkHelpers");

module.exports = async function (argv, config, cliInfo) {

  ////////////////////////
  // Remove debug stack //
  ////////////////////////

  const stackName = `${config.stage}-${config.name}-debug-stack`;
  logger.info(chalk.grey("Removing " + stackName + " stack"));
  const debugAppArgs = [stackName, config.stage, config.region];
  // Note: When deploying the debug stack, the current working directory is user's app.
  //       Setting the current working directory to debug stack cdk app directory to allow
  //       Lambda Function construct be able to reference code with relative path.
  process.chdir(path.join(paths.ownPath, "assets", "debug-stack"));
  await cdkDestroy({
    ...cliInfo.cdkOptions,
    app: `node bin/index.js ${debugAppArgs.join(" ")}`,
    output: "cdk.out",
  });
  // Note: Restore working directory
  process.chdir(paths.appPath);

  ////////////////
  // Remove app //
  ////////////////

  logger.info(chalk.grey("Removing " + (argv.stack ? argv.stack : "stacks")));

  // Build
  await synth(cliInfo.cdkOptions);

  // Loop until remove is complete
  let stackStates;
  let isCompleted;
  do {
    // Update remove status
    const response = await parallelDestroy({
      ...cliInfo.cdkOptions,
      stackName: argv.stack,
      cdkOutputPath: path.join(paths.appPath, paths.appBuildDir, "cdk.out"),
    }, stackStates);
    stackStates = response.stackStates;
    isCompleted = response.isCompleted;

    // Wait for 5 seconds
    if (!isCompleted) {
      logger.info("Checking remove status...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } while (!isCompleted);

  // Print remove result
  stackStates.forEach(({ name, status, errorMessage }) => {
    logger.info(`\nStack ${name}`);
    logger.info(`  Status: ${formatStackStatus(status)}`);
    if (errorMessage) {
      logger.info(`  Error: ${errorMessage}`);
    }
  });
  logger.info("");

  return stackStates.map((stackState) => ({
    name: stackState.name,
    status: stackState.status,
  }));
};

function formatStackStatus(status) {
  return {
    succeeded: "removed",
    failed: "failed",
    skipped: "not removed",
  }[status];
}
