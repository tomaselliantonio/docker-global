# docker-global

Traefik + Homepage + strumenti locali, tutto su `*.localhost` (Traefik ascolta solo su 127.0.0.1).

## Primo avvio

```bash
./setup.sh
```

Crea `.env` con segreti casuali, avvia i servizi, crea gli account locali (Gitea, n8n, Beszel, Memos), registra il runner di Gitea Actions e l'agente Beszel. Le credenziali vanno in `credentials.txt` (non versionato).
Dopo il primo giro basta `docker compose up -d`.

**Vaultwarden**: crea tu l'account su http://vault.localhost (la master password è solo tua), poi metti `SIGNUPS_ALLOWED=false` nel compose.

## Servizi aggiunti

| Gruppo | Servizio | URL |
|---|---|---|
| Sviluppo | Gitea (+ runner Actions) | git.localhost (login automatico via Traefik) |
| Sviluppo | n8n | n8n.localhost |
| Sviluppo | Verdaccio (cache npm) | verdaccio.localhost · `npm config set registry http://localhost:4873` |
| Sviluppo | MinIO (S3 locale) | minio.localhost · API s3.localhost / localhost:9000 |
| Sviluppo | Mailpit | mail.localhost (SMTP `mailpit:1025`) |
| Personale | Vaultwarden | vault.localhost |
| Personale | Linkding | links.localhost (login automatico) |
| Personale | Memos | memos.localhost |
| Strumenti | ConvertX | convert.localhost |
| Sistema | Beszel (+ agente) | beszel.localhost (login automatico) |
| Sistema | Dozzle (log) | logs.localhost |
| — | Diun | avvisa via Mailpit quando escono nuove immagini (lunedì 9:00) |
| — | volume_backup | backup notturno (03:00 UTC) di tutti i volumi in `./backups`, ultimi 7. Subito: `docker exec volume_backup /backup.sh now` |

Il login automatico (Gitea, Linkding) funziona perché Traefik aggiunge un header d'identità: è sicuro solo finché Traefik resta legato a 127.0.0.1.

## Aggiungere un progetto

```bash
./onboard ../mio-progetto [--group "Nome gruppo"] [--dry-run]
```

Genera `docker-compose.traefik.yml` nel progetto (rete `web_network`, label Traefik e `homepage.*`) e lo avvia.
Per la tab *Progetti* aggiungi il gruppo in `homepage/config/settings.yaml` (e in `PROJECTS` di `projects-ctl` per il pulsante accendi/spegni).
