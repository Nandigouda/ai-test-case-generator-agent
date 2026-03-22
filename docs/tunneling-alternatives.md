# Alternative tunneling services with static URLs

## 1. Cloudflare Tunnel (Free, Static URLs)
# Install: npm install -g cloudflared
# Setup: cloudflared tunnel login
# Run: cloudflared tunnel --url localhost:3005

## 2. LocalTunnel (Free, Custom Subdomain)
# Install: npm install -g localtunnel
# Run: lt --port 3005 --subdomain your-project-name

## 3. PageKite (Free tier available)
# Install: pip install pagekite
# Run: pagekite.py 3005 your-name.pagekite.me

## 4. Serveo (Free, SSH-based)
# Run: ssh -R 80:localhost:3005 serveo.net

## 5. Tailscale Funnel (Free for personal use)
# Install Tailscale, then: tailscale funnel 3005
