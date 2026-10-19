#!/usr/bin/env bash
# Télécharge le modèle de pose MediaPipe (≈5,5 Mo) dans www/models pour un fonctionnement hors ligne.
set -e
mkdir -p www/models
URL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
curl -fsSL "$URL" -o www/models/pose_landmarker_lite.task
echo "Modèle téléchargé : $(du -h www/models/pose_landmarker_lite.task | cut -f1)"
