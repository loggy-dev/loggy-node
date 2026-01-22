#!/bin/bash

# Publish loggy-node to npm
# Usage: ./scripts/publish-loggy-node.sh [version]
# Example: ./scripts/publish-loggy-node.sh 0.2.1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SDK_DIR="$PROJECT_ROOT/loggy-node"

cd "$SDK_DIR"

# Check if version argument is provided
if [ -n "$1" ]; then
    echo "Updating version to $1..."
    npm version "$1" --no-git-tag-version
fi

# Get current version
VERSION=$(node -p "require('./package.json').version")
echo "Publishing @loggydev/loggy-node version $VERSION..."

# Run tests
echo "Running tests..."
yarn test

# Build
echo "Building..."
yarn build

# Publish
echo "Publishing to npm..."
npm publish --access public

echo ""
echo "✅ Successfully published @loggydev/loggy-node@$VERSION"
echo ""
echo "Install with:"
echo "  npm install @loggydev/loggy-node"
echo "  yarn add @loggydev/loggy-node"
