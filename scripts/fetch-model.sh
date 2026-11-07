#!/usr/bin/env bash
# Télécharge les modèles MediaPipe dans www/models pour un fonctionnement hors ligne :
#  - pose (corps entier, ≈5,5 Mo) ; - main (21 points, ≈7,5 Mo) pour les exercices du poignet, de la main et du pouce.
set -e
mkdir -p www/models
BASE="https://storage.googleapis.com/mediapipe-models"
curl -fsSL "$BASE/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task" -o www/models/pose_landmarker_lite.task
curl -fsSL "$BASE/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task" -o www/models/hand_landmarker.task
echo "Modèles téléchargés : $(du -h www/models/*.task | tr '\n' ' ')"
