import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configPath = path.join(root, 'capacitor.config.ts');
const config = fs.readFileSync(configPath, 'utf8');
const appIdMatch = config.match(/appId\s*:\s*['\"]([^'\"]+)['\"]/);
if (!appIdMatch) throw new Error('Could not read appId from capacitor.config.ts');
const appId = appIdMatch[1];
const expected = 'com.base6a3f3ae0473f4e5dce013c32.app.geofencepoc';
if (appId !== expected) throw new Error(`Refusing to build POC with unexpected appId: ${appId}`);

const android = path.join(root, 'android');
if (!fs.existsSync(android)) throw new Error('android/ does not exist. Run npx cap add android first.');

const javaDir = path.join(android, 'app', 'src', 'main', 'java', ...appId.split('.'));
fs.mkdirSync(javaDir, { recursive: true });

for (const name of ['MainActivity.java', 'GeofencePlugin.java', 'GeofenceBroadcastReceiver.java', 'GeofenceEventStore.java']) {
  const tmplPath = path.join(root, 'native-poc', 'android', `${name}.tmpl`);
  const outPath = path.join(javaDir, name);
  const content = fs.readFileSync(tmplPath, 'utf8').replaceAll('__PACKAGE__', appId);
  fs.writeFileSync(outPath, content);
}

const manifestPath = path.join(android, 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const permissions = [
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />',
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
];
for (const permission of permissions) {
  if (!manifest.includes(permission)) manifest = manifest.replace('<application', `    ${permission}\n\n    <application`);
}
const receiver = '        <receiver android:name=".GeofenceBroadcastReceiver" android:exported="false" />';
if (!manifest.includes('GeofenceBroadcastReceiver')) {
  manifest = manifest.replace('</application>', `${receiver}\n    </application>`);
}
fs.writeFileSync(manifestPath, manifest);

const gradlePath = path.join(android, 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
const locationDependency = "    implementation 'com.google.android.gms:play-services-location:21.3.0'";
if (!gradle.includes('play-services-location')) {
  const marker = /dependencies\s*\{/;
  if (!marker.test(gradle)) throw new Error('Could not locate dependencies block in android/app/build.gradle');
  gradle = gradle.replace(marker, `dependencies {\n${locationDependency}`);
}
// Keep the POC install identity/version explicit and reproducible.
if (!gradle.includes('versionCode 310')) {
  gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 310');
}
if (!gradle.includes('versionName \"3.1.0-geofence-poc\"')) {
  gradle = gradle.replace(/versionName\s+\"[^\"]+\"/, 'versionName \"3.1.0-geofence-poc\"');
}
fs.writeFileSync(gradlePath, gradle);

console.log(`Installed BoriSend Android geofence POC for ${appId}`);
console.log('Native behavior: OS geofence transitions, queued events, app-private live broadcast, no continuous GPS.');
