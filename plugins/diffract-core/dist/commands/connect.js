"use strict";
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
Object.defineProperty(exports, "__esModule", { value: true });
exports.cliConnect = cliConnect;
const node_child_process_1 = require("node:child_process");
async function cliConnect(opts) {
    const { sandbox: sandboxName, logger } = opts;
    logger.info(`Connecting to Diffract sandbox: ${sandboxName}`);
    logger.info("You will be inside the sandbox. Run 'diffract' commands normally.");
    logger.info("Type 'exit' to return to your host shell.");
    logger.info("");
    const exitCode = await new Promise((resolve) => {
        const proc = (0, node_child_process_1.spawn)("diffract", ["sandbox", "connect", sandboxName], {
            stdio: "inherit",
        });
        proc.on("close", resolve);
        proc.on("error", (err) => {
            if (err.message.includes("ENOENT")) {
                logger.error("diffract CLI not found. Is Diffract installed?");
            }
            else {
                logger.error(`Connection failed: ${err.message}`);
            }
            resolve(1);
        });
    });
    if (exitCode !== 0 && exitCode !== null) {
        logger.error(`Sandbox '${sandboxName}' exited with code ${String(exitCode)}.`);
        logger.info("Run 'diffract nemoclaw status' to check available sandboxes.");
    }
}
//# sourceMappingURL=connect.js.map