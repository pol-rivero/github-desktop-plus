#!/bin/bash

INSTALL_DIR="/usr/lib/desktop-plus"
CLI_DIR="$INSTALL_DIR/resources/app/static"
CLI_INSTALL_TARGET="/usr/bin/desktop-plus-cli"

# add executable permissions for CLI interface
chmod +x "$CLI_DIR"/desktop-plus-cli || :

# create symbolic links to /usr/bin directory
ln -f -s "$CLI_DIR"/desktop-plus-cli "$CLI_INSTALL_TARGET" || :

exit 0
