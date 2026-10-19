#!/usr/bin/env bash
# Regénère les librairies incluses dans www/vendor (Firebase + MediaPipe). Utile seulement pour les mettre à jour.
set -e
npx esbuild scripts/firebase-entry.js --bundle --format=esm --minify --outfile=www/vendor/firebase.js
mkdir -p www/vendor/mediapipe/wasm
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs www/vendor/mediapipe/
cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.* www/vendor/mediapipe/wasm/
echo "Librairies à jour."
