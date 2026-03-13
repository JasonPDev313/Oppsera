FROM gcr.io/oss-fuzz-base/base-builder:v1

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm@9

COPY . $SRC/oppsera
WORKDIR $SRC/oppsera

COPY .clusterfuzzlite/build.sh $SRC/build.sh
