<p align="center">
  <img src="public/brand/logo-512.webp" alt="Snak'r" width="200" />
</p>

# Snak'r

**We ride, we partage.** A self-hosted, offline-capable file transfer & sharing platform — resumable multi-GB uploads, universal in-app preview, secure public links, and an ink-black & bone grunge UI straight from the Snak'r logo. One command to run.

**Installable PWA**: Snak'r installs as a full app on Android, iOS and desktop (Chrome/Edge/Safari) — standalone window, branded install prompt, offline fallback page, and in-app update banner. On iOS: Safari → Partager → « Sur l'écran d'accueil ».

Built on **Next.js 16** (App Router, standalone) · **PostgreSQL 16** · **Prisma** · local-disk storage (S3-swappable) · **tus** resumable uploads · **argon2id** auth · a strict self-only CSP.

> 🇫🇷 **Guide d'installation complet en français** (serveur Ubuntu/Debian vierge, de A à Z) : [voir plus bas](#-installation-sur-un-serveur-ubuntu--debian-de-a-à-z).

---

## Run it (one command)

```bash
cp .env.example .env      # then edit the secrets (see below)
docker compose up -d --build
```

This builds the app, starts Postgres, waits for it to be healthy, runs migrations, seeds the admin account, and serves behind Caddy (automatic HTTPS).

- App: `http://localhost` (or your `APP_DOMAIN`)
- First login uses `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (you'll be forced to change the password on first sign-in).

### Required `.env` secrets

| Variable | Notes |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres credentials |
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/db?schema=public` (host = `postgres` in compose) |
| `SESSION_SECRET` | ≥ 32 bytes — generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | seeded once, on first boot only |
| `STORAGE_ROOT` | `/data/uploads` in the container |
| `APP_DOMAIN` | domain Caddy serves (`localhost` for local) |

Registration is **closed by default** — open it in the admin console once you're in.

---

## 🇫🇷 Installation sur un serveur Ubuntu / Debian (de A à Z)

Guide complet pour déployer Snak'r sur un serveur vierge (Ubuntu 22.04/24.04 ou Debian 12), avec HTTPS automatique via Let's Encrypt.

### Prérequis

