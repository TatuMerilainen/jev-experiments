#!/bin/sh
# Prints the saved log of the CI test run, for the jev-trim demo.
cat "$(dirname "$0")/../tests/tasks/pytest-failure.txt"
