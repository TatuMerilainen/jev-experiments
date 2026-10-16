#!/bin/sh
# Prints the saved log of the billing service startup, for the jev-trim demo.
cat "$(dirname "$0")/../tests/tasks/startup-port.txt"
