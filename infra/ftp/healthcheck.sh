#!/bin/bash
set -euo pipefail
exec 3<>/dev/tcp/127.0.0.1/21
read -r -t 3 greeting <&3
[[ "$greeting" == 220* ]]
