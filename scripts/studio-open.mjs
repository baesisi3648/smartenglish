// 바탕화면 아이콘(studio-launch.cmd)에서 호출:
//   1) 처음이면 npm install  2) 서버가 꺼져 있으면 최소화 창으로 켜기  3) 준비되면 브라우저 열기
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureInstalled } from "./ensure-installed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = "http://localhost:3456/studio";
const isWin = process.platform === "win32";

async function isUp() {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "manual" });
    return res.status > 0;
  } catch {
    return false;
  }
}

function openBrowser() {
  if (isWin) spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

if (!ensureInstalled(root)) process.exit(1);

if (!(await isUp())) {
  console.log("  스튜디오 서버를 켜는 중입니다. 처음에는 1분 정도 걸릴 수 있어요...");
  if (isWin) {
    // 서버는 별도 최소화 창에서 계속 실행 (그 창을 닫으면 스튜디오가 꺼짐)
    spawn("cmd.exe", ["/c", "start", '"블로그 스튜디오 서버"', "/min", "cmd", "/c", "npm run studio"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: true,
    }).unref();
  } else {
    spawn("npm", ["run", "studio"], { cwd: root, detached: true, stdio: "ignore" }).unref();
  }
  let ready = false;
  for (let i = 0; i < 180 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    ready = await isUp();
  }
  if (!ready) {
    console.error("  ❌ 서버가 3분 안에 켜지지 않았습니다. 작업표시줄의 '블로그 스튜디오 서버' 창을 확인해 주세요.");
    process.exit(1);
  }
}

openBrowser();
