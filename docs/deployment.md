# Production Deployment Guide

Target: a single Linux VM (4 vCPU, 8 GB RAM, 80 GB SSD) for the pilot, running Docker Compose. The same images
run on any container platform.

## 1. Prepare the host

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin ufw
```

```bash
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

Enable unattended security updates, full-disk encryption (or encrypted volumes) and SSH key-only login.

## 2. Configure

```bash
git clone <repo> afyalink && cd afyalink && cp .env.example .env && chmod 600 .env
```

Fill every value in `.env`:

| Variable | Notes |
|---|---|
| `APP_ORIGIN` | Public URL, e.g. `https://app.example.et` (CORS + activation links) |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | `openssl rand -hex 24` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `DATA_ENCRYPTION_KEY` | `openssl rand -base64 32` — **back this up separately; losing it makes clinical data unreadable** |
| `SEED_PLATFORM_ADMIN_*` | First deploy only; remove afterwards and enable MFA for that account |
| `SEED_DEMO` | `false` in production |
| AI / SMTP / SMS | Leave blank until contracts and reviews are complete |

## 3. TLS

Place certificates at `infrastructure/nginx/certs/fullchain.pem` and `privkey.pem`. With Let's Encrypt:

```bash
sudo certbot certonly --standalone -d app.example.et
```

```bash
sudo cp /etc/letsencrypt/live/app.example.et/{fullchain,privkey}.pem infrastructure/nginx/certs/
```

Schedule renewal with a deploy hook that copies certificates and runs `docker compose restart nginx`.

## 4. Deploy

```bash
docker compose up -d --build --wait
```

The `migrate` service applies migrations and seeds reference data before the API starts. Verify:

```bash
curl -fsS https://app.example.et/api/v1/health/ready
```

## 5. Upgrades

```bash
git pull && docker compose up -d --build --wait
```

Migrations run automatically. **Take a backup before every upgrade.** Roll back by checking out the previous
release and restoring the pre-upgrade backup if a migration must be reverted.

## 6. Backups

Encrypted daily backups (AES-256, PBKDF2) with checksums and 30-day local retention:

```bash
echo "<long random passphrase>" | sudo tee /etc/afyalink/backup.pass && sudo chmod 600 /etc/afyalink/backup.pass
```

Cron (`crontab -e`):

```
30 1 * * * cd /opt/afyalink && BACKUP_PASSPHRASE_FILE=/etc/afyalink/backup.pass ./scripts/backup.sh /var/backups/afyalink >> /var/log/afyalink-backup.log 2>&1
```

Copy backups off-site daily (object storage in an approved jurisdiction). Store the passphrase and
`DATA_ENCRYPTION_KEY` in a separate secrets vault.

### Restore (tested procedure)

```bash
docker compose stop api
```

```bash
BACKUP_PASSPHRASE_FILE=/etc/afyalink/backup.pass ./scripts/restore.sh /var/backups/afyalink/afyalink-<stamp>.dump.enc
```

```bash
docker compose start api
```

Test a restore into a staging stack **monthly** and record the result.

## 7. Monitoring & logging

- **Health**: `/api/v1/health` (liveness) and `/api/v1/health/ready` (DB + Redis). Container health checks are built in.
- **Logs**: API emits structured JSON (pino) with request ids; Nginx logs omit query strings. Ship with
  `docker logs` → Loki/ELK/CloudWatch. Never enable request-body logging.
- **Alerts**: readiness failures, 5xx rate, `auth.refresh_reuse_detected`, `auth.account_locked` spikes, backup job
  failures, disk > 80 %, notification `FAILED` counts.
- **Uptime**: external probe on `/api/v1/health`.

## 8. Scaling notes

- Run additional API replicas with `WORKERS_ENABLED=false` and one worker replica with it enabled.
- Switch the API throttler to Redis storage when running multiple replicas.
- Move PostgreSQL to a managed service with point-in-time recovery when leaving the pilot.

## 9. Go-live checklist

- [ ] Legal review of privacy notice, terms, DPA and cross-border processing
- [ ] Real TLS certificate; HSTS verified
- [ ] Secrets generated and vaulted; `.env` permissions 600
- [ ] Demo seed disabled; bootstrap admin password rotated; MFA enabled for admins/doctors
- [ ] Backup cron running; first restore test passed
- [ ] SMS/email providers verified in their sandboxes (or left disabled)
- [ ] AI provider reviewed, or left unconfigured
- [ ] Emergency numbers and Amharic safety phrases verified with clinicians
- [ ] Penetration test / security review completed
