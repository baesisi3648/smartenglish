// 원장님 PC 최초 설정: npm run studio:setup
//  1) 관리자 비밀번호 생성 → web/.env.local (git 제외 파일)
//  2) 바탕화면에 '블로그 스튜디오' 실행 아이콘 생성 (Windows)
// 비밀번호를 직접 정하려면: npm run studio:setup -- --password 원하는비밀번호
// --first-run ('처음 설정.cmd'에서 호출): 프로그램 자동 설치 + 끝에 AI 구독 로그인 안내까지
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { ensureInstalled } from "./ensure-installed.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const firstRun = process.argv.includes("--first-run");

// 0) 필요한 프로그램 (처음 설정에서만; studio:setup 단독 실행은 기존처럼 설치 생략)
if (firstRun && !ensureInstalled(root)) process.exit(1);

// 1) 비밀번호
const argIdx = process.argv.indexOf("--password");
const given = argIdx > -1 ? process.argv[argIdx + 1] : undefined;
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const has = /^STUDIO_PASSWORD=.+$/m.test(env);

if (given && given.length < 8) {
  console.error("비밀번호는 8자 이상이어야 합니다.");
  process.exit(1);
}
// .env 파서가 #(주석), $(변수 확장), 따옴표, 공백, 역슬래시를 다르게 해석하므로 허용 문자만 받는다
if (given && !/^[A-Za-z0-9!@%^&*_+=.,:~-]+$/.test(given)) {
  console.error("비밀번호에는 영문·숫자와 ! @ % ^ & * _ + = . , : ~ - 만 쓸 수 있습니다 (#, $, 따옴표, 공백 불가).");
  process.exit(1);
}

if (given || !has) {
  // 헷갈리는 문자(0/O, 1/l/I) 제외
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const pw = given ?? Array.from({ length: 12 }, () => chars[randomInt(chars.length)]).join("").replace(/(.{4})(?!$)/g, "$1-");
  env = env.replace(/^STUDIO_PASSWORD=.*\n?/m, "");
  env = `${env.trimEnd()}${env.trim() ? "\n" : ""}STUDIO_PASSWORD=${pw}\n`;
  writeFileSync(envPath, env, "utf8");
  console.log("\n  🔑 관리자 비밀번호를 설정했습니다 (web/.env.local)");
  console.log(`     비밀번호: ${pw}`);
  console.log("     → 잊지 않게 메모해 두세요. 배포 사이트에서도 쓰려면 Vercel 환경변수 STUDIO_PASSWORD 에 같은 값을 넣으세요.\n");
  // 화면 기록에 비밀번호가 남지 않도록, 메모했다고 확인하면 화면을 지운다 (대화형 실행일 때만)
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question("  메모했으면 Enter 를 누르세요 (화면에서 비밀번호를 지웁니다) ");
    rl.close();
    console.clear();
    console.log("\n  🔑 관리자 비밀번호 설정 완료 (화면에서 지웠습니다)\n");
  }
} else {
  console.log("\n  🔑 관리자 비밀번호가 이미 설정되어 있습니다 (web/.env.local). 바꾸려면 --password 옵션을 쓰세요.\n");
}

// 1-2) 로그인 쿠키 서명키 (비밀번호와 독립된 32자 이상 무작위 값, 화면에 표시하지 않음)
env = readFileSync(envPath, "utf8");
if (!/^STUDIO_SECRET=[A-Za-z0-9_-]{32,}\r?$/m.test(env)) {
  env = env.replace(/^STUDIO_SECRET=.*\r?\n?/m, "");
  env = `${env.trimEnd()}${env.trim() ? "\n" : ""}STUDIO_SECRET=${randomBytes(36).toString("base64url")}\n`;
  writeFileSync(envPath, env, "utf8");
  console.log("  🔐 로그인 서명키(STUDIO_SECRET)를 만들었습니다.\n");
}

// 2) 바탕화면 바로가기 (Windows)
if (process.platform === "win32") {
  const target = path.join(root, "scripts", "studio-launch.cmd");
  const ps = `
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '블로그 스튜디오.lnk'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = '${target.replace(/'/g, "''")}'
$s.WorkingDirectory = '${root.replace(/'/g, "''")}'
$s.WindowStyle = 1  # 일반 창: 첫 설치 진행/안내 문구가 보이도록 (브라우저가 열리면 자동으로 닫힘)
$s.Description = '스마트해법영어 백운밸리점 블로그 스튜디오'
$s.Save()
Write-Output $lnk
`;
  const dir = mkdtempSync(path.join(tmpdir(), "hb-setup-"));
  const file = path.join(dir, "shortcut.ps1");
  writeFileSync(file, "﻿" + ps, "utf8"); // PowerShell 5.1 한글 처리를 위해 BOM
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file], {
      encoding: "utf8",
    });
    console.log(`  🖥️  바탕화면 아이콘 생성: ${out.trim()}`);
    console.log("     → 더블클릭하면 스튜디오가 켜지고 브라우저가 열립니다.\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else {
  console.log("  (Windows가 아니므로 바탕화면 아이콘은 만들지 않았습니다. `npm run studio` 로 실행하세요.)\n");
}

// 3) AI 구독 로그인 (처음 설정에서만)
// Gemini 개인 계정 로그인은 Google이 Gemini CLI 지원을 중단해 제외 (2026-11 확인:
// "This client is no longer supported for Gemini Code Assist for individuals")
if (firstRun) {
  const LOGINS = {
    1: { name: "ChatGPT (Plus/Pro 구독)", cmd: "npx -y @openai/codex login", tip: "브라우저에서 ChatGPT 계정으로 로그인하면 자동으로 끝납니다." },
    2: { name: "Claude (Pro/Max 구독)", cmd: "npx -y @anthropic-ai/claude-code", tip: "화면이 열리면 /login 입력 → 브라우저에서 승인 → 끝나면 /exit 입력." },
  };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("  글을 써 줄 AI에 구독 계정으로 로그인합니다 (이미 했다면 건너뛰세요).");
  console.log("   1) ChatGPT   2) Claude   Enter) 건너뛰기");
  const pick = LOGINS[(await rl.question("  번호를 고르세요: ")).trim()];
  rl.close();
  if (pick) {
    console.log(`\n  ${pick.name} 로그인: ${pick.tip}\n`);
    spawnSync(pick.cmd, { cwd: tmpdir(), stdio: "inherit", shell: true });
  } else {
    console.log("  나중에 하려면 README의 'AI 로그인' 표를 참고하세요.\n");
  }
  console.log("\n  🎉 설정 끝! 바탕화면 '블로그 스튜디오' 아이콘을 더블클릭하세요.\n");
}
