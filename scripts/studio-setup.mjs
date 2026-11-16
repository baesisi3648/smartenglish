// 원장님 PC 최초 설정: npm run studio:setup
//  1) 관리자 비밀번호 생성 → web/.env.local (git 제외 파일)
//  2) 바탕화면에 '블로그 스튜디오' 실행 아이콘 생성 (Windows)
// 비밀번호를 직접 정하려면: npm run studio:setup -- --password 원하는비밀번호
import { randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

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
} else {
  console.log("\n  🔑 관리자 비밀번호가 이미 설정되어 있습니다 (web/.env.local). 바꾸려면 --password 옵션을 쓰세요.\n");
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
$s.WindowStyle = 7
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
