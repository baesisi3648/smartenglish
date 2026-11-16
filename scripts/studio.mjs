// 원장 PC에서 블로그 스튜디오 실행: npm run studio → http://localhost:3456/studio
import { spawn } from "node:child_process";

const port = process.env.PORT || "3456";
const child = spawn("npx", ["next", "dev", "-p", port, "-H", "127.0.0.1"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, STUDIO_ENABLED: "1" },
});
console.log(`\n  ✍️  블로그 스튜디오: http://localhost:${port}/studio\n`);
child.on("exit", (code) => process.exit(code ?? 0));
