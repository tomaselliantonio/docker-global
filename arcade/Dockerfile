FROM alpine:3.20 AS fetch
RUN apk add --no-cache git
WORKDIR /games
RUN git clone --depth 1 https://github.com/gabrielecirulli/2048.git 2048 \
 && git clone --depth 1 https://github.com/Hextris/hextris.git hextris \
 && git clone --depth 1 https://github.com/platzhersh/pacman-canvas.git pacman \
 && rm -rf */.git

FROM nginx:alpine
COPY --from=fetch /games /usr/share/nginx/html
COPY index.html /usr/share/nginx/html/index.html
