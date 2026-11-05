#!/usr/bin/env bash
# Instala Android SDK cmdline-tools + platform 34 + build-tools para o APK
set -e
SDK=/home/z/android-sdk
mkdir -p "$SDK/cmdline-tools"
cd /tmp
echo "[sdk] baixando cmdline-tools…"
curl -sSLo cmdtools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -oq cmdtools.zip -d /tmp/ctools
mv /tmp/ctools/cmdline-tools "$SDK/cmdline-tools/latest"
export ANDROID_HOME="$SDK"
export PATH="$SDK/cmdline-tools/latest/bin:$PATH"
echo "[sdk] aceitando licenças…"
yes | sdkmanager --licenses > /dev/null 2>&1 || true
echo "[sdk] instalando platform-tools, android-34, build-tools 34…"
yes | sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /tmp/sdkmanager.log 2>&1
echo "[sdk] CONCLUÍDO"
ls "$SDK"
