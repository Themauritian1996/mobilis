#!/usr/bin/env bash
# Crée le projet Android (android/, non versionné) et applique les réglages de Mobilis : permissions caméra/micro,
# retour de la connexion Google (ca.mobilis.app://auth), icônes. Copie conforme des étapes de .github/workflows/android.yml
# (CI de main), factorisée pour la CI de dev-v2. Prérequis : `npm run build` (webDir = dist).
set -euo pipefail
npx cap add android
M=android/app/src/main/AndroidManifest.xml
sed -i 's#</manifest>#    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>#' "$M"
sed -i '0,/<\/activity>/s##    <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="ca.mobilis.app" />\n            </intent-filter>\n        </activity>#' "$M"
for d in brand/android/mipmap-*; do cp -f "$d"/*.png "android/app/src/main/res/$(basename "$d")/"; done
f=android/app/src/main/res/values/ic_launcher_background.xml
if [ -f "$f" ]; then sed -i 's#<color name="ic_launcher_background">[^<]*</color>#<color name="ic_launcher_background">\#2747D4</color>#' "$f"; fi
echo "Projet Android prêt."
