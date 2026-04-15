#!/bin/bash
# Deploy bot scripts and crontab to the EC2 instance
# Run from local machine (anywhere in the repo)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="slam-bot"

echo "=== Deploying slam-bot scripts ==="

# Symlink scripts (git-pull.sh handles this on subsequent runs,
# but deploy.sh should also set it up for fresh installs)
echo "Symlinking scripts..."
ssh "$HOST" 'REPO_SCRIPTS="$HOME/meet-without-fear/scripts/ec2-bot/scripts" && [ -L /opt/slam-bot/scripts ] || (rm -rf /opt/slam-bot/scripts && ln -s "$REPO_SCRIPTS" /opt/slam-bot/scripts)'

# Sync Socket Mode listener (keeps its own node_modules, can't be a symlink)
echo "Syncing Socket Mode listener..."
ssh "$HOST" 'mkdir -p /opt/slam-bot/socket-mode'
scp -q "$SCRIPT_DIR"/socket-mode/* "$HOST":/opt/slam-bot/socket-mode/
ssh "$HOST" 'cd /opt/slam-bot/socket-mode && npm install --production'

# Install crontab
echo "Installing crontab..."
scp -q "$SCRIPT_DIR/crontab.txt" "$HOST":/tmp/slam-bot-crontab.txt
ssh "$HOST" 'crontab /tmp/slam-bot-crontab.txt && rm /tmp/slam-bot-crontab.txt'

# Install systemd unit file for socket listener
echo "Installing systemd service..."
scp -q "$SCRIPT_DIR/slam-bot-socket.service" "$HOST":/tmp/slam-bot-socket.service
ssh "$HOST" 'sudo mv /tmp/slam-bot-socket.service /etc/systemd/system/slam-bot-socket.service && sudo chown root:root /etc/systemd/system/slam-bot-socket.service && sudo systemctl daemon-reload && sudo systemctl enable slam-bot-socket'

# Install systemd unit file for the github-state scanner daemon (Phase 1
# of the GitHub API budget reduction plan). The daemon owns the
# consolidated GraphQL state file under /opt/slam-bot/state/, which
# subsequent migration phases (workspace-dispatcher, pr-reviewer,
# /review-pr, etc.) will read from instead of making their own gh calls.
echo "Installing github-state scanner systemd service..."
ssh "$HOST" 'sudo -n mkdir -p /opt/slam-bot/state/github-state-refresh-queue && sudo -n chown -R ubuntu:ubuntu /opt/slam-bot/state'
scp -q "$SCRIPT_DIR/slam-bot-state-scanner.service" "$HOST":/tmp/slam-bot-state-scanner.service
ssh "$HOST" 'sudo mv /tmp/slam-bot-state-scanner.service /etc/systemd/system/slam-bot-state-scanner.service && sudo chown root:root /etc/systemd/system/slam-bot-state-scanner.service && sudo systemctl daemon-reload && sudo systemctl enable slam-bot-state-scanner && sudo systemctl restart slam-bot-state-scanner'

# Install logrotate config
echo "Installing logrotate config..."
scp -q "$SCRIPT_DIR/logrotate-slam-bot.conf" "$HOST":/tmp/slam-bot-logrotate.conf
ssh "$HOST" 'sudo mv /tmp/slam-bot-logrotate.conf /etc/logrotate.d/slam-bot && sudo chown root:root /etc/logrotate.d/slam-bot'

# Verify
echo ""
echo "Deployed scripts:"
ssh "$HOST" 'ls -1 /opt/slam-bot/scripts/'
echo ""
echo "Active crontab:"
ssh "$HOST" 'crontab -l'
echo ""
echo "=== Deploy complete ==="
