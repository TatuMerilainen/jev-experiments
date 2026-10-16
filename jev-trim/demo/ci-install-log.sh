#!/bin/sh
# Prints the saved log of the CI npm install, for the jev-trim demo.
cat "$(dirname "$0")/../tests/tasks/npm-eresolve.txt"
