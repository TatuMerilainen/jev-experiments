#!/bin/sh
# Prints the saved log of the CI build, for the jev-trim demo.
cat "$(dirname "$0")/../tests/tasks/build-error.txt"
