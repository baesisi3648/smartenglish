// 원장 PC에서 블로그 스튜디오 실행: npm run studio → http://localhost:3456/studio
// 처음 실행(node_modules 없음)이면 npm install을 먼저 한다.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureInstalled } from "./ensure-installed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!ensureInstalled(root)) process.exit(1);

const port = String(Number(process.env.PORT) || 3456); // 숫자만 허용 (shell 문자열에 들어감)
const child = spawn(`npx next dev -p ${port} -H 127.0.0.1`, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  // 항상 127.0.0.1(이 PC 안)에만 연다 → STUDIO_LOOPBACK=1 일 때만 ChatGPT·Claude(ACP)가 켜짐
  env: { ...process.env, STUDIO_ENABLED: "1", STUDIO_LOOPBACK: "1" },
});
console.log(`\n  ✍️  블로그 스튜디오: http://localhost:${port}/studio\n`);
child.on("exit", (code) => process.exit(code ?? 0));
