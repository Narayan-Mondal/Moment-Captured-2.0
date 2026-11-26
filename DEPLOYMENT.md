# Moment Captured 2.0 — Production Deployment Guide

This guide details how to launch **Moment Captured 2.0** to production across leading cloud providers (Render, Railway, Heroku, DigitalOcean, or AWS).

---

## 1. Environment Variables Configuration

In your production cloud dashboard, set the following environment variables:

| Variable | Description | Example / Recommended |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Listening port (injected by host) | `10000` (Render) / `3000` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name | `nu7t1phx` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | `718978749987952` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | *(From Cloudinary Console > API Keys)* |
| `CLOUDINARY_UPLOAD_PRESET`| Unsigned Upload Preset (optional) | `moment_captured_stories` |
| `ADMIN_PASSWORD` | Strong password for `/admin` portal | *(Your custom strong password)* |

> [!IMPORTANT]
> **API Secret Masking**: When copying from the Cloudinary Console, make sure to click the **Copy icon** (or reveal the eye) so you do not accidentally copy mask asterisks (`**********`).

---

## 2. One-Click Deploy on Render (Recommended)

1. Connect your GitHub / GitLab repository to [Render.com](https://render.com).
2. Click **New +** > **Web Service**.
3. Select your repository.
4. Render automatically detects `render.yaml` or you can configure manually:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
5. Add the Environment Variables from the table above in the **Environment** tab.
6. Click **Deploy Web Service**.

---

## 3. Deploying on Railway

1. Go to [Railway.app](https://railway.app) and create a **New Project**.
2. Select **Deploy from GitHub repo**.
3. Railway automatically detects `Procfile` (`web: npm start`).
4. Go to the service **Variables** tab and add the environment keys.
5. In **Settings** > **Networking**, click **Generate Domain** or map your custom domain (e.g. `momentcaptured.in`).

---

## 4. Deploying on a Custom Linux VPS (Ubuntu / Debian + Nginx + PM2)

1. **Install Node.js & PM2**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

2. **Clone and Install**:
   ```bash
   git clone <repo-url> /var/www/moment-captured
   cd /var/www/moment-captured
   npm install --omit=dev
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env
   nano .env # Add your production secrets
   ```

4. **Start with PM2**:
   ```bash
   pm2 start server.js --name "moment-captured" -i max
   pm2 save
   pm2 startup
   ```

5. **Nginx Reverse Proxy Configuration**:
   ```nginx
   server {
       server_name momentcaptured.in www.momentcaptured.in;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   Add free SSL via Certbot:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d momentcaptured.in -d www.momentcaptured.in
   ```

---

## 5. Built-in Production Features

- **Security Headers**: Built-in protection against Clickjacking, MIME-sniffing, XSS, and CSP restricting untrusted resources.
- **In-Memory Rate Limiting**: Protects admin login (`/api/admin/login`) against brute force and throttles excessive upload requests.
- **Timing-Safe Authentication**: Protects password verification against timing attacks using `crypto.timingSafeEqual`.
- **High-Entropy Tokens**: Generates 256-bit cryptographically secure session tokens (`crypto.randomBytes`) with automatic expiration.
- **Compression**: Response compression for static assets and API payloads.
- **CDN Caching**: Configured `Cache-Control` headers for fast loading, while keeping `/admin` and HTML dynamic.
- **Health Monitoring**: Dedicated `/api/health` endpoint for uptime monitoring and zero-downtime rolling deploys.
- **SEO & Discoverability**: Search engine compliant `robots.txt` and `sitemap.xml`.
