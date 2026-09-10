import fs from 'node:fs';
import path from 'node:path';

const gradlePath = path.join(process.cwd(), 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');

if (!gradle.includes('BORISEND_POC_KEYSTORE')) {
  const androidBlock = /android\s*\{/;
  if (!androidBlock.test(gradle)) throw new Error('android block not found in app/build.gradle');
  gradle = gradle.replace(androidBlock, `android {\n    signingConfigs {\n        pocRelease {\n            storeFile file(System.getenv('BORISEND_POC_KEYSTORE'))\n            storePassword System.getenv('BORISEND_POC_STORE_PASSWORD')\n            keyAlias System.getenv('BORISEND_POC_KEY_ALIAS')\n            keyPassword System.getenv('BORISEND_POC_KEY_PASSWORD')\n            enableV1Signing true\n            enableV2Signing true\n        }\n    }`);

  const releaseBlock = /release\s*\{/;
  if (!releaseBlock.test(gradle)) throw new Error('release buildType not found in app/build.gradle');
  gradle = gradle.replace(releaseBlock, `release {\n            signingConfig signingConfigs.pocRelease`);
}

fs.writeFileSync(gradlePath, gradle);
console.log('Configured explicit signed release APK for isolated geofence POC.');