- Un serveur (VPS ou machine dédiée) avec un accès SSH et les droits `sudo`.
- **2 Go de RAM minimum recommandés** (le build de l'image Next.js est gourmand — voir [Dépannage](#dépannage) si vous n'avez qu'1 Go).
- Un **nom de domaine** pointant vers l'IP publique du serveur (recommandé, pour le HTTPS automatique). Sans domaine, voir [Sans nom de domaine](#sans-nom-de-domaine-).
- Les ports **80** et **443** ouverts/accessibles depuis Internet.

### Étape 1 — Mettre à jour le système

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl
```

### Étape 2 — Installer Docker (avec Docker Compose)

Le script officiel fonctionne à l'identique sur Ubuntu et Debian, et installe Docker Engine **et** le plugin Compose :

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

(Optionnel) Pour lancer `docker` sans `sudo` :

```bash
sudo usermod -aG docker $USER
# Déconnectez-vous puis reconnectez-vous pour que le groupe soit pris en compte.
```

Vérifiez l'installation :

```bash
docker --version
docker compose version
```

### Étape 3 — Configurer le pare-feu (UFW)

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> ⚠️ Vérifiez bien que `OpenSSH` est autorisé **avant** `sudo ufw enable`, sinon vous perdez la main sur le serveur.

### Étape 4 — Configurer le DNS

Chez votre registrar (OVH, Cloudflare, Gandi…), créez un enregistrement **A** pointant vers l'IP publique du serveur :

```
files.example.com.   A   203.0.113.10
```

Attendez que la propagation soit effective (`ping files.example.com` doit répondre avec l'IP du serveur). Caddy obtiendra ensuite un certificat Let's Encrypt automatiquement — aucune configuration TLS manuelle.

### Étape 5 — Cloner le projet

```bash
git clone https://github.com/ramoucho03/snakr.git
cd snakr
```

### Étape 6 — Configurer les secrets (`.env`)

```bash
cp .env.example .env
```

Générez un secret de session :

```bash
openssl rand -base64 32
```

Puis éditez le fichier (`nano .env`) et renseignez **au minimum** :

| Variable | Valeur à mettre |
|---|---|
| `POSTGRES_PASSWORD` | Un mot de passe fort pour la base de données |
| `DATABASE_URL` | Mettez-y le même mot de passe (l'hôte reste `postgres`) |
| `SESSION_SECRET` | La sortie du `openssl rand -base64 32` ci-dessus |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Le compte administrateur créé au premier démarrage |
| `APP_DOMAIN` | Votre domaine, ex. `files.example.com` |
| `APP_URL` | `https://files.example.com` |

> Le compte admin n'est créé **qu'au tout premier démarrage** — modifier ces valeurs ensuite n'a aucun effet.

### Étape 7 — Lancer

```bash
docker compose up -d --build
```

Le premier lancement prend quelques minutes : build de l'image, démarrage de PostgreSQL, migrations de la base, création du compte admin, obtention du certificat TLS. Suivez la progression :

```bash
docker compose ps            # les 3 services doivent être "running" / "healthy"
docker compose logs -f app   # logs de l'application (Ctrl+C pour quitter)
```

### Étape 8 — Première connexion

1. Ouvrez `https://votre-domaine` dans un navigateur.
2. Connectez-vous avec `ADMIN_EMAIL` / `ADMIN_PASSWORD` du `.env`.
3. L'application vous force à **changer le mot de passe** à la première connexion.
4. Les inscriptions sont **fermées par défaut** — ouvrez-les depuis la console d'administration si besoin.

### Derrière votre propre reverse proxy (Nginx, Nginx Proxy Manager…)

Si un reverse proxy tourne déjà chez vous (Nginx, Nginx Proxy Manager, Traefik…), inutile du Caddy embarqué : l'overlay `docker-compose.lan.yml` le désactive et expose l'application directement sur le réseau local, prête à être proxifiée.

**1. Lancez en mode LAN** (sur la machine qui héberge Snak'r, ex. `192.168.0.200`) :

```bash
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

L'application répond alors en HTTP sur `http://192.168.0.200:3000`.

**2. Configurez le proxy.** Avec **Nginx Proxy Manager** : nouveau *Proxy Host* → domaine public, scheme `http`, forward vers `192.168.0.200` port `3000`, et activez le SSL (Let's Encrypt) dans l'onglet dédié. Avec **Nginx** brut :

```nginx
server {
    listen 443 ssl;
    server_name files.exemple.com;
    # ... vos certificats ...

    # Uploads tus multi-Go : pas de limite de taille, pas de buffering
    client_max_body_size 0;
    proxy_request_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    location / {
        proxy_pass http://192.168.0.200:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

(Les uploads passent par tus en chunks de 8 Mo, donc même un `client_max_body_size` par défaut fonctionne — mais `0` + `proxy_request_buffering off` est plus propre pour les gros transferts.)

**3. `.env`** : mettez l'URL publique servie par votre proxy :

```bash
APP_URL="https://files.exemple.com"
```

> 🔒 En production le cookie de session est marqué `Secure` : la connexion **doit** se faire via l'URL HTTPS du proxy. `http://192.168.0.200:3000` en direct affichera l'app mais la session ne tiendra pas — c'est voulu. N'exposez au proxy que le port 3000 ; jamais le 5432 (PostgreSQL).

### Sans nom de domaine ?

Deux options pour tester sans FQDN :

- **IP en HTTPS auto-signé** : mettez l'IP du serveur dans `APP_DOMAIN` (ex. `APP_DOMAIN=203.0.113.10`). Caddy servira un certificat interne — le navigateur affichera un avertissement, c'est normal.
- **HTTP direct sur le port 3000** : lancez avec l'overlay LAN (`docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build`), ouvrez le port (`sudo ufw allow 3000/tcp`) et accédez à `http://IP-du-serveur:3000`. Limite : en production le cookie de session exige HTTPS, donc la connexion ne persistera pas en HTTP pur — ce mode ne sert qu'à vérifier que l'app répond, ou à placer votre propre reverse proxy devant (voir section précédente).

### Maintenance

**Mettre à jour l'application** (les migrations s'appliquent automatiquement au redémarrage) :

```bash
cd snakr
git pull
docker compose up -d --build
```

**Consulter les logs / redémarrer / arrêter :**

```bash
docker compose logs -f app     # logs
docker compose restart app     # redémarrage
docker compose down            # arrêt (les données sont conservées dans les volumes)
```

**Sauvegarder** (base de données + fichiers uploadés) :

```bash
# Base de données (adaptez utilisateur/base si modifiés dans .env)
docker compose exec -T postgres pg_dump -U snakr snakr > snakr-db-$(date +%F).sql

# Fichiers uploadés (volume `uploads`)
docker run --rm -v snakr_uploads:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/snakr-uploads-$(date +%F).tar.gz -C /data .
```

**Restaurer :**

```bash
cat snakr-db-2026-07-05.sql | docker compose exec -T postgres psql -U snakr snakr

docker run --rm -v snakr_uploads:/data -v "$(pwd)":/backup alpine \
  tar xzf /backup/snakr-uploads-2026-07-05.tar.gz -C /data
```

### Dépannage

- **Le build échoue ou le serveur gèle (1–2 Go de RAM)** : ajoutez du swap puis relancez le build.
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
- **Pas de certificat HTTPS** : vérifiez que le DNS pointe bien vers le serveur et que les ports 80/443 sont ouverts (pare-feu du fournisseur cloud inclus), puis regardez `docker compose logs caddy`.
- **L'app redémarre en boucle** : `docker compose logs app` — le plus souvent un `DATABASE_URL` désynchronisé de `POSTGRES_PASSWORD`, ou un `SESSION_SECRET` trop court (< 32 octets).
- **Repartir de zéro** (⚠️ supprime la base **et** tous les fichiers uploadés) :
  ```bash
  docker compose down -v
  docker compose up -d --build
  ```

---

## Local development

```bash
npm install                        # .npmrc sets legacy-peer-deps for React 19
docker run -d --name snakr-pg -p 5432:5432 \
  -e POSTGRES_USER=snakr -e POSTGRES_PASSWORD=snakr -e POSTGRES_DB=snakr postgres:16-alpine
npx prisma migrate deploy          # apply schema
npm run db:seed                    # seed the admin
npm run dev                        # http://localhost:3000
```

Scripts: `db:generate`, `db:migrate`, `db:deploy`, `db:seed`, `db:studio`.

---

## Architecture

- **Security boundary = the server-side DAL.** Every server action / route handler / data fetch re-checks the session and access level ([`src/lib/dal.ts`](src/lib/dal.ts), [`src/lib/access.ts`](src/lib/access.ts)). `src/proxy.ts` only does *optimistic* redirects + the CSP nonce — never authorization (post-CVE-2025-29927).
- **Sessions** are DB-backed for instant revocation; the cookie carries only a `jose`-signed session id. Passwords + share passwords use **argon2id** (OWASP params).
- **Uploads** flow entirely through **tus** ([`/api/upload`](src/app/api/upload)) — streamed, never buffered. On finish the bytes are **content-addressed** (sha256), **deduplicated** (ref-counted blobs), quota-reconciled, and thumbnailed asynchronously ([`src/lib/upload-finalize.ts`](src/lib/upload-finalize.ts)).
- **Storage** is behind a `StorageProvider` interface ([`src/lib/storage`](src/lib/storage)) — local disk today, S3/MinIO later with zero call-site changes. The logical tree lives only in Postgres; disk keys are opaque hashes (no path traversal).
- **Downloads** are Range-aware (206) so video scrubbing and Safari work, served `attachment` + `nosniff`, never from a script-executing dir ([`src/lib/http.ts`](src/lib/http.ts)).
- **Preview** dispatches by sniffed MIME to lazily-loaded viewers (image, video/audio, PDF, code, markdown, docx, CSV, download card) — opening an image never ships pdf.js ([`src/components/preview`](src/components/preview)).
- **Sharing**: public links store only the token *hash*, support optional password (argon2id), expiry, and an **atomic** max-download counter; internal sharing is a resource/principal ACL with folder-tree inheritance.
- **Offline guarantee**: fonts, icons, backgrounds, and the pdf.js worker are all bundled/self-hosted. A strict `default-src 'self'` CSP (nonce'd scripts) is the guardrail against any CDN creeping back in.

The full design spec lives in [`docs/research-brief.md`](docs/research-brief.md).
