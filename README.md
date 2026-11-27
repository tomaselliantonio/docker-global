# docker-global

Una homepage locale con gli strumenti di tutti i giorni, raggiungibile solo dal tuo PC.

| Cosa | Indirizzo |
|---|---|
| Homepage | http://homepage.localhost |
| IT-Tools (utility per sviluppatori) | http://tools.localhost |
| Excalidraw (disegni e diagrammi) | http://draw.localhost |
| Stirling PDF (unire, dividere, comprimere PDF) | http://pdf.localhost |
| Traefik (reverse proxy) | http://localhost:8080/dashboard/ |

Non servono account né password.

## Cosa serve

- Docker Desktop, avviato
- Git
- le porte 80 e 8080 libere

## Installazione (una volta sola)

```bash
git clone https://github.com/tomaselliantonio/docker-global.git
cd docker-global
docker network create web_network
docker compose up -d --build
```

La prima volta ci vogliono alcuni minuti per scaricare e costruire le immagini. Poi apri http://homepage.localhost.

Se `docker network create` dice che la rete esiste già, vai avanti.

## Uso quotidiano

Tutti i comandi vanno lanciati nella cartella `docker-global`.

| Per | Comando |
|---|---|
| Accendere (anche dopo un riavvio del PC) | `docker compose up -d` |
| Spegnere | `docker compose stop` |
| Aggiornare | `git pull` e poi `docker compose up -d --build --remove-orphans` |

## Personalizzare (facoltativo)

Le personalizzazioni restano sul tuo PC: `docker-compose.override.yml` e la cartella `local/` non vanno su git.

1. Copia `docker-compose.override.example.yml` in `docker-compose.override.yml`.
2. Cambia il saluto in `HOMEPAGE_VAR_GREETING`.
3. Per il pulsante accendi/spegni dei tuoi progetti, elencali in `PROJECTS`: `"nome-progetto-compose":"Titolo del gruppo"`.
4. Per dare ai progetti una scheda a parte, copia `homepage/config/settings.yaml` in `local/settings.yaml`, aggiungi sotto `layout` un blocco per ogni progetto (con lo stesso titolo del punto 3) e togli i commenti alle righe `volumes` nel file di override:

   ```yaml
     Mio Progetto:
       tab: Progetti
   ```

   Aggiungi `tab: Home` anche ai gruppi già presenti, se non ce l'hanno.
5. Applica con `docker compose up -d`.

## Aggiungere un progetto alla homepage

Serve Python 3.

```bash
python onboard ../mio-progetto --group "Mio Progetto" --dry-run
```

Mostra l'anteprima. Senza `--dry-run` crea `docker-compose.traefik.yml` nel progetto e lo avvia. Su macOS e Linux usa `python3`.

## Problemi comuni

- **La pagina non si apre:** controlla che Docker Desktop sia avviato e lancia `docker compose ps`.
- **Errore "port is already allocated":** un altro programma usa la porta 80 o 8080. Chiudilo e rilancia `docker compose up -d`.
