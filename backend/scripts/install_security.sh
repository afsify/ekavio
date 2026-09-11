#!/usr/bin/env bash
# Ekavio Backend Security Package Installer
# Installs production security middlewares and their TypeScript definitions

set -e

echo "Installing production security packages for Ekavio Backend..."
npm install helmet express-rate-limit compression express-mongo-sanitize

echo "Installing dev dependencies / TypeScript types..."
npm install -D @types/compression @types/express-rate-limit

echo "Security packages installed successfully!"
