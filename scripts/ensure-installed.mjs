// 처음 실행(node_modules 없음)이면 npm install. 성공하면 true.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export function ensureInstalled(root) {
  if (existsSync(path.join(root, "node_modules", "next", "package.json"))) return true;
  console.log("\n  📦 처음 실행이라 필요한 프로그램을 설치합니다 (몇 분 걸릴 수 있어요)...\n");
  // 인자를 고정 문자열 하나로 넘김 (Windows에서 npm.cmd 실행에 shell 필요)
  const r = spawnSync("npm install --no-audit --no-fund", { cwd: root, stdio: "inherit", shell: true });
  if (r.status === 0) return true;
  console.error("\n  ❌ 설치에 실패했습니다. 인터넷 연결을 확인하고 다시 실행해 주세요.\n");
  return false;
}
