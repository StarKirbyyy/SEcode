import { runTerminalMain } from "@/lib/terminal";

runTerminalMain({ argv: process.argv.slice(2), environment: process.env })
  .then((result) => {
    process.exitCode = result.exitCode;
  })
  .catch(() => {
    process.stderr.write("TERMINAL_INTERNAL_ERROR: 终端启动失败\n");
    process.exitCode = 1;
  });
