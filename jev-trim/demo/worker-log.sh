#!/bin/sh
# Prints the saved log of the worker service, for the jev-trim demo.
cat "$(dirname "$0")/../tests/tasks/oom-restart.txt"
