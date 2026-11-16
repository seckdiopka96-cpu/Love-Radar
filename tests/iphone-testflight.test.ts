import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";

const script="scripts/prepare-testflight.mjs";
const workflow=readFileSync(".github/workflows/iphone-testflight.yml","utf8");
const prepare=readFileSync(script,"utf8");

test("iPhone app uses the stable Love Radar native bundle ID, not a Safari wrapper",()=>{
 const config=readFileSync("capacitor.config.ts","utf8");
 assert.ok(config.includes('appId:"com.diaotech.loveradar"'));
 assert.ok(config.includes('webDir:"dist"'));
 assert.ok(!config.includes("url:\"https://"),"native app must bundle its own Vite UI");
 assert.ok(workflow.includes("npx cap add ios --packagemanager SPM"));
 assert.ok(workflow.includes("node scripts/configure-native.mjs ios"));
 assert.ok(workflow.includes("npx cap sync ios"));
});
test("TestFlight export is valid for the distribution profile, with no secrets embedded",()=>{
 const result=spawnSync(process.execPath,[script,"--dry-run"],{
  encoding:"utf8",env:{...process.env,APPSTORE_TEAM_ID:"ABCDEF1234"}
 });
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/com\.diaotech\.loveradar/);
 const invalid=spawnSync(process.execPath,[script,"--dry-run"],{
  encoding:"utf8",env:{...process.env,APPSTORE_TEAM_ID:"WRONG"}
 });
 assert.notEqual(invalid.status,0,"missing or invalid Apple Team ID must fail");
 assert.ok(prepare.includes("<string>app-store-connect</string>"));
 assert.ok(prepare.includes("<string>manual</string>"));
 assert.ok(prepare.includes("<string>Apple Distribution</string>"));
 assert.ok(prepare.includes("manageAppVersionAndBuildNumber"));
 assert.ok(prepare.includes("sips"));
 assert.ok(prepare.includes("AppIcon-1024.png"));
 assert.ok(!prepare.includes("AuthKey_"),"No auth private key may be bundled into app icon tooling");
});
test("TestFlight workflow is manual, uses Apple secrets and never publishes signing credentials",()=>{
 assert.ok(workflow.includes("workflow_dispatch:"));
 assert.ok(!workflow.includes("\n  push:"));
 assert.ok(!workflow.includes("\n  pull_request:"));
 assert.ok(workflow.includes("if: github.ref == 'refs/heads/main'"));
 assert.ok(workflow.includes("mode == 'testflight'"));
 assert.ok(workflow.includes("mode == 'simulateur'"));
 assert.ok(workflow.includes("secrets.APPSTORE_API_PRIVATE_KEY"));
 assert.ok(workflow.includes("secrets.APPSTORE_CERTIFICATES_FILE_BASE64"));
 assert.ok(workflow.includes("secrets.APPSTORE_CERTIFICATES_PASSWORD"));
 assert.ok(workflow.includes("vars.APPSTORE_TEAM_ID"));
 assert.ok(workflow.includes("Apple-Actions/import-codesign-certs@v7"));
 assert.ok(workflow.includes("Apple-Actions/download-provisioning-profiles@v7"));
 assert.ok(workflow.includes("Apple-Actions/upload-testflight-build@v5"));
 assert.ok(workflow.includes("profile-type: IOS_APP_STORE"));
 assert.ok(workflow.includes("CODE_SIGN_STYLE=Manual"));
 assert.ok(workflow.includes("CODE_SIGN_IDENTITY='Apple Distribution'"));
 assert.ok(workflow.includes("CURRENT_PROJECT_VERSION="));
 assert.ok(workflow.includes("xcodebuild -exportArchive"));
 assert.ok(workflow.includes("wait-for-processing: 'false'"));
 assert.ok(workflow.includes("name: love-radar-iphone-simulator"));
 assert.ok(!workflow.includes("name: love-radar-testflight-signed-ipa"),
  "Signed IPA is uploaded directly to Apple, not exposed as a downloadable public artifact");
});
test("the iPhone deployment checklist describes Apple prerequisites and honest limitations",()=>{
 const guide=readFileSync("docs/TESTFLIGHT-IPHONE.md","utf8");
 for(const piece of ["99","com.diaotech.loveradar","APPSTORE_ISSUER_ID",
  "APPSTORE_API_KEY_ID","APPSTORE_TEAM_ID","APPSTORE_API_PRIVATE_KEY",
  "APPSTORE_CERTIFICATES_FILE_BASE64","APPSTORE_CERTIFICATES_PASSWORD",
  "TestFlight","iPhone","GitHub Actions"])
  assert.ok(guide.includes(piece),"Documentation missing "+piece);
 assert.ok(guide.includes("CallKit"));
 assert.ok(guide.includes("PushKit"));
 assert.ok(guide.includes("Apple Developer"));
});
