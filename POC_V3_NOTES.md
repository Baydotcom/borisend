# POC v3 changes

- Uses a distinct Android application ID ending in `.geofencepoc` to avoid any signing/package collision with Base44's installed app.
- Keeps the existing Base44 backend app ID through build-time Vite environment variables.
- Builds `assembleRelease` instead of `assembleDebug`.
- Creates an isolated POC signing key inside GitHub Actions. This key is disposable and must never be used for the production Play Store app.
- Verifies APK badging and APK Signature Scheme output before uploading the artifact.
- Retains native Android OS geofencing only; no continuous GPS tracking.
- Production BoriSend remains untouched.

## v3.1 security correction

- Signing passwords are no longer stored in workflow YAML or repository history.
- GitHub Actions generates random, masked signing credentials for each isolated POC build and exposes them only to that workflow run.
- The signing key remains disposable and is not a production/Play Store signing identity.
