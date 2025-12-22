#!/bin/bash
# Capacitimer Universal Installer
# Automatically downloads and installs the latest Capacitimer release for your architecture

set -e

REPO="tomhillmeyer/capacitimer"
INSTALL_SCRIPT="install-linux-server.sh"

echo "=== Capacitimer Universal Installer ==="
echo ""

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
    x86_64|amd64)
        DEB_ARCH="amd64"
        ;;
    aarch64|arm64)
        DEB_ARCH="arm64"
        ;;
    *)
        echo "Error: Unsupported architecture: $ARCH"
        echo "Supported architectures: x86_64, amd64, aarch64, arm64"
        exit 1
        ;;
esac

echo "Detected architecture: $ARCH (using $DEB_ARCH packages)"
echo ""

# Check for required tools
if ! command -v curl &> /dev/null; then
    echo "Error: curl is required but not installed"
    echo "Install it with: sudo apt-get install curl"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Installing jq (required for JSON parsing)..."
    sudo apt-get update && sudo apt-get install -y jq
fi

# Get latest release info from GitHub API
echo "Fetching latest release information..."
RELEASE_INFO=$(curl -s "https://api.github.com/repos/$REPO/releases/latest")

if [ -z "$RELEASE_INFO" ] || echo "$RELEASE_INFO" | grep -q "Not Found"; then
    echo "Error: Could not fetch release information from GitHub"
    exit 1
fi

# Extract version tag
VERSION=$(echo "$RELEASE_INFO" | jq -r '.tag_name')
if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
    echo "Error: Could not determine latest version"
    exit 1
fi

# Strip 'v' prefix from version if present
VERSION_NUMBER="${VERSION#v}"

echo "Latest version: $VERSION"
echo ""

# Construct expected filenames
DEB_FILENAME="Capacitimer-${VERSION_NUMBER}-linux-${DEB_ARCH}.deb"
INSTALL_SCRIPT_URL="https://raw.githubusercontent.com/$REPO/$VERSION/$INSTALL_SCRIPT"

# Find download URL for the .deb file
DEB_URL=$(echo "$RELEASE_INFO" | jq -r ".assets[] | select(.name == \"$DEB_FILENAME\") | .browser_download_url")

if [ -z "$DEB_URL" ] || [ "$DEB_URL" = "null" ]; then
    echo "Error: Could not find $DEB_FILENAME in latest release"
    echo "Available files:"
    echo "$RELEASE_INFO" | jq -r '.assets[].name'
    exit 1
fi

echo "Found package: $DEB_FILENAME"
echo ""

# Create temporary directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

cd "$TMP_DIR"

# Download the .deb package
echo "Downloading $DEB_FILENAME..."
if ! curl -L -f -o "$DEB_FILENAME" "$DEB_URL"; then
    echo "Error: Failed to download .deb package"
    echo "URL: $DEB_URL"
    exit 1
fi

# Verify the download is a valid .deb file
if ! file "$DEB_FILENAME" | grep -q "Debian binary package"; then
    echo "Error: Downloaded file is not a valid .deb package"
    echo "File type: $(file "$DEB_FILENAME")"
    echo "File size: $(wc -c < "$DEB_FILENAME") bytes"
    echo ""
    echo "This might be due to:"
    echo "  • GitHub rate limiting or service issues (try again in a few minutes)"
    echo "  • Network connectivity problems"
    echo "  • The release asset not being properly uploaded"
    exit 1
fi

echo "✓ Downloaded .deb package ($(wc -c < "$DEB_FILENAME") bytes)"

# Download the installation script
echo "Downloading installation script..."
if ! curl -L -o "$INSTALL_SCRIPT" "$INSTALL_SCRIPT_URL"; then
    echo "Error: Failed to download installation script"
    exit 1
fi
echo "✓ Downloaded installation script"

# Make installation script executable
chmod +x "$INSTALL_SCRIPT"

echo ""
echo "=== Ready to Install ==="
echo ""
echo "The installer will now:"
echo "  • Install system dependencies (xorg, openbox, etc.)"
echo "  • Install Capacitimer $VERSION"
echo "  • Configure auto-login and fullscreen display"
echo "  • Grant port 80 binding capability"
echo ""
echo "This requires root privileges."
echo ""

# Run the installation script with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Running installation script with sudo..."
    echo ""
    sudo ./"$INSTALL_SCRIPT"
else
    echo "Running installation script..."
    echo ""
    ./"$INSTALL_SCRIPT"
fi

echo ""
echo "Installation files were downloaded to: $TMP_DIR"
echo "They will be automatically cleaned up on exit."
echo ""
