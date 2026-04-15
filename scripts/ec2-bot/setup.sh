#!/bin/bash
# First-time setup for a fresh slam-bot EC2 instance
# Run ON the instance: ssh slam-bot 'bash -s' < scripts/ec2-bot/setup.sh
# Or: ssh slam-bot then: bash ~/meet-without-fear/scripts/ec2-bot/setup.sh
set -euo pipefail

echo "=== Slam Bot Instance Setup ==="

# 1. System packages
echo "[1/7] Installing system packages..."
sudo apt update && sudo apt install -y \
  git curl jq zsh vim build-essential unzip ca-certificates gnupg

# 2. Node.js 20 + pnpm
echo "[2/7] Installing Node.js 20 + pnpm..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@10.0.0 --activate

# 3. GitHub CLI
echo "[3/7] Installing GitHub CLI..."
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt update && sudo apt install -y gh

# 4. Claude Code
echo "[4/7] Installing Claude Code..."
sudo npm install -g @anthropic-ai/claude-code

# 5. Python packages (TTS)
echo "[5/8] Installing Python packages..."
sudo apt install -y python3-pip
pip3 install edge-tts

# 6. Shell setup
echo "[6/8] Configuring shell..."
if ! grep -q "slam bot" ~/.bashrc; then
  cat >> ~/.bashrc << 'BASHRC'

# Slam bot aliases
alias m="cd ~/meet-without-fear"
alias c="claude --dangerously-skip-permissions"
PS1="\[\033[36m\][slam-bot]\[\033[0m\] \w \$ "
cd ~/meet-without-fear 2>/dev/null || true
BASHRC
fi

# 7. Claude Code config
echo "[7/8] Writing Claude Code settings and instructions..."
mkdir -p ~/.claude
cat > ~/.claude/CLAUDE.md << 'EOF'
# EC2 Bot Instance

This is the EC2 bot instance. A cron job runs `git pull` on `main` every minute and syncs scripts to `/opt/slam-bot/scripts/`. Any file changes on `main` will be overwritten. Files outside the repo (e.g., `/opt/slam-bot/.env`) are not affected.
EOF

cat > ~/.claude/settings.json << 'EOF'
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(*)",
      "Read(*)",
      "Write(*)",
      "Edit(*)",
      "Glob(*)",
      "Grep(*)",
      "Agent(*)",
      "WebFetch(*)",
      "WebSearch(*)",
      "mcp__slack__*"
    ],
    "deny": []
  },
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/opt/slam-bot/scripts/check-pending-messages.sh"
          }
        ]
      }
    ]
  },
  "env": {},
  "includeCoAuthoredBy": true,
  "skipDangerousModePermissionPrompt": true
}
EOF

# 7. Create directories
echo "[8/8] Creating bot directories..."
sudo mkdir -p /opt/slam-bot/scripts /opt/slam-bot/state/wip /opt/slam-bot/state/claims /var/log/slam-bot
sudo chown -R ubuntu:ubuntu /opt/slam-bot /var/log/slam-bot

# Logrotate
sudo tee /etc/logrotate.d/slam-bot > /dev/null << 'EOF'
/var/log/slam-bot/*.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
}
EOF

echo ""
echo "=== Setup complete ==="
echo ""
echo "Remaining manual steps:"
echo "  1. Clone repo:  (see setup-repo.sh or do it manually)"
echo "  2. Copy secrets: scp .env files to the instance"
echo "  3. Run deploy:   ./scripts/ec2-bot/deploy.sh"
echo "  4. Auth Claude:  ssh slam-bot, then run 'claude' interactively"
echo "  5. Auth GitHub:  echo 'TOKEN' | gh auth login --with-token"
