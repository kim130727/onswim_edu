FROM node:20-alpine AS student-builder

ARG VITE_API_BASE_URL=same-origin
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

WORKDIR /build
COPY packages/student-renderer/ /build/packages/student-renderer/
WORKDIR /build/apps/mobile
COPY apps/mobile/package.json apps/mobile/package-lock.json ./
RUN npm ci
COPY apps/mobile/index.html apps/mobile/tsconfig.json apps/mobile/vite.config.ts apps/mobile/capacitor.config.ts ./
COPY apps/mobile/src ./src
RUN npm run build


FROM nginx:1.27-alpine

COPY docker/nginx-mobile.conf /etc/nginx/conf.d/default.conf
COPY --from=student-builder /build/apps/mobile/dist /usr/share/nginx/html

EXPOSE 3000
