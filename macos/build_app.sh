#!/bin/zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_BUNDLE="$ROOT_DIR/Museo.app"

echo "1. Generating Adobe-style Mu iconset..."
mkdir -p /tmp/swift-module-cache
swift -module-cache-path /tmp/swift-module-cache "$ROOT_DIR/macos/GenerateIcon.swift" "$ROOT_DIR"

echo "2. Building AppIcon.icns..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources/app"
iconutil -c icns "$ROOT_DIR/Museo.iconset" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
rm -rf "$ROOT_DIR/Museo.iconset"

echo "3. Compiling native macOS Museo binary..."
swiftc -O \
  -module-cache-path /tmp/swift-module-cache \
  -framework Cocoa \
  -framework WebKit \
  -framework UniformTypeIdentifiers \
  "$ROOT_DIR/macos/MuseoApp.swift" \
  -o "$APP_BUNDLE/Contents/MacOS/Museo"

echo "4. Packaging Info.plist and embedded web resources..."
cp "$ROOT_DIR/macos/Info.plist" "$APP_BUNDLE/Contents/Info.plist"
cp "$ROOT_DIR/index.html" "$APP_BUNDLE/Contents/Resources/app/index.html"
cp "$ROOT_DIR/server.py" "$APP_BUNDLE/Contents/Resources/app/server.py"
chmod +x "$APP_BUNDLE/Contents/Resources/app/server.py"
chmod +x "$ROOT_DIR/server.py"
rm -rf "$APP_BUNDLE/Contents/Resources/app/css" "$APP_BUNDLE/Contents/Resources/app/js" "$APP_BUNDLE/Contents/Resources/app/assets"
cp -R "$ROOT_DIR/css" "$APP_BUNDLE/Contents/Resources/app/css"
cp -R "$ROOT_DIR/js" "$APP_BUNDLE/Contents/Resources/app/js"
cp -R "$ROOT_DIR/assets" "$APP_BUNDLE/Contents/Resources/app/assets"

# Ad-hoc codesign so macOS Gatekeeper allows launching smoothly
codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null 2>&1 || true

echo "Done! Built $APP_BUNDLE"
