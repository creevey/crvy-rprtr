#!/bin/bash
# Pre-commit hook to run staged checks
exec ./scripts/check.sh --staged
