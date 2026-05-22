#!/bin/bash
# Run this ONCE on your fresh Hostinger VPS to set everything up
# Usage: bash vps-setup.sh

set -e

echo "=== WhatsApp Care VPS Setup ==="

# 1. Install Docker
echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 2. Install Docker Compose plugin
echo "Installing Docker Compose..."
apt-get install -y docker-compose-plugin

# 3. Create app directory
mkdir -p /opt/whatsapp-care
cd /opt/whatsapp-care

# 4. Copy docker-compose.yml and nginx config
mkdir -p nginx

echo ""
echo "=== NEXT STEPS ==="
echo ""
echo "1. Upload your docker-compose.yml to /opt/whatsapp-care/"
echo "   scp docker-compose.yml user@your-vps:/opt/whatsapp-care/"
echo ""
echo "2. Upload nginx config:"
echo "   scp -r nginx/ user@your-vps:/opt/whatsapp-care/"
echo ""
echo "3. Create your .env file on the VPS:"
echo "   nano /opt/whatsapp-care/.env"
echo "   (copy from .env.example and fill in real values)"
echo ""
echo "4. Add GitHub Secrets in your repo settings:"
echo "   VPS_HOST     = your VPS IP address"
echo "   VPS_USER     = root (or your SSH username)"
echo "   VPS_SSH_KEY  = your private SSH key contents"
echo ""
echo "5. Push to GitHub main branch — deployment is automatic!"
echo ""
echo "6. First time only — scan WhatsApp QR:"
echo "   docker compose logs -f api"
echo "   (QR code will appear — scan with WhatsApp)"
echo ""
echo "=== Setup complete! ==="
