#!/bin/bash

IMAGE_NAME="desktop-plus-tests"

script_dir=$(dirname $0)
repo_root=$(realpath "$script_dir/../..")

# Check if image exists
if [[ "$(docker images -q $IMAGE_NAME 2> /dev/null)" == "" ]]; then
  echo "Image not found. Building image..."
  docker build -t $IMAGE_NAME -f "$script_dir/Dockerfile" "$script_dir/."
fi

# If running on a worktree, mount the git common dir (read-only) at its absolute path so the chain resolves
extra_mounts=()
if [[ -f "$repo_root/.git" ]]; then
  git_common_dir=$(realpath "$(git -C "$repo_root" rev-parse --git-common-dir)")
  extra_mounts+=(-v "$git_common_dir:$git_common_dir:ro")
fi

docker run --rm -v "$repo_root:/app" "${extra_mounts[@]}" $IMAGE_NAME
