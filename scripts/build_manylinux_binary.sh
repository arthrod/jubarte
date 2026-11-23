#!/bin/bash

# SPDX-FileCopyrightText: 2026 Jandira Technologies, LLC
#
# SPDX-License-Identifier: Apache-2.0

# Build jubarte inside a manylinux_2_28 image (glibc 2.28). release.yml
# mounts the repo at /work and runs this there. The image's own glibc is
# what the binary links, not the GitHub runner's.

set -euo pipefail

target="${1:?rust target triple}"
# Rustup 1.28.2 checksums from the official Rust 1.89 container build.
case "$target" in
  x86_64-unknown-linux-gnu) sha256=20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c ;;
  aarch64-unknown-linux-gnu) sha256=e3853c5a252fca15252d07cb23a1bdd9377a8c6f3efa01531109281ae47f841c ;;
  *) echo "unsupported manylinux Rust target: $target" >&2; exit 1 ;;
esac
installer_dir=$(mktemp -d)
trap 'rm -rf -- "$installer_dir"' EXIT
installer="$installer_dir/rustup-init"
curl --proto '=https' --tlsv1.2 -fsSL -o "$installer" \
  "https://static.rust-lang.org/rustup/archive/1.28.2/$target/rustup-init"
printf '%s  %s\n' "$sha256" "$installer" | sha256sum -c -
chmod +x "$installer"
"$installer" -y --default-toolchain stable --profile minimal --target "$target"
# shellcheck disable=SC1091
. "$HOME/.cargo/env"
cargo build --release --locked --bin jubarte --target "$target"
chmod a+rX "target/${target}/release/jubarte"
